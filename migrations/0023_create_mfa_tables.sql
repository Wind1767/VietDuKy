-- Đăng nhập Google, Google Authenticator (TOTP) và passkey, dùng chung cho khách (kind = 'user') và quản trị (kind = 'admin').
-- Bí mật TOTP lưu đã mã hoá AES-GCM; mã khôi phục chỉ lưu bản băm SHA-256. Worker cũng tự tạo các bảng này khi chạy.
CREATE TABLE IF NOT EXISTS mfa_totp (kind TEXT NOT NULL, uid INTEGER NOT NULL, secret TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0, last_step INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, PRIMARY KEY (kind, uid));
CREATE TABLE IF NOT EXISTS mfa_recovery (kind TEXT NOT NULL, uid INTEGER NOT NULL, code_hash TEXT NOT NULL, used_at INTEGER, PRIMARY KEY (kind, uid, code_hash));
CREATE TABLE IF NOT EXISTS mfa_passkeys (id TEXT PRIMARY KEY, kind TEXT NOT NULL, uid INTEGER NOT NULL, pub TEXT NOT NULL, alg INTEGER NOT NULL, counter INTEGER NOT NULL DEFAULT 0, name TEXT NOT NULL DEFAULT '', transports TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, last_used INTEGER);
CREATE INDEX IF NOT EXISTS idx_mfa_passkeys_owner ON mfa_passkeys(kind, uid);
CREATE TABLE IF NOT EXISTS mfa_google (sub TEXT PRIMARY KEY, kind TEXT NOT NULL, uid INTEGER NOT NULL, email TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS mfa_challenges (id TEXT PRIMARY KEY, kind TEXT NOT NULL, uid INTEGER NOT NULL DEFAULT 0, purpose TEXT NOT NULL, data TEXT NOT NULL DEFAULT '', tries INTEGER NOT NULL DEFAULT 0, exp INTEGER NOT NULL);
