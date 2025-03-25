import React, { useEffect, useRef, useState } from 'react';
import { WebRTCClient } from './utils/webrtc';

interface VideoStreamProps {
  stream: MediaStream;
  label: string;
}

const VideoStream: React.FC<VideoStreamProps> = ({ stream, label }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch((error) => {
        console.error('Error playing video:', error);
      });
    }
  }, [stream]);

  return (
    <div className="video-container">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted // ローカルストリームの場合はミュート
      />
      <div className="stream-info">{label}</div>
    </div>
  );
};

const App: React.FC = () => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(
    new Map()
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const webrtcClientRef = useRef<WebRTCClient | null>(null);

  useEffect(() => {
    webrtcClientRef.current = new WebRTCClient('MASTER');

    // リモートストリーム受信時のハンドラを設定
    webrtcClientRef.current.onStream((stream) => {
      console.log('Received remote stream:', stream);
      setRemoteStreams((prev) => {
        const newStreams = new Map(prev);
        newStreams.set(stream.id, stream);
        return newStreams;
      });
    });

    return () => {
      webrtcClientRef.current?.disconnect();
    };
  }, []);

  const startStreaming = async () => {
    try {
      console.log('Starting stream...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: true,
      });

      console.log('Got local stream:', stream);
      setLocalStream(stream);

      await webrtcClientRef.current?.initialize();
      await webrtcClientRef.current?.startStreaming(stream);

      setIsStreaming(true);
    } catch (error) {
      console.error('Error accessing media devices:', error);
    }
  };

  return (
    <div className="app">
      <header>
        <h1>WebRTC Streaming</h1>
        <button onClick={startStreaming} disabled={isStreaming}>
          {isStreaming ? 'Streaming...' : 'Start Streaming'}
        </button>
      </header>
      <div className="streams-container">
        {localStream && (
          <VideoStream stream={localStream} label="Local Stream" />
        )}
        {Array.from(remoteStreams.entries()).map(([id, stream]) => (
          <VideoStream
            key={id}
            stream={stream}
            label={`Remote Stream (${id})`}
          />
        ))}
      </div>
      <style>{`
        .app {
          padding: 20px;
          max-width: 1200px;
          margin: 0 auto;
        }
        .streams-container {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 20px;
          margin-top: 20px;
        }
        .video-container {
          position: relative;
          background: #000;
          border-radius: 8px;
          overflow: hidden;
          aspect-ratio: 16/9;
        }
        video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .stream-info {
          position: absolute;
          bottom: 10px;
          left: 10px;
          background: rgba(0,0,0,0.7);
          color: white;
          padding: 5px 10px;
          border-radius: 4px;
        }
      `}</style>
    </div>
  );
};

export default App;
