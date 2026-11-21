import { assertClean } from './profanity.js';
/* Việt Du Ký – tài khoản khách: đăng ký, xác minh email, đăng nhập */
import { avatarApi } from './imagekit.js';
import { MIN_PASS, MAX_PASS } from './rules.js';
import { DELETE_GRACE_MS, exportMyData, requestDelete, cancelDelete } from './privacy.js';
import { sendEmail, verifyEmail } from './email.js';
import { tplFields, getTpl } from './email-templates.js';
import { deviceInfo, maskIp, countryClash, sameDevice } from './session-device.js';
import { mfaGate, mfaPublic, mfaSettings } from './mfa-routes.js';
import { checkSecondFactor, methodsOf } from './mfa.js';
import { getSite } from './site-settings.js';

const enc = new TextEncoder();
/* Quản trị tắt "Yêu cầu xác minh email": đăng ký xong dùng được ngay, tài khoản chưa xác minh cũng đăng nhập được */
async function skipVerify(env) {
  return (await getSite(env)).feat_email_verify === false;
}
const PBKDF2_ITER = 100000; // mức tối đa Cloudflare Workers cho phép
const SESSION_TTL_S = 30 * 24 * 3600; // đăng nhập giữ tối đa 30 ngày
const SESSION_IDLE_MS = 14 * 86400000; // 14 ngày không dùng thì phiên mất hiệu lực
const SESSION_TOUCH_MS = 5 * 60000; // ghi lại lần dùng gần nhất tối đa 5 phút một lần
const MAX_SESSIONS = 10; // mỗi khách tối đa 10 thiết bị đăng nhập cùng lúc
const VERIFY_TTL_MS = 24 * 3600 * 1000; // liên kết xác minh sống 24 giờ
/* Độ dài mật khẩu tối thiểu: dùng chung cho đăng ký, đổi/đặt lại và tài khoản do admin tạo */
export { MIN_PASS, MAX_PASS };
const RESET_TTL_MS = 3600 * 1000; // liên kết đặt lại mật khẩu sống 1 giờ
const RESEND_COOLDOWN_MS = 60 * 1000;
const FAV_TOURS = ['du-thuyen-ha-long', 'da-nang-hoi-an-hue', 'phu-quoc-nghi-duong'];
const COOKIE = 'vdk_user';
const TOKEN_RE = /^s1\.[A-Za-z0-9_-]{43}$/;

export const USER_SESSIONS_SCHEMA = [
  'CREATE TABLE IF NOT EXISTS user_sessions (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, device TEXT NOT NULL, label TEXT NOT NULL DEFAULT \'\', country TEXT NOT NULL DEFAULT \'\', ip TEXT NOT NULL DEFAULT \'\')',
  'CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id, last_seen)'
];

/* ---------- Mã hoá ---------- */
const toB64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const toB64Url = buf => toB64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const toHex = buf => [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
const sha256Hex = async (s) => toHex(await crypto.subtle.digest('SHA-256', enc.encode(s)));

function ctEqual(a, b) {
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    diff |= (x[i] || 0) ^ (y[i] || 0);
  }
  return diff === 0;
}

export async function hashPassword(password, salt = crypto.getRandomValues(new Uint8Array(16)), iter = PBKDF2_ITER) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt,
    iterations: iter
  }, key, 256);
  return `pbkdf2$${iter}$${toB64(salt)}$${toB64(bits)}`;
}

export async function checkPassword(password, stored) {
  const [alg, iter, salt, hash] = String(stored).split('$');
  if (alg !== 'pbkdf2' || !iter || !salt || !hash) {
    return false;
  }
  const again = await hashPassword(password, fromB64(salt), Number(iter));
  return ctEqual(again.split('$')[3], hash);
}

