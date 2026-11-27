/* Mật khẩu: đăng ký, đặt lại, đổi mật khẩu và tài khoản do admin tạo phải dùng chung MỘT độ dài tối thiểu. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIN_PASS, hashPassword, checkPassword } from '../../src/customer-auth.js';
import { RULES, MIN_PASS as RULE_MIN } from '../../src/rules.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('MIN_PASS là 10', () => {
	assert.equal(MIN_PASS, 10);
});

test('Form đăng ký / đặt lại / đổi mật khẩu dùng minlength khớp MIN_PASS', () => {
	for (const f of ['public/register.html', 'public/reset.html']) {
		assert.match(read(f), new RegExp('minlength="' + MIN_PASS + '"'), f);
		assert.doesNotMatch(read(f), /ít nhất 8 ký tự/, f);
	}
	assert.match(read('public/js/auth.js'), new RegExp('minlength="' + MIN_PASS + '"'));
});

test('Server không còn con số 8 / 10 viết cứng cho mật khẩu', () => {
	for (const f of ['src/customer-auth.js', 'src/customer-accounts.js', 'src/admin-accounts.js']) {
		assert.doesNotMatch(read(f), /length < (8|10) \|\| .*128/, f);
	}
	assert.match(read('src/admin-accounts.js'), /MIN_PASS/);
	assert.match(read('src/customer-accounts.js'), /MIN_PASS/);
});

test('Một nguồn duy nhất cho độ dài mật khẩu (rules.js)', () => {
	assert.equal(RULE_MIN, MIN_PASS);
	assert.equal(RULES.minPass, MIN_PASS);
	assert.match(read('src/site-settings.js'), /rules: RULES/);
	assert.match(read('src/worker.js'), /rules: RULES/);
	for (const f of ['public/register.html', 'public/reset.html', 'public/js/auth.js']) {
		assert.match(read(f), /data-pass-new/, f);
	}
});

test('Trang quản trị đọc độ dài mật khẩu từ máy chủ, không viết cứng', () => {
	const a = read('public/admin/admin.js');
	assert.doesNotMatch(a, /Mật khẩu \(10 ký tự trở lên\)/);
	assert.match(a, /minPass\(\)/);
});

test('Băm và kiểm tra mật khẩu', async () => {
	const stored = await hashPassword('mat-khau-dai-123');
	assert.equal(await checkPassword('mat-khau-dai-123', stored), true);
	assert.equal(await checkPassword('sai-mat-khau-123', stored), false);
});

test('Admin có nút tạo mật khẩu ngẫu nhiên cho tài khoản quản trị và khách', () => {
	const a = read('public/admin/admin.js');
	assert.match(a, /passGen\('aPass'\)/);
	assert.match(a, /passGen\('cPass'\)/);
	assert.match(a, /function genPass\(\)/);
});
