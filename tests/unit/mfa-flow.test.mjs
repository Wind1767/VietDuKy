/* Luồng xác thực hai lớp của khách qua API thật (D1 giả lập): mật khẩu -> vé -> mã Authenticator / mã khôi phục / passkey. */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createDB, makeH, UA } from '../helpers/d1.mjs';
import { authenticator } from '../helpers/webauthn.mjs';
import { hashPassword, handleAuth } from '../../src/customer-auth.js';
import { hotp, b32dec, b64u, resetGoogleKeyCache } from '../../src/mfa.js';

const PASS = 'mat-khau-dai-123';
let db, env, h;

beforeEach(async () => {
	db = createDB();
	env = { DB: db, MFA_KEY: 'khoa-thu-nghiem' };
	h = makeH({ logAct: async () => {} });
	await db.prepare('INSERT INTO users (id, created_at, email, name, phone, pass_hash, verified_at) VALUES (1, ?1, ?2, ?3, ?4, ?5, ?1)')
		.bind(Date.now(), 'a@example.com', 'Khách A', '0901234567', await hashPassword(PASS)).run();
});

async function call(method, path, { body, cookie } = {}) {
	const headers = {
		'User-Agent': UA.chromeWin,
		'CF-IPCountry': 'VN',
		'CF-Connecting-IP': '113.161.10.20',
		Origin: 'http://localhost',
		'Content-Type': 'application/json'
	};
	if (cookie) {
		headers.Cookie = 'vdk_user=' + cookie;
	}
	const url = new URL('http://localhost' + path);
	try {
		const res = await handleAuth(new Request(url, {
			method,
			headers,
			body: body ? JSON.stringify(body) : undefined
		}), env, url, '113.161.10.20', h);
		return {
			status: res.status,
			res,
			json: await res.clone().json()
		};
	} catch (e) {
		return { status: e.status || 500, json: { error: e.message, code: e.code } };
	}
}
const cookieOf = r => /vdk_user=([^;]+)/.exec(r.res.headers.get('Set-Cookie'))[1];
const codeAt = async (secret, offset = 0) => hotp(b32dec(secret), Math.floor(Date.now() / 30000) + offset);

async function loginPlain() {
	const r = await call('POST', '/api/auth/login', { body: { email: 'a@example.com', password: PASS } });
	assert.equal(r.status, 200);
	return cookieOf(r);
}

