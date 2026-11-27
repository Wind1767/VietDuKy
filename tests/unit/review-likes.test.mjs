/* Admin chỉnh lượt thích của đánh giá; lượt thích công khai = bình chọn thật + chênh lệch admin, không âm */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createDB, HttpError } from '../helpers/d1.mjs';
import { adminReviews } from '../../src/reviews.js';

let env;
before(() => {
	env = { DB: createDB() };
	const raw = env.DB.raw;
	raw.exec("INSERT INTO users (id, created_at, email, name, pass_hash) VALUES (1, 1, 'a@x.vn', 'An', 'x'), (2, 1, 'b@x.vn', 'Bình', 'x'), (3, 1, 'c@x.vn', 'Chi', 'x')");
	raw.exec("INSERT INTO reviews (id, user_id, rating, destination, body, status, created_at, updated_at) VALUES (1, 1, 5, 'Sa Pa', 'Rất tuyệt vời luôn', 'approved', 1, 1)");
	raw.exec('INSERT INTO review_votes (review_id, user_id, created_at) VALUES (1, 2, 1), (1, 3, 1)');
});
const h = { HttpError, readJson: (r) => r.json(), logAct: async () => {}, notify: async () => {}, clean: (v, n) => String(v ?? '').trim().slice(0, n), vDest: (v) => v };
const call = (method, p, body) => adminReviews(new Request('http://x.test' + p, { method, body: body ? JSON.stringify(body) : undefined }), env, new URL('http://x.test' + p), { ...h, json: (d) => Response.json(d) });

test('Danh sách admin trả lượt thích = bình chọn thật khi chưa chỉnh', async () => {
	const r = await (await call('GET', '/api/admin/reviews?status=approved')).json();
	assert.equal(r.items[0].helpful, 2);
	assert.equal(r.total, 1);
	assert.equal(r.counts.approved, 1);
});

test('Admin đặt lượt thích bất kỳ (kể cả cao hơn hoặc thấp hơn số thật), lưu phần chênh', async () => {
	let r = await (await call('PATCH', '/api/admin/reviews/1', { helpful: 120 })).json();
	assert.equal(r.helpful, 120);
	assert.equal(env.DB.raw.prepare('SELECT helpful_adj a FROM reviews WHERE id = 1').get().a, 118);
	r = await (await call('PATCH', '/api/admin/reviews/1', { helpful: 0 })).json();
	assert.equal(r.helpful, 0);
	const list = await (await call('GET', '/api/admin/reviews')).json();
	assert.equal(list.items[0].helpful, 0);
});

test('Lượt thích không hợp lệ bị từ chối; đánh giá không tồn tại là 404', async () => {
	for (const v of [-1, 1.5, 'abc', 2e6]) {
		await assert.rejects(() => call('PATCH', '/api/admin/reviews/1', { helpful: v }), (e) => e.status === 400, String(v));
	}
	await assert.rejects(() => call('PATCH', '/api/admin/reviews/99', { helpful: 3 }), (e) => e.status === 404);
});

test('Xoá đánh giá dọn luôn bình chọn của nó', async () => {
	await call('DELETE', '/api/admin/reviews/1');
	assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM review_votes').get().n, 0);
	assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM reviews').get().n, 0);
});
