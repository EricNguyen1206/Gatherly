# Mô hình Hub-Room-Client

## Tổng quan
Mô hình Hub-Room-Client được thiết kế để quản lý WebSocket connections một cách có tổ chức và dễ đọc. Mỗi class có trách nhiệm riêng biệt, giúp code dễ maintain và debug.

## Kiến trúc

```
Hub (Trung tâm điều phối)
├── Room 1
│   ├── Client A (WebSocket connection)
│   ├── Client B (WebSocket connection)
│   └── Client C (WebSocket connection)
├── Room 2
│   ├── Client D (WebSocket connection)
│   └── Client E (WebSocket connection)
└── Room 3
    └── Client F (WebSocket connection)
```

## Các Class

### 1. Client (`models/Client.js`)
**Trách nhiệm**: Quản lý 1 WebSocket connection cụ thể

**Thuộc tính**:
- `ws`: WebSocket connection
- `userId`: ID của user
- `roomId`: ID của room hiện tại
- `isConnected`: Trạng thái kết nối
- `joinTime`: Thời gian join

**Phương thức chính**:
- `send(type, data)`: Gửi message đến client
- `joinRoom(roomId)`: Join vào room
- `leaveRoom()`: Leave khỏi room
- `close()`: Đóng connection

### 2. Room (`models/Room.js`)
**Trách nhiệm**: Quản lý danh sách clients trong 1 room

**Thuộc tính**:
- `roomId`: ID của room
- `clients`: Map chứa clients (userId -> Client)
- `createdAt`: Thời gian tạo room

**Phương thức chính**:
- `addClient(client)`: Thêm client vào room
- `removeClient(userId)`: Xóa client khỏi room
- `broadcast(type, data, excludeUserId)`: Gửi message đến tất cả clients
- `sendToClient(targetUserId, type, data)`: Gửi message đến 1 client cụ thể
- `getUserIds()`: Lấy danh sách userIds
- `isEmpty()`: Kiểm tra room có trống không

### 3. Hub (`models/Hub.js`)
**Trách nhiệm**: Trung tâm điều phối tất cả rooms và routing messages

**Thuộc tính**:
- `rooms`: Map chứa rooms (roomId -> Room)
- `clients`: Map chứa clients (ws -> Client)

**Phương thức chính**:
- `createClient(ws)`: Tạo client mới
- `createRoom(roomId)`: Tạo room mới
- `handleJoinRoom(client, roomId, userId)`: Xử lý join room
- `handleOffer(client, offer, targetUserId)`: Xử lý WebRTC offer
- `handleAnswer(client, answer, targetUserId)`: Xử lý WebRTC answer
- `handleIceCandidate(client, candidate, targetUserId)`: Xử lý ICE candidate

## Luồng hoạt động

### 1. Khi có WebSocket connection mới:
```
WebSocket Connection → Hub.createClient() → Client object
```

### 2. Khi client join room:
```
Client.send('join-room') → Hub.handleJoinRoom() → Room.addClient()
```

### 3. Khi client gửi WebRTC message:
```
Client.send('offer') → Hub.handleOffer() → Room.sendToClient()
```

### 4. Khi client disconnect:
```
WebSocket.close() → Client.disconnect → Hub.handleClientDisconnect() → Room.removeClient()
```

## Lợi ích

### 1. **Tách biệt trách nhiệm**
- Mỗi class có trách nhiệm rõ ràng
- Dễ test và debug từng phần

### 2. **Dễ đọc và maintain**
- Code được tổ chức theo logic nghiệp vụ
- Dễ hiểu luồng xử lý

### 3. **Mở rộng dễ dàng**
- Thêm tính năng mới không ảnh hưởng code cũ
- Có thể thêm validation, logging, metrics

### 4. **Quản lý state tốt hơn**
- State được encapsulate trong từng class
- Tránh race condition và memory leak

## So sánh với code cũ

### Code cũ:
```javascript
// Tất cả logic trong server.js
const rooms = new Map();
const connections = new Map();

function handleJoinRoom(ws, roomId, userId) {
  // Logic phức tạp, khó đọc
  // Không tách biệt trách nhiệm
}
```

### Code mới:
```javascript
// Logic được tách biệt rõ ràng
const hub = new Hub();

wss.on('connection', (ws) => {
  const client = hub.createClient(ws);
  // Hub tự động xử lý tất cả
});
```

## Debug và Monitoring

### Logs có cấu trúc:
```
🔍 Hub initialized
🔍 New WebSocket connection
🔍 Created new client
🔍 Client User-123 joining room 456
🔍 Created room: 456
🔍 Added client User-123 to room 456
🔍 Room 456 now has 1 clients
```

### Thông tin chi tiết:
- Mỗi class có method `getInfo()` để lấy thông tin
- Hub có thể monitor tất cả rooms và clients
- Dễ dàng thêm metrics và health check

## Kết luận

Mô hình Hub-Room-Client giúp:
- **Code dễ đọc hơn**: Logic được tách biệt rõ ràng
- **Dễ maintain**: Mỗi class có trách nhiệm riêng
- **Dễ test**: Có thể test từng class độc lập
- **Dễ mở rộng**: Thêm tính năng mới không ảnh hưởng code cũ
- **Quản lý tốt hơn**: State được encapsulate, tránh lỗi