async function enableTotp(cookie) {
	const s = await call('POST', '/api/auth/mfa/totp/setup', { cookie });
	assert.equal(s.status, 200);
	assert.match(s.json.uri, /^otpauth:\/\/totp\//);
	const e = await call('POST', '/api/auth/mfa/totp/enable', { cookie, body: { code: await codeAt(s.json.secret) } });
	assert.equal(e.status, 200, e.json.error);
	return { secret: s.json.secret, recovery: e.json.recovery };
}

test('Chưa bật 2FA: đăng nhập mật khẩu vào thẳng như cũ', async () => {
	const c = await loginPlain();
	const st = await call('GET', '/api/auth/mfa/security', { cookie: c });
	assert.deepEqual([st.json.totp, st.json.passkeys.length, st.json.has_password], [false, 0, true]);
});

test('Bật Authenticator: sai mã bị từ chối, đúng mã trả 8 mã khôi phục, bí mật không lưu dạng rõ', async () => {
	const c = await loginPlain();
	const s = await call('POST', '/api/auth/mfa/totp/setup', { cookie: c });
	const bad = await call('POST', '/api/auth/mfa/totp/enable', { cookie: c, body: { code: '000000' } });
	assert.equal(bad.status, 400);
	const ok = await call('POST', '/api/auth/mfa/totp/enable', { cookie: c, body: { code: await codeAt(s.json.secret) } });
	assert.equal(ok.json.recovery.length, 8);
	const row = await db.prepare('SELECT secret FROM mfa_totp').first();
	assert.ok(!row.secret.includes(s.json.secret));
	assert.equal((await call('POST', '/api/auth/mfa/totp/setup', { cookie: c })).status, 409, 'đã bật thì không thiết lập lại được');
});

test('Đã bật 2FA: mật khẩu đúng chưa cấp phiên, phải nhập mã; mã dùng lại bị từ chối', async () => {
	const c = await loginPlain();
	const { secret } = await enableTotp(c);
	const r = await call('POST', '/api/auth/login', { body: { email: 'a@example.com', password: PASS } });
	assert.equal(r.status, 200);
	assert.equal(r.json.mfa, true);
	assert.deepEqual(r.json.methods, ['totp']);
	assert.equal(r.res.headers.get('Set-Cookie'), null, 'chưa có cookie phiên');
	assert.equal((await call('GET', '/api/auth/me')).json.user, null);

	const wrong = await call('POST', '/api/auth/mfa/verify', { body: { ticket: r.json.ticket, code: '123456' } });
	assert.equal(wrong.status, 401);
	// mã của bước hiện tại đã dùng lúc bật -> không dùng lại; mã bước kế tiếp thì được
	const replay = await call('POST', '/api/auth/mfa/verify', { body: { ticket: r.json.ticket, code: await codeAt(secret, 0) } });
	assert.equal(replay.status, 401, 'chống dùng lại mã');
	const ok = await call('POST', '/api/auth/mfa/verify', { body: { ticket: r.json.ticket, code: await codeAt(secret, 1) } });
	assert.equal(ok.status, 200, ok.json.error);
	assert.equal((await call('GET', '/api/auth/me', { cookie: cookieOf(ok) })).json.user.email, 'a@example.com');
	const again = await call('POST', '/api/auth/mfa/verify', { body: { ticket: r.json.ticket, code: await codeAt(secret, 1) } });
	assert.equal(again.status, 401, 'vé chỉ dùng một lần');
});

test('Mã khôi phục dùng được đúng một lần; thử sai 5 lần thì vé bị huỷ', async () => {
	const c = await loginPlain();
	const { recovery } = await enableTotp(c);
	const t1 = (await call('POST', '/api/auth/login', { body: { email: 'a@example.com', password: PASS } })).json.ticket;
	assert.equal((await call('POST', '/api/auth/mfa/verify', { body: { ticket: t1, code: recovery[0].toUpperCase() } })).status, 200);
	const t2 = (await call('POST', '/api/auth/login', { body: { email: 'a@example.com', password: PASS } })).json.ticket;
	assert.equal((await call('POST', '/api/auth/mfa/verify', { body: { ticket: t2, code: recovery[0] } })).status, 401, 'mã khôi phục đã dùng');
	for (let i = 0; i < 4; i++) {
		await call('POST', '/api/auth/mfa/verify', { body: { ticket: t2, code: '000000' } });
	}
	assert.equal((await call('POST', '/api/auth/mfa/verify', { body: { ticket: t2, code: recovery[1] } })).status, 401, 'vé đã bị huỷ sau 5 lần sai');
});

test('Tắt Authenticator cần mật khẩu hoặc mã; sau đó đăng nhập lại như thường', async () => {
	const c = await loginPlain();
	await enableTotp(c);
	assert.equal((await call('POST', '/api/auth/mfa/totp/disable', { cookie: c, body: {} })).status, 400);
	assert.equal((await call('POST', '/api/auth/mfa/totp/disable', { cookie: c, body: { password: 'sai-mat-khau-1' } })).status, 400);
	assert.equal((await call('POST', '/api/auth/mfa/totp/disable', { cookie: c, body: { password: PASS } })).status, 200);
	assert.equal((await call('POST', '/api/auth/login', { body: { email: 'a@example.com', password: PASS } })).json.mfa, undefined);
	assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM mfa_recovery').first()).n, 0);
});

test('Các API cài đặt bảo mật cần đăng nhập', async () => {
	for (const [m, p] of [['GET', '/api/auth/mfa/security'], ['POST', '/api/auth/mfa/totp/setup'], ['POST', '/api/auth/mfa/passkey/reg-options']]) {
		assert.equal((await call(m, p)).status, 401, p);
	}
});

test('Passkey: đăng ký, đăng nhập không cần mật khẩu, và làm bước 2FA sau mật khẩu', async () => {
	const c = await loginPlain();
	const a = await authenticator('localhost', 'http://localhost');
	const opt = await call('POST', '/api/auth/mfa/passkey/reg-options', { cookie: c });
	assert.equal(opt.json.publicKey.rp.id, 'localhost');
	assert.equal(opt.json.publicKey.authenticatorSelection.userVerification, 'required');
	const reg = await call('POST', '/api/auth/mfa/passkey/register', { cookie: c, body: {
			challengeId: opt.json.challengeId,
			credential: a.register(opt.json.publicKey.challenge),
			name: 'Máy tính'
		} });
	assert.equal(reg.status, 200, reg.json.error);
	assert.equal(reg.json.recovery.length, 8, 'chỉ có passkey: phát luôn mã khôi phục');
	const replayReg = await call('POST', '/api/auth/mfa/passkey/register', { cookie: c, body: { challengeId: opt.json.challengeId, credential: a.register(opt.json.publicKey.challenge) } });
	assert.equal(replayReg.status, 400, 'challenge chỉ dùng một lần');

	// đăng nhập bằng passkey, không nhập email/mật khẩu
	const o1 = await call('POST', '/api/auth/mfa/passkey/options', { body: {} });
	assert.equal(o1.json.publicKey.allowCredentials, undefined);
	const v1 = await call('POST', '/api/auth/mfa/passkey/verify', { body: { challengeId: o1.json.challengeId, credential: await a.assert(o1.json.publicKey.challenge, 1) } });
	assert.equal(v1.status, 200, v1.json.error);
	assert.equal((await call('GET', '/api/auth/me', { cookie: cookieOf(v1) })).json.user.id, 1);

	// làm bước 2FA sau mật khẩu
	const login = await call('POST', '/api/auth/login', { body: { email: 'a@example.com', password: PASS } });
	assert.deepEqual(login.json.methods, ['passkey']);
	const o2 = await call('POST', '/api/auth/mfa/passkey/options', { body: { ticket: login.json.ticket } });
	assert.equal(o2.json.publicKey.allowCredentials.length, 1);
	const v2 = await call('POST', '/api/auth/mfa/passkey/verify', { body: {
			ticket: login.json.ticket,
			challengeId: o2.json.challengeId,
			credential: await a.assert(o2.json.publicKey.challenge, 2)
		} });
	assert.equal(v2.status, 200, v2.json.error);

	// chữ ký lặp lại (bộ đếm không tăng) bị từ chối
	const o3 = await call('POST', '/api/auth/mfa/passkey/options', { body: {} });
	const v3 = await call('POST', '/api/auth/mfa/passkey/verify', { body: { challengeId: o3.json.challengeId, credential: await a.assert(o3.json.publicKey.challenge, 2) } });
	assert.equal(v3.status, 401);
});

test('Passkey của người khác không dùng được cho vé của mình', async () => {
	await db.prepare('INSERT INTO users (id, created_at, email, name, phone, pass_hash, verified_at) VALUES (2, ?1, ?2, ?3, ?4, ?5, ?1)')
		.bind(Date.now(), 'b@example.com', 'Khách B', '0901234568', await hashPassword(PASS)).run();
	const c1 = await loginPlain();
	const a = await authenticator('localhost', 'http://localhost');
	const opt = await call('POST', '/api/auth/mfa/passkey/reg-options', { cookie: c1 });
	await call('POST', '/api/auth/mfa/passkey/register', { cookie: c1, body: { challengeId: opt.json.challengeId, credential: a.register(opt.json.publicKey.challenge) } });
	// B bật TOTP rồi đăng nhập, dùng passkey của A cho vé của B
	const rb = await call('POST', '/api/auth/login', { body: { email: 'b@example.com', password: PASS } });
	const cb = cookieOf(rb);
	await enableTotp(cb);
	const lb = await call('POST', '/api/auth/login', { body: { email: 'b@example.com', password: PASS } });
	const o = await call('POST', '/api/auth/mfa/passkey/options', { body: { ticket: lb.json.ticket } });
	const v = await call('POST', '/api/auth/mfa/passkey/verify', { body: {
			ticket: lb.json.ticket,
			challengeId: o.json.challengeId,
			credential: await a.assert(o.json.publicKey.challenge, 1)
		} });
	assert.equal(v.status, 401);
});

test('Google chưa cấu hình thì từ chối; tài khoản chưa có mật khẩu vẫn tải/xoá dữ liệu được', async () => {
	const r = await call('POST', '/api/auth/mfa/google', { body: { credential: 'x', nonce: 'y' } });
	assert.equal(r.status, 503);
	await db.prepare("UPDATE users SET pass_hash = '!google' WHERE id = 1").run();
	const login = await call('POST', '/api/auth/login', { body: { email: 'a@example.com', password: '!google' } });
	assert.equal(login.status, 401, 'không đăng nhập bằng mật khẩu giả');
	const cfg = await call('GET', '/api/auth/mfa/config');
	assert.equal(cfg.json.google_client_id, '');
});

/* ---- Google: không tự gộp vào email có sẵn, phải liên kết sau khi đăng nhập bằng email ---- */
const CLIENT_ID = 'test-client.apps.googleusercontent.com';
async function googleKit() {
	resetGoogleKeyCache();
	const kp = await crypto.subtle.generateKey({
		name: 'RSASSA-PKCS1-v1_5',
		modulusLength: 2048,
		publicExponent: new Uint8Array([1, 0, 1]),
		hash: 'SHA-256'
	}, true, ['sign', 'verify']);
	const jwk = { ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid: 'k1' };
	const realFetch = globalThis.fetch;
	globalThis.fetch = async () => ({ ok: true, json: async () => ({ keys: [jwk] }) });
	const enc = new TextEncoder();
	return {
		restore: () => {
			globalThis.fetch = realFetch;
		},
		async token(email, sub, nonce) {
			const now = Math.floor(Date.now() / 1000);
			const h = b64u.enc(enc.encode(JSON.stringify({ alg: 'RS256', kid: 'k1' })));
			const p = b64u.enc(enc.encode(JSON.stringify({
				iss: 'https://accounts.google.com',
				aud: CLIENT_ID,
				sub,
				email,
				email_verified: true,
				name: 'Người Google',
				nonce,
				iat: now,
				exp: now + 3600
			})));
			const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, enc.encode(h +
				'.' + p)));
			return h + '.' + p + '.' + b64u.enc(sig);
		}
	};
}
async function googleCall(kit, email, sub, path = '/api/auth/mfa/google', cookie) {
	const cfg = (await call('GET', '/api/auth/mfa/config')).json;
	return call('POST', path, { cookie, body: { credential: await kit.token(email, sub, cfg.nonce), nonce: cfg.nonce } });
}

