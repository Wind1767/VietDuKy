import test from 'node:test';
import assert from 'node:assert/strict';
import { cborEnc, authenticator, ORIGIN, RP_ID } from '../helpers/webauthn.mjs';
import { b32enc, b32dec, verifyTotp, hotp, cborDecode, b64u, sha256, verifyRegistration, verifyAssertion, verifyGoogleToken, resetGoogleKeyCache, sealSecret, openSecret, newNonce, checkNonce, newRecoveryCodes, normRecovery, otpauthUri } from '../../src/mfa.js';

const enc = new TextEncoder();
const RFC_SECRET = b32enc(enc.encode('12345678901234567890')); // khoá thử trong RFC 6238

test('Base32 mã hoá/giải mã đối xứng', () => {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  assert.deepEqual(b32dec(b32enc(bytes)), bytes);
  assert.equal(b32enc(enc.encode('foobar')), 'MZXW6YTBOI');
  assert.throws(() => b32dec('!!!'));
});

test('TOTP khớp vector RFC 6238 (SHA-1) và không dùng lại được', async () => {
  // t = 59s -> 94287082 (8 số) -> 6 số cuối: 287082
  assert.equal(await hotp(enc.encode('12345678901234567890'), 1), '287082');
  const step = await verifyTotp(RFC_SECRET, '287082', 0, 59000);
  assert.equal(step, 1);
  assert.equal(await verifyTotp(RFC_SECRET, '287082', step, 59000), 0, 'mã đã dùng');
  assert.equal(await verifyTotp(RFC_SECRET, '287 082', 0, 59000), 1, 'bỏ khoảng trắng');
  assert.equal(await verifyTotp(RFC_SECRET, '000000', 0, 59000), 0);
  assert.equal(await verifyTotp(RFC_SECRET, 'abcdef', 0, 59000), 0);
  assert.equal(await verifyTotp(RFC_SECRET, '287082', 0, 59000 + 90000), 0, 'quá hạn');
  // lệch một bước (30 giây) vẫn được chấp nhận
  assert.equal(await verifyTotp(RFC_SECRET, '287082', 0, 59000 + 30000), 1);
});

test('Mã khôi phục: 8 mã, định dạng xxxxx-xxxxx, chuẩn hoá khi nhập', () => {
  const codes = newRecoveryCodes();
  assert.equal(codes.length, 8);
  assert.equal(new Set(codes).size, 8);
  for (const c of codes) {
    assert.match(c, /^[a-z2-9]{5}-[a-z2-9]{5}$/);
    assert.equal(normRecovery(c.toUpperCase().replace('-', ' ')).length, 10);
  }
});

test('otpauth URI đúng định dạng cho Google Authenticator', () => {
  const u = otpauthUri('Việt Du Ký', 'a@b.vn', 'ABC234');
  assert.match(u, /^otpauth:\/\/totp\/Vi%E1%BB%87t%20Du%20K%C3%BD:a%40b\.vn\?secret=ABC234&issuer=/);
  assert.match(u, /digits=6&period=30$/);
});

test('Bí mật TOTP được mã hoá khi lưu và giải mã lại đúng', async () => {
  const env = { MFA_KEY: 'khoa-thu' };
  const sealed = await sealSecret(env, RFC_SECRET);
  assert.ok(!sealed.includes(RFC_SECRET));
  assert.equal(await openSecret(env, sealed), RFC_SECRET);
  await assert.rejects(openSecret({ MFA_KEY: 'khoa-khac' }, sealed));
});

test('Nonce Google: hợp lệ, hết hạn và bị sửa đều được nhận ra', async () => {
  const env = { MFA_KEY: 'k' };
  const n = await newNonce(env);
  assert.ok(await checkNonce(env, n));
  assert.ok(!(await checkNonce(env, n + 'x')));
  assert.ok(!(await checkNonce({ MFA_KEY: 'khac' }, n)));
  const p = n.split('.');
  assert.ok(!(await checkNonce(env, [p[0], 1, p[2]].join('.'))));
  assert.ok(!(await checkNonce(env, '')));
});

test('CBOR đọc được map, byte, chuỗi, số âm', () => {
  const m = new Map([[1, 2], [3, -7], ['k', new Uint8Array([1, 2, 3])]]);
  const [v] = cborDecode(new Uint8Array(cborEnc(m)));
  assert.equal(v.get(3), -7);
  assert.deepEqual([...v.get('k')], [1, 2, 3]);
  assert.throws(() => cborDecode(new Uint8Array([0x5f])));
});

