const EventEmitter = require('events');
const Client = require('./Client');
const Room = require('./Room');

/**
 * Hub class - Quản lý tất cả rooms và routing messages
 * Hub là trung tâm điều phối tất cả hoạt động WebSocket
 */
class Hub extends EventEmitter {
    constructor() {
        super();
        this.rooms = new Map(); // roomId -> Room
        this.clients = new Map(); // ws -> Client (để tìm client từ WebSocket)
    }

    /**
     * Tạo client mới từ WebSocket connection
     * @param {WebSocket} ws - WebSocket connection
     */
    createClient(ws) {
        // Kiểm tra xem đã có client nào với WebSocket này chưa
        if (this.clients.has(ws)) {
            const oldClient = this.clients.get(ws);
            oldClient.close();
            this.clients.delete(ws);
        }
        
        const client = new Client(ws);
        
        // Lưu mapping ws -> client để dễ tìm
        this.clients.set(ws, client);
        
        // Thiết lập event handlers cho client
        this.setupClientHandlers(client);
        return client;
    }

    /**
     * Thiết lập event handlers cho client
     * @param {Client} client - Client object
     */
    setupClientHandlers(client) {
        // Xử lý messages từ client
        client.on('message', (message) => {
            this.handleClientMessage(client, message);
        });

        // Xử lý khi client disconnect
        client.on('disconnect', () => {
            this.handleClientDisconnect(client);
        });

        // Xử lý lỗi từ client
        client.on('error', (error) => {
            console.error(`❌ Client error:`, error);
        });
    }

    /**
     * Xử lý message từ client
     * @param {Client} client - Client gửi message
     * @param {object} message - Message object
     */
    handleClientMessage(client, message) {
        const { type, data } = message;

        switch (type) {
            case 'join-room':
                this.handleJoinRoom(client, data.roomId, data.userId);
                break;
            
            case 'offer':
                this.handleOffer(client, data.offer, data.targetUserId);
                break;
            
            case 'answer':
                this.handleAnswer(client, data.answer, data.targetUserId);
                break;
            
            case 'ice-candidate':
                this.handleIceCandidate(client, data.candidate, data.targetUserId);
                break;
            
            default:
                console.log(`🔍 Unknown message type: ${type}`);
        }
    }

    /**
     * Xử lý khi client disconnect
     * @param {Client} client - Client disconnect
     */
    handleClientDisconnect(client) {
        
        // Xóa client khỏi room nếu có
        if (client.roomId) {
            const room = this.getRoom(client.roomId);
            if (room) {
                room.removeClient(client.userId);
                
                // Nếu room trống thì xóa room
                if (room.isEmpty()) {
                    this.removeRoom(client.roomId);
                }
            }
        }
        
        // Xóa client khỏi hub
        this.clients.delete(client.ws);
    }

    /**
     * Xử lý join room
     * @param {Client} client - Client join room
     * @param {string} roomId - ID của room
     * @param {string} userId - ID của user
     */
    handleJoinRoom(client, roomId, userId) {
        // Cập nhật thông tin client
        client.userId = userId;

        // Lấy hoặc tạo room
        let room = this.getRoom(roomId);
        if (!room) {
            room = this.createRoom(roomId);
        }

        // Kiểm tra xem đã có client nào với userId này chưa
        const existingClient = room.getClient(userId);
        if (existingClient) {
            // Xóa client cũ khỏi room (không emit event vì đang replace)
            room.removeClient(userId, false);
            // Đóng connection cũ
            existingClient.close();
        }

        // Thêm client mới vào room
        room.addClient(client, !existingClient); // Chỉ emit event nếu không phải replace

        // Gửi danh sách existing users cho client mới
        const existingUsers = room.getUserIds().filter(id => id !== userId);
        client.send('existing-users', { users: existingUsers });

        // Thông báo cho các client khác trong room (chỉ khi không phải replace)
        if (!existingClient) {
            room.broadcast('user-joined', { userId }, userId);
        } else {
            console.log(`🔍 Skipping user-joined broadcast for reconnected user ${userId}`);
        }
    }

