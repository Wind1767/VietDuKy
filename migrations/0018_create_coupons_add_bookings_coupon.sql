-- Worker tự tạo bảng và thêm cột khi chạy lần đầu; file này chỉ để tham khảo / chạy tay.
CREATE TABLE IF NOT EXISTS coupons (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, value INTEGER NOT NULL, min_people INTEGER NOT NULL DEFAULT 1, max_uses INTEGER, used INTEGER NOT NULL DEFAULT 0, start_date TEXT, end_date TEXT, destination TEXT, active INTEGER NOT NULL DEFAULT 1, note TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
ALTER TABLE bookings ADD COLUMN coupon TEXT;    -- mã khách đã dùng
ALTER TABLE bookings ADD COLUMN discount INTEGER; -- số tiền đã giảm (đồng), NULL nếu chưa tính được