/* ---------- Phiên đăng nhập: mã ngẫu nhiên trong cookie, dữ liệu phiên nằm ở máy chủ ---------- */
function cookie(value, maxAge, url) {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

const publicUser = u => ({
  id: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  avatar: u.avatar || '',
  has_password: !!u.pass_hash && !String(u.pass_hash).startsWith('!'),
  delete_at: u.delete_requested_at ? u.delete_requested_at + DELETE_GRACE_MS : null
});

/* Trình duyệt có thể gửi nhiều cookie vdk_user cùng tên (bản cũ đặt ở Path/Domain khác, bản mới ở Path=/).
Phải xét TẤT CẢ rồi lấy cookie đúng định dạng — không được chỉ lấy cái đầu tiên, nếu không cookie cũ sẽ che mất cookie mới. */
const readToken = (request) => {
  for (const c of (request.headers.get('Cookie') || '').split(/;\s*/)) {
    if (c.startsWith(COOKIE + '=')) {
      const v = c.slice(COOKIE.length + 1);
      if (TOKEN_RE.test(v)) {
        return v;
      }
    }
  }
  return '';
};

/* Xoá các cookie vdk_user đời cũ (Path/Domain khác) để không còn hai cookie trùng tên */
function legacyClears(url) {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  const out = [];
  for (const path of ['/api', '/api/auth', '/account', '/login']) {
    out.push(`${COOKIE}=; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
  }
  const host = url.hostname;
  if (host.includes('.')) {
    for (const d of [host, '.' + host]) {
      out.push(`${COOKIE}=; Domain=${d}; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
    }
  }
  return out;
}

/* Gắn cookie mới (hoặc xoá cookie) + dọn cookie cũ vào phản hồi */
function withCookies(resp, url, main) {
  resp.headers.append('Set-Cookie', main);
  for (const c of legacyClears(url)) {
    resp.headers.append('Set-Cookie', c);
  }
  return resp;
}

/* Tạo phiên mới cho thiết bị đang đăng nhập; trả về mã để đặt vào cookie (chỉ lưu bản băm trong DB). */
export async function createSession(env, user, request) {
  const token = 's1.' + toB64Url(crypto.getRandomValues(new Uint8Array(32)));
  const now = Date.now(), dev = deviceInfo(request);
  await env.DB.prepare('DELETE FROM user_sessions WHERE expires_at < ?1').bind(now).run().catch(() => {});
  await env.DB.prepare('INSERT INTO user_sessions (id, user_id, created_at, expires_at, last_seen, device, label, country, ip) VALUES (?1, ?2, ?3, ?4, ?3, ?5, ?6, ?7, ?8)')
    .bind(await sha256Hex(token), user.id, now, now + SESSION_TTL_S * 1000, dev.key, dev.label, dev.country, dev.ip).run();
  // quá số thiết bị cho phép thì bỏ các phiên cũ nhất
  await env.DB.prepare('DELETE FROM user_sessions WHERE user_id = ?1 AND id NOT IN (SELECT id FROM user_sessions WHERE user_id = ?1 ORDER BY last_seen DESC LIMIT ?2)')
    .bind(user.id, MAX_SESSIONS).run().catch(() => {});
  return token;
}

/* Thu hồi phiên: bỏ `keepSid` nếu muốn giữ lại phiên đang dùng. */
export async function revokeUserSessions(env, userId, keepSid = '') {
  await env.DB.prepare('DELETE FROM user_sessions WHERE user_id = ?1 AND id <> ?2').bind(userId, keepSid).run();
}

/* Trả về dòng người dùng đã xác minh, hoặc null. Các phần sau (đặt đơn, nhắn tin, đánh giá) dùng hàm này.
Cookie chỉ có tác dụng khi: mã đúng + còn hạn + đúng thiết bị đã đăng nhập (trình duyệt, hệ điều hành, quốc gia).
Cookie chép sang máy khác bị từ chối và phiên đó bị thu hồi luôn. */
export async function currentUser(request, env, h, diag) {
  /* diag (tuỳ chọn): nhận lý do khi không có phiên hợp lệ, để trang tài khoản báo đúng nguyên nhân */
  const why = (code) => {
    if (diag) {
      diag.why = code;
    }
    return null;
  };
  /* Quản trị tắt đăng nhập: không nhận phiên nào nữa (khách đặt tour không cần tài khoản, xem createBooking) */
  if ((await getSite(env)).feat_login === false) {
    return why('login_off');
  }
  const token = readToken(request);
  if (!token) {
    return why('no_cookie');
  }
  const sid = await sha256Hex(token);
  const row = await env.DB.prepare('SELECT u.*, s.expires_at AS s_exp, s.last_seen AS s_seen, s.device AS s_dev, s.country AS s_country FROM user_sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?1').bind(sid).first();
  if (!row) {
    return why('unknown_session');
  }
  const { s_exp, s_seen, s_dev, s_country, ...u } = row;
  const now = Date.now(), dev = deviceInfo(request);
  if (s_exp < now || now - s_seen > SESSION_IDLE_MS || !sameDevice(s_dev, dev.key) || countryClash(s_country, dev.country)) {
    await env.DB.prepare('DELETE FROM user_sessions WHERE id = ?1').bind(sid).run().catch(() => {});
    return why(!sameDevice(s_dev, dev.key) ? 'device' : countryClash(s_country, dev.country) ? 'country' : 'expired');
  }
  if ((!u.verified_at && !(await skipVerify(env))) || u.blocked_at) {
    return why(u.blocked_at ? 'blocked' : 'unverified');
  }
  if (now - s_seen > SESSION_TOUCH_MS) {
    await env.DB.prepare('UPDATE user_sessions SET last_seen = ?1, ip = ?2 WHERE id = ?3').bind(now, dev.ip, sid).run().catch(() => {});
  }
  u.sid = sid;
  return u;
}

/* ---------- Kiểm tra dữ liệu ---------- */
function vEmail(h, v) {
  const s = h.clean(v, 254).toLowerCase();
  if (!/^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(s)) {
    throw new h.HttpError(400, 'Email chưa đúng. Ví dụ: ten@gmail.com.');
  }
  return s;
}
function vPassword(h, v) {
  const s = String(v ?? '');
  if (s.length < MIN_PASS) {
    throw new h.HttpError(400, `Mật khẩu cần ít nhất ${MIN_PASS} ký tự.`);
  }
  if (s.length > MAX_PASS) {
    throw new h.HttpError(400, `Mật khẩu tối đa ${MAX_PASS} ký tự.`);
  }
  return s;
}

/* ---------- Gửi email xác minh ---------- */
export async function issueVerification(env, url, user) {
  const raw = toB64Url(crypto.getRandomValues(new Uint8Array(32)));
  const now = Date.now();
  await env.DB.prepare('UPDATE users SET verify_hash = ?1, verify_exp = ?2, verify_sent_at = ?3 WHERE id = ?4')
    .bind(await sha256Hex(raw), now + VERIFY_TTL_MS, now, user.id).run();
  const site = (env.SITE_URL || url.origin).replace(/\/+$/, '');
  const t = await tplFields(env, 'verify', {
    ten: String(user.name).trim().split(/\s+/).pop(),
    ho_ten: user.name,
    email: user.email
  });
  const mail = verifyEmail({
    name: user.name,
    email: user.email,
    link: `${site}/verify?token=${raw}`,
    site
  }, await getTpl(env, 'verify'), t.vars);
  await sendEmail(env, { to: user.email, ...mail });
}

/* ---------- Định tuyến /api/auth/* ---------- */
export async function handleAuth(request, env, url, ip, h) {
  const { pathname } = url;
  if (pathname === '/api/auth/me' && request.method === 'GET') {
    return me(request, env, h);
  }
  if (pathname === '/api/auth/bookings' && request.method === 'GET') {
    return myBookings(request, env, h);
  }
  if ((pathname === '/api/auth/imagekit' || pathname === '/api/auth/avatars') && request.method === 'GET') {
    return avatarApi(request, env, url, h, await needUser(request, env, h));
  }
  if (pathname === '/api/auth/sessions' && request.method === 'GET') {
    return listSessions(request, env, h);
  }
  if (pathname === '/api/auth/favorites' && request.method === 'GET') {
    return listFavorites(request, env, ip, h);
  }
  if (pathname.startsWith('/api/auth/mfa/')) {
    return mfaEntry(pathname.slice('/api/auth/mfa'.length), request, env, url, ip, h);
  }
  if (request.method !== 'POST') {
    throw new h.HttpError(404, 'Không tìm thấy.');
  }

  // Chặn gửi chéo trang
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) {
    throw new h.HttpError(403, 'Yêu cầu không hợp lệ.');
  }

  if (pathname === '/api/auth/register') {
    return register(request, env, url, ip, h);
  }
  if (pathname === '/api/auth/verify') {
    return verify(request, env, ip, h);
  }
  if (pathname === '/api/auth/resend') {
    return resend(request, env, url, ip, h);
  }
  if (pathname === '/api/auth/login') {
    return login(request, env, url, ip, h);
  }
  if (pathname === '/api/auth/forgot') {
    return forgot(request, env, url, ip, h);
  }
  if (pathname === '/api/auth/reset') {
    return reset(request, env, ip, h);
  }
  if (pathname === '/api/auth/password') {
    return changePassword(request, env, ip, h);
  }
  if (pathname.startsWith('/api/auth/avatar')) {
    return avatarApi(request, env, url, h, await needUser(request, env, h));
  }
  if (pathname === '/api/auth/profile') {
    return updateProfile(request, env, h);
  }
  if (pathname === '/api/auth/favorite') {
    return setFavorite(request, env, ip, h);
  }
  if (pathname === '/api/auth/bookings/cancel') {
    return cancelBooking(request, env, h);
  }
  if (pathname === '/api/auth/export') {
    // tải dữ liệu cá nhân: phải nhập lại mật khẩu (cookie bị lấy cũng không tải được dữ liệu)
    const u = await needUser(request, env, h);
    await h.limit(env, 'ulogin-email:' + u.email, h.LIMITS.userLogin);
    const b = await h.readJson(request);
    if (!(await reauthUser(env, u, b.current))) {
      throw new h.HttpError(400, 'Mật khẩu chưa đúng.');
    }
    return exportMyData(env, u, h);
  }
  if (pathname === '/api/auth/sessions/revoke') {
    return revokeSessions(request, env, h);
  }
  if (pathname === '/api/auth/delete-request') {
    const u = await needUser(request, env, h);
    await h.limit(env, 'ulogin-email:' + u.email, h.LIMITS.userLogin);
    return requestDelete(env, u, await h.readJson(request), h);
  }
  if (pathname === '/api/auth/delete-cancel') {
    return cancelDelete(env, await needUser(request, env, h), h);
  }
  if (pathname === '/api/auth/logout') {
    const token = readToken(request);
    if (token) {
      await env.DB.prepare('DELETE FROM user_sessions WHERE id = ?1').bind(await sha256Hex(token)).run().catch(() => {});
    }
    return withCookies(h.json({ ok: true }), url, cookie('', 0, url));
  }
  throw new h.HttpError(404, 'Không tìm thấy.');
}

