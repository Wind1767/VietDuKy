ALTER TABLE users ADD COLUMN blocked_at INTEGER;   -- NULL = không bị khoá (Worker cũng tự thêm cột này)
