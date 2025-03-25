const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

// クライアント管理
const clients = new Map();
let masterClient = null;

wss.on('connection', (ws) => {
  console.log('New client connected');
  let clientInfo = null;

  ws.on('message', (message) => {
    const data = JSON.parse(message);
    console.log('Received message:', data);

    switch (data.type) {
      case 'register':
        clientInfo = {
          role: data.role,
          clientId: data.clientId,
          ws: ws,
        };
        clients.set(data.clientId, clientInfo);

        // MASTERクライアントの場合、保存
        if (data.role === 'MASTER') {
          masterClient = clientInfo;
        }

        // 登録完了を通知
        ws.send(JSON.stringify({ type: 'registered' }));

        // 新しいクライアントの参加を他のクライアントに通知
        broadcastPeerJoined(clientInfo);

        // 既存のピアの情報を新しいクライアントに送信
        sendExistingPeers(ws);
        break;

      case 'offer':
      case 'answer':
      case 'ice-candidate':
        const targetClient = data.to ? clients.get(data.to) : null;
        if (targetClient) {
          targetClient.ws.send(message.toString());
        }
        break;
    }
  });

  ws.on('close', () => {
    if (clientInfo) {
      console.log(
        `Client disconnected: ${clientInfo.clientId} (${clientInfo.role})`
      );
      clients.delete(clientInfo.clientId);

      // MASTERクライアントが切断された場合
      if (clientInfo.role === 'MASTER' && masterClient === clientInfo) {
        masterClient = null;
      }

      // 切断を他のクライアントに通知
      broadcastPeerLeft(clientInfo);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

function broadcastPeerJoined(newPeer) {
  const message = JSON.stringify({
    type: 'peer-joined',
    peer: {
      id: newPeer.clientId,
      role: newPeer.role,
    },
  });

  clients.forEach((client, clientId) => {
    if (clientId !== newPeer.clientId) {
      client.ws.send(message);
    }
  });
}

function broadcastPeerLeft(peer) {
  const message = JSON.stringify({
    type: 'peer-left',
    peer: {
      id: peer.clientId,
      role: peer.role,
    },
  });

  clients.forEach((client, clientId) => {
    if (clientId !== peer.clientId) {
      client.ws.send(message);
    }
  });
}

function sendExistingPeers(ws) {
  clients.forEach((client, clientId) => {
    if (client.ws !== ws) {
      ws.send(
        JSON.stringify({
          type: 'peer-joined',
          peer: {
            id: client.clientId,
            role: client.role,
          },
        })
      );
    }
  });
}

console.log('WebSocket server is running on port 8080');
