-- Worker tự tạo bảng này khi chạy lần đầu; file này chỉ để tham khảo / chạy tay.
-- Chỉ lưu những ô đã sửa; ô trống hoặc bằng mặc định thì dùng chữ mặc định trong src/email-templates.js.
CREATE TABLE IF NOT EXISTS email_templates (key TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL);
