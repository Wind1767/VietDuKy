-- Phiên đăng nhập của khách lưu ở máy chủ (cookie chỉ chứa mã ngẫu nhiên, ở đây lưu bản băm SHA-256 của mã).
-- Nhờ vậy đăng xuất, đổi mật khẩu, khoá tài khoản đều thu hồi được phiên, và phiên gắn với thiết bị đã đăng nhập.
-- Worker cũng tự tạo bảng này khi chạy; file này để chạy tay / tham khảo.
CREATE TABLE IF NOT EXISTS user_sessions (
  id         TEXT    PRIMARY KEY,          -- SHA-256 của mã trong cookie
  user_id    INTEGER NOT NULL,
  created_at INTEGER NOT NULL,             -- mili giây UTC
  expires_at INTEGER NOT NULL,             -- hết hạn tuyệt đối (30 ngày)
  last_seen  INTEGER NOT NULL,             -- lần dùng gần nhất (không dùng quá 14 ngày thì mất hiệu lực)
  device     TEXT    NOT NULL,             -- trình duyệt|hệ điều hành|di động-hay-máy tính
  label      TEXT    NOT NULL DEFAULT '',  -- "Chrome · Windows" hiện trong danh sách thiết bị
  country    TEXT    NOT NULL DEFAULT '',  -- mã quốc gia lúc đăng nhập (Cloudflare CF-IPCountry)
  ip         TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id, last_seen);