test('Google: email đã có tài khoản thì không tự đăng nhập; đăng nhập bằng email rồi liên kết, sau đó dùng được cả hai', async () => {
	env.GOOGLE_CLIENT_ID = CLIENT_ID;
	const kit = await googleKit();
	try {
		const refused = await googleCall(kit, 'a@example.com', 'g-1');
		assert.equal(refused.status, 409);
		assert.equal(refused.json.code, 'google_exists');
		assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM mfa_google').first()).n, 0, 'chưa liên kết gì');

		const c = await loginPlain();
		const linked = await googleCall(kit, 'a@example.com', 'g-1', '/api/auth/mfa/google/link', c);
		assert.equal(linked.status, 200, linked.json.error);
		assert.equal((await call('GET', '/api/auth/mfa/security', { cookie: c })).json.google, true);
		assert.equal((await googleCall(kit, 'a@example.com', 'g-1', '/api/auth/mfa/google/link', c)).status, 409, 'đã liên kết rồi');

		const viaGoogle = await googleCall(kit, 'a@example.com', 'g-1');
		assert.equal(viaGoogle.status, 200, viaGoogle.json.error);
		assert.equal((await call('GET', '/api/auth/me', { cookie: cookieOf(viaGoogle) })).json.user.id, 1);

		const unlink = await call('POST', '/api/auth/mfa/google/unlink', { cookie: c, body: { password: PASS } });
		assert.equal(unlink.status, 200);
		assert.equal((await googleCall(kit, 'a@example.com', 'g-1')).status, 409);
	} finally {
		kit.restore();
	}
});

