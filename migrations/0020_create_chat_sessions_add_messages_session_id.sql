-- Worker tự tạo bảng, thêm cột và chuyển tin nhắn cũ vào phiên khi chạy lần đầu; file này chỉ để tham khảo / chạy tay.
CREATE TABLE IF NOT EXISTS chat_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, title TEXT NOT NULL DEFAULT '', topic TEXT NOT NULL DEFAULT 'other', status TEXT NOT NULL DEFAULT 'open', created_by TEXT NOT NULL DEFAULT 'user', closed_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, closed_at INTEGER);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id, id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_status ON chat_sessions(status, updated_at);
ALTER TABLE messages ADD COLUMN session_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, id);
-- Sao x,5: cột reviews.rating giữ nguyên (SQLite lưu 4.5 được trong cột INTEGER), không cần đổi gì.