async function me(request, env, h) {
  let u = null;
  const diag = {};
  try {
    u = await currentUser(request, env, h, diag);
  } catch { /* chưa cấu hình khoá phiên: coi như chưa đăng nhập */
    diag.why = 'error';
  }
  return h.json(u ? { user: publicUser(u) } : { user: null, why: diag.why || '' });
}

async function register(request, env, url, ip, h) {
  await h.limit(env, 'register:' + ip, h.LIMITS.register);
  const b = await h.readJson(request);
  await h.turnstile(b, 'register');
  if (h.clean(b.website, 100)) {
    return h.json({ ok: true }, 201);
  } // ô ẩn dành cho bot

  const name = h.vName(b.name), phone = h.vPhone(b.phone), email = vEmail(h, b.email), password = vPassword(h, b.password);
  await assertClean(env, h.HttpError, name);
  const passHash = await hashPassword(password);

  const old = await env.DB.prepare('SELECT id, verified_at FROM users WHERE email = ?1').bind(email).first();
  if (old && old.verified_at) {
    throw new h.HttpError(409, 'Email này đã có tài khoản. Hãy đăng nhập.', undefined, 'exists');
  }

  const skip = await skipVerify(env), now = Date.now();
  let user;
  if (old) { // đăng ký lại khi chưa xác minh: lấy thông tin mới nhất
    user = await env.DB.prepare('UPDATE users SET name = ?1, phone = ?2, pass_hash = ?3, verified_at = COALESCE(?5, verified_at) WHERE id = ?4 RETURNING id, email, name')
      .bind(name, phone, passHash, old.id, skip ? now : null).first();
  } else {
    user = await env.DB.prepare('INSERT INTO users (created_at, email, name, phone, pass_hash, verified_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) RETURNING id, email, name')
      .bind(now, email, name, phone, passHash, skip ? now : null).first();
  }
  if (skip) { // không cần xác minh email: bỏ qua việc gửi thư
    return h.json({ ok: true, verified: true }, 201);
  }

  // dọn dần tài khoản không xác minh quá 7 ngày
  if (Math.random() < 0.02) {
    await env.DB.prepare('DELETE FROM users WHERE verified_at IS NULL AND created_at < ?1').bind(Date.now() - 7 * 86400000).run().catch(() => {});
  }

  try {
    await issueVerification(env, url, user);
  } catch (err) {
    console.error('Gửi email xác minh lỗi:', err && err.message || err);
    throw new h.HttpError(502, 'Đã tạo tài khoản nhưng chưa gửi được email xác minh. Hãy thử “Gửi lại email” sau ít phút.', undefined, 'mail_failed');
  }
  return h.json({ ok: true }, 201);
}

