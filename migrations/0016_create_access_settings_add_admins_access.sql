-- Worker tự tạo bảng và thêm cột khi chạy lần đầu; file này chỉ để tham khảo / chạy tay.
CREATE TABLE IF NOT EXISTS access_settings (id INTEGER PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL);
ALTER TABLE admins ADD COLUMN access TEXT;