test('Google: một tài khoản Google không liên kết được vào hai tài khoản; tài khoản tạo bằng Google phải đặt mật khẩu trước khi gỡ liên kết', async () => {
	env.GOOGLE_CLIENT_ID = CLIENT_ID;
	const kit = await googleKit();
	try {
		const created = await googleCall(kit, 'moi@example.com', 'g-2');
		assert.equal(created.status, 200, created.json.error);
		assert.equal(created.json.user.has_password, false);
		const gc = cookieOf(created);

		const c1 = await loginPlain();
		assert.equal((await googleCall(kit, 'moi@example.com', 'g-2', '/api/auth/mfa/google/link', c1)).status, 409, 'g-2 đã thuộc tài khoản khác');

		assert.equal((await call('POST', '/api/auth/mfa/google/unlink', { cookie: gc, body: {} })).status, 400, 'chưa có mật khẩu');
		const set = await call('POST', '/api/auth/password', { cookie: gc, body: { current: '', password: 'mat-khau-moi-12345' } });
		assert.equal(set.status, 200, set.json.error);
		const login = await call('POST', '/api/auth/login', { body: { email: 'moi@example.com', password: 'mat-khau-moi-12345' } });
		assert.equal(login.status, 200, 'đăng nhập được bằng email + mật khẩu vừa đặt');
		assert.equal((await call('POST', '/api/auth/mfa/google/unlink', { cookie: cookieOf(login), body: { password: 'mat-khau-moi-12345' } })).status, 200);
	} finally {
		kit.restore();
	}
});