async function verify(request, env, ip, h) {
  await h.limit(env, 'verify:' + ip, h.LIMITS.verify);
  const b = await h.readJson(request);
  const token = h.clean(b.token, 100);
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) {
    throw new h.HttpError(400, 'Liên kết không hợp lệ.', undefined, 'invalid');
  }

  const row = await env.DB.prepare('SELECT id, verify_exp FROM users WHERE verify_hash = ?1').bind(await sha256Hex(token)).first();
  if (!row) {
    throw new h.HttpError(400, 'Liên kết không hợp lệ hoặc đã được dùng. Nếu đã xác minh, hãy đăng nhập.', undefined, 'invalid');
  }
  if (row.verify_exp < Date.now()) {
    throw new h.HttpError(400, 'Liên kết đã hết hạn. Hãy gửi lại email xác minh mới.', undefined, 'expired');
  }

  await env.DB.prepare('UPDATE users SET verified_at = ?1, verify_hash = NULL, verify_exp = NULL WHERE id = ?2').bind(Date.now(), row.id).run();
  return h.json({ ok: true });
}

async function resend(request, env, url, ip, h) {
  await h.limit(env, 'resend:' + ip, h.LIMITS.resend);
  const b = await h.readJson(request);
  const email = vEmail(h, b.email);
  await h.limit(env, 'resend-email:' + email, h.LIMITS.resend);

  const u = await env.DB.prepare('SELECT id, email, name, verified_at, verify_sent_at FROM users WHERE email = ?1').bind(email).first();
  if (u && !u.verified_at && Date.now() - (u.verify_sent_at || 0) > RESEND_COOLDOWN_MS) {
    try {
      await issueVerification(env, url, u);
    } catch (err) {
      console.error('Gửi lại email xác minh lỗi:', err && err.message || err);
    }
  }
  return h.json({ ok: true }); // luôn trả như nhau để không lộ email nào đã đăng ký
}

