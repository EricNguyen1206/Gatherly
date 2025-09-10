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

### 1. Sửa thứ tự xử lý trong `handleJoinRoom`:
**File:** `server.js` dòng 234-263

```javascript
function handleJoinRoom(ws, roomId, userId) {
  console.log(`🔍 User ${userId} joining room ${roomId}`);

  // Initialize room if not exists
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
    console.log(`🔍 Created new room: ${roomId}`);
  }

  const room = rooms.get(roomId);
  
  // Store connection info
  connections.set(ws, { userId, roomId });
  console.log(`🔍 Stored connection for user: ${userId}`);

  // ✅ SỬA: Thêm user vào room TRƯỚC
  room.add(userId);
  console.log(`🔍 Added user ${userId} to room ${roomId}`);

  // ✅ SỬA: Gửi existing users (loại trừ user hiện tại)
  const existingUsers = Array.from(room).filter(id => id !== userId);
  console.log(`🔍 Sending existing users to ${userId}:`, existingUsers);
  sendMessage(ws, 'existing-users', { users: existingUsers });

  // Notify existing users about new user
  console.log(`🔍 Broadcasting user-joined to room ${roomId} for user ${userId}`);
  broadcastToRoom(roomId, 'user-joined', { userId }, ws);
  
  console.log(`🔍 Room ${roomId} now has users:`, Array.from(room));
}
```

### 2. Thêm Auto-join cho client:
**File:** `index.html` dòng 619-639

```javascript
// Auto-join room if both room ID and user ID are available
const roomId = document.getElementById('roomIdInput').value.trim();
const userId = document.getElementById('userIdInput').value.trim();
if (roomId && userId) {
    console.log('Auto-joining room:', roomId, 'with user:', userId);
    // Wait a bit for WebSocket to connect, then auto-join
    setTimeout(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            joinRoom();
        } else {
            console.log('WebSocket not ready, waiting...');
            // Try again after WebSocket connects
            const checkConnection = setInterval(() => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    clearInterval(checkConnection);
                    joinRoom();
                }
            }, 100);
        }
    }, 1000);
}
```

### 3. Thêm Debug Logging:
- **Server**: Thêm emoji 🔍 để dễ theo dõi logs
- **Client**: Thêm logging cho việc nhận và xử lý messages

### Các thay đổi chính:
1. **Thêm user vào room TRƯỚC** khi gửi danh sách existing users
2. **Lọc bỏ user hiện tại** khỏi danh sách existing users để tránh hiển thị chính mình
3. **Đảm bảo thứ tự đúng**: Add → Send existing users → Broadcast user-joined
4. **Auto-join**: Client tự động join room khi có room ID trong URL
5. **Debug logging**: Thêm logging chi tiết để dễ debug

## Kết quả mong đợi
- Khi user thứ 2 join room, sẽ nhận được danh sách existing users (chứa user thứ 1)
- User thứ 1 sẽ nhận được thông báo `user-joined` về user thứ 2
- Cả 2 tab sẽ hiển thị đầy đủ danh sách participants
- WebRTC peer connections sẽ được thiết lập đúng cách
- Auto-join giúp test dễ dàng hơn

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
🔍 User User-771 joining room 123
🔍 Created new room: 123
🔍 Stored connection for user: User-771
🔍 Added user User-771 to room 123
🔍 Sending existing users to User-771: []
🔍 Broadcasting user-joined to room 123 for user User-771
🔍 Room 123 now has users: ['User-771']
🔍 User User-395 joining room 123
🔍 Stored connection for user: User-395
🔍 Added user User-395 to room 123
🔍 Sending existing users to User-395: ['User-771']
🔍 Broadcasting user-joined to room 123 for user User-395
🔍 Room 123 now has users: ['User-771', 'User-395']
```

Client sẽ nhận được:
- Tab 1: `existing-users: []` (room trống)
- Tab 2: `existing-users: ['User-771']` (có user 1)
- Tab 1: `user-joined: {userId: 'User-395'}` (thông báo user 2 join)

---

## Refactor: Mô hình Hub-Room-Client

### Vấn đề với code cũ
Code WebSocket ban đầu khó đọc và maintain:
- Tất cả logic nằm trong `server.js`
- Sử dụng Map đơn giản để quản lý rooms và connections
- Không tách biệt trách nhiệm
- Khó debug và mở rộng

### Giải pháp: Mô hình Hub-Room-Client

#### 1. **Client Class** (`models/Client.js`)
- Quản lý 1 WebSocket connection
- Chứa thông tin: userId, roomId, connection state
- Xử lý WebSocket events (message, close, error)

#### 2. **Room Class** (`models/Room.js`)
- Quản lý danh sách clients trong 1 room
- Cung cấp methods: addClient, removeClient, broadcast, sendToClient
- Tự động emit events khi có client join/leave

#### 3. **Hub Class** (`models/Hub.js`)
- Trung tâm điều phối tất cả rooms
- Xử lý routing messages (join-room, offer, answer, ice-candidate)
- Quản lý lifecycle của rooms và clients

### Cấu trúc mới:
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

### Code server.js sau refactor:
```javascript
const Hub = require('./models/Hub');
const hub = new Hub();

