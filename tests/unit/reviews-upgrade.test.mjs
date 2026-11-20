/* DB cũ còn bảng reviews "mỗi khách một đánh giá" (user_id UNIQUE): Worker phải tự nâng cấp để khách đánh giá được nhiều tour. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import worker from '../../src/worker.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function wrap(db) {
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    async first() {
      return db.prepare(sql).get(...args) ?? null;
    },
    async all() {
      return { results: db.prepare(sql).all(...args) };
    },
    async run() {
      const r = db.prepare(sql).run(...args);
      return { success: true, meta: { changes: Number(r.changes) } };
    }
  });
  return {
    prepare: (sql) => stmt(sql),
    async batch(list) {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const s of list) {
          out.push(await s.run());
        }
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    }
  };
}

test('Bảng reviews cũ được dựng lại, giữ dữ liệu và cho đánh giá nhiều tour', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(root, 'migrations', '0006_create_reviews.sql'), 'utf8'));
  db.prepare("INSERT INTO reviews (user_id, rating, destination, body, status, created_at, updated_at) VALUES (1, 5, 'Vịnh Hạ Long', 'Rất tuyệt vời', 'approved', 1, 1)").run();
  assert.throws(() => db.prepare("INSERT INTO reviews (user_id, rating, destination, body, created_at, updated_at) VALUES (1, 4, 'Sa Pa', 'Cũng ổn lắm', 2, 2)").run(), /UNIQUE/);

  const env = { DB: wrap(db), ASSETS: { fetch: async () => new Response('') } };
  const res = await worker.fetch(new Request('https://x/api/site'), env, { waitUntil() {} });
  assert.equal(res.status, 200);

  assert.doesNotMatch(db.prepare("SELECT sql FROM sqlite_master WHERE name = 'reviews'").get().sql, /UNIQUE/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reviews').get().n, 1, 'giữ nguyên đánh giá cũ');
  db.prepare("INSERT INTO reviews (user_id, rating, destination, body, created_at, updated_at) VALUES (1, 4, 'Sa Pa', 'Cũng ổn lắm', 2, 2)").run();
  assert.throws(() => db.prepare("INSERT INTO reviews (user_id, rating, destination, body, created_at, updated_at) VALUES (1, 3, 'Sa Pa', 'Trùng tour', 3, 3)").run(), /UNIQUE/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reviews').get().n, 2);
});
