/* Hòm thư: hiện đủ mọi thông báo, bài viết chỉ hiện tiêu đề, khách xoá riêng của mình */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { INBOX_SCHEMA, VISIBLE } from '../../src/inbox.js';

function db() {
	const d = new DatabaseSync(':memory:');
	INBOX_SCHEMA.forEach((s) => d.exec(s));
	const ins = d.prepare('INSERT INTO notifications (user_id, kind, title, body, created_at) VALUES (?, ?, ?, ?, ?)');
	for (let i = 0; i < 150; i++) {
		ins.run(1, 'system', 'n' + i, '', 1000 + i);
	}
	ins.run(null, 'admin', 'chung', 'x', 5000);
	ins.run(2, 'admin', 'của người khác', 'x', 5001);
	return d;
}
const list = (d, uid, since = 0) => d.prepare(`SELECT n.id, n.title FROM notifications n WHERE ${VISIBLE} ORDER BY n.id DESC`).all(uid, since);

test('Danh sách không giới hạn 40/60 mục và không lẫn thông báo của khách khác', () => {
	const rows = list(db(), 1);
	assert.equal(rows.length, 151);
	assert.ok(!rows.some((r) => r.title === 'của người khác'));
	assert.doesNotMatch(readFileSync(new URL('../../src/inbox.js', import.meta.url), 'utf8'), /\$\{VISIBLE\} ORDER BY n\.id DESC LIMIT/);
});

test('Khách xoá thông báo chung chỉ ẩn với chính họ, khách khác vẫn thấy', () => {
	const d = db();
	const id = list(d, 1)[0].id;
	d.prepare('INSERT INTO notif_hidden (user_id, notif_id) VALUES (1, ?)').run(id);
	assert.equal(list(d, 1).length, 150);
	assert.equal(list(d, 3).length, 1);
});

test('Bài viết chỉ trả tiêu đề ở danh sách, nội dung đầy đủ lấy ở /api/inbox/:id; có DELETE', () => {
	const src = readFileSync(new URL('../../src/inbox.js', import.meta.url), 'utf8');
	assert.match(src, /CASE WHEN n\.kind = 'post' THEN '' ELSE n\.body END/);
	assert.match(src, /\/api\\\/inbox\\\/\(\\d\+\)/);
	assert.match(src, /method === 'DELETE'/);
});

test('Khách xoá thông báo riêng (không phải bài viết) thì xoá hẳn, bài viết và thông báo chung chỉ ẩn', () => {
	const src = readFileSync(new URL('../../src/inbox.js', import.meta.url), 'utf8');
	assert.match(src, /n\.user_id === user\.id && n\.kind !== 'post'/);
	assert.match(src, /purge\(env, `user_id = \?1 AND kind != 'post'`/);
	assert.match(src, /purge\(env, 'id = \?1', Number\(m\[1\]\)\)/);
});

import { adminInbox } from '../../src/inbox.js';
import { createDB, HttpError } from '../helpers/d1.mjs';

test('Admin gửi cho nhiều khách đã chọn: mỗi khách một thông báo; tìm khách theo tên/email', async () => {
	const env = { DB: createDB() };
	env.DB.raw.exec("INSERT INTO users (id, created_at, email, name, pass_hash) VALUES (1, 1, 'an@x.vn', 'Nguyễn An', 'x'), (2, 1, 'binh@x.vn', 'Trần Bình', 'x'), (3, 1, 'vr@virtual.invalid', 'Ảo', 'x')");
	const h = { HttpError, readJson: (r) => r.json(), logAct: async () => {}, json: (d, s = 200) => Response.json(d, { status: s }), clean: (v, n) => String(v ?? '').trim().slice(0, n) };
	const call = (method, p, body) => adminInbox(new Request('http://x.test' + p, { method, body: body ? JSON.stringify(body) : undefined }), env, new URL('http://x.test' + p), h);
	const found = await (await call('GET', '/api/admin/inbox/customers?q=bình')).json();
	assert.deepEqual(found.items.map((u) => u.id), [2]);
	assert.equal((await (await call('GET', '/api/admin/inbox/customers?q=')).json()).items.length, 2, 'không gồm tài khoản ảo');
	await call('POST', '/api/admin/inbox', { users: [1, 2, 2, 3], title: 'Chào', body: 'Nội dung', format: 'text' });
	const rows = env.DB.raw.prepare('SELECT user_id FROM notifications ORDER BY user_id').all().map((r) => r.user_id);
	assert.deepEqual(rows, [1, 2]);
	await assert.rejects(() => call('POST', '/api/admin/inbox', { users: [], title: 'x', body: 'y' }), (e) => e.status === 400);
});
