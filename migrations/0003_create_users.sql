CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at     INTEGER NOT NULL,           -- mili giây UTC
  email          TEXT    NOT NULL UNIQUE,    -- luôn viết thường
  name           TEXT    NOT NULL,
  phone          TEXT,
  pass_hash      TEXT    NOT NULL,           -- pbkdf2$vòng$muối$băm
  verified_at    INTEGER,                    -- NULL = chưa xác minh email
  verify_hash    TEXT,                       -- SHA-256 của mã trong liên kết email
  verify_exp     INTEGER,
  verify_sent_at INTEGER,
  last_login     INTEGER
);
CREATE INDEX IF NOT EXISTS idx_users_verify ON users(verify_hash);
