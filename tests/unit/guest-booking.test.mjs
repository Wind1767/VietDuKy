/* Tắt đăng nhập + bật đặt tour: khách không cần tài khoản vẫn đặt được, đơn lên thẳng trang quản trị. */
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createDB, UA } from '../helpers/d1.mjs';
import worker from '../../src/worker.js';
import { dropSiteCache } from '../../src/site-settings.js';

let env;
const OK = { name: 'Nguyễn Văn An', phone: '0912345678', destination: 'Sa Pa', people: 2, message: 'Cần tư vấn' };

/* Dùng chung một CSDL cho cả file: worker chỉ dựng/nâng cấp bảng một lần cho mỗi tiến trình */
before(async () => {
	env = { DB: createDB(), ASSETS: { fetch: async () => new Response('a') } };
	await call('GET', '/api/site');
});
beforeEach(() => {
	env.DB.raw.exec('DELETE FROM bookings; DELETE FROM site_settings;');
	dropSiteCache();
});
async function call(method, p, body) {
	return worker.fetch(new Request('http://localhost' + p, {
		method,
		headers: { 'User-Agent': UA.chromeWin, 'CF-IPCountry': 'VN', 'CF-Connecting-IP': '113.161.10.' + Math.floor(Math.random() * 200), 'Content-Type': 'application/json', Origin: 'http://localhost' },
		body: body ? JSON.stringify(body) : undefined
	}), env, { waitUntil() {} });
}
function setFlag(key, value) {
	env.DB.raw.prepare('INSERT OR REPLACE INTO site_settings (key, value, updated_at) VALUES (?1, ?2, 0)').run(key, JSON.stringify(value));
	dropSiteCache();
}
const rows = () => env.DB.raw.prepare('SELECT name, phone, destination, user_id FROM bookings').all();

test('Đăng nhập đang bật: chưa đăng nhập thì không đặt được', async () => {
	setFlag('feat_turnstile', false);
	const r = await call('POST', '/api/booking', OK);
	assert.equal(r.status, 401);
	assert.equal((await r.json()).code, 'login_required');
	assert.equal(rows().length, 0);
});

test('Tắt đăng nhập + bật đặt tour: đặt được không cần tài khoản, đơn không gắn user', async () => {
	setFlag('feat_turnstile', false);
	setFlag('feat_login', false);
	const r = await call('POST', '/api/booking', { ...OK, email: 'khach@example.com' });
	assert.equal(r.status, 201);
	const [b] = rows();
	assert.equal(b.name, OK.name);
	assert.equal(b.phone, OK.phone);
	assert.equal(b.destination, 'Sa Pa');
	assert.equal(b.user_id, null);
});

test('Khách không đăng nhập vẫn phải nhập tên và SĐT đúng; email là tuỳ chọn', async () => {
	setFlag('feat_turnstile', false);
	setFlag('feat_login', false);
	assert.equal((await call('POST', '/api/booking', { ...OK, phone: '' })).status, 400);
	assert.equal((await call('POST', '/api/booking', { ...OK, name: '' })).status, 400);
	assert.equal((await call('POST', '/api/booking', { ...OK, email: 'không-hợp-lệ' })).status, 201);
	assert.equal(rows().length, 1);
});

test('Tắt cả đăng nhập lẫn đặt tour: đặt tour vẫn bị chặn', async () => {
	setFlag('feat_turnstile', false);
	setFlag('feat_login', false);
	setFlag('feat_booking', false);
	assert.equal((await call('POST', '/api/booking', OK)).status, 503);
	assert.equal(rows().length, 0);
});

test('Tắt đăng nhập: máy chủ không còn nhận phiên nào, /api/auth/me báo login_off', async () => {
	setFlag('feat_login', false);
	const me = await (await call('GET', '/api/auth/me')).json();
	assert.equal(me.user, null);
	assert.equal(me.why, 'login_off');
	assert.equal((await call('POST', '/api/auth/login', { email: 'a@b.co', password: 'x' })).status, 503);
});

test('Quên mật khẩu, huỷ đơn, bình chọn hữu ích bị chặn khi tắt công tắc riêng', async () => {
	setFlag('feat_forgot', false);
	setFlag('feat_cancel', false);
	setFlag('feat_votes', false);
	assert.equal((await call('POST', '/api/auth/forgot', { email: 'a@b.co' })).status, 503);
	assert.equal((await call('POST', '/api/auth/reset', { token: 'x', password: 'y' })).status, 503);
	assert.equal((await call('POST', '/api/auth/bookings/cancel', { id: 1 })).status, 503);
	assert.equal((await call('POST', '/api/reviews/5/helpful')).status, 503);
});

test('Tắt trang tự tạo: API nội dung trang cũng bị chặn', async () => {
	setFlag('feat_pages', false);
	assert.equal((await call('GET', '/api/pages/gioi-thieu')).status, 503);
});
