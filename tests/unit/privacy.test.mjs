/* Yêu cầu dữ liệu + xoá tài khoản chờ 30 ngày. */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createDB, h } from '../helpers/d1.mjs';
import { hashPassword } from '../../src/customer-auth.js';
import { DELETE_GRACE_MS, exportMyData, requestDelete, cancelDelete, purgeDeletedUsers } from '../../src/privacy.js';

const DAY = 86400000;
let db, env, user;

async function seed() {
	db = createDB();
	env = { DB: db };
	const pass = await hashPassword('mat-khau-dai-123');
	await db.prepare('INSERT INTO users (id, created_at, email, name, phone, pass_hash, verified_at) VALUES (1, ?1, ?2, ?3, ?4, ?5, ?1)').bind(Date.now(), 'khach@example.com', 'Khách Một', '0901234567', pass).run();
	await db.prepare('INSERT INTO users (id, created_at, email, name, pass_hash, verified_at) VALUES (2, ?1, ?2, ?3, ?4, ?1)').bind(Date.now(), 'khac@example.com', 'Người Khác', pass).run();
	for (const uid of [1, 2]) {
		await db.prepare("INSERT INTO user_sessions (id, user_id, created_at, expires_at, last_seen, device) VALUES (?1, ?2, ?3, ?4, ?3, 'Chrome|Windows|d')").bind('sid' +
			uid, uid, Date.now(), Date.now() +
			86400000).run();
		await db.prepare("INSERT INTO bookings (created_at, name, phone, destination, updated_at, user_id) VALUES (?1, 'Tên', '0900', 'Hội An', ?1, ?2)").bind(Date.now(), uid).run();
		await db.prepare('INSERT INTO favorites (user_id, item, created_at) VALUES (?1, ?2, ?3)').bind(uid, 'Sa Pa', Date.now()).run();
		await db.prepare("INSERT INTO reviews (user_id, rating, destination, body, status, created_at, updated_at) VALUES (?1, 5, 'Hội An', 'Chuyến đi rất tuyệt vời', 'approved', ?2, ?2)").bind(uid, Date.now()).run();
		await db.prepare("INSERT INTO messages (user_id, sender, body, created_at) VALUES (?1, 'user', 'Xin chào', ?2)").bind(uid, Date.now()).run();
	}
	user = await db.prepare('SELECT * FROM users WHERE id = 1').first();
}
beforeEach(seed);

test('Yêu cầu dữ liệu: tải về JSON chỉ chứa dữ liệu của chính khách đó', async () => {
	const res = await exportMyData(env, user, h);
	assert.match(res.headers.get('Content-Disposition'), /attachment/);
	const data = await res.json();
	assert.equal(data.account.email, 'khach@example.com');
	assert.equal(data.bookings.length, 1);
	assert.equal(data.favorites.length, 1);
	assert.equal(data.reviews.length, 1);
	assert.equal(data.messages.length, 1);
	assert.equal(JSON.stringify(data).includes('khac@example.com'), false);
	assert.equal('pass_hash' in data.account, false);
});

test('Xoá tài khoản: sai mật khẩu bị từ chối và không đặt lịch xoá', async () => {
	await assert.rejects(requestDelete(env, user, { current: 'sai-mat-khau' }, h), { status: 400 });
	assert.equal((await db.prepare('SELECT delete_requested_at AS d FROM users WHERE id = 1').first()).d, null);
});

test('Xoá tài khoản: đúng mật khẩu thì hẹn xoá sau 30 ngày', async () => {
	const res = await requestDelete(env, user, { current: 'mat-khau-dai-123' }, h);
	const body = await res.json();
	const row = await db.prepare('SELECT delete_requested_at AS d FROM users WHERE id = 1').first();
	assert.ok(row.d > 0);
	assert.equal(body.delete_at, row.d + 30 * DAY);
	assert.equal(DELETE_GRACE_MS, 30 * DAY);
});

test('Chưa đủ 30 ngày thì chưa xoá', async () => {
	await db.prepare('UPDATE users SET delete_requested_at = ?1 WHERE id = 1').bind(Date.now() - 29 * DAY).run();
	assert.equal(await purgeDeletedUsers(env), 0);
	assert.ok(await db.prepare('SELECT 1 AS x FROM users WHERE id = 1').first());
});

test('Huỷ yêu cầu xoá trong thời gian chờ', async () => {
	await requestDelete(env, user, { current: 'mat-khau-dai-123' }, h);
	await cancelDelete(env, user, h);
	assert.equal((await db.prepare('SELECT delete_requested_at AS d FROM users WHERE id = 1').first()).d, null);
	await db.prepare('UPDATE users SET delete_requested_at = NULL WHERE id = 1').run();
	assert.equal(await purgeDeletedUsers(env), 0);
});

test('Quá 30 ngày: xoá hẳn dữ liệu, đơn tour được ẩn danh, người khác không bị ảnh hưởng', async () => {
	await db.prepare('UPDATE users SET delete_requested_at = ?1 WHERE id = 1').bind(Date.now() - 31 * DAY).run();
	assert.equal(await purgeDeletedUsers(env), 1);
	assert.equal(await db.prepare('SELECT 1 AS x FROM users WHERE id = 1').first(), null);
	for (const t of ['favorites', 'reviews', 'messages', 'user_sessions']) {
		assert.equal((await db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE user_id = 1`).first()).n, 0, t);
	}
	const orphan = await db.prepare("SELECT * FROM bookings WHERE name = 'Tài khoản đã xoá'").all();
	assert.equal(orphan.results.length, 1);
	assert.equal(orphan.results[0].user_id, null);
	assert.equal(orphan.results[0].phone, '');
	// khách còn lại giữ nguyên
	assert.ok(await db.prepare('SELECT 1 AS x FROM users WHERE id = 2').first());
	assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM reviews WHERE user_id = 2').first()).n, 1);
	assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM user_sessions WHERE user_id = 2').first()).n, 1);
	assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE user_id = 2").first()).n, 1);
});
