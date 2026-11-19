-- Gắn đơn đặt tour với tài khoản khách (Worker cũng tự thêm cột này khi chạy)
ALTER TABLE bookings ADD COLUMN user_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
