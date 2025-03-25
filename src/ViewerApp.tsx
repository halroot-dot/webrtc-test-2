import React, { useEffect, useRef, useState } from 'react';
import { WebRTCClient } from './utils/webrtc';

interface VideoStreamProps {
  stream: MediaStream;
  label: string;
  isMaximized: boolean;
  onToggleMaximize: () => void;
}

const VideoStream: React.FC<VideoStreamProps> = ({
  stream,
  label,
  isMaximized,
  onToggleMaximize,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      // 自動再生の問題を解決するためのオプション設定
      videoRef.current.play().catch((error) => {
        console.error('Error playing video:', error);
      });
    }
  }, [stream]);

  return (
    <div
      className={`video-container ${isMaximized ? 'maximized' : ''}`}
      onClick={onToggleMaximize}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={false} // 視聴者側は音声を再生
      />
      <div className="stream-info">
        {label}
        <span className="maximize-hint">
          {isMaximized ? '(クリックで戻る)' : '(クリックで最大化)'}
        </span>
      </div>
    </div>
  );
};

const ViewerApp: React.FC = () => {
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(
    new Map()
  );
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] =
    useState<string>('disconnected');
  const [maximizedPeerId, setMaximizedPeerId] = useState<string | null>(null);
  const webrtcClientRef = useRef<WebRTCClient | null>(null);

  useEffect(() => {
    // ViewerとしてWebRTCClientを初期化
    webrtcClientRef.current = new WebRTCClient('VIEWER');

    // ストリーム受信時のハンドラを設定
    webrtcClientRef.current.onStream((stream, peerId) => {
      console.log('Received remote stream:', stream, 'from peer:', peerId);
      setRemoteStreams((prev) => {
        const newStreams = new Map(prev);
        newStreams.set(peerId, stream);
        return newStreams;
      });
    });

    // ストリーム削除時のハンドラを設定
    webrtcClientRef.current.onStreamRemoved((peerId) => {
      console.log('Stream removed for peer:', peerId);
      setRemoteStreams((prev) => {
        const newStreams = new Map(prev);
        newStreams.delete(peerId);
        return newStreams;
      });
    });

    // クリーンアップ
    return () => {
      webrtcClientRef.current?.disconnect();
    };
  }, []);

  const connectToStream = async () => {
    try {
      setConnectionStatus('connecting');
      console.log('Connecting to stream...');
      await webrtcClientRef.current?.initialize();

      // 空のストリームを作成（Viewerの場合は送信しないため）
      const emptyStream = new MediaStream();
      await webrtcClientRef.current?.startStreaming(emptyStream);

      setIsConnected(true);
      setConnectionStatus('connected');
    } catch (error) {
      console.error('Error connecting to stream:', error);
      setIsConnected(false);
      setConnectionStatus('error');
    }
  };

  const disconnectFromStream = () => {
    webrtcClientRef.current?.disconnect();
    setRemoteStreams(new Map());
    setIsConnected(false);
    setConnectionStatus('disconnected');
  };

  const handleToggleMaximize = (peerId: string) => {
    setMaximizedPeerId((currentPeerId) =>
      currentPeerId === peerId ? null : peerId
    );
  };

  return (
    <div className="app">
      <header>
        <h1>WebRTC Stream Viewer</h1>
        <div className="controls">
          <button
            onClick={isConnected ? disconnectFromStream : connectToStream}
            disabled={connectionStatus === 'connecting'}
          >
            {isConnected ? 'Disconnect' : 'Connect to Stream'}
          </button>
          <span className={`status ${connectionStatus}`}>
            Status: {connectionStatus}
          </span>
        </div>
      </header>
      <div
        className={`streams-container ${
          maximizedPeerId ? 'has-maximized' : ''
        }`}
      >
        {remoteStreams.size === 0 && isConnected && (
          <div className="no-streams">Waiting for streams...</div>
        )}
        {Array.from(remoteStreams.entries()).map(([peerId, stream]) => (
          <VideoStream
            key={peerId}
            stream={stream}
            label={`Stream from ${peerId}`}
            isMaximized={maximizedPeerId === peerId}
            onToggleMaximize={() => handleToggleMaximize(peerId)}
          />
        ))}
      </div>
      <style>{`
        .app {
          padding: 20px;
          max-width: 100%;
          margin: 0 auto;
        }
        .controls {
          display: flex;
          align-items: center;
          gap: 20px;
          margin-bottom: 20px;
        }
        .status {
          padding: 5px 10px;
          border-radius: 4px;
          font-weight: bold;
        }
        .status.connecting {
          background: #ffd700;
          color: #000;
        }
        .status.connected {
          background: #4caf50;
          color: #fff;
        }
        .status.disconnected {
          background: #ccc;
          color: #000;
        }
        .status.error {
          background: #f44336;
          color: #fff;
        }
        .streams-container {
          display: flex;
          flex-direction: column;
          gap: 20px;
          margin-top: 20px;
          width: 100%;
          max-width: 1200px;
          margin-left: auto;
          margin-right: auto;
          transition: all 0.3s ease;
        }
        .streams-container.has-maximized {
          max-width: 100%;
        }
        .no-streams {
          text-align: center;
          padding: 40px;
          background: #f5f5f5;
          border-radius: 8px;
          font-size: 1.2em;
          color: #666;
        }
        .video-container {
          position: relative;
          background: #000;
          border-radius: 8px;
          overflow: hidden;
          aspect-ratio: 16/9;
          width: 100%;
          cursor: pointer;
          transition: all 0.3s ease;
        }
        .video-container:hover {
          transform: scale(1.01);
          box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        }
        .video-container.maximized {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          z-index: 1000;
          border-radius: 0;
          aspect-ratio: unset;
        }
        .video-container.maximized:hover {
          transform: none;
          box-shadow: none;
        }
        video {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
        .stream-info {
          position: absolute;
          bottom: 20px;
          left: 20px;
          background: rgba(0,0,0,0.7);
          color: white;
          padding: 10px 15px;
          border-radius: 8px;
          font-size: 1.1em;
          display: flex;
          align-items: center;
          gap: 10px;
          opacity: 0.8;
          transition: opacity 0.3s ease;
        }
        .video-container:hover .stream-info {
          opacity: 1;
        }
        .maximize-hint {
          font-size: 0.9em;
          opacity: 0.8;
        }
      `}</style>
    </div>
  );
};

export default ViewerApp;
