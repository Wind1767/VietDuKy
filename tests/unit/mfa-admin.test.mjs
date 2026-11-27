/* Đường dẫn 2FA của quản trị qua worker thật: công khai khi chưa đăng nhập, cài đặt thì cần phiên. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDB } from '../helpers/d1.mjs';
import worker from '../../src/worker.js';

const env = () => ({
	DB: createDB(),
	ADMIN_PASSWORD: 'mat-khau-chu-rat-dai-123',
	GOOGLE_CLIENT_ID: 'abc.apps.googleusercontent.com',
	TURNSTILE_SECRET: ''
});
const call = (e, method, path, body) => worker.fetch(new Request('https://vietduky.test' + path, {
	method,
	headers: {
		'Content-Type': 'application/json',
		Origin: 'https://vietduky.test',
		'CF-Connecting-IP': '1.2.3.4',
		'User-Agent': 'node'
	},
	body: body ? JSON.stringify(body) : undefined
}), e, { waitUntil() {} });

test('Admin: /config công khai trả client ID và nonce', async () => {
	const r = await call(env(), 'GET', '/api/admin/mfa/config');
	assert.equal(r.status, 200);
	const j = await r.json();
	assert.equal(j.google_client_id, 'abc.apps.googleusercontent.com');
	assert.match(j.nonce, /^[\w-]+\.\d+\.[0-9a-f]{64}$/);
});

test('Admin: cài đặt bảo mật và đăng nhập Google/passkey với dữ liệu sai đều bị từ chối', async () => {
	const e = env();
	assert.equal((await call(e, 'GET', '/api/admin/mfa/security')).status, 401);
	assert.equal((await call(e, 'POST', '/api/admin/mfa/totp/setup')).status, 401);
	assert.equal((await call(e, 'POST', '/api/admin/mfa/google', { credential: 'a.b.c', nonce: 'x' })).status, 401);
	assert.equal((await call(e, 'POST', '/api/admin/mfa/verify', { ticket: 'khong-co', code: '123456' })).status, 401);
	assert.equal((await call(e, 'POST', '/api/admin/mfa/passkey/verify', { challengeId: 'x', credential: {} })).status, 401);
});
