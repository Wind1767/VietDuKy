CREATE TABLE IF NOT EXISTS reviews (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL UNIQUE,      -- mỗi khách một đánh giá
  rating      INTEGER NOT NULL,             -- 1..5
  destination TEXT,
  body        TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  reply       TEXT,                         -- phản hồi công khai của admin
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status, created_at);
