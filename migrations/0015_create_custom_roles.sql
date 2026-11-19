-- Worker tự tạo bảng này khi chạy lần đầu; file này chỉ để tham khảo / chạy tay.
-- Vai trò tuỳ chỉnh: tài khoản quản trị lưu role = 'c' || id. Quyền theo mục con lưu trong perms dưới khoá _deny.
CREATE TABLE IF NOT EXISTS custom_roles (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, perms TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
