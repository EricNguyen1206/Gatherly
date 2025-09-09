# Giải pháp sửa lỗi WebSocket Server - Room chỉ hiển thị 1 user

## Vấn đề
Khi mở 2 tab cùng room ID, mỗi tab chỉ hiển thị 1 user (chính nó) trong danh sách participants, mặc dù cả 2 tab đều đã join thành công vào cùng một room.

## Nguyên nhân
Lỗi nằm ở logic xử lý `join-room` trong hàm `handleJoinRoom` tại file `server.js` (dòng 234-258):

### Lỗi logic ban đầu:
```javascript
function handleJoinRoom(ws, roomId, userId) {
  // ... khởi tạo room và connection ...
  
  // ❌ LỖI: Gửi existing users TRƯỚC KHI thêm user vào room
  const existingUsers = Array.from(room);
  sendMessage(ws, 'existing-users', { users: existingUsers });

  // ❌ LỖI: Thêm user vào room SAU KHI đã gửi existing users
  room.add(userId);
}
```

### Hậu quả:
1. User thứ 2 join room → server gửi danh sách `existing-users` rỗng (vì user thứ 1 chưa được thêm vào room)
2. User thứ 1 không nhận được thông báo về user thứ 2
3. Mỗi user chỉ thấy chính mình trong danh sách participants

## Giải pháp đã áp dụng

### Sửa thứ tự xử lý trong `handleJoinRoom`:
**File:** `server.js` dòng 234-258

```javascript
function handleJoinRoom(ws, roomId, userId) {
  console.log(`User ${userId} joining room ${roomId}`);

  // Initialize room if not exists
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }

  const room = rooms.get(roomId);
  
  // Store connection info
  connections.set(ws, { userId, roomId });

  // ✅ SỬA: Thêm user vào room TRƯỚC
  room.add(userId);

  // ✅ SỬA: Gửi existing users (loại trừ user hiện tại)
  const existingUsers = Array.from(room).filter(id => id !== userId);
  sendMessage(ws, 'existing-users', { users: existingUsers });

  // Notify existing users about new user
  broadcastToRoom(roomId, 'user-joined', { userId }, ws);
  
  console.log(`Room ${roomId} now has users:`, Array.from(room));
}
```

### Các thay đổi chính:
1. **Thêm user vào room TRƯỚC** khi gửi danh sách existing users
2. **Lọc bỏ user hiện tại** khỏi danh sách existing users để tránh hiển thị chính mình
3. **Đảm bảo thứ tự đúng**: Add → Send existing users → Broadcast user-joined

## Kết quả mong đợi
- Khi user thứ 2 join room, sẽ nhận được danh sách existing users (chứa user thứ 1)
- User thứ 1 sẽ nhận được thông báo `user-joined` về user thứ 2
- Cả 2 tab sẽ hiển thị đầy đủ danh sách participants
- WebRTC peer connections sẽ được thiết lập đúng cách

## Test
1. Khởi động server: `node server.js`
2. Mở 2 tab trình duyệt với cùng room ID (ví dụ: `#123`)
3. Kiểm tra:
   - Tab 1: Hiển thị "People (2)" với 2 users
   - Tab 2: Hiển thị "People (2)" với 2 users
   - Cả 2 tab đều thấy video của nhau

## Logs để debug
Server sẽ in ra:
```
User User-771 joining room 123
Room 123 now has users: ['User-771']
User User-395 joining room 123  
Room 123 now has users: ['User-771', 'User-395']
```

Client sẽ nhận được:
- Tab 1: `existing-users: []` (room trống)
- Tab 2: `existing-users: ['User-771']` (có user 1)
- Tab 1: `user-joined: {userId: 'User-395'}` (thông báo user 2 join)