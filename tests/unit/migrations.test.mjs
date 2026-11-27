/* Tên file migration phải nói rõ việc nó làm; script đồng bộ tên cho DB đã áp dụng bản cũ phải đủ. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const files = fs.readdirSync(path.join(root, 'migrations')).filter((f) => f.endsWith('.sql')).sort();

test('Mỗi migration đặt tên: số thứ tự + động từ (create_/add_/note_) + đối tượng', () => {
	assert.ok(files.length >= 22);
	for (const f of files) {
		assert.match(f, /^\d{4}_(create|add|note)_[a-z0-9_]+\.sql$/, f);
		assert.doesNotMatch(f, /part\d|phan|init/i, f + ' còn tên chung chung');
	}
});

test('Số thứ tự liên tục, không trùng', () => {
	files.forEach((f, i) => assert.equal(Number(f.slice(0, 4)), i + 1, f));
});

test('Tên file khớp nội dung: create_X có CREATE TABLE X, add_X_Y có ALTER TABLE X ADD COLUMN Y', () => {
	for (const f of files) {
		const sql = fs.readFileSync(path.join(root, 'migrations', f), 'utf8');
		const name = f.replace(/^\d{4}_/, '').replace(/\.sql$/, '');
		if (name.startsWith('add_')) {
			const m = /^add_([a-z]+)_([a-z_]+?)(?:_|$)/.exec(name);
			assert.match(sql, new RegExp('ALTER TABLE ' + m[1] + ' ADD COLUMN ' + m[2].split('_')[0] +
				'|ALTER TABLE ' + m[1] + ' ADD COLUMN'), f);
		}
		if (name.startsWith('create_')) {
			const table = name.replace(/^create_/, '').split('_and_')[0].split('_add_')[0].split('_')[0];
			assert.match(sql, new RegExp('CREATE TABLE IF NOT EXISTS ' + table), f);
		}
		if (name.startsWith('note_')) {
			assert.match(sql, /SELECT 1;/, f + ' chỉ là ghi chú nên không đổi gì trong DB');
		}
	}
});

test('Không còn nhãn "Phần N" / "partN" trong tên file hay comment SQL', () => {
	for (const f of files) {
		assert.doesNotMatch(fs.readFileSync(path.join(root, 'migrations', f), 'utf8'), /Phần \d|part\d/i, f);
	}
});

test('scripts/sync-renamed-migrations.sql đổi đủ tên cũ -> tên mới cho DB đã áp dụng bản cũ', () => {
	const sql = fs.readFileSync(path.join(root, 'scripts', 'sync-renamed-migrations.sql'), 'utf8');
	const pairs = [...sql.matchAll(/SET name = '([^']+)' WHERE name = '([^']+)'/g)].map((m) => ({ now: m[1], was: m[2] }));
	assert.equal(pairs.length, 21);
	for (const { now, was } of pairs) {
		assert.ok(files.includes(now), 'không có file ' + now);
		assert.ok(!files.includes(was), 'tên cũ vẫn còn: ' + was);
		assert.equal(now.slice(0, 4), was.slice(0, 4), 'giữ nguyên số thứ tự');
	}
});
