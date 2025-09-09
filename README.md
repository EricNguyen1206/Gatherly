# ZoomRTC - Zero Dependency P2P Video Conference

A modern, zero-dependency video conference application with Google Meet-inspired UI, built using only Node.js built-in modules.

## 🚀 Quick Start

### Zero Configuration Setup
```bash
# Clone or download the project
# No npm install needed!

# Start the server
node server.js

# Access the application
# Open browser: https://localhost:3000
```

That's it! No dependencies, no configuration files, no package managers required.

## ✨ Features

### 🎥 Video Conference
- **P2P Video Calls**: Real-time video communication using WebRTC
- **Multi-user Support**: Join rooms with multiple participants
- **Screen Sharing**: Share your screen with other participants
- **Audio/Video Controls**: Toggle camera and microphone independently

### 🎨 Modern UI
- **Google Meet Design**: Clean, modern interface inspired by Google Meet
- **Dark Theme**: Professional dark theme with Google's color palette
- **Responsive Layout**: Works on desktop, tablet, and mobile devices
- **Participant Panel**: Real-time participant list with status indicators

### 🔒 Security & Performance
- **HTTPS Support**: Built-in SSL/TLS with self-signed certificates
- **LAN Access**: Share meetings across local network
- **Smart IP Detection**: Automatically detects Ethernet IP for LAN sharing
- **Media Access Handling**: Graceful fallback for restricted media access

### 🛠️ Technical Features
- **Zero Dependencies**: Uses only Node.js built-in modules
- **Custom WebSocket**: Lightweight WebSocket implementation
- **Auto-reconnection**: Automatic reconnection on connection loss
- **Cross-platform**: Works on Windows, macOS, and Linux

## 📁 Project Structure

```
ZoomRTC/
├── server.js              # Main server (Node.js + HTTPS + WebSocket)
├── index.html             # Frontend application (HTML + CSS + JS)
├── config.json            # Configuration file
├── websocket-server.js    # Custom WebSocket implementation
├── key.pem               # SSL private key
├── cert.pem              # SSL certificate
└── README.md             # This file
```

## 🎯 Usage

### Starting a Meeting
1. **Start Server**: Run `node server.js`
2. **Open Browser**: Navigate to `https://localhost:3000`
3. **Accept SSL Warning**: Click "Advanced" → "Proceed to localhost (unsafe)"
4. **Enter Details**: Input your name and room ID
5. **Join Meeting**: Click "Join" button

### Sharing a Meeting
1. **Copy Room URL**: Click "📋 Copy Room URL" button
2. **Share Link**: Send the HTTPS URL to other participants
3. **LAN Access**: Others can join via your LAN IP (e.g., `https://10.1.13.36:3000`)

### Meeting Controls
- **🎤 Microphone**: Toggle audio on/off
- **📹 Camera**: Toggle video on/off  
- **🖥️ Screen Share**: Present your screen
- **📞 Leave**: Exit the meeting
- **🔗 Copy URL**: Share meeting link

## ⚙️ Configuration

### config.json
```json
{
  "server": {
    "port": 3000,
    "host": "0.0.0.0",
    "https": {
      "enabled": true,
      "keyFile": "key.pem",
      "certFile": "cert.pem"
    }
  },
  "client": {
    "serverUrl": "https://localhost:3000",
    "wsUrl": "wss://localhost:3000"
  },
  "webrtc": {
    "iceServers": [
      {"urls": "stun:stun.l.google.com:19302"},
      {"urls": "stun:stun1.l.google.com:19302"}
    ]
  }
}
```

## 🔧 Technical Details

### Zero Dependencies
- **No npm install**: Uses only Node.js built-in modules
- **Custom WebSocket**: Lightweight WebSocket server implementation
- **Built-in HTTPS**: Node.js https module with self-signed certificates
- **Pure JavaScript**: No external libraries or frameworks

### WebRTC Implementation
- **STUN Servers**: Google's public STUN servers for NAT traversal
- **P2P Communication**: Direct peer-to-peer video/audio streaming
- **Screen Sharing**: Display Media API for screen capture
- **Media Handling**: Graceful fallback for restricted media access

### Network Features
- **Smart IP Detection**: Automatically finds Ethernet IP for LAN sharing
- **HTTPS/WSS**: Secure connections with SSL/TLS
- **CORS-free**: Same-origin setup eliminates CORS issues
- **Auto-reconnection**: WebSocket reconnection on connection loss

## 🌐 Network Access

### Local Access
- **HTTPS**: `https://localhost:3000`
- **Features**: Full media access (camera, microphone)

### LAN Access  
- **HTTPS**: `https://[YOUR_LAN_IP]:3000` (e.g., `https://10.1.13.36:3000`)
- **Features**: Full media access with HTTPS
- **Sharing**: Copy room URL for others to join

### Browser Security
- **SSL Warning**: Browser will show security warning for self-signed certificate
- **Solution**: Click "Advanced" → "Proceed to [hostname] (unsafe)"
- **Media Access**: HTTPS required for camera/microphone access via IP

## 🚀 Deployment

### Development
```bash
node server.js
```

### Production
```bash
# Set environment
export NODE_ENV=production

# Start server
node server.js
```

### Docker (Optional)
```dockerfile
FROM node:18-alpine
COPY . /app
WORKDIR /app
EXPOSE 3000
CMD ["node", "server.js"]
```

## 🔍 Troubleshooting

### Common Issues

**SSL Certificate Warning**
- Expected behavior for self-signed certificates
- Click "Advanced" → "Proceed to continue"

**Media Access Denied**
- Use HTTPS instead of HTTP
- Access via localhost for full permissions
- Check browser permissions for camera/microphone

**Connection Issues**
- Ensure firewall allows port 3000
- Check if another process is using port 3000
- Verify network connectivity

**Screen Sharing Not Working**
- Ensure browser supports Display Media API
- Check screen sharing permissions
- Try refreshing the page

## 📝 License

MIT License - Feel free to use and modify for your projects.

## 🤝 Contributing

This is a zero-dependency project. Contributions should maintain the zero-dependency philosophy:
- Use only Node.js built-in modules
- No external package dependencies
- Keep the codebase lightweight and portable

---

**ZoomRTC** - Modern video conferencing with zero dependencies! 🎥✨