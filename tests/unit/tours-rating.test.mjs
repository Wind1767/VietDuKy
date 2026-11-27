/* Tour hiển thị đánh giá THẬT: chỉ tính đánh giá đã duyệt, theo điểm đến (hoặc tên tour), không tự bịa số. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDB, h } from '../helpers/d1.mjs';
import { publicTours } from '../../src/tours.js';

async function setup() {
	const db = createDB();
	const now = Date.now();
	const tour = (slug, name, dest, sort) => db.prepare("INSERT INTO tours (slug, name, price, destination, active, sort, updated_at) VALUES (?1, ?2, 1000000, ?3, 1, ?4, ?5)").bind(slug, name, dest, sort, now).run();
	await tour('ha-long', 'Du thuyền Hạ Long', 'Vịnh Hạ Long', 1);
	await tour('hue', 'Tour Huế', 'Huế', 2);
	await tour('moi', 'Tour mới tạo', 'Sa Pa', 3);
	let uid = 0;
	const review = async (rating, dest, status) => {
		uid++;
		await db.prepare('INSERT INTO users (id, created_at, email, name, pass_hash, verified_at) VALUES (?1, ?2, ?3, ?4, ?5, ?2)').bind(uid, now, `u${uid}@x.vn`, 'Khách ' +
			uid, 'x').run();
		await db.prepare('INSERT INTO reviews (user_id, rating, destination, body, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)').bind(uid, rating, dest, 'Nội dung đánh giá hợp lệ', status, now).run();
	};
	await review(5, 'Vịnh Hạ Long', 'approved');
	await review(4, 'Vịnh Hạ Long', 'approved');
	await review(1, 'Vịnh Hạ Long', 'pending');
	await review(1, 'Vịnh Hạ Long', 'rejected');
	await review(3, 'Huế', 'approved');
	return db;
}

test('Trung bình và số lượng chỉ tính đánh giá đã duyệt', async () => {
	const db = await setup();
	const { items } = await (await publicTours({ DB: db }, h)).json();
	const by = Object.fromEntries(items.map((t) => [t.slug, t]));
	assert.equal(by['ha-long'].rating_count, 2);
	assert.equal(by['ha-long'].rating_avg, 4.5);
	assert.equal(by['hue'].rating_count, 1);
	assert.equal(by['hue'].rating_avg, 3);
});

test('Tour chưa có đánh giá thì là 0, không có số liệu giả', async () => {
	const db = await setup();
	const { items } = await (await publicTours({ DB: db }, h)).json();
	const t = items.find((x) => x.slug === 'moi');
	assert.equal(t.rating_count, 0);
	assert.equal(t.rating_avg, 0);
});

test('Giữ nguyên thứ tự theo cột sort', async () => {
	const db = await setup();
	const { items } = await (await publicTours({ DB: db }, h)).json();
	assert.deepEqual(items.map((t) => t.slug), ['ha-long', 'hue', 'moi']);
});
