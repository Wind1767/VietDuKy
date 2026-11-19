-- Worker tự tạo 2 bảng này khi chạy lần đầu; file này chỉ để tham khảo / chạy tay.
CREATE TABLE IF NOT EXISTS content_blocks (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS pages (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, descr TEXT NOT NULL DEFAULT '', blocks TEXT NOT NULL DEFAULT '[]', active INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL);