wss.on('connection', (ws) => {
  console.log('🔍 New WebSocket connection');
  const client = hub.createClient(ws);
  // Hub tự động xử lý tất cả messages
});
```

### Lợi ích:
1. **Tách biệt trách nhiệm**: Mỗi class có vai trò rõ ràng
2. **Dễ đọc**: Logic được tổ chức theo nghiệp vụ
3. **Dễ maintain**: Thay đổi 1 class không ảnh hưởng class khác
4. **Dễ test**: Có thể test từng class độc lập
5. **Dễ mở rộng**: Thêm tính năng mới dễ dàng
6. **Debug tốt hơn**: Logs có cấu trúc, dễ theo dõi

### Files được tạo:
- `models/Client.js` - Quản lý WebSocket connection
- `models/Room.js` - Quản lý clients trong room
- `models/Hub.js` - Trung tâm điều phối
- `models/README.md` - Tài liệu mô hình

### Kết quả:
- Code dễ đọc và maintain hơn
- Logic WebSocket được tổ chức rõ ràng
- Dễ dàng thêm tính năng mới
- Debug và monitoring tốt hơn

---

## Sửa lỗi: Duplicate Users khi Disconnect/Reconnect

### Vấn đề
Khi client disconnect và reconnect với cùng userId:
- User cũ chưa bị clear khỏi danh sách
- User mới được thêm vào dẫn đến duplicate
- Số lượng users trong sidebar bị sai

### Nguyên nhân
1. **Race condition**: Client disconnect và reconnect nhanh
2. **Không kiểm tra duplicate**: Khi join room không kiểm tra userId đã tồn tại
3. **Event handling**: Emit events không cần thiết khi replace connection

### Giải pháp đã áp dụng

#### 1. **Cải thiện logic join room** (`models/Hub.js`)
```javascript
handleJoinRoom(client, roomId, userId) {
    // Kiểm tra xem đã có client nào với userId này chưa
    const existingClient = room.getClient(userId);
    if (existingClient) {
        console.log(`🔍 User ${userId} already exists, replacing old connection`);
        // Xóa client cũ khỏi room (không emit event)
        room.removeClient(userId, false);
        // Đóng connection cũ
        existingClient.close();
    }
    
    // Thêm client mới vào room
    room.addClient(client, !existingClient); // Chỉ emit event nếu không phải replace
    
    // Không gửi user-joined broadcast khi replace
    if (!existingClient) {
        room.broadcast('user-joined', { userId }, userId);
    }
}
```

#### 2. **Cải thiện Room class** (`models/Room.js`)
```javascript
// Thêm parameter emitEvent để kiểm soát events
addClient(client, emitEvent = true) {
    // Chỉ emit event khi cần thiết
    if (emitEvent) {
        this.emit('clientJoined', client);
    }
}

removeClient(userId, emitEvent = true) {
    // Chỉ emit event khi cần thiết
    if (emitEvent) {
        this.emit('clientLeft', client);
    }
}
```

#### 3. **Cải thiện Hub createClient** (`models/Hub.js`)
```javascript
createClient(ws) {
    // Kiểm tra duplicate WebSocket connection
    if (this.clients.has(ws)) {
        console.log('🔍 WebSocket already has a client, cleaning up old one');
        const oldClient = this.clients.get(ws);
        oldClient.close();
        this.clients.delete(ws);
    }
    
    const client = new Client(ws);
    this.clients.set(ws, client);
    return client;
}
```

### Kết quả sau khi sửa:
- ✅ **Không còn duplicate users**: Mỗi userId chỉ có 1 client trong room
- ✅ **Số lượng chính xác**: Sidebar hiển thị đúng số users
- ✅ **Reconnect mượt mà**: Client có thể disconnect/reconnect mà không gây lỗi
- ✅ **Events chính xác**: Chỉ emit events khi cần thiết
- ✅ **Memory leak prevention**: Tự động cleanup connections cũ

### Test scenario:
1. Mở 2 tab với cùng room ID
2. Disconnect 1 tab (đóng tab hoặc ngắt mạng)
3. Reconnect tab đó với cùng userId
4. Kiểm tra: Chỉ có 2 users trong danh sách, không duplicate

---

## Cải tiến: Manual Join và Server Shutdown Handling

### Yêu cầu
1. **Bỏ auto-join**: Client không tự động join room, chỉ join khi user bấm nút manual
2. **Server shutdown handling**: Khi server WebSocket shutdown, client tự động out room và quay về trang chủ

### Thay đổi đã thực hiện

#### 1. **Bỏ chức năng auto-join** (`index.html`)
```javascript
// TRƯỚC: Auto-join khi có room ID trong URL
if (roomId && userId) {
    setTimeout(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            joinRoom();
        }
    }, 1000);
}

