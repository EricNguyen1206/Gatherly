# Giải pháp sửa lỗi WebSocket Server khi upgrade

## Vấn đề
Lỗi `TypeError: Cannot read properties of undefined (reading 'on')` xảy ra khi khởi tạo WebSocketServer vì:
- Trong `server.js` dòng 95: `new WebSocketServer(server)` 
- Constructor của `WebSocketServer` mong đợi object với thuộc tính `server`: `this.server = options.server`
- Khi truyền trực tiếp `server`, `options.server` sẽ là `undefined`

## Giải pháp đã áp dụng

### 1. Sửa cách khởi tạo WebSocketServer
**File:** `server.js` dòng 95
```javascript
// Trước (SAI):
const wss = new WebSocketServer(server);

// Sau (ĐÚNG):
const wss = new WebSocketServer({ server });
```

### 2. Thêm method broadcast
**File:** `websocket-server.js` 
Thêm method `broadcast` vào class `WebSocketServer`:
```javascript
broadcast(sender, message) {
    this.clients.forEach(client => {
        if (client !== sender) {
            client.send(message);
        }
    });
}
```

## Kết quả
- Server chạy thành công không còn lỗi
- WebSocket server hoạt động bình thường
- Có thể xử lý các kết nối WebSocket và broadcast messages

## Test
```bash
node server.js
# Output: Configuration loaded from config.json
# Server running at: http://localhost:5000
```
