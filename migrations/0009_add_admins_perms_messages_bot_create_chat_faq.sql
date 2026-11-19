-- Worker tự tạo/thêm các mục này khi chạy; file này chỉ để tham khảo.
ALTER TABLE admins ADD COLUMN perms TEXT;                          -- quyền tuỳ chỉnh (JSON), NULL = theo vai trò
ALTER TABLE messages ADD COLUMN bot INTEGER NOT NULL DEFAULT 0;    -- 1 = bot trả lời câu hỏi, 2 = báo chờ admin
CREATE TABLE IF NOT EXISTS chat_faq (id INTEGER PRIMARY KEY AUTOINCREMENT, question TEXT NOT NULL, answer TEXT NOT NULL, keywords TEXT NOT NULL DEFAULT '', sort INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL);
