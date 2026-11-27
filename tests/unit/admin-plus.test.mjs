import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('Trang quản trị nạp admin-plus.js và file có thật', () => {
	assert.match(read('public/admin/index.html'), /<script src="admin-plus\.js"><\/script>/);
	assert.ok(fs.existsSync(path.join(root, 'public/admin/admin-plus.js')));
});

test('Các icon của tính năng admin mới có trong danh sách font', () => {
	const html = read('public/admin/index.html');
	for (const n of ['density_medium', 'density_small', 'format_size', 'keyboard']) {
		assert.match(html, new RegExp('icon_names=[^"]*\\b' + n + '\\b'), n);
	}
});

test('Trang chủ chỉ có một nút lên đầu trang và một thanh tiến độ', () => {
	const extras = read('public/js/extras.js');
	assert.doesNotMatch(extras, /x-top|x-progress/);
	assert.match(read('public/js/main.js'), /id="top"/);
	assert.doesNotMatch(read('public/css/extras.css'), /\.x-top|\.x-progress/);
});

test('Icon giao diện tối dùng biến --icon, không dùng --mut mờ', () => {
	const css = read('public/admin/admin.css');
	assert.match(css, /:root\[data-theme="dark"\] \{\s*--mut: #b3c8c1;\s*--icon: #d6e7e1;/);
	assert.match(css, /\.search-wrap \.ms,[^}]*color: var\(--icon\)/s);
});

test('Tính năng tiện ích admin: lưu nhanh, cảnh báo rời trang, tiêu đề tab, nhớ trang, nút lên đầu', () => {
	const j = read('public/admin/admin-plus.js');
	assert.match(j, /e\.key === 'Enter'/);
	assert.match(j, /beforeunload/);
	assert.match(j, /navNew/);
	assert.match(j, /vdk-last-view/);
	assert.match(j, /adm-top/);
});

test('Ô mật khẩu có nút hiện/ẩn và gợi ý độ dài theo quy tắc chung', () => {
	const s = read('public/js/site.js');
	assert.match(s, /function enhancePass/);
	assert.match(s, /VDK_RULES\.minPass/);
	assert.match(read('public/css/style.css'), /\.pw-eye \{/);
	for (const f of ['login', 'register', 'reset']) {
		assert.match(read(`public/${f}.html`), /visibility_off/, f);
	}
});

test('Nhấp đúp vào ô bảng để sao chép', () => {
	assert.match(read('public/admin/admin-plus.js'), /dblclick/);
});
