const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('./websocket-server');
const os = require('os');

// Load configuration from config.json
let config;
try {
  const configData = fs.readFileSync('./config.json', 'utf8');
  config = JSON.parse(configData);
  console.log('Configuration loaded from config.json');
} catch (error) {
  console.error('Error loading config.json:', error.message);
  // Fallback to default configuration
  config = {
    server: {
      port: 5000,
      host: '0.0.0.0',
      corsOrigin: '*',
      nodeEnv: 'development'
    }
  };
  console.log('Using default configuration');
}

// In-memory storage
const rooms = new Map();
const connections = new Map(); // ws -> {userId, roomId}

// MIME types
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml'
};

// Function to get local IP address
function getLocalIPAddress() {
  const interfaces = os.networkInterfaces();
  
  // Priority order for network interfaces (exact match first, then contains)
  const priorityInterfaces = ['Ethernet', 'Wi-Fi', 'WiFi', 'en0', 'eth0'];
  
  // First, try exact match for priority interfaces
  for (const priorityName of priorityInterfaces) {
    if (interfaces[priorityName]) {
      for (const iface of interfaces[priorityName]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          console.log(`Found exact match ${priorityName} interface with IP: ${iface.address}`);
          return iface.address;
        }
      }
    }
  }
  
  // Then try contains match for priority interfaces
  for (const priorityName of priorityInterfaces) {
    for (const name of Object.keys(interfaces)) {
      if (name.toLowerCase().includes(priorityName.toLowerCase()) && 
          !name.toLowerCase().includes('vethernet') && // Exclude vEthernet
          !name.toLowerCase().includes('default switch')) { // Exclude Default Switch
        for (const iface of interfaces[name]) {
          if (iface.family === 'IPv4' && !iface.internal) {
            console.log(`Found ${name} interface with IP: ${iface.address}`);
            return iface.address;
          }
        }
      }
    }
  }
  
  // If no priority interface found, get the first non-internal IPv4 address
  // but exclude vEthernet and virtual interfaces
  for (const name of Object.keys(interfaces)) {
    if (!name.toLowerCase().includes('vethernet') && 
        !name.toLowerCase().includes('default switch') &&
        !name.toLowerCase().includes('virtual')) {
      for (const iface of interfaces[name]) {
        // Skip internal (loopback) and non-IPv4 addresses
        if (iface.family === 'IPv4' && !iface.internal) {
          console.log(`Using ${name} interface with IP: ${iface.address}`);
          return iface.address;
        }
      }
    }
  }
  
  return 'localhost';
}

// Function to get all network interfaces for debugging
function getAllNetworkInterfaces() {
  const interfaces = os.networkInterfaces();
  const result = {};
  
  for (const name of Object.keys(interfaces)) {
    result[name] = interfaces[name].map(iface => ({
      address: iface.address,
      family: iface.family,
      internal: iface.internal
    }));
  }
  
  return result;
}

// Create server (HTTP or HTTPS)
let server;
if (config.server.https && config.server.https.enabled) {
  try {
    const key = fs.readFileSync(config.server.https.keyFile);
    const cert = fs.readFileSync(config.server.https.certFile);
    server = https.createServer({ key, cert }, (req, res) => {
      handleRequest(req, res);
    });
    console.log('HTTPS server created with SSL certificates');
  } catch (error) {
    console.error('Error loading SSL certificates:', error.message);
    console.log('Falling back to HTTP server');
    server = http.createServer((req, res) => {
      handleRequest(req, res);
    });
  }
} else {
  server = http.createServer((req, res) => {
    handleRequest(req, res);
  });
}

