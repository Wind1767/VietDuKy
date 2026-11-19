-- Cho một khách đánh giá nhiều tour: bỏ ràng buộc "mỗi khách một đánh giá", thay bằng "mỗi khách một đánh giá cho mỗi tour".
-- SQLite không bỏ được UNIQUE nằm trong định nghĩa cột, nên tạo bảng mới rồi chép dữ liệu sang.
CREATE TABLE IF NOT EXISTS reviews_per_tour (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  rating      INTEGER NOT NULL,
  destination TEXT,
  body        TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'pending',
  reply       TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
INSERT INTO reviews_per_tour (id, user_id, rating, destination, body, status, reply, created_at, updated_at)
SELECT id, user_id, rating, destination, body, status, reply, created_at, updated_at FROM reviews;
DROP TABLE reviews;
ALTER TABLE reviews_per_tour RENAME TO reviews;
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status, created_at);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_user_tour ON reviews(user_id, COALESCE(destination, ''));
