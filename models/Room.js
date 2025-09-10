const EventEmitter = require('events');

/**
 * Room class - Quản lý danh sách clients trong 1 room
 * Mỗi room có roomId và danh sách clients
 */
class Room extends EventEmitter {
    constructor(roomId) {
        super();
        this.roomId = roomId;
        this.clients = new Map(); // userId -> Client
        this.createdAt = new Date();
    }

    /**
     * Thêm client vào room
     * @param {Client} client - Client object
     * @param {boolean} emitEvent - Có emit event clientJoined không (default: true)
     */
    addClient(client, emitEvent = true) {
        if (this.clients.has(client.userId)) {
            return false;
        }

        this.clients.set(client.userId, client);
        client.joinRoom(this.roomId);
        
        // Emit event để Hub có thể xử lý
        if (emitEvent) {
            this.emit('clientJoined', client);
        }
        
        return true;
    }

    /**
     * Xóa client khỏi room
     * @param {string} userId - ID của user
     * @param {boolean} emitEvent - Có emit event clientLeft không (default: true)
     */
    removeClient(userId, emitEvent = true) {
        const client = this.clients.get(userId);
        if (!client) {
            return false;
        }

        this.clients.delete(userId);
        client.leaveRoom();
        
        // Emit event để Hub có thể xử lý (trừ khi đang replace connection)
        if (emitEvent) {
            this.emit('clientLeft', client);
        }
        
        return true;
    }

    /**
     * Lấy client theo userId
     * @param {string} userId - ID của user
     */
    getClient(userId) {
        return this.clients.get(userId);
    }

    /**
     * Lấy danh sách tất cả clients
     */
    getAllClients() {
        return Array.from(this.clients.values());
    }

    /**
     * Lấy danh sách userIds
     */
    getUserIds() {
        return Array.from(this.clients.keys());
    }

    /**
     * Gửi message đến tất cả clients trong room
     * @param {string} type - Loại message
     * @param {object} data - Dữ liệu message
     * @param {string} excludeUserId - UserId cần loại trừ
     */
    broadcast(type, data, excludeUserId = null) {
        let sentCount = 0;
        this.clients.forEach((client, userId) => {
            if (excludeUserId && userId === excludeUserId) {
                return;
            }
            
            if (client.send(type, data)) {
                sentCount++;
            }
        });
        return sentCount;
    }

    /**
     * Gửi message đến 1 client cụ thể trong room
     * @param {string} targetUserId - UserId của client nhận
     * @param {string} type - Loại message
     * @param {object} data - Dữ liệu message
     */
    sendToClient(targetUserId, type, data) {
        const client = this.getClient(targetUserId);
        if (!client) {
            return false;
        }
        
        return client.send(type, data);
    }

    /**
     * Kiểm tra room có trống không
     */
    isEmpty() {
        return this.clients.size === 0;
    }

    /**
     * Lấy số lượng clients
     */
    getClientCount() {
        return this.clients.size;
    }

    /**
     * Lấy thông tin room
     */
    getInfo() {
        return {
            roomId: this.roomId,
            clientCount: this.clients.size,
            userIds: this.getUserIds(),
            createdAt: this.createdAt
        };
    }

    /**
     * Dọn dẹp room (đóng tất cả connections)
     */
    cleanup() {
        this.clients.forEach((client) => {
            client.close();
        });
        this.clients.clear();
    }
}

module.exports = Room;