// Request handler function
function handleRequest(req, res) {
  // CORS headers not needed since client and server are on same origin
  // res.setHeader('Access-Control-Allow-Origin', config.server.corsOrigin);
  // res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  // res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle IP endpoint
  if (req.url === '/ip') {
    const localIP = getLocalIPAddress();
    const allInterfaces = getAllNetworkInterfaces();
    const protocol = (config.server.https && config.server.https.enabled) ? 'https' : 'http';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      ip: localIP,
      port: config.server.port,
      url: `${protocol}://${localIP}:${config.server.port}`,
      protocol: protocol,
      allInterfaces: allInterfaces
    }));
    return;
  }

  let filePath = '.' + req.url;
  if (filePath === './') filePath = './index.html';

  const extname = String(path.extname(filePath)).toLowerCase();
  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 Not Found</h1>', 'utf-8');
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${error.code}`, 'utf-8');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
}

// WebSocket Server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('New WebSocket connection');

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleMessage(ws, message);
    } catch (error) {
      console.error('Invalid JSON message:', error);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
    handleDisconnect(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    handleDisconnect(ws);
  });
});

function handleMessage(ws, message) {
  const { type, data } = message;

  switch (type) {
    case 'join-room':
      handleJoinRoom(ws, data.roomId, data.userId);
      break;
    
    case 'offer':
      handleOffer(ws, data.offer, data.targetUserId);
      break;
    
    case 'answer':
      handleAnswer(ws, data.answer, data.targetUserId);
      break;
    
    case 'ice-candidate':
      handleIceCandidate(ws, data.candidate, data.targetUserId);
      break;
    
    default:
      console.log('Unknown message type:', type);
  }
}

function handleJoinRoom(ws, roomId, userId) {
  console.log(`User ${userId} joining room ${roomId}`);

  // Initialize room if not exists
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }

  const room = rooms.get(roomId);
  
  // Store connection info
  connections.set(ws, { userId, roomId });

  // Send existing users to new user
  const existingUsers = Array.from(room);
  sendMessage(ws, 'existing-users', { users: existingUsers });

  // Notify existing users about new user
  broadcastToRoom(roomId, 'user-joined', { userId }, ws);

  // Add user to room
  room.add(userId);
  
  console.log(`Room ${roomId} now has users:`, Array.from(room));
}

function handleOffer(ws, offer, targetUserId) {
  const connection = connections.get(ws);
  if (!connection) return;

  console.log(`Offer from ${connection.userId} to ${targetUserId}`);
  
  sendToUser(connection.roomId, targetUserId, 'offer', {
    offer,
    fromUserId: connection.userId,
    targetUserId
  });
}

function handleAnswer(ws, answer, targetUserId) {
  const connection = connections.get(ws);
  if (!connection) return;

  console.log(`Answer from ${connection.userId} to ${targetUserId}`);
  
  sendToUser(connection.roomId, targetUserId, 'answer', {
    answer,
    fromUserId: connection.userId,
    targetUserId
  });
}

function handleIceCandidate(ws, candidate, targetUserId) {
  const connection = connections.get(ws);
  if (!connection) return;

  sendToUser(connection.roomId, targetUserId, 'ice-candidate', {
    candidate,
    fromUserId: connection.userId,
    targetUserId
  });
}

function handleDisconnect(ws) {
  const connection = connections.get(ws);
  if (!connection) return;

  const { userId, roomId } = connection;
  
  // Remove from room
  const room = rooms.get(roomId);
  if (room) {
    room.delete(userId);
    
    // Notify other users
    broadcastToRoom(roomId, 'user-left', { userId }, ws);
    
    // Clean up empty rooms
    if (room.size === 0) {
      rooms.delete(roomId);
      console.log(`Room ${roomId} deleted (empty)`);
    }
  }
  
  // Remove connection
  connections.delete(ws);
}

function sendMessage(ws, type, data) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ type, data }));
  }
}

function broadcastToRoom(roomId, type, data, excludeWs = null) {
  connections.forEach((connection, ws) => {
    if (connection.roomId === roomId && ws !== excludeWs) {
      sendMessage(ws, type, data);
    }
  });
}

function sendToUser(roomId, targetUserId, type, data) {
  connections.forEach((connection, ws) => {
    if (connection.roomId === roomId && connection.userId === targetUserId) {
      sendMessage(ws, type, data);
    }
  });
}

const PORT = config.server.port;
const HOST = config.server.host;
server.listen(PORT, HOST, () => {
  const localIP = getLocalIPAddress();
  const protocol = (config.server.https && config.server.https.enabled) ? 'https' : 'http';
  const wsProtocol = (config.server.https && config.server.https.enabled) ? 'wss' : 'ws';
  
  console.log(`Server running on ${protocol}://${HOST}:${PORT}`);
  console.log(`Environment: ${config.server.nodeEnv}`);
  console.log(`Same Origin: Client and server running on same origin`);
  console.log(`LAN access: ${protocol}://${localIP}:${PORT}`);
  console.log(`WebSocket: ${wsProtocol}://${localIP}:${PORT}`);
  
  if (config.server.https && config.server.https.enabled) {
    console.log('🔒 HTTPS enabled with SSL certificates');
    console.log('⚠️  Note: Self-signed certificate - browser will show security warning');
    console.log('   Click "Advanced" → "Proceed to localhost (unsafe)" to continue');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Server shutting down...');
  wss.close();
  server.close();
});