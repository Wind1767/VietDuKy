/* Giả lập Cloudflare D1 bằng SQLite có sẵn trong Node (node:sqlite) để chạy test mà không cần mạng hay wrangler. */
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA } from '../../src/worker.js';

class Stmt {
  constructor(db, sql, args = []) {
    this.db = db;
    this.sql = sql;
    this.args = args;
  }
  bind(...args) {
    return new Stmt(this.db, this.sql, args);
  }
  async first() {
    return this.db.prepare(this.sql).get(...this.args) ?? null;
  }
  async all() {
    return { results: this.db.prepare(this.sql).all(...this.args), success: true };
  }
  async run() {
    const r = this.db.prepare(this.sql).run(...this.args);
    return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
}

export function createDB() {
  const db = new DatabaseSync(':memory:');
  const api = {
    raw: db,
    prepare: (sql) => new Stmt(db, sql),
    async batch(stmts) {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const s of stmts) {
          out.push(/^\s*(select|with)\b/i.test(s.sql) ? await s.all() : await s.run());
        }
        db.exec('COMMIT');
        return out;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    }
  };
  /* Tạo bảng đúng như worker làm khi chạy (SCHEMA), rồi các cột thêm sau */
  for (const sql of SCHEMA) {
    db.exec(sql);
  }
  /* Các cột mà worker thêm lúc chạy (ensureSchema) */
  for (const alter of [
    'ALTER TABLE users ADD COLUMN avatar TEXT',
    'ALTER TABLE users ADD COLUMN delete_requested_at INTEGER',
    'ALTER TABLE bookings ADD COLUMN user_id INTEGER',
    'ALTER TABLE bookings ADD COLUMN amount INTEGER',
    'ALTER TABLE tours ADD COLUMN image TEXT',
    'ALTER TABLE tours ADD COLUMN summary TEXT',
    'ALTER TABLE reviews ADD COLUMN helpful_adj INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE messages ADD COLUMN session_id INTEGER'
  ]) {
    try {
      db.exec(alter);
    } catch { /* đã có */
    }
  }
  for (const t of ['user_avatars', 'favorites', 'chat_sessions', 'settings']) {
    const ok = db.prepare("SELECT 1 FROM sqlite_master WHERE name = ?").get(t);
    if (!ok) {
      throw new Error('Thiếu bảng ' + t + ' sau khi áp migrations');
    }
  }
  return api;
}

/* Bộ helper giống `h` mà worker truyền cho từng module */
export class HttpError extends Error {
  constructor(status, message, headers, code) {
    super(message);
    this.status = status;
    this.headers = headers;
    this.code = code;
  }
}
export const h = {
  HttpError,
  json: (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } })
};

/* `h` đủ dùng cho handleAuth: giới hạn tần suất và Turnstile được bỏ qua trong test */
export function makeH(extra = {}) {
  const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
  return {
    ...h,
    clean,
    limit: async () => {},
    LIMITS: {
      userLogin: [10, 60],
      verify: [10, 60],
      fav: [10, 60]
    },
    turnstile: async () => {},
    readJson: async (request) => request.json(),
    mail: () => {},
    tpl: () => ({}),
    site: 'http://localhost',
    ...extra
  };
}

export const UA = {
  chromeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  chromeWinNewer: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
  safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
};