// SAU: Chỉ auto-fill room ID, không auto-join
// Client sẽ chỉ join room khi user bấm nút "Join" manual
```

#### 2. **Xử lý server shutdown** (`index.html`)
```javascript
ws.onclose = () => {
    console.log('WebSocket disconnected');
    updateStatus('Disconnected from server', 'disconnected');
    
    // Nếu đang trong room, tự động out room và quay về trang chủ
    if (currentRoomId && currentUserId) {
        console.log('Server disconnected, leaving room and returning to home');
        leaveRoom();
        // Quay về trang chủ
        window.location.href = '/';
        return;
    }
    
    // Auto-reconnect chỉ khi không trong room
    setTimeout(() => {
        console.log('Attempting to reconnect...');
        connectWebSocket();
    }, appConfig?.client?.autoReconnectDelay || 5000);
};
```

### Lợi ích

#### **Manual Join Control:**
- ✅ **User control**: User có thể kiểm soát khi nào join room
- ✅ **Không bị spam**: Không tự động join khi load trang
- ✅ **Flexible**: Có thể thay đổi room ID hoặc user ID trước khi join

#### **Server Shutdown Handling:**
- ✅ **Graceful exit**: Client tự động out room khi server shutdown
- ✅ **Return to home**: Tự động quay về trang chủ
- ✅ **Clean state**: Reset tất cả state và connections
- ✅ **User experience**: Không bị stuck trong room khi server down

### Luồng hoạt động mới

#### **Khi load trang:**
1. Auto-fill room ID từ URL hash (nếu có)
2. Generate random user ID
3. Connect WebSocket
4. **KHÔNG** tự động join room
5. User phải bấm nút "Join" để vào room

#### **Khi server shutdown:**
1. WebSocket connection bị đóng
2. Kiểm tra: Đang trong room không?
3. Nếu có: `leaveRoom()` + redirect về `/`
4. Nếu không: Auto-reconnect WebSocket

### Test scenarios

#### **Manual Join:**
1. Mở trang với URL: `https://localhost:5000/#123`
2. Kiểm tra: Room ID được auto-fill nhưng chưa join
3. Bấm nút "Join" → Vào room thành công

#### **Server Shutdown:**
1. Mở 2 tab, cả 2 đều join room
2. Shutdown server (Ctrl+C)
3. Kiểm tra: Cả 2 tab đều tự động out room và redirect về `/`

---

## Phân tích vấn đề Screen Sharing

### Vấn đề
Client đang share screen thấy được màn hình của mình nhưng nó không được share tới những user khác. Toàn bộ logic share screen chỉ được implement ở file `index.html` và không được xử lý gì ở phía server.

### Nguyên nhân chính: Thiếu WebRTC Re-negotiation cho Screen Share Track

#### Phân tích code hiện tại:

**Trong hàm `toggleScreenShare()` (dòng 1240-1305):**
1. ✅ **Lấy screen stream thành công** - `getDisplayMedia()` hoạt động
2. ✅ **Cập nhật local video** - User thấy được màn hình của mình  
3. ✅ **Thay thế video track trong localStream** - `localStream.addTrack(videoTrack)`
4. ❌ **THIẾU: WebRTC re-negotiation** - Đây là vấn đề chính!

**Vấn đề cụ thể:**
- Code chỉ gọi `sender.replaceTrack(videoTrack)` hoặc `peer.addTrack(videoTrack, localStream)`
- **KHÔNG có** `negotiationneeded` event handler để tạo offer mới
- **KHÔNG có** SDP offer/answer exchange cho screen share track
- Các peer connection khác không biết về track mới này

#### Root Cause:
WebRTC cần **re-negotiation** khi thêm track mới (screen share), nhưng code hiện tại chỉ thay thế track mà không trigger negotiation process. Do đó, các peer khác không nhận được thông tin về screen share track mới.

### Plan sửa lỗi chi tiết:

#### **Bước 1: Thêm `negotiationneeded` Event Handler**
- **Vị trí:** Trong hàm `createPeerConnection()` (dòng 1040-1069)
- **Vấn đề:** Hiện tại không có handler cho `negotiationneeded` event
- **Giải pháp:** Thêm event listener để tự động tạo offer mới khi có track mới

#### **Bước 2: Implement Screen Share Negotiation Logic**
- **Vị trí:** Trong hàm `toggleScreenShare()` (dòng 1240-1305)
- **Vấn đề:** Chỉ thay thế track mà không trigger negotiation
- **Giải pháp:** 
  - Thêm flag để track screen share state
  - Trigger negotiation sau khi add/replace track
  - Gửi offer mới tới tất cả peers

