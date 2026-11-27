/* Kiểm tra tĩnh HTML / CSS / cấu hình: những thứ dễ hỏng mà không ai nhìn thấy. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const pub = (f) => path.join(root, 'public', f.replace(/^\//, ''));

test('Trang chủ không còn đánh giá viết cứng', () => {
	const html = read('public/index.html');
	assert.doesNotMatch(html, /class="rate"/);
	assert.doesNotMatch(html, /\d+ đánh giá/);
	assert.doesNotMatch(html, /9\.800 khách hàng/);
	assert.match(html, /id="heroTrust"/);
});

test('Trang chủ có nút "Tất cả tour"', () => {
	const html = read('public/index.html');
	assert.match(html, /id="toursAllBtn"/);
	assert.match(read('public/js/main.js'), /Tất cả tour/);
});

test('Mọi <script src> và <link href> nội bộ đều trỏ tới file có thật', () => {
	const pages = fs.readdirSync(path.join(root, 'public')).filter((f) => f.endsWith('.html')).map((f) => 'public/' +
		f);
	pages.push('public/admin/index.html');
	for (const page of pages) {
		const dir = path.dirname(path.join(root, page));
		for (const m of read(page).matchAll(/(?:src|href)="([^"]+\.(?:js|css|png|jpg))"/g)) {
			const ref = m[1];
			if (/^(https?:)?\/\//.test(ref)) {
				continue;
			}
			const file = ref.startsWith('/') ? pub(ref) : path.join(dir, ref);
			assert.ok(fs.existsSync(file), `${page} → ${ref}`);
		}
	}
});

test('Kéo thả file được nạp ở trang quản trị và trang tài khoản', () => {
	assert.match(read('public/admin/index.html'), /dropzone\.js/);
	assert.match(read('public/account.html'), /dropzone\.js/);
});

test('Admin: thẻ lồng thẻ có bo góc riêng (đồng tâm)', () => {
	assert.match(read('public/admin/admin.css'), /\.card \.card[^{]*\{[^}]*border-radius/);
});

test('Có cron dọn tài khoản hết hạn xoá', () => {
	assert.match(read('wrangler.toml'), /\[triggers\][\s\S]*crons/);
	assert.match(read('src/worker.js'), /async scheduled\(/);
});

test('CSS và JS không bị viết dính một dòng dài (mỗi khai báo / câu lệnh một dòng)', () => {
	for (const f of ['public/css/style.css', 'public/css/components.css', 'public/css/form-controls.css', 'public/css/chat.css', 'public/admin/admin.css']) {
		for (const [i, line] of read(f).split('\n').entries()) {
			const semis = (line.replace(/\([^)]*\)/g, '').replace(/"[^"]*"|'[^']*'/g, '').match(/;/g) || []).length;
			assert.ok(semis <= 1, `${f}:${i + 1} có ${semis} khai báo trên một dòng`);
		}
	}
});
