import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import App from './App';
import ViewerApp from './ViewerApp';

const isStreamingDisabled = import.meta.env.VITE_DISABLE_STREAMING === 'true';

const Root = () => (
  <Router>
    <div>
      {!isStreamingDisabled && (
        <nav
          style={{
            padding: '1rem',
            backgroundColor: '#f0f0f0',
            marginBottom: '1rem',
          }}
        >
          <Link to="/" style={{ marginRight: '1rem' }}>
            Broadcaster
          </Link>
          <Link to="/viewer">Viewer</Link>
        </nav>
      )}
      <Routes>
        {isStreamingDisabled ? (
          // ストリーミングが無効な場合は、すべてのパスをビューワーページにリダイレクト
          <Route path="*" element={<ViewerApp />} />
        ) : (
          // 通常のルーティング
          <>
            <Route path="/" element={<App />} />
            <Route path="/viewer" element={<ViewerApp />} />
          </>
        )}
      </Routes>
    </div>
  </Router>
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
