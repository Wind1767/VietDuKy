/* Một khách đánh giá được nhiều tour, nhưng mỗi tour chỉ một đánh giá. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDB } from '../helpers/d1.mjs';

async function add(db, uid, dest) {
  return db.prepare("INSERT INTO reviews (user_id, rating, destination, body, status, created_at, updated_at) VALUES (?1, 5, ?2, 'Nội dung đánh giá hợp lệ', 'pending', 1, 1)").bind(uid, dest).run();
}

test('Cùng một khách đánh giá được hai tour khác nhau', async () => {
  const db = createDB();
  await add(db, 1, 'Hội An');
  await add(db, 1, 'Huế');
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM reviews WHERE user_id = 1').first()).n, 2);
});

test('Không đánh giá hai lần cho cùng một tour', async () => {
  const db = createDB();
  await add(db, 1, 'Hội An');
  await assert.rejects(() => add(db, 1, 'Hội An'));
});