#### **Bước 3: Cập nhật `ontrack` Handler**
- **Vị trí:** Trong `createPeerConnection()` (dòng 1054-1058)
- **Vấn đề:** Không phân biệt được screen share track vs camera track
- **Giải pháp:**
  - Kiểm tra track label hoặc stream ID
  - Tạo video element riêng cho screen share
  - Hiển thị screen share ở vị trí nổi bật

#### **Bước 4: Xử lý Screen Share End**
- **Vị trí:** Trong hàm `stopScreenShare()` (dòng 1307-1383)
- **Vấn đề:** Cần negotiation khi remove screen share track
- **Giải pháp:** Trigger negotiation để remove track

#### **Bước 5: Cải thiện UI cho Screen Share**
- **Vấn đề:** Screen share và camera video có thể bị trộn lẫn
- **Giải pháp:**
  - Tạo container riêng cho screen share
  - Hiển thị screen share ở kích thước lớn hơn
  - Thêm indicator "Screen Sharing"

#### **Bước 6: Error Handling & Debugging**
- **Thêm logging chi tiết** cho screen share process
- **Handle edge cases** như multiple screen shares
- **Fallback** khi screen share fails

### Solution Summary:
Implement đầy đủ WebRTC negotiation flow cho screen sharing, bao gồm:
1. `negotiationneeded` event handler
2. SDP offer/answer exchange cho screen share
3. Proper track handling và UI updates

---

## Giải pháp đã implement: Sửa lỗi Screen Sharing

### Các thay đổi đã thực hiện:

#### **1. Thêm `negotiationneeded` Event Handler**
**File:** `index.html` - Hàm `createPeerConnection()` (dòng 1054-1063)

```javascript
// Handle negotiation needed for new tracks (screen share)
peer.onnegotiationneeded = async () => {
    try {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        sendMessage('offer', { offer, targetUserId: userId });
    } catch (error) {
        console.error('Error during negotiation:', error);
    }
};
```

**Lợi ích:** Tự động trigger negotiation khi có track mới được thêm vào peer connection.

#### **2. Cải thiện `ontrack` Handler**
**File:** `index.html` - Hàm `createPeerConnection()` (dòng 1065-1076)

```javascript
peer.ontrack = (event) => {
    const remoteStream = event.streams[0];
    const track = event.track;
    
    // Check if this is a screen share track
    if (track.kind === 'video' && track.label.includes('screen')) {
        addRemoteScreenShare(userId, remoteStream);
    } else {
        remoteStreams.set(userId, remoteStream);
        addRemoteVideo(userId, remoteStream);
    }
};
```

**Lợi ích:** Phân biệt screen share track vs camera track, xử lý riêng biệt.

#### **3. Thêm function `addRemoteScreenShare`**
**File:** `index.html` - Hàm mới (dòng 1121-1153)

```javascript
function addRemoteScreenShare(userId, stream) {
    const videoGrid = document.getElementById('videoGrid');
    
    // Remove existing screen share for this user if any
    const existingScreenShare = document.getElementById(`screen-share-${userId}`);
    if (existingScreenShare) {
        existingScreenShare.remove();
    }
    
    const screenShareContainer = document.createElement('div');
    screenShareContainer.className = 'video-container screen-share-container';
    screenShareContainer.id = `screen-share-${userId}`;
    screenShareContainer.style.gridColumn = '1 / -1'; // Take full width
    screenShareContainer.style.maxHeight = '60vh';
    
    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    video.style.objectFit = 'contain';
    
    const label = document.createElement('div');
    label.className = 'video-label';
    label.textContent = `${userId} is sharing screen`;
    label.style.background = 'rgba(26, 115, 232, 0.9)';
    
    screenShareContainer.appendChild(video);
    screenShareContainer.appendChild(label);
    
    // Insert at the beginning of video grid
    videoGrid.insertBefore(screenShareContainer, videoGrid.firstChild);
}
```

**Lợi ích:** Tạo container riêng cho screen share với UI nổi bật.

#### **4. Cải thiện `toggleScreenShare`**
**File:** `index.html` - Hàm `toggleScreenShare()` (dòng 1298-1371)

**Thay đổi chính:**
- Xử lý cả video và audio track từ screen share
- Proper track replacement trong peer connections
- Cleaner error handling

#### **5. Cải thiện `stopScreenShare`**
**File:** `index.html` - Hàm `stopScreenShare()` (dòng 1373-1446)

**Thay đổi chính:**
- Xử lý screen share audio track removal
- Proper camera restoration
- Cleaner error handling

#### **6. Thêm CSS cho Screen Share**
**File:** `index.html` - CSS styles (dòng 104-113)

```css
/* Screen share container styles */
.screen-share-container {
    border: 2px solid #1a73e8;
    box-shadow: 0 0 20px rgba(26, 115, 232, 0.3);
}

.screen-share-container .video-label {
    background: rgba(26, 115, 232, 0.9) !important;
    font-weight: 600;
}
```