async function login(request, env, url, ip, h) {
  await h.limit(env, 'ulogin:' + ip, h.LIMITS.userLogin);
  const b = await h.readJson(request);
  await h.turnstile(b, 'login');
  const email = h.clean(b.email, 254).toLowerCase();
  const password = String(b.password ?? '').slice(0, 200);
  if (!email || !password) {
    throw new h.HttpError(400, 'Vui lòng nhập email và mật khẩu.');
  }
  await h.limit(env, 'ulogin-email:' + email, h.LIMITS.userLogin);

  const u = await env.DB.prepare('SELECT * FROM users WHERE email = ?1').bind(email).first();
  // email lạ vẫn băm một lần để thời gian phản hồi không lộ email nào có tài khoản
  const ok = u ? await checkPassword(password, u.pass_hash) : (await hashPassword(password), false);
  if (!ok) {
    throw new h.HttpError(401, 'Email hoặc mật khẩu chưa đúng.');
  }
  if (u.blocked_at) {
    throw new h.HttpError(403, 'Tài khoản này đã bị khoá. Vui lòng liên hệ hotline 1900 1234.', undefined, 'blocked');
  }
  if (!u.verified_at && !(await skipVerify(env))) {
    throw new h.HttpError(403, 'Email này chưa được xác minh. Hãy mở email xác minh, hoặc gửi lại email mới.', undefined, 'unverified');
  }

  const gate = await mfaGate(env, h, 'user', u.id); // đã bật Authenticator / passkey: cần thêm một bước
  if (gate) {
    return gate;
  }
  return startSession(env, h, u, request, url);
}

/* Cấp phiên đăng nhập cho khách (sau mật khẩu, Google, mã xác thực hoặc passkey) */
async function startSession(env, h, u, request, url) {
  await env.DB.prepare('UPDATE users SET last_login = ?1 WHERE id = ?2').bind(Date.now(), u.id).run();
  const token = await createSession(env, u, request);
  return withCookies(h.json({ ok: true, user: publicUser(u) }), url, cookie(token, SESSION_TTL_S, url));
}

