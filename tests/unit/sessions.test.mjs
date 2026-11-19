/* Cookie vdk_user: chép cookie của người khác sang máy khác thì KHÔNG vào được; đăng xuất / đổi mật khẩu thu hồi phiên. */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createDB, makeH, UA } from '../helpers/d1.mjs';
import { hashPassword, handleAuth, currentUser } from '../../src/customer-auth.js';

const PASS = 'mat-khau-dai-123';
const sha = (s) => createHash('sha256').update(s).digest('hex');
let db, env, h;

async function addUser(id, email, extra = '') {
  await db.prepare('INSERT INTO users (id, created_at, email, name, phone, pass_hash, verified_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?2)').bind(id, Date.now(), email, 'Khách ' +
    id, '0901234567', await hashPassword(PASS)).run();
}
beforeEach(async () => {
  db = createDB();
  env = { DB: db };
  h = makeH();
  await addUser(1, 'a@example.com');
  await addUser(2, 'b@example.com');
});

/* Gọi API như trình duyệt thật: cookie + User-Agent + quốc gia */
async function call(method, path, { body, cookie, ua = UA.chromeWin, country = 'VN', ip = '113.161.10.20' } = {}) {
  const headers = {
    'User-Agent': ua,
    'CF-IPCountry': country,
    'CF-Connecting-IP': ip,
    Origin: 'http://localhost',
    'Content-Type': 'application/json'
  };
  if (cookie) {
    headers.Cookie = 'vdk_user=' + cookie;
  }
  const url = new URL('http://localhost' + path);
  const req = new Request(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  try {
    const res = await handleAuth(req, env, url, ip, h);
    return {
      status: res.status,
      res,
      json: res.headers.get('Content-Type')?.includes('json') ? await res.clone().json() : null
    };
  } catch (e) {
    return {
      status: e.status || 500,
      error: e.message,
      json: { error: e.message, code: e.code }
    };
  }
}
async function login(email = 'a@example.com', opts = {}) {
  const r = await call('POST', '/api/auth/login', { body: { email, password: PASS }, ...opts });
  assert.equal(r.status, 200, r.error);
  const set = r.res.headers.get('Set-Cookie');
  return { token: /vdk_user=([^;]+)/.exec(set)[1], set };
}
const me = async (cookie, opts) => (await call('GET', '/api/auth/me', { cookie, ...opts })).json.user;

test('Cookie là mã ngẫu nhiên (không chứa id người dùng), HttpOnly, và DB chỉ lưu bản băm', async () => {
  const { token, set } = await login();
  assert.match(token, /^s1\.[A-Za-z0-9_-]{43}$/);
  assert.match(set, /HttpOnly/);
  assert.match(set, /SameSite=Lax/);
  const row = await db.prepare('SELECT * FROM user_sessions').first();
  assert.equal(row.id, sha(token));
  assert.notEqual(row.id, token);
  assert.equal(row.user_id, 1);
  assert.equal(row.device, 'Chrome|Windows|d');
});

test('Dùng đúng thiết bị: vào được', async () => {
  const { token } = await login();
  assert.equal((await me(token)).email, 'a@example.com');
});

test('Cập nhật phiên bản trình duyệt không bị đăng xuất', async () => {
  const { token } = await login();
  assert.equal((await me(token, { ua: UA.chromeWinNewer }))?.email, 'a@example.com');
});

test('Chép cookie sang trình duyệt / hệ điều hành khác: bị từ chối và phiên bị thu hồi', async () => {
  const { token } = await login();
  assert.equal(await me(token, { ua: UA.firefoxLinux }), null);
  // phiên đã bị thu hồi: chủ thật cũng phải đăng nhập lại (kẻ lấy cookie không còn dùng lại được)
  assert.equal(await me(token), null);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM user_sessions').first()).n, 0);
});

test('Chép cookie sang điện thoại: bị từ chối', async () => {
  const { token } = await login();
  assert.equal(await me(token, { ua: UA.safariIphone }), null);
});

test('Cookie dùng từ quốc gia khác: bị từ chối', async () => {
  const { token } = await login();
  assert.equal(await me(token, { country: 'RU' }), null);
});

test('Cookie giả / đoán id / định dạng cũ đều không vào được', async () => {
  await login();
  const forged = 's1.' + 'A'.repeat(43);
  assert.equal(await me(forged), null);
  assert.equal(await me('1'), null);
  assert.equal(await me('1.9999999999.' + 'a'.repeat(64)), null); // định dạng cũ: id.hạn.chữ-ký
  assert.equal(await me(''), null);
});

test('Đăng xuất thu hồi phiên ở máy chủ: cookie đã chép trước đó hết tác dụng', async () => {
  const { token } = await login();
  const copy = token; // kẻ xấu chép lại cookie
  const out = await call('POST', '/api/auth/logout', { cookie: token });
  assert.equal(out.status, 200);
  assert.match(out.res.headers.get('Set-Cookie'), /Max-Age=0/);
  assert.equal(await me(copy), null);
});

test('Hết hạn tuyệt đối hoặc quá 14 ngày không dùng: mất hiệu lực', async () => {
  const a = await login();
  await db.prepare('UPDATE user_sessions SET expires_at = ?1').bind(Date.now() - 1000).run();
  assert.equal(await me(a.token), null);
  const b = await login();
  await db.prepare('UPDATE user_sessions SET last_seen = ?1').bind(Date.now() - 15 * 86400000).run();
  assert.equal(await me(b.token), null);
});

test('Tài khoản bị khoá: phiên đang mở không dùng được', async () => {
  const { token } = await login();
  await db.prepare('UPDATE users SET blocked_at = ?1 WHERE id = 1').bind(Date.now()).run();
  assert.equal(await me(token), null);
});

test('Đổi mật khẩu: thiết bị khác bị đăng xuất, thiết bị đang dùng giữ nguyên', async () => {
  const pc = await login();
  const phone = await login('a@example.com', { ua: UA.safariIphone });
  const r = await call('POST', '/api/auth/password', { cookie: pc.token, body: { current: PASS, password: 'mat-khau-moi-4567' } });
  assert.equal(r.status, 200, r.error);
  assert.equal((await me(pc.token))?.email, 'a@example.com');
  assert.equal(await me(phone.token, { ua: UA.safariIphone }), null);
});

test('Đặt lại mật khẩu qua email: mọi thiết bị bị đăng xuất', async () => {
  const pc = await login();
  const raw = 'tokenDatLaiMatKhau' + 'x'.repeat(30);
  await db.prepare('UPDATE users SET reset_hash = ?1, reset_exp = ?2 WHERE id = 1').bind(sha(raw), Date.now() +
    60000).run();
  const r = await call('POST', '/api/auth/reset', { body: { token: raw, password: 'mat-khau-moi-4567' } });
  assert.equal(r.status, 200, r.error);
  assert.equal(await me(pc.token), null);
});

test('Tải dữ liệu cá nhân: phải nhập lại mật khẩu, không tải được bằng GET', async () => {
  const { token } = await login();
  assert.equal((await call('GET', '/api/auth/export', { cookie: token })).status, 404);
  assert.equal((await call('POST', '/api/auth/export', { cookie: token, body: { current: 'sai-mat-khau-1' } })).status, 400);
  const ok = await call('POST', '/api/auth/export', { cookie: token, body: { current: PASS } });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.account.email, 'a@example.com');
});

