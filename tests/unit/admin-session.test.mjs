/* Cookie quản trị vdk_session: gắn với thiết bị đã đăng nhập, chép sang máy khác thì không dùng được. */
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createDB, UA } from '../helpers/d1.mjs';
import worker from '../../src/worker.js';

const ADMIN_PASSWORD = 'mat-khau-quan-tri-rat-dai-123';
let env;

/* Turnstile gọi ra Cloudflare: trong test thay bằng câu trả lời "thành công" giả */
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
	if (String(url).includes('challenges.cloudflare.com')) {
		return new Response(JSON.stringify({
			success: true,
			action: 'admin_login',
			hostname: 'localhost'
		}), { headers: { 'Content-Type': 'application/json' } });
	}
	return realFetch(url, init);
};
after(() => {
	globalThis.fetch = realFetch;
});

beforeEach(() => {
	env = {
		DB: createDB(),
		ADMIN_PASSWORD,
		TURNSTILE_SECRET: 'test-secret',
		TURNSTILE_HOSTNAMES: 'localhost',
		ASSETS: { fetch: async () => new Response('asset') }
	};
});

async function call(method, path, { body, cookie, ua = UA.chromeWin, country = 'VN' } = {}) {
	const headers = {
		'User-Agent': ua,
		'CF-IPCountry': country,
		'CF-Connecting-IP': '113.161.10.20',
		'Content-Type': 'application/json',
		Origin: 'http://localhost'
	};
	if (cookie) {
		headers.Cookie = 'vdk_session=' + cookie;
	}
	const res = await worker.fetch(new Request('http://localhost' + path, {
		method,
		headers,
		body: body ? JSON.stringify(body) : undefined
	}), env, { waitUntil() {} });
	return res;
}
async function login(opts) {
	const res = await call('POST', '/api/admin/login', { body: { password: ADMIN_PASSWORD, 'cf-turnstile-response': 'ok-token' }, ...opts });
	assert.equal(res.status, 200);
	return /vdk_session=([^;]+)/.exec(res.headers.get('Set-Cookie'))[1];
}

test('Đúng thiết bị: vào được trang quản trị', async () => {
	const token = await login();
	assert.equal((await call('GET', '/api/admin/me', { cookie: token })).status, 200);
});

test('Chép cookie quản trị sang trình duyệt / hệ điều hành khác: bị từ chối', async () => {
	const token = await login();
	assert.equal((await call('GET', '/api/admin/me', { cookie: token, ua: UA.firefoxLinux })).status, 401);
	assert.equal((await call('GET', '/api/admin/me', { cookie: token, ua: UA.safariIphone })).status, 401);
});

test('Cập nhật phiên bản trình duyệt vẫn dùng được cookie quản trị', async () => {
	const token = await login();
	assert.equal((await call('GET', '/api/admin/me', { cookie: token, ua: UA.chromeWinNewer })).status, 200);
});

test('Cookie quản trị giả bị từ chối', async () => {
	await login();
	const exp = Math.floor(Date.now() / 1000) + 3600;
	assert.equal((await call('GET', '/api/admin/me', { cookie: `${exp}.${'a'.repeat(64)}` })).status, 401);
	assert.equal((await call('GET', '/api/admin/me', { cookie: `a1.${exp}.${'a'.repeat(64)}` })).status, 401);
});

test('Cookie quản trị cũ (chưa gắn thiết bị) không còn hiệu lực', async () => {
	// định dạng cũ: HMAC chỉ gồm 'session:' + exp, không có khoá thiết bị
	const { createHmac } = await import('node:crypto');
	const exp = Math.floor(Date.now() / 1000) + 3600;
	const old = createHmac('sha256', ADMIN_PASSWORD).update('session:' + exp).digest('hex');
	assert.equal((await call('GET', '/api/admin/me', { cookie: `${exp}.${old}` })).status, 401);
});

test('Phiên quản trị sống 7 ngày, không phải 8 giờ', async () => {
	const res = await call('POST', '/api/admin/login', { body: { password: ADMIN_PASSWORD, 'cf-turnstile-response': 'ok-token' } });
	assert.match(res.headers.get('Set-Cookie'), /Max-Age=604800/);
});

test('Phiên trượt: dùng sau một thời gian thì được cấp cookie mới, vẫn đăng nhập sau hơn 8 giờ', async () => {
	const cookie = await login();
	const fresh = await call('GET', '/api/admin/me', { cookie });
	assert.equal(fresh.status, 200);
	assert.equal(fresh.headers.get('Set-Cookie'), null, 'vừa đăng nhập thì chưa cần cấp lại');
	const realNow = Date.now;
	Date.now = () => realNow() + 2 * 24 * 3600 * 1000; // 2 ngày sau
	try {
		const later = await call('GET', '/api/admin/me', { cookie });
		assert.equal(later.status, 200);
		assert.match(later.headers.get('Set-Cookie') || '', /vdk_session=[^;]+.*Max-Age=604800/);
	} finally {
		Date.now = realNow;
	}
});

test('ADMIN_SESSION_HOURS đổi được thời hạn phiên', async () => {
	env.ADMIN_SESSION_HOURS = '48';
	const res = await call('POST', '/api/admin/login', { body: { password: ADMIN_PASSWORD, 'cf-turnstile-response': 'ok-token' } });
	assert.match(res.headers.get('Set-Cookie'), /Max-Age=172800/);
});