    /**
     * Xử lý WebRTC offer
     * @param {Client} client - Client gửi offer
     * @param {object} offer - WebRTC offer
     * @param {string} targetUserId - UserId nhận offer
     */
    handleOffer(client, offer, targetUserId) {
        if (!client.roomId) {
            return;
        }

        const room = this.getRoom(client.roomId);
        if (!room) {
            return;
        }

        room.sendToClient(targetUserId, 'offer', {
            offer,
            fromUserId: client.userId,
            targetUserId
        });
    }

    /**
     * Xử lý WebRTC answer
     * @param {Client} client - Client gửi answer
     * @param {object} answer - WebRTC answer
     * @param {string} targetUserId - UserId nhận answer
     */
    handleAnswer(client, answer, targetUserId) {
        if (!client.roomId) {
            return;
        }

        const room = this.getRoom(client.roomId);
        if (!room) {
            return;
        }

        room.sendToClient(targetUserId, 'answer', {
            answer,
            fromUserId: client.userId,
            targetUserId
        });
    }

    /**
     * Xử lý ICE candidate
     * @param {Client} client - Client gửi ICE candidate
     * @param {object} candidate - ICE candidate
     * @param {string} targetUserId - UserId nhận candidate
     */
    handleIceCandidate(client, candidate, targetUserId) {
        if (!client.roomId) {
            return;
        }

        const room = this.getRoom(client.roomId);
        if (!room) {
            return;
        }

        room.sendToClient(targetUserId, 'ice-candidate', {
            candidate,
            fromUserId: client.userId,
            targetUserId
        });
    }

    /**
     * Tạo room mới
     * @param {string} roomId - ID của room
     */
    createRoom(roomId) {
        if (this.rooms.has(roomId)) {
            console.log(`🔍 Room ${roomId} already exists`);
            return this.rooms.get(roomId);
        }

        const room = new Room(roomId);
        this.rooms.set(roomId, room);
        
        // Thiết lập event handlers cho room
        this.setupRoomHandlers(room);
        
        return room;
    }

    /**
     * Thiết lập event handlers cho room
     * @param {Room} room - Room object
     */
    setupRoomHandlers(room) {
        room.on('clientJoined', (client) => {
            console.log(`🔍 Client ${client.userId} joined room ${room.roomId}`);
        });

        room.on('clientLeft', (client) => {
            console.log(`🔍 Client ${client.userId} left room ${room.roomId}`);
            
            // Thông báo cho các client khác
            room.broadcast('user-left', { userId: client.userId });
        });
    }

    /**
     * Lấy room theo ID
     * @param {string} roomId - ID của room
     */
    getRoom(roomId) {
        return this.rooms.get(roomId);
    }

    /**
     * Xóa room
     * @param {string} roomId - ID của room
     */
    removeRoom(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) {
            return false;
        }

        room.cleanup();
        this.rooms.delete(roomId);
        return true;
    }

    /**
     * Lấy thông tin tất cả rooms
     */
    getAllRooms() {
        const roomsInfo = [];
        this.rooms.forEach((room) => {
            roomsInfo.push(room.getInfo());
        });
        return roomsInfo;
    }

    /**
     * Lấy thông tin hub
     */
    getInfo() {
        return {
            totalRooms: this.rooms.size,
            totalClients: this.clients.size,
            rooms: this.getAllRooms()
        };
    }

    /**
     * Dọn dẹp hub (đóng tất cả connections)
     */
    cleanup() {
        // Dọn dẹp tất cả rooms
        this.rooms.forEach((room) => {
            room.cleanup();
        });
        this.rooms.clear();
        
        // Dọn dẹp tất cả clients
        this.clients.forEach((client) => {
            client.close();
        });
        this.clients.clear();
    }
}

module.exports = Hub;
