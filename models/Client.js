const EventEmitter = require('events');

/**
 * Client class - Đại diện cho 1 WebSocket connection
 * Mỗi client có userId, roomId và WebSocket connection
 */
class Client extends EventEmitter {
    constructor(ws, userId = null, roomId = null) {
        super();
        this.ws = ws;
        this.userId = userId;
        this.roomId = roomId;
        this.isConnected = true;
        this.joinTime = new Date();
        
        this.setupWebSocketHandlers();
    }

    /**
     * Thiết lập các event handlers cho WebSocket
     */
    setupWebSocketHandlers() {
        this.ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                this.emit('message', message);
            } catch (error) {
                console.error('❌ Error parsing message from client:', this.userId, error);
            }
        });

        this.ws.on('close', () => {
            this.isConnected = false;
            this.emit('disconnect');
        });

        this.ws.on('error', (error) => {
            console.error(`❌ WebSocket error for client ${this.userId}:`, error);
            this.emit('error', error);
        });
    }

    /**
     * Gửi message đến client
     * @param {string} type - Loại message
     * @param {object} data - Dữ liệu message
     */
    send(type, data) {
        if (!this.isConnected || this.ws.readyState !== 1) {
            return false;
        }

        try {
            const message = JSON.stringify({ type, data });
            this.ws.send(message);
            return true;
        } catch (error) {
            console.error(`❌ Error sending message to client ${this.userId}:`, error);
            return false;
        }
    }

    /**
     * Join vào room
     * @param {string} roomId - ID của room
     */
    joinRoom(roomId) {
        this.roomId = roomId;
    }

    /**
     * Leave khỏi room
     */
    leaveRoom() {
        const oldRoomId = this.roomId;
        this.roomId = null;
        return oldRoomId;
    }

    /**
     * Đóng connection
     */
    close() {
        if (this.isConnected) {
            this.isConnected = false;
            this.ws.close();
        }
    }

    /**
     * Lấy thông tin client
     */
    getInfo() {
        return {
            userId: this.userId,
            roomId: this.roomId,
            isConnected: this.isConnected,
            joinTime: this.joinTime
        };
    }
}

module.exports = Client;