test('Passkey: đăng ký rồi đăng nhập thành công, sai là bị từ chối', async () => {
  const a = await authenticator();
  const reg = await verifyRegistration(a.register('chal-1'), {
    challenge: 'chal-1',
    origin: ORIGIN,
    rpId: RP_ID
  });
  assert.equal(reg.id, b64u.enc(a.credId));
  assert.equal(reg.alg, -7);

  const base = {
    challenge: 'chal-2',
    origin: ORIGIN,
    rpId: RP_ID,
    pub: reg.pub,
    alg: reg.alg,
    counter: 0
  };
  assert.equal(await verifyAssertion(await a.assert('chal-2', 1), base), 1);
  await assert.rejects(verifyAssertion(await a.assert('chal-2', 1), { ...base, challenge: 'khac' }), /clientData/);
  await assert.rejects(verifyAssertion(await a.assert('chal-2', 1, { origin: 'https://evil.example' }), base), /clientData/);
  await assert.rejects(verifyAssertion(await a.assert('chal-2', 1), { ...base, rpId: 'evil.example' }), /authData/);
  await assert.rejects(verifyAssertion(await a.assert('chal-2', 1, { flags: 0x01 }), base), /authData/, 'thiếu xác minh người dùng (UV)');
  await assert.rejects(verifyAssertion(await a.assert('chal-2', 5), { ...base, counter: 5 }), /counter/, 'bộ đếm không tăng');
  const other = await authenticator();
  await assert.rejects(verifyAssertion(await other.assert('chal-2', 1), base), /sig/, 'khoá khác');
  const tampered = await a.assert('chal-2', 1);
  tampered.response.signature = b64u.enc(new Uint8Array(70));
  await assert.rejects(verifyAssertion(tampered, base));
});

test('Passkey: đăng ký bị từ chối khi sai challenge, origin hoặc thiếu UV', async () => {
  const a = await authenticator();
  await assert.rejects(verifyRegistration(a.register('x'), {
    challenge: 'y',
    origin: ORIGIN,
    rpId: RP_ID
  }));
  await assert.rejects(verifyRegistration(a.register('x', { origin: 'https://evil.example' }), {
    challenge: 'x',
    origin: ORIGIN,
    rpId: RP_ID
  }));
  await assert.rejects(verifyRegistration(a.register('x', { flags: 0x41 }), {
    challenge: 'x',
    origin: ORIGIN,
    rpId: RP_ID
  }));
});

/* ---- Google id_token ---- */
const CLIENT_ID = '717807708737-ss0s4ru9g1k88f838fbcdkb8i7mpkmri.apps.googleusercontent.com';

async function googleSetup() {
  const kp = await crypto.subtle.generateKey({
    name: 'RSASSA-PKCS1-v1_5',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256'
  }, true, ['sign', 'verify']);
  const jwk = {
    ...(await crypto.subtle.exportKey('jwk', kp.publicKey)),
    kid: 'k1',
    alg: 'RS256',
    use: 'sig'
  };
  const fetcher = async () => ({ ok: true, json: async () => ({ keys: [jwk] }) });
  const sign = async (claims, header = { alg: 'RS256', kid: 'k1' }) => {
    const h = b64u.enc(enc.encode(JSON.stringify(header))), p = b64u.enc(enc.encode(JSON.stringify(claims)));
    const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, enc.encode(h + '.' +
      p)));
    return h + '.' + p + '.' + b64u.enc(sig);
  };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: '123',
    email: 'Khach@Gmail.com',
    email_verified: true,
    name: 'Khách',
    nonce: 'n1',
    iat: now,
    exp: now + 3600
  };
  return {
    fetcher,
    sign,
    claims,
    now
  };
}

test('Google: id_token hợp lệ được chấp nhận, email viết thường', async () => {
  resetGoogleKeyCache();
  const g = await googleSetup();
  const r = await verifyGoogleToken(await g.sign(g.claims), {
    clientId: CLIENT_ID,
    nonce: 'n1',
    fetcher: g.fetcher
  });
  assert.deepEqual([r.sub, r.email, r.name], ['123', 'khach@gmail.com', 'Khách']);
});

test('Google: sai audience, issuer, hết hạn, nonce, email chưa xác minh, chữ ký hay thuật toán đều bị từ chối', async () => {
  resetGoogleKeyCache();
  const g = await googleSetup();
  const ok = {
    clientId: CLIENT_ID,
    nonce: 'n1',
    fetcher: g.fetcher
  };
  const bad = async (claims, opts = {}, header) => assert.rejects(verifyGoogleToken(await g.sign(claims, header), { ...ok, ...opts }));
  await bad({ ...g.claims, aud: 'client-khac' });
  await bad({ ...g.claims, iss: 'https://evil.example' });
  await bad({ ...g.claims, exp: g.now - 3600 });
  await bad({ ...g.claims, nonce: 'khac' });
  await bad({ ...g.claims, email_verified: false });
  await bad({ ...g.claims, email: undefined });
  await bad(g.claims, {}, { alg: 'none', kid: 'k1' });
  await bad(g.claims, {}, { alg: 'RS256', kid: 'khong-co' });
  const t = await g.sign(g.claims);
  const [h, p, s] = t.split('.');
  await assert.rejects(verifyGoogleToken(`${h}.${p}.${s.slice(0, -4)}AAAA`, ok));
  const forged = b64u.enc(enc.encode(JSON.stringify({ ...g.claims, email: 'admin@vietduky.vn' })));
  await assert.rejects(verifyGoogleToken(`${h}.${forged}.${s}`, ok), 'sửa nội dung thì chữ ký không còn khớp');
  await assert.rejects(verifyGoogleToken(t, { ...ok, clientId: '' }));
});