/* Nhập lại mật khẩu cho thao tác nhạy cảm. Tài khoản Google chưa có mật khẩu: dùng mã xác thực nếu đã bật, còn không thì phiên đăng nhập là đủ. */
export async function reauthUser(env, u, input) {
  if (hasPassword(u)) {
    return checkPassword(String(input ?? '').slice(0, 200), u.pass_hash);
  }
  return (await methodsOf(env, 'user', u.id)).includes('totp') ? checkSecondFactor(env, 'user', u.id, input) : true;
}

const GOOGLE_PASS = '!google'; // tài khoản tạo bằng Google chưa có mật khẩu: không mật khẩu nào khớp được
const hasPassword = u => !!u.pass_hash && !String(u.pass_hash).startsWith('!');

export async function googleUser(env, h, p) {
  /* Google này đã liên kết ở đâu? (một tài khoản Google chỉ gắn được với MỘT tài khoản, khách hoặc quản trị) */
  const link = await env.DB.prepare('SELECT kind, uid FROM mfa_google WHERE sub = ?1').bind(p.sub).first();
  let u = null;
  if (link && link.kind === 'user') {
    u = await env.DB.prepare('SELECT * FROM users WHERE id = ?1').bind(link.uid).first();
    if (!u) { // tài khoản cũ đã bị xoá: bỏ liên kết mồ côi để Google này dùng lại được
      await env.DB.prepare("DELETE FROM mfa_google WHERE sub = ?1 AND kind = 'user'").bind(p.sub).run();
    }
  } else if (link) {
    throw new h.HttpError(409, 'Tài khoản Google này đã được liên kết với một tài khoản quản trị nên không dùng để đăng nhập khách được. Hãy gỡ liên kết ở tài khoản quản trị, hoặc đăng nhập bằng Google khác / email và mật khẩu.', undefined, 'google_linked_other');
  }
  const now = Date.now();
  if (!u) {
    // Email này đã có tài khoản (đăng ký bằng email): không tự gộp. Phải đăng nhập bằng email rồi chủ động liên kết Google,
    // nhờ vậy người chỉ biết email của người khác không thể chiếm tài khoản, và chủ tài khoản vẫn lấy lại được bằng "Quên mật khẩu".
    const exists = await env.DB.prepare('SELECT id FROM users WHERE email = ?1').bind(p.email).first();
    if (exists) {
      throw new h.HttpError(409, 'Email này đã có tài khoản. Hãy đăng nhập bằng email và mật khẩu (quên mật khẩu thì bấm “Quên mật khẩu”), rồi liên kết Google trong mục Bảo mật nâng cao.', undefined, 'google_exists');
    }
    const name = (h.clean(p.name, 60) || p.email.split('@')[0]).padEnd(2, ' ');
    u = await env.DB.prepare('INSERT INTO users (created_at, email, name, phone, pass_hash, verified_at, last_login) VALUES (?1, ?2, ?3, NULL, ?4, ?1, ?1) RETURNING *')
      .bind(now, p.email, name, GOOGLE_PASS).first();
    await env.DB.prepare("INSERT OR IGNORE INTO mfa_google (sub, kind, uid, email, created_at) VALUES (?1, 'user', ?2, ?3, ?4)").bind(p.sub, u.id, p.email, now).run();
  }
  if (u.blocked_at) {
    throw new h.HttpError(403, 'Tài khoản này đã bị khoá. Vui lòng liên hệ hotline 1900 1234.', undefined, 'blocked');
  }
  return u;
}

async function mfaEntry(sub, request, env, url, ip, h) {
  const ctx = {
    kind: 'user',
    googleUser: p => googleUser(env, h, p),
    userById: id => env.DB.prepare('SELECT * FROM users WHERE id = ?1 AND verified_at IS NOT NULL AND blocked_at IS NULL').bind(id).first(),
    finish: (u, req, u2) => startSession(env, h, u, req, u2),
    hasPassword,
    checkPassword: (u, pw) => checkPassword(pw, u.pass_hash),
    googleLinked: async (u) => !!(await env.DB.prepare("SELECT 1 FROM mfa_google WHERE kind = 'user' AND uid = ?1").bind(u.id).first())
  };
  const open = await mfaPublic(sub, request, env, url, ip, h, ctx);
  if (open) {
    return open;
  }
  const user = await needUser(request, env, h);
  const r = await mfaSettings(sub, request, env, url, ip, h, ctx, user);
  if (r) {
    return r;
  }
  throw new h.HttpError(404, 'Không tìm thấy.');
}