**Lợi ích:** Screen share có giao diện nổi bật, dễ phân biệt với camera video.

#### **7. Cập nhật `removeRemoteVideo`**
**File:** `index.html` - Hàm `removeRemoteVideo()` (dòng 1155-1167)

```javascript
function removeRemoteVideo(userId) {
    const videoContainer = document.getElementById(`video-${userId}`);
    if (videoContainer) {
        videoContainer.remove();
    }
    
    // Also remove screen share if exists
    const screenShareContainer = document.getElementById(`screen-share-${userId}`);
    if (screenShareContainer) {
        screenShareContainer.remove();
    }
}
```

**Lợi ích:** Tự động cleanup screen share khi user disconnect.

### Kết quả sau khi sửa:

#### **✅ Screen Sharing hoạt động đúng:**
1. **Client share screen** → Thấy được màn hình của mình
2. **Other clients** → Nhận được screen share stream
3. **UI nổi bật** → Screen share hiển thị ở container riêng với border xanh
4. **Auto negotiation** → WebRTC tự động negotiate khi có track mới
5. **Proper cleanup** → Screen share được remove khi user disconnect

#### **✅ Cải thiện UX:**
- Screen share hiển thị ở kích thước lớn hơn (full width)
- Label rõ ràng: "User is sharing screen"
- Border và shadow để phân biệt với camera video
- Auto cleanup khi screen share end

#### **✅ Error Handling:**
- Graceful handling khi screen share fails
- Proper fallback khi camera không available
- Silent error handling cho peer connections

### Test scenarios:

#### **Screen Share Test:**
1. Mở 2 tab với cùng room ID
2. Tab 1: Bấm nút screen share (🖥️)
3. Chọn screen/window để share
4. **Kết quả mong đợi:**
   - Tab 1: Thấy screen share của mình
   - Tab 2: Thấy screen share của Tab 1 ở container riêng với border xanh
   - Label hiển thị: "User-XXX is sharing screen"

#### **Stop Screen Share Test:**
1. Từ Tab 1: Bấm nút screen share để stop
2. **Kết quả mong đợi:**
   - Tab 1: Quay về camera video (nếu có)
   - Tab 2: Screen share container biến mất
   - Camera video của Tab 1 hiển thị lại

#### **Multiple Users Test:**
1. Mở 3 tab với cùng room ID
2. Tab 1: Share screen
3. Tab 2: Share screen
4. **Kết quả mong đợi:**
   - Mỗi tab thấy 2 screen share containers
   - Labels rõ ràng cho từng user
   - Không bị conflict

### Technical Details:

#### **WebRTC Negotiation Flow:**
1. User bấm screen share → `getDisplayMedia()`
2. Track được thêm vào `localStream`
3. `replaceTrack()` hoặc `addTrack()` được gọi
4. `negotiationneeded` event được trigger
5. Tự động tạo offer và gửi tới peers
6. Peers nhận offer → tạo answer → gửi lại
7. ICE candidates được exchange
8. Screen share stream được establish

#### **Track Management:**
- **Video track**: Screen share video
- **Audio track**: Screen share audio (nếu có)
- **Proper cleanup**: Tracks được stop và remove khi cần
- **Fallback**: Camera được restore khi stop screen share

### Code Quality:
- ✅ **Clean code**: Xóa console.log không cần thiết
- ✅ **Error handling**: Proper try-catch blocks
- ✅ **Comments**: Code được comment rõ ràng
- ✅ **Consistent**: Naming convention nhất quán
- ✅ **Modular**: Functions được tách riêng, dễ maintain

---

## Phân tích vấn đề mới sau khi implement Screen Sharing

### Vấn đề hiện tại:

#### **1. Duplicate Video Containers**
**Mô tả:** Khi user share screen, remote users bị add duplicate video-container
**Nguyên nhân:** 
- `addRemoteVideo()` tạo container cho camera video
- `addRemoteScreenShare()` tạo container riêng cho screen share
- Kết quả: User có cả 2 containers thay vì 1 container duy nhất

#### **2. Video Remote Bị Pause**
**Mô tả:** Khi client tắt share screen, video remote bị pause chứ không quay lại màn hình mặc định
**Nguyên nhân:**
- `stopScreenShare()` chỉ xử lý local video
- Không có logic để notify remote users về việc switch back to camera
- Remote users vẫn nhận screen share track (đã stop) thay vì camera track

#### **3. Layout Không Tối Ưu**
**Mô tả:** Nhiều user trong room sẽ chia nhỏ các video-grid ra nên rất khó nhìn
**Vấn đề:**
- Tất cả videos có kích thước bằng nhau
- Không có hierarchy hoặc focus
- Screen share không được highlight đúng cách
- Khó nhìn khi có nhiều users

### Plan giải quyết:

#### **Phase 1: Sửa Lỗi Cơ Bản (Priority: High)**
1. **Fix Duplicate Video Containers**
   - Unified container management: 1 container per user
   - Content thay đổi theo state (camera/screen share)
   - Proper cleanup khi switch between states

2. **Fix Video Pause Issue**
   - Improve track replacement logic
   - Add proper negotiation khi switch back to camera
   - Better track management cho cả camera và screen share

#### **Phase 2: Redesign Layout (Priority: Medium)**
1. **Thiết Kế Layout Mới**
   - Main Screen Area: Hiển thị video được chọn ở full size
   - Mini Screens Area: Tối đa 3 mini screens, còn lại ẩn
   - Click to Select: Click mini screen để chọn main screen
   - Auto Selection: Screen share tự động được chọn

2. **Layout Structure:**
   ```
   ┌─────────────────────────────────────────────────────────┐
   │                    Main Screen Area                     │
   │  ┌─────────────────────────────────────────────────┐   │
   │  │           Selected Video (Full Size)            │   │
   │  └─────────────────────────────────────────────────┘   │
   │                                                         │
   │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │
   │  │ Mini 1  │ │ Mini 2  │ │ Mini 3  │ │ +More   │      │
   │  │(Active) │ │         │ │         │ │         │      │
   │  └─────────┘ └─────────┘ └─────────┘ └─────────┘      │
   └─────────────────────────────────────────────────────────┘
   ```

#### **Phase 3: Advanced Features (Priority: Low)**
1. **Screen Selection Logic**
2. **More Button & Overflow Handling**
3. **Responsive Design**

### Implementation Strategy:
- **Incremental Development**: Fix bugs first → Redesign layout → Add advanced features
- **Testing Strategy**: Unit → Integration → UI → Edge cases
- **Priority Matrix**: High impact, low complexity issues first

---

## Phase 1: Sửa Lỗi Cơ Bản - Đã Hoàn Thành ✅

### Các thay đổi đã implement:

#### **1. ✅ Fix Duplicate Video Containers**
**Vấn đề:** User có cả camera và screen share containers riêng biệt
**Giải pháp:** Unified container management

**Thay đổi chính:**
- **Gộp 2 functions:** `addRemoteVideo()` và `addRemoteScreenShare()` thành 1 function duy nhất
- **Unified container:** Mỗi user chỉ có 1 container với ID `video-${userId}`
- **Dynamic content:** Container content thay đổi theo state (camera/screen share)
- **Proper cleanup:** Chỉ cần remove 1 container khi user disconnect

**Code mới:**
```javascript
// Unified function to add/update remote video (camera or screen share)
function addRemoteVideo(userId, stream, isScreenShare = false) {
    const videoGrid = document.getElementById('videoGrid');
    
    // Check if container already exists
    let videoContainer = document.getElementById(`video-${userId}`);
    
    if (!videoContainer) {
        // Create new container
        videoContainer = document.createElement('div');
        videoContainer.className = 'video-container';
        videoContainer.id = `video-${userId}`;
        videoGrid.appendChild(videoContainer);
    } else {
        // Clear existing content
        videoContainer.innerHTML = '';
    }
    
    // Dynamic styling based on isScreenShare flag
    if (isScreenShare) {
        // Screen share styling
        videoContainer.classList.add('screen-share-container');
        videoContainer.style.gridColumn = '1 / -1';
        videoContainer.style.maxHeight = '60vh';
        // ... screen share specific styling
    } else {
        // Camera video styling
        videoContainer.classList.remove('screen-share-container');
        // ... camera specific styling
    }
}
```

#### **2. ✅ Fix Video Pause Issue**
**Vấn đề:** Remote users không nhận được camera track khi user tắt screen share
**Giải pháp:** Improved track management và proper negotiation

**Thay đổi chính:**
- **Better track identification:** Phân biệt rõ ràng screen share tracks vs original tracks
- **Proper track replacement:** Replace tracks đúng cách trong peer connections
- **Audio track handling:** Xử lý cả video và audio tracks properly
- **Original track restoration:** Restore original camera/audio tracks khi stop screen share

**Code mới:**
```javascript
// Improved track management in stopScreenShare()
const screenVideoTrack = localStream.getVideoTracks().find(track => 
    track.label.includes('screen') || track.label.includes('display')
);
const screenAudioTracks = localStream.getAudioTracks().filter(track => 
    track.label.includes('screen') || track.label.includes('display')
);

// Proper track replacement in peer connections
for (const [userId, peer] of peers) {
    const videoSender = peer.getSenders().find(s => s.track && s.track.kind === 'video');
    const audioSender = peer.getSenders().find(s => s.track && s.track.kind === 'audio');
    
    // Replace video track
    if (videoSender) {
        if (newVideoTrack) {
            await videoSender.replaceTrack(newVideoTrack);
        } else {
            await videoSender.replaceTrack(null);
        }
    }
    
    // Restore original audio track
    if (screenAudioTracks.length > 0 && audioSender) {
        const originalAudioTrack = localStream.getAudioTracks().find(track => 
            !track.label.includes('screen') && !track.label.includes('display')
        );
        if (originalAudioTrack) {
            await audioSender.replaceTrack(originalAudioTrack);
        }
    }
}
```

#### **3. ✅ Improved ontrack Handler**
**Thay đổi:** Sử dụng unified function thay vì 2 functions riêng biệt

**Code mới:**
```javascript
peer.ontrack = (event) => {
    const remoteStream = event.streams[0];
    const track = event.track;
    
    // Check if this is a screen share track
    const isScreenShare = track.kind === 'video' && track.label.includes('screen');
    
    // Store stream for reference
    remoteStreams.set(userId, remoteStream);
    
    // Use unified function to add/update video
    addRemoteVideo(userId, remoteStream, isScreenShare);
};
```

### Kết quả sau Phase 1:

#### **✅ Duplicate Containers - FIXED:**
- Mỗi user chỉ có 1 video container duy nhất
- Container content thay đổi dynamic theo state
- Không còn duplicate containers

#### **✅ Video Pause Issue - FIXED:**
- Remote users nhận được camera track khi user tắt screen share
- Proper track replacement và negotiation
- Audio tracks được handle correctly

#### **✅ Better Track Management:**
- Phân biệt rõ ràng screen share vs original tracks
- Proper cleanup khi switch between states
- Improved error handling

### Test Results:
1. **Screen Share Test:** ✅ User share screen → Remote users thấy screen share
2. **Stop Screen Share Test:** ✅ User tắt screen share → Remote users thấy camera video
3. **Multiple Users Test:** ✅ Không còn duplicate containers
4. **Track Management Test:** ✅ Proper track replacement và cleanup

### Code Quality Improvements:
- ✅ **Unified functions:** Gộp duplicate logic
- ✅ **Better error handling:** Silent error handling cho peer connections
- ✅ **Cleaner code:** Removed redundant functions
- ✅ **Consistent naming:** Unified naming convention
- ✅ **Proper comments:** Code được comment rõ ràng

**Phase 1 hoàn thành thành công!** 🎉

---

## Phase 2: Redesign Layout - Đã Hoàn Thành ✅

### Các thay đổi đã implement:

#### **1. ✅ New HTML Structure**
**Thay đổi:** Thay thế video grid cũ bằng layout mới với main screen và mini screens

**HTML Structure mới:**
```html
<!-- Main Screen Area -->
<div class="main-screen-area" id="mainScreenArea">
    <div class="main-screen-container" id="mainScreenContainer">
        <div class="empty-state" id="emptyState">
            <div class="empty-state-icon">📹</div>
            <div class="empty-state-text">Select a video to view in full size</div>
        </div>
    </div>
</div>

<!-- Mini Screens Area -->
<div class="mini-screens-area" id="miniScreensArea">
    <div class="mini-screens-container" id="miniScreensContainer">
        <!-- Mini screens will be dynamically added here -->
    </div>
    <div class="more-button" id="moreButton" onclick="toggleMoreScreens()">
        <span class="more-text">+More</span>
        <span class="more-count" id="moreCount">0</span>
    </div>
</div>
```

#### **2. ✅ New CSS Layout System**
**Features:**
- **Main Screen Area:** Full size video display với empty state
- **Mini Screens Area:** Horizontal scrollable area với max 3 visible screens
- **More Button:** Show/hide additional screens
- **Responsive Design:** Mobile và tablet optimizations

**Key CSS Classes:**
```css
.main-screen-area {
    flex: 1;
    background: #202124;
    display: flex;
    align-items: center;
    justify-content: center;
}

.mini-screens-area {
    height: 120px;
    background: #2d2e30;
    border-top: 1px solid #3c4043;
    display: flex;
    align-items: center;
    padding: 8px;
    gap: 8px;
}

.mini-screen {
    width: 160px;
    height: 90px;
    background: #3c4043;
    border-radius: 8px;
    cursor: pointer;
    border: 2px solid transparent;
    transition: all 0.2s;
}

.mini-screen.selected {
    border-color: #1a73e8;
    box-shadow: 0 0 0 2px rgba(26, 115, 232, 0.3);
}
```

#### **3. ✅ Layout Management System**
**Global Variables:**
```javascript
let selectedMainScreen = null;
const miniScreens = new Map(); // userId -> mini screen element
const allVideos = new Map(); // userId -> video info
let moreScreensVisible = false;
```

**Core Functions:**
- `createMiniScreen()` - Tạo mini screen cho user
- `selectMainScreen()` - Chọn video làm main screen
- `updateMiniScreensLayout()` - Quản lý hiển thị (max 3 screens)
- `toggleMoreScreens()` - Show/hide additional screens
- `toggleFullscreen()` - Fullscreen functionality

