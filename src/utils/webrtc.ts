import EventEmitter from 'eventemitter3';

const WS_URL = 'ws://' + import.meta.env.VITE_HOST_URL + ':8080';

interface PeerInfo {
  role: 'MASTER' | 'VIEWER';
  id: string;
}

class SignalingClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000;
  private clientId: string;
  private role: string;

  constructor(config: { clientId: string; role: string }) {
    super();
    this.clientId = config.clientId;
    this.role = config.role;
  }

  async open() {
    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        this.register();
      };

      this.ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        console.log('Received message:', message);

        switch (message.type) {
          case 'registered':
            this.emit('open');
            break;
          case 'peer-joined':
            this.emit('peer-joined', message.peer);
            break;
          case 'peer-left':
            this.emit('peer-left', message.peer);
            break;
          case 'offer':
            this.emit('sdpOffer', message.payload, message.from);
            break;
          case 'answer':
            this.emit('sdpAnswer', message.payload, message.from);
            break;
          case 'ice-candidate':
            this.emit('iceCandidate', message.payload, message.from);
            break;
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.emit('error', error);
      };

      this.ws.onclose = () => {
        console.log('WebSocket closed');
        this.emit('close');
        this.tryReconnect();
      };
    } catch (error) {
      console.error('Error connecting to WebSocket:', error);
      this.tryReconnect();
    }
  }

  private tryReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(
        `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
      );
      setTimeout(() => this.open(), this.reconnectDelay);
    }
  }

  private register() {
    this.send({
      type: 'register',
      role: this.role,
      clientId: this.clientId,
    });
  }

  private send(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  sendSdpOffer(offer: RTCSessionDescriptionInit, to?: string) {
    this.send({
      type: 'offer',
      payload: offer,
      to,
      from: this.clientId,
    });
  }

  sendSdpAnswer(answer: RTCSessionDescriptionInit, to?: string) {
    this.send({
      type: 'answer',
      payload: answer,
      to,
      from: this.clientId,
    });
  }

  sendIceCandidate(candidate: RTCIceCandidateInit, to?: string) {
    this.send({
      type: 'ice-candidate',
      payload: candidate,
      to,
      from: this.clientId,
    });
  }

  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export class WebRTCClient {
  private signalingClient: SignalingClient | null = null;
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private localStream: MediaStream | null = null;
  private onStreamHandler:
    | ((stream: MediaStream, peerId: string) => void)
    | null = null;
  private onStreamRemovedHandler: ((peerId: string) => void) | null = null;

  constructor(private readonly role: 'MASTER' | 'VIEWER') {}

  async initialize() {
    this.signalingClient = new SignalingClient({
      clientId: `${this.role}-${Date.now()}`,
      role: this.role,
    });

    this.setupSignalingHandlers();
    await this.signalingClient.open();
  }

  private setupSignalingHandlers() {
    if (!this.signalingClient) return;

    this.signalingClient.on('peer-joined', (peer: PeerInfo) => {
      console.log('Peer joined:', peer);
      if (this.role === 'MASTER') {
        this.createPeerConnection(peer.id);
      }
    });

    this.signalingClient.on('peer-left', (peer: PeerInfo) => {
      console.log('Peer left:', peer);
      this.removePeerConnection(peer.id);
    });

    this.signalingClient.on(
      'sdpOffer',
      async (offer: RTCSessionDescriptionInit, from: string) => {
        if (this.role === 'VIEWER') {
          const pc = this.createPeerConnection(from);
          await pc.setRemoteDescription(offer);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          this.signalingClient?.sendSdpAnswer(answer, from);
        }
      }
    );

    this.signalingClient.on(
      'sdpAnswer',
      async (answer: RTCSessionDescriptionInit, from: string) => {
        const pc = this.peerConnections.get(from);
        if (pc) {
          await pc.setRemoteDescription(answer);
        }
      }
    );

    this.signalingClient.on(
      'iceCandidate',
      async (candidate: RTCIceCandidateInit, from: string) => {
        const pc = this.peerConnections.get(from);
        if (pc) {
          await pc.addIceCandidate(candidate);
        }
      }
    );
  }

  private createPeerConnection(peerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.signalingClient?.sendIceCandidate(event.candidate, peerId);
      }
    };

    pc.ontrack = (event) => {
      console.log('Received track from peer:', peerId, event.streams[0]);
      if (this.onStreamHandler && event.streams[0]) {
        this.onStreamHandler(event.streams[0], peerId);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(
        `ICE connection state with ${peerId}:`,
        pc.iceConnectionState
      );
      if (
        pc.iceConnectionState === 'disconnected' ||
        pc.iceConnectionState === 'failed' ||
        pc.iceConnectionState === 'closed'
      ) {
        this.removePeerConnection(peerId);
      }
    };

    this.peerConnections.set(peerId, pc);

    if (this.role === 'MASTER' && this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          this.signalingClient?.sendSdpOffer(pc.localDescription!, peerId);
        })
        .catch((error) => {
          console.error('Error creating offer:', error);
        });
    }

    return pc;
  }

  private removePeerConnection(peerId: string) {
    const pc = this.peerConnections.get(peerId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(peerId);
      if (this.onStreamRemovedHandler) {
        this.onStreamRemovedHandler(peerId);
      }
    }
  }

  async startStreaming(stream: MediaStream) {
    this.localStream = stream;
    // MASTERの場合、既存のピア接続に対してストリームを追加
    if (this.role === 'MASTER') {
      for (const [peerId, pc] of this.peerConnections) {
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.signalingClient?.sendSdpOffer(offer, peerId);
      }
    }
  }

  onStream(handler: (stream: MediaStream, peerId: string) => void) {
    this.onStreamHandler = handler;
  }

  onStreamRemoved(handler: (peerId: string) => void) {
    this.onStreamRemovedHandler = handler;
  }

  disconnect() {
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.peerConnections.forEach((pc) => pc.close());
    this.peerConnections.clear();
    this.signalingClient?.close();
  }
}
