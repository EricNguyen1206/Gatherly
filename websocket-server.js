// Simple WebSocket Server Implementation
// Based on Node.js built-in modules only

const EventEmitter = require('events');
const crypto = require('crypto');

class WebSocketServer extends EventEmitter {
    constructor(options) {
        super();
        this.server = options.server;
        this.clients = new Set();
        this.setupServer();
    }

    setupServer() {
        this.server.on('upgrade', (request, socket, head) => {
            this.handleUpgrade(request, socket, head);
        });
    }

    handleUpgrade(request, socket, head) {
        const key = request.headers['sec-websocket-key'];
        if (!key) {
            socket.destroy();
            return;
        }

        // Generate accept key
        const acceptKey = this.generateAcceptKey(key);
        
        // Send upgrade response
        const response = [
            'HTTP/1.1 101 Switching Protocols',
            'Upgrade: websocket',
            'Connection: Upgrade',
            `Sec-WebSocket-Accept: ${acceptKey}`,
            '',
            ''
        ].join('\r\n');

        socket.write(response);
        
        // Create WebSocket connection
        const ws = new WebSocketConnection(socket);
        this.clients.add(ws);
        
        ws.on('close', () => {
            this.clients.delete(ws);
        });

        this.emit('connection', ws);
    }

    generateAcceptKey(key) {
        const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
        const hash = crypto.createHash('sha1');
        hash.update(key + GUID);
        return hash.digest('base64');
    }

    close() {
        this.clients.forEach(client => {
            client.close();
        });
        this.clients.clear();
    }
}

class WebSocketConnection extends EventEmitter {
    constructor(socket) {
        super();
        this.socket = socket;
        this.readyState = 1; // OPEN
        this.setupSocket();
    }

    setupSocket() {
        this.socket.on('data', (data) => {
            this.handleData(data);
        });

        this.socket.on('close', () => {
            this.readyState = 3; // CLOSED
            this.emit('close');
        });

        this.socket.on('error', (error) => {
            this.emit('error', error);
        });
    }

    handleData(data) {
        if (data.length < 2) return;

        const firstByte = data[0];
        const secondByte = data[1];
        
        const fin = (firstByte & 0x80) !== 0;
        const opcode = firstByte & 0x0F;
        const masked = (secondByte & 0x80) !== 0;
        let payloadLength = secondByte & 0x7F;

        let maskKey = null;
        let payloadStart = 2;

        if (payloadLength === 126) {
            if (data.length < 4) return;
            payloadLength = data.readUInt16BE(2);
            payloadStart = 4;
        } else if (payloadLength === 127) {
            if (data.length < 10) return;
            payloadLength = data.readUInt32BE(6);
            payloadStart = 10;
        }

        if (masked) {
            if (data.length < payloadStart + 4) return;
            maskKey = data.slice(payloadStart, payloadStart + 4);
            payloadStart += 4;
        }

        if (data.length < payloadStart + payloadLength) return;

        const payload = data.slice(payloadStart, payloadStart + payloadLength);

        if (masked && maskKey) {
            for (let i = 0; i < payload.length; i++) {
                payload[i] ^= maskKey[i % 4];
            }
        }

        if (opcode === 1) { // Text frame
            const message = payload.toString('utf8');
            this.emit('message', message);
        } else if (opcode === 8) { // Close frame
            this.close();
        }
    }

    send(data) {
        if (this.readyState !== 1) return;

        const message = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
        const length = message.length;
        
        let frame;
        if (length < 126) {
            frame = Buffer.allocUnsafe(2 + length);
            frame[0] = 0x81; // FIN + text frame
            frame[1] = length;
            message.copy(frame, 2);
        } else if (length < 65536) {
            frame = Buffer.allocUnsafe(4 + length);
            frame[0] = 0x81; // FIN + text frame
            frame[1] = 126;
            frame.writeUInt16BE(length, 2);
            message.copy(frame, 4);
        } else {
            frame = Buffer.allocUnsafe(10 + length);
            frame[0] = 0x81; // FIN + text frame
            frame[1] = 127;
            frame.writeUInt32BE(0, 2);
            frame.writeUInt32BE(length, 6);
            message.copy(frame, 10);
        }

        this.socket.write(frame);
    }

    close() {
        if (this.readyState === 3) return;
        
        this.readyState = 3; // CLOSED
        
        // Send close frame
        const closeFrame = Buffer.from([0x88, 0x00]); // Close frame
        this.socket.write(closeFrame);
        
        this.socket.destroy();
        this.emit('close');
    }
}

module.exports = { WebSocketServer };
