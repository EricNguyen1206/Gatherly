const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('./websocket-server');
const Hub = require('./models/Hub');
const os = require('os');

// Load configuration from config.json
let config;
try {
  const configData = fs.readFileSync('./config.json', 'utf8');
  config = JSON.parse(configData);
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

// Initialize Hub for WebSocket management
const hub = new Hub();

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
  } catch (error) {
    console.error('Error loading SSL certificates:', error.message);
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
  // Tạo client mới và giao cho Hub quản lý
  const client = hub.createClient(ws);
});

// Tất cả logic WebSocket đã được chuyển vào Hub class
// Hub sẽ tự động xử lý tất cả messages và connections

const PORT = config.server.port;
const HOST = config.server.host;
server.listen(PORT, HOST, () => {
  const localIP = getLocalIPAddress();
  const protocol = (config.server.https && config.server.https.enabled) ? 'https' : 'http';
  
  console.log(`Server running on ${protocol}://${HOST}:${PORT}`);
  console.log(`Local access: ${protocol}://localhost:${PORT}`);
  console.log(`LAN access: ${protocol}://${localIP}:${PORT}`);
  
  if (config.server.https && config.server.https.enabled) {
    console.log('🔒 HTTPS enabled with SSL certificates');
    console.log('⚠️  Note: Self-signed certificate - browser will show security warning');
    console.log('   Click "Advanced" → "Proceed to localhost (unsafe)" to continue');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  hub.cleanup();
  wss.close();
  server.close();
});

process.on('SIGINT', () => {
  hub.cleanup();
  wss.close();
  server.close();
});