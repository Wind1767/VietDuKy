/* Công tắc đăng nhập Google / passkey: khách và quản trị tách riêng; tắt passkey thì bỏ qua lớp hai bằng passkey, không chặn. */
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createDB, UA } from '../helpers/d1.mjs';
import worker from '../../src/worker.js';
import { mfaGate, loginFlags } from '../../src/mfa-routes.js';
import { dropSiteCache, DEFS, RESTRICTED } from '../../src/site-settings.js';

let env;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

before(async () => {
	env = { DB: createDB(), ADMIN_PASSWORD: 'mat-khau-thu-nghiem-123', SESSION_SECRET: 'x'.repeat(40), MFA_KEY: 'y'.repeat(40), GOOGLE_CLIENT_ID: 'abc.apps.googleusercontent.com', ASSETS: { fetch: async () => new Response('a') } };
	await call('GET', '/api/site');
});
beforeEach(() => {
	env.DB.raw.exec('DELETE FROM site_settings; DELETE FROM mfa_totp; DELETE FROM mfa_passkeys; DELETE FROM mfa_challenges;');
	dropSiteCache();
});
async function call(method, p, body) {
	return worker.fetch(new Request('http://localhost' + p, {
		method,
		headers: { 'User-Agent': UA.chromeWin, 'CF-IPCountry': 'VN', 'CF-Connecting-IP': '113.161.20.' + Math.floor(Math.random() * 200), 'Content-Type': 'application/json', Origin: 'http://localhost' },
		body: body ? JSON.stringify(body) : undefined
	}), env, { waitUntil() {} });
}
function setFlag(key, value) {
	env.DB.raw.prepare('INSERT OR REPLACE INTO site_settings (key, value, updated_at) VALUES (?1, ?2, 0)').run(key, JSON.stringify(value));
	dropSiteCache();
}
function addPasskey(kind, uid) {
	env.DB.raw.prepare("INSERT INTO mfa_passkeys (id, kind, uid, pub, alg, counter, name, transports, created_at) VALUES (?1, ?2, ?3, 'p', -7, 0, 'k', '', 1)").run('k' + Math.random(), kind, uid);
}
function addTotp(kind, uid) {
	env.DB.raw.prepare("INSERT INTO mfa_totp (kind, uid, secret, enabled, last_step, created_at) VALUES (?1, ?2, 's', 1, 0, 1)").run(kind, uid);
}

test('Bốn công tắc mới bật sẵn; cờ của quản trị và passkey thuộc nhóm quyền bảo trì', () => {
	for (const k of ['feat_google', 'feat_google_admin', 'feat_passkey', 'feat_passkey_admin']) {
		assert.deepEqual(DEFS[k], ['b', 0, true], k);
	}
	for (const k of ['feat_google_admin', 'feat_passkey', 'feat_passkey_admin']) {
		assert.equal(RESTRICTED[k], 'maint', k);
	}
});

test('Cấu hình: mặc định có Google + passkey; tắt thì giao diện nhận được cờ tắt', async () => {
	let c = await (await call('GET', '/api/auth/mfa/config')).json();
	assert.equal(c.google_client_id, env.GOOGLE_CLIENT_ID);
	assert.ok(c.nonce);
	assert.equal(c.passkey, true);
	setFlag('feat_google', false);
	setFlag('feat_passkey', false);
	c = await (await call('GET', '/api/auth/mfa/config')).json();
	assert.equal(c.google_client_id, '');
	assert.equal(c.nonce, '');
	assert.equal(c.passkey, false);
});

test('Khách và quản trị tách riêng: tắt của khách không đụng tới quản trị và ngược lại', async () => {
	setFlag('feat_google', false);
	assert.equal((await (await call('GET', '/api/auth/mfa/config')).json()).google_client_id, '');
	assert.equal((await (await call('GET', '/api/admin/mfa/config')).json()).google_client_id, env.GOOGLE_CLIENT_ID);
	setFlag('feat_google', true);
	setFlag('feat_passkey_admin', false);
	assert.equal((await (await call('GET', '/api/auth/mfa/config')).json()).passkey, true);
	assert.equal((await (await call('GET', '/api/admin/mfa/config')).json()).passkey, false);
	assert.deepEqual(await loginFlags(env, 'admin'), { google: true, passkey: false });
});

test('Tắt Google: máy chủ từ chối đăng nhập Google; tắt passkey: từ chối đăng nhập passkey', async () => {
	setFlag('feat_google', false);
	setFlag('feat_passkey', false);
	assert.equal((await call('POST', '/api/auth/mfa/google', { credential: 'x', nonce: 'y' })).status, 503);
	assert.equal((await call('POST', '/api/auth/mfa/passkey/options', {})).status, 503);
	assert.equal((await call('POST', '/api/auth/mfa/passkey/verify', {})).status, 503);
	assert.equal((await call('POST', '/api/admin/mfa/passkey/options', {})).status !== 503, true, 'quản trị chưa tắt');
});

test('Tắt passkey: không bị đòi passkey làm lớp hai; còn Authenticator thì vẫn đòi', async () => {
	addPasskey('user', 7);
	let r = await mfaGate(env, { json }, 'user', 7);
	assert.deepEqual((await r.json()).methods, ['passkey']);
	setFlag('feat_passkey', false);
	assert.equal(await mfaGate(env, { json }, 'user', 7), null, 'chỉ có passkey: bỏ qua lớp hai');
	addTotp('user', 7);
	r = await mfaGate(env, { json }, 'user', 7);
	assert.deepEqual((await r.json()).methods, ['totp'], 'còn Authenticator thì vẫn bắt buộc');
	setFlag('feat_passkey', true);
	setFlag('feat_passkey_admin', false);
	addPasskey('admin', 3);
	assert.equal(await mfaGate(env, { json }, 'admin', 3), null);
	r = await mfaGate(env, { json }, 'user', 7);
	assert.deepEqual((await r.json()).methods, ['totp', 'passkey'], 'tắt của quản trị không ảnh hưởng khách');
});

import { googleUser } from '../../src/customer-auth.js';
import { HttpError } from '../helpers/d1.mjs';

test('Đăng nhập khách bằng Google đã liên kết với tài khoản quản trị: báo đúng lý do, không nói "email đã có tài khoản"', async () => {
	const h = { HttpError, clean: (v, n) => String(v ?? '').trim().slice(0, n) };
	const raw = env.DB.raw;
	raw.exec("DELETE FROM mfa_google; DELETE FROM users WHERE email = 'trung@x.vn'");
	raw.exec("INSERT INTO users (created_at, email, name, pass_hash) VALUES (1, 'trung@x.vn', 'Trùng', 'x')");
	raw.exec("INSERT INTO mfa_google (sub, kind, uid, email, created_at) VALUES ('g1', 'admin', 1, 'trung@x.vn', 1)");
	await assert.rejects(() => googleUser(env, h, { sub: 'g1', email: 'trung@x.vn', name: 'T' }), (e) => e.status === 409 && /quản trị/.test(e.message) && !/Email này đã có/.test(e.message));
	// liên kết mồ côi (khách đã bị xoá) thì bỏ đi, rồi mới xét email như thường
	raw.exec("DELETE FROM mfa_google; INSERT INTO mfa_google (sub, kind, uid, email, created_at) VALUES ('g2', 'user', 99999, 'trung@x.vn', 1)");
	await assert.rejects(() => googleUser(env, h, { sub: 'g2', email: 'trung@x.vn', name: 'T' }), (e) => /Email này đã có/.test(e.message));
	assert.equal(raw.prepare("SELECT COUNT(*) n FROM mfa_google WHERE sub = 'g2'").get().n, 0);
});

test('Đã đăng nhập thì /login, /register, /forgot chuyển về /account; chưa đăng nhập vẫn vào được', async () => {
	const raw = env.DB.raw;
	raw.exec("DELETE FROM users WHERE email = 'dn@x.vn'");
	const { createSession } = await import('../../src/customer-auth.js');
	raw.exec("INSERT INTO users (created_at, email, name, pass_hash, verified_at) VALUES (1, 'dn@x.vn', 'Đã đăng nhập', 'x', 1)");
	const u = raw.prepare("SELECT * FROM users WHERE email = 'dn@x.vn'").get();
	const ses = await createSession(env, u, new Request('http://localhost/', { headers: { 'User-Agent': UA.chromeWin, 'CF-IPCountry': 'VN', 'CF-Connecting-IP': '113.161.20.9' } }));
	const page = (p, ck) => worker.fetch(new Request('http://localhost' + p, { headers: { 'User-Agent': UA.chromeWin, 'CF-IPCountry': 'VN', 'CF-Connecting-IP': '113.161.20.9', ...(ck ? { Cookie: ck } : {}) } }), env, { waitUntil() {} });
	assert.equal((await page('/login')).status, 200);
	const ck = 'vdk_user=' + ses;
	for (const p of ['/login', '/register', '/forgot', '/login.html']) {
		const r = await page(p, ck);
		assert.equal(r.status, 302, p);
		assert.match(r.headers.get('Location'), /\/account$/);
	}
	assert.equal((await page('/reset', ck)).status, 200, 'trang đặt lại mật khẩu từ email vẫn mở được');
});