/* Đơn đặt tour của chính khách đang đăng nhập (không trả ghi chú nội bộ của admin) */
async function myBookings(request, env, h) {
  const u = await currentUser(request, env, h);
  if (!u) {
    throw new h.HttpError(401, 'Bạn cần đăng nhập.', undefined, 'login_required');
  }
  const { results } = await env.DB.prepare('SELECT id, created_at, destination, depart_date, people, message, status FROM bookings WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 100').bind(u.id).all();
  return h.json({ items: results });
}

/* ---------- Quên mật khẩu / đặt lại / đổi mật khẩu ---------- */
async function forgot(request, env, url, ip, h) {
  await h.limit(env, 'forgot:' + ip, h.LIMITS.forgot);
  const b = await h.readJson(request);
  await h.turnstile(b, 'forgot');
  const email = vEmail(h, b.email);
  await h.limit(env, 'forgot-email:' + email, h.LIMITS.forgot);
  const u = await env.DB.prepare('SELECT id, email, name, verified_at, blocked_at, reset_sent_at FROM users WHERE email = ?1').bind(email).first();
  if (u && u.verified_at && !u.blocked_at && Date.now() - (u.reset_sent_at || 0) > RESEND_COOLDOWN_MS) {
    const raw = toB64Url(crypto.getRandomValues(new Uint8Array(32)));
    const now = Date.now();
    await env.DB.prepare('UPDATE users SET reset_hash = ?1, reset_exp = ?2, reset_sent_at = ?3 WHERE id = ?4').bind(await sha256Hex(raw), now +
      RESET_TTL_MS, now, u.id).run();
    h.mail(u.email, h.tpl('reset', {
      ten: u.name.trim().split(/\s+/).pop(),
      ho_ten: u.name,
      email: u.email
    }, { link: `${h.site}/reset?token=${raw}` }));
  }
  return h.json({ ok: true }); // luôn trả như nhau để không lộ email nào có tài khoản
}

async function reset(request, env, ip, h) {
  await h.limit(env, 'verify:' + ip, h.LIMITS.verify);
  const b = await h.readJson(request);
  const token = h.clean(b.token, 100);
  const password = vPassword(h, b.password);
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) {
    throw new h.HttpError(400, 'Liên kết không hợp lệ.', undefined, 'invalid');
  }
  const row = await env.DB.prepare('SELECT id, reset_exp FROM users WHERE reset_hash = ?1').bind(await sha256Hex(token)).first();
  if (!row) {
    throw new h.HttpError(400, 'Liên kết không hợp lệ hoặc đã được dùng.', undefined, 'invalid');
  }
  if (row.reset_exp < Date.now()) {
    throw new h.HttpError(400, 'Liên kết đã hết hạn. Hãy yêu cầu đặt lại mật khẩu lần nữa.', undefined, 'expired');
  }
  await env.DB.prepare('UPDATE users SET pass_hash = ?1, reset_hash = NULL, reset_exp = NULL, verified_at = COALESCE(verified_at, ?2) WHERE id = ?3').bind(await hashPassword(password), Date.now(), row.id).run();
  await revokeUserSessions(env, row.id); // đặt lại mật khẩu: đăng xuất mọi thiết bị
  return h.json({ ok: true });
}

async function needUser(request, env, h) {
  const u = await currentUser(request, env, h);
  if (!u) {
    throw new h.HttpError(401, 'Bạn cần đăng nhập.', undefined, 'login_required');
  }
  return u;
}

async function changePassword(request, env, ip, h) {
  const u = await needUser(request, env, h);
  await h.limit(env, 'ulogin-email:' + u.email, h.LIMITS.userLogin);
  const b = await h.readJson(request);
  if (!(await reauthUser(env, u, b.current))) {
    throw new h.HttpError(400, 'Mật khẩu hiện tại chưa đúng.');
  }
  const next = vPassword(h, b.password);
  await env.DB.prepare('UPDATE users SET pass_hash = ?1 WHERE id = ?2').bind(await hashPassword(next), u.id).run();
  await revokeUserSessions(env, u.id, u.sid); // đổi mật khẩu: mọi thiết bị khác phải đăng nhập lại
  return h.json({ ok: true });
}

/* Danh sách thiết bị đang đăng nhập của chính khách (mã phiên chỉ lộ 16 ký tự đầu của bản băm) */
async function listSessions(request, env, h) {
  const u = await needUser(request, env, h);
  const { results } = await env.DB.prepare('SELECT id, created_at, last_seen, label, country, ip FROM user_sessions WHERE user_id = ?1 AND expires_at > ?2 ORDER BY last_seen DESC').bind(u.id, Date.now()).all();
  return h.json({
    items: results.map(r => ({
      id: r.id.slice(0, 16),
      label: r.label || 'Thiết bị không rõ',
      country: r.country,
      ip: maskIp(r.ip),
      created_at: r.created_at,
      last_seen: r.last_seen,
      current: r.id === u.sid
    }))
  });
}

async function revokeSessions(request, env, h) {
  const u = await needUser(request, env, h);
  const b = await h.readJson(request);
  if (b.all) {
    await revokeUserSessions(env, u.id, u.sid); // "Đăng xuất mọi thiết bị khác"
    return h.json({ ok: true });
  }
  const id = String(b.id ?? '');
  if (!/^[0-9a-f]{16}$/.test(id)) {
    throw new h.HttpError(400, 'Thiết bị không hợp lệ.');
  }
  await env.DB.prepare("DELETE FROM user_sessions WHERE user_id = ?1 AND substr(id, 1, 16) = ?2").bind(u.id, id).run();
  return h.json({ ok: true });
}

async function updateProfile(request, env, h) {
  const u = await needUser(request, env, h);
  const b = await h.readJson(request);
  const name = h.vName(b.name), phone = h.vPhone(b.phone);
  await assertClean(env, h.HttpError, name);
  await env.DB.prepare('UPDATE users SET name = ?1, phone = ?2 WHERE id = ?3').bind(name, phone, u.id).run();
  return h.json({ ok: true, user: {
      ...publicUser(u),
      name,
      phone
    } });
}

/* ---------- Yêu thích (điểm đến và tour) ---------- */
async function listFavorites(request, env, ip, h) {
  const u = await needUser(request, env, h);
  const { results } = await env.DB.prepare('SELECT item FROM favorites WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 200').bind(u.id).all();
  return h.json({ items: results.map(r => r.item) });
}

async function setFavorite(request, env, ip, h) {
  const u = await needUser(request, env, h);
  await h.limit(env, 'fav:' + ip, h.LIMITS.fav);
  const b = await h.readJson(request);
  const item = h.clean(b.item, 60);
  if (!h.DESTINATIONS.includes(item) && !(await h.destExists(env, item)) && !FAV_TOURS.includes(item) && !(await env.DB.prepare('SELECT 1 FROM tours WHERE slug = ?1').bind(item).first().catch(() => null))) {
    throw new h.HttpError(400, 'Mục này không hợp lệ.');
  }
  if (b.on) {
    await env.DB.prepare('INSERT OR IGNORE INTO favorites (user_id, item, created_at) VALUES (?1, ?2, ?3)').bind(u.id, item, Date.now()).run();
  } else {
    await env.DB.prepare('DELETE FROM favorites WHERE user_id = ?1 AND item = ?2').bind(u.id, item).run();
  }
  return h.json({ ok: true });
}

/* Khách tự huỷ đơn khi chưa ai liên hệ (trạng thái "Mới") */
async function cancelBooking(request, env, h) {
  const u = await needUser(request, env, h);
  const b = await h.readJson(request);
  const id = Number(b.id);
  if (!Number.isInteger(id) || id < 1) {
    throw new h.HttpError(400, 'Đơn không hợp lệ.');
  }
  const row = await env.DB.prepare("UPDATE bookings SET status = 'cancelled', updated_at = ?1 WHERE id = ?2 AND user_id = ?3 AND status = 'new' RETURNING id, name, destination").bind(Date.now(), id, u.id).first();
  if (!row) {
    throw new h.HttpError(400, 'Chỉ huỷ được đơn chưa có tư vấn viên liên hệ.');
  }
  await h.logAct(env, 'Khách huỷ đơn #' + id, row.name);
  h.adminMail(h.tpl('cancel_admin', {
    ho_ten: row.name,
    diem_den: row.destination || '',
    ma_don: id,
    email: u.email
  }, {
    rows: [['Điểm đến', row.destination || ''], ['Email', u.email]], link: h.site + '/admin/#/bookings'
  }));
  return h.json({ ok: true });
}
