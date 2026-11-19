-- Worker tự tạo bảng này khi chạy lần đầu; file này chỉ để tham khảo / chạy tay nếu muốn.
-- Cài đặt website (chữ, màu, banner, bật/tắt tính năng...) lưu dạng khoá-giá trị, giá trị là JSON.
CREATE TABLE IF NOT EXISTS site_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