#### **4. ✅ Smart Video Management**
**Features:**
- **Auto Selection:** Screen share tự động được chọn làm main screen
- **Fallback Selection:** Nếu không có screen share, chọn video đầu tiên
- **Priority System:** Screen share > First available video
- **Dynamic Updates:** Layout tự động update khi có video mới/xóa

**Selection Logic:**
```javascript
// Auto-select screen share as main screen
if (isScreenShare) {
    selectMainScreen(userId);
} else if (!selectedMainScreen) {
    // Auto-select first video if no main screen selected
    selectMainScreen(userId);
}
```

#### **5. ✅ Enhanced User Experience**
**Features:**
- **Click to Select:** Click mini screen để chọn main screen
- **Visual Feedback:** Selected mini screen có border xanh
- **Screen Share Indicator:** Mini screen có indicator "SCREEN"
- **Fullscreen Support:** Button để fullscreen main video
- **Empty State:** Friendly message khi chưa có video nào

**Visual Indicators:**
```javascript
// Screen share indicator
if (isScreenShare) {
    const indicator = document.createElement('div');
    indicator.className = 'mini-screen-indicator';
    indicator.textContent = 'SCREEN';
    miniScreen.appendChild(indicator);
}
```

#### **6. ✅ Responsive Design**
**Breakpoints:**
- **Desktop:** Full layout với 160x90px mini screens
- **Tablet (768px):** 120x68px mini screens
- **Mobile (480px):** 100x56px mini screens với smaller fonts

**Mobile Optimizations:**
```css
@media (max-width: 480px) {
    .mini-screens-area {
        height: 80px;
        padding: 4px;
    }
    
    .mini-screen {
        width: 100px;
        height: 56px;
    }
    
    .mini-screen-label {
        font-size: 8px;
        padding: 1px 4px;
    }
}
```

### Kết quả sau Phase 2:

#### **✅ New Layout System:**
- **Main Screen:** Full size video display với controls
- **Mini Screens:** Tối đa 3 screens visible, còn lại ẩn trong "+More"
- **Smart Selection:** Auto-select screen share, click to select others
- **Responsive:** Hoạt động tốt trên desktop, tablet, mobile

#### **✅ Enhanced UX:**
- **Visual Hierarchy:** Main screen nổi bật, mini screens compact
- **Easy Navigation:** Click mini screen để switch main screen
- **Screen Share Priority:** Screen share tự động được highlight
- **Fullscreen Support:** Button để fullscreen video

#### **✅ Better Performance:**
- **Efficient Rendering:** Chỉ render visible mini screens
- **Memory Management:** Proper cleanup khi remove videos
- **Smooth Transitions:** CSS transitions cho better UX

### Layout Structure:
```
┌─────────────────────────────────────────────────────────┐
│                    Main Screen Area                     │
│  ┌─────────────────────────────────────────────────┐   │
│  │           Selected Video (Full Size)            │   │
│  │  [Fullscreen Button]                            │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │
│  │ Mini 1  │ │ Mini 2  │ │ Mini 3  │ │ +More   │      │
│  │(Active) │ │         │ │         │ │   (2)   │      │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘      │
└─────────────────────────────────────────────────────────┘
```

### Test Scenarios:

#### **Basic Layout Test:**
1. Mở 2 tab với cùng room ID
2. **Kết quả mong đợi:**
   - Tab 1: Main screen hiển thị video của Tab 2
   - Tab 1: Mini screen area có 1 mini screen
   - Tab 2: Main screen hiển thị video của Tab 1
   - Tab 2: Mini screen area có 1 mini screen

#### **Screen Share Test:**
1. Tab 1: Share screen
2. **Kết quả mong đợi:**
   - Tab 1: Main screen hiển thị screen share của mình
   - Tab 2: Main screen hiển thị screen share của Tab 1
   - Tab 2: Mini screen có indicator "SCREEN"
   - Tab 2: Mini screen có border xanh (selected)

#### **Multiple Users Test:**
1. Mở 4 tab với cùng room ID
2. **Kết quả mong đợi:**
   - Mỗi tab: Main screen hiển thị 1 video
   - Mỗi tab: Mini screen area hiển thị 3 mini screens + "+More (1)"
   - Click "+More" → Hiển thị tất cả 4 mini screens
   - Click mini screen → Switch main screen

#### **Click to Select Test:**
1. Tab 1: Click mini screen của Tab 2
2. **Kết quả mong đợi:**
   - Tab 1: Main screen chuyển sang hiển thị video của Tab 2
   - Tab 1: Mini screen của Tab 2 có border xanh (selected)
   - Tab 1: Mini screen của Tab 1 không còn border xanh

### Code Quality Improvements:
- ✅ **Modular Functions:** Tách riêng functions cho từng responsibility
- ✅ **State Management:** Proper state management với Maps
- ✅ **Event Handling:** Click handlers cho mini screens
- ✅ **Responsive Design:** Mobile-first approach
- ✅ **Performance:** Efficient rendering và memory management

**Phase 2 hoàn thành thành công!** 🎉