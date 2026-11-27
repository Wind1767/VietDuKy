/* Logo vector + bộ icon, avatar quản trị viên, bố cục thông tin cá nhân. */
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDB, UA } from '../helpers/d1.mjs';
import worker from '../../src/worker.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const png = f => {
	const b = fs.readFileSync(path.join(root, 'public', f));
	assert.equal(b.subarray(1, 4).toString(), 'PNG', f);
	return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};

test('Logo có đủ kích cỡ nét và bản vector', () => {
	assert.deepEqual(png('logo.png'), { w: 512, h: 512 });
	assert.deepEqual(png('logo-1024.png'), { w: 1024, h: 1024 });
	assert.deepEqual(png('favicon.png'), { w: 256, h: 256 });
	assert.deepEqual(png('icon-192.png'), { w: 192, h: 192 });
	assert.deepEqual(png('icon-512.png'), { w: 512, h: 512 });
	assert.deepEqual(png('icon-maskable-512.png'), { w: 512, h: 512 });
	assert.deepEqual(png('apple-touch-icon.png'), { w: 180, h: 180 });
	assert.match(read('public/logo.svg'), /<svg[^>]+viewBox="0 0 512 512"/);
	assert.ok(fs.existsSync(path.join(root, 'public/favicon.ico')));
});

test('manifest hợp lệ và mọi trang đều gắn logo', () => {
	const m = JSON.parse(read('public/manifest.webmanifest'));
	assert.ok(m.icons.some(i => i.purpose === 'maskable'));
	for (const i of m.icons) {
		assert.ok(fs.existsSync(path.join(root, 'public', i.src)), i.src);
	}
	for (const f of fs.readdirSync(path.join(root, 'public')).filter(x => x.endsWith('.html')).concat(['admin/index.html'])) {
		const h = read(f.includes('/') ? 'public/' + f : 'public/' + f);
		assert.match(h, /rel="apple-touch-icon"/, f);
		assert.match(h, /favicon\.svg/, f);
	}
});

test('Thông tin cá nhân: nhãn (Họ và tên) nằm trên giá trị', () => {
	const a = read('public/js/auth.js');
	assert.match(a, /<small>Họ và tên<\/small><b id="aName">/);
	assert.match(a, /<small>Số điện thoại<\/small><b id="aPhone">/);
	assert.match(a, /<label class="pf"><span>Họ và tên<\/span>/);
});

test('Admin hiện avatar kế bên tên và cho tự đổi ảnh', () => {
	assert.match(read('public/admin/index.html'), /id="whoAv"/);
	const j = read('public/admin/admin.js');
	assert.match(j, /function openMyAvatar/);
	assert.match(j, /avInner\(a\.name, a\.avatar\)/);
});

/* ---- API: avatar tài khoản quản trị ---- */
const ADMIN_PASSWORD = 'mat-khau-quan-tri-rat-dai-123';
const IK = 'https://ik.imagekit.io/test';
let env;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => String(url).includes('challenges.cloudflare.com')
	? new Response(JSON.stringify({
		success: true,
		action: 'admin_login',
		hostname: 'localhost'
	}), { headers: { 'Content-Type': 'application/json' } })
	: realFetch(url, init);
after(() => {
	globalThis.fetch = realFetch;
});
beforeEach(() => {
	env = {
		DB: createDB(),
		ADMIN_PASSWORD,
		TURNSTILE_SECRET: 's',
		TURNSTILE_HOSTNAMES: 'localhost',
		IMAGEKIT_URL_ENDPOINT: IK,
		ASSETS: { fetch: async () => new Response('a') }
	};
});
async function call(method, p, { body, cookie } = {}) {
	const headers = {
		'User-Agent': UA.chromeWin,
		'CF-IPCountry': 'VN',
		'CF-Connecting-IP': '113.161.10.20',
		'Content-Type': 'application/json',
		Origin: 'http://localhost'
	};
	if (cookie) {
		headers.Cookie = 'vdk_session=' + cookie;
	}
	return worker.fetch(new Request('http://localhost' + p, {
		method,
		headers,
		body: body ? JSON.stringify(body) : undefined
	}), env, { waitUntil() {} });
}
async function login() {
	const r = await call('POST', '/api/admin/login', { body: { password: ADMIN_PASSWORD, 'cf-turnstile-response': 'ok-token' } });
	return /vdk_session=([^;]+)/.exec(r.headers.get('Set-Cookie'))[1];
}

test('Tạo quản trị viên kèm avatar hợp lệ; ảnh ngoài hệ thống bị từ chối', async () => {
	const cookie = await login();
	const mk = (avatar, email) => call('POST', '/api/admin/admins', { cookie, body: {
			name: 'Lê Minh',
			email,
			role: 'staff',
			password: 'mat-khau-dai-123',
			avatar
		} });
	const ok = await mk(IK + '/a.jpg', 'a@x.vn');
	assert.equal(ok.status, 201);
	assert.equal((await ok.json()).item.avatar, IK + '/a.jpg');
	assert.equal((await mk('https://evil.example/a.jpg', 'b@x.vn')).status, 400);
	const list = await (await call('GET', '/api/admin/admins', { cookie })).json();
	assert.equal(list.items[0].avatar, IK + '/a.jpg');
});

test('Tài khoản chủ gốc không có hàng trong bảng nên không tự đổi ảnh', async () => {
	const cookie = await login();
	assert.equal((await call('PATCH', '/api/admin/me', { cookie, body: { avatar: IK + '/a.jpg' } })).status, 400);
	const me = await (await call('GET', '/api/admin/me', { cookie })).json();
	assert.equal(me.avatar, '');
});