test('Danh sách thiết bị: chỉ thấy phiên của mình, che bớt IP, gỡ được từng thiết bị', async () => {
  const pc = await login();
  const phone = await login('a@example.com', { ua: UA.safariIphone, ip: '27.64.1.2' });
  await login('b@example.com');
  const list = (await call('GET', '/api/auth/sessions', { cookie: pc.token })).json.items;
  assert.equal(list.length, 2);
  assert.ok(list.every((x) => /^[0-9a-f]{16}$/.test(x.id)));
  assert.equal(list.filter((x) => x.current).length, 1);
  assert.match(list.find((x) => x.label.includes('Chrome')).ip, /^113\.161\.xxx\.xxx$/);
  const other = list.find((x) => !x.current);
  assert.equal((await call('POST', '/api/auth/sessions/revoke', { cookie: pc.token, body: { id: other.id } })).status, 200);
  assert.equal(await me(phone.token, { ua: UA.safariIphone, ip: '27.64.1.2' }), null);
});

test('Không gỡ được phiên của người khác', async () => {
  const a = await login();
  const b = await login('b@example.com');
  const bId = (await call('GET', '/api/auth/sessions', { cookie: b.token })).json.items[0].id;
  await call('POST', '/api/auth/sessions/revoke', { cookie: a.token, body: { id: bId } });
  assert.equal((await me(b.token))?.email, 'b@example.com');
});

test('"Đăng xuất mọi thiết bị khác" giữ lại thiết bị đang dùng', async () => {
  const pc = await login();
  const phone = await login('a@example.com', { ua: UA.safariIphone });
  await call('POST', '/api/auth/sessions/revoke', { cookie: pc.token, body: { all: true } });
  assert.equal((await me(pc.token))?.email, 'a@example.com');
  assert.equal(await me(phone.token, { ua: UA.safariIphone }), null);
});

test('Tối đa 10 thiết bị đăng nhập cùng lúc: phiên cũ nhất bị bỏ', async () => {
  for (let i = 0; i < 12; i++) {
    await login();
  }
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM user_sessions WHERE user_id = 1').first()).n, 10);
});

test('currentUser trả về null khi không có cookie', async () => {
  const req = new Request('http://localhost/api/auth/me');
  assert.equal(await currentUser(req, env, h), null);
});
