import { assertClean } from './profanity.js';
/* Việt Du Ký – Cloudflare Worker: nhận đơn đặt tour, tài khoản khách, trang quản trị, giới hạn tần suất */
import { handleAuth, currentUser, USER_SESSIONS_SCHEMA } from './customer-auth.js';
import { deviceInfo } from './session-device.js';
import { handleChat, adminChat, adminFaq } from './chat.js';
import { handleReviews, adminReviews } from './reviews.js';
import { INBOX_SCHEMA, handleInbox, adminInbox, notify } from './inbox.js';
import { BUG_SCHEMA, publicBugReport, adminBugs } from './bug-reports.js';
import { adminAccounts } from './customer-accounts.js';
import { purgeDeletedUsers } from './privacy.js';
import { adminTools, publicTours, estimateAmount, TOURS_SCHEMA, seedTours } from './tours.js';
import { ADMINS_SCHEMA, ROLES, permsOf, parsePerms, authorize, maskPII, isMasked, adminLogin, adminById, adminApi, resolvePerms, roleName } from './admin-accounts.js';
import { verifyTurnstile } from './turnstile.js';
import { IK_SCHEMA, ikAuth, ikUrlOk } from './imagekit.js';
import { DEST_SCHEMA, seedDestinations, publicDestinations, adminDestinations, destExists } from './destinations.js';
import { SITE_SCHEMA, publicSite, adminSite, requireFeature, requireFlag, getSite, pageOffFlag, cleanValue } from './site-settings.js';
import { adminLayout } from './site-layout.js';
import { CONTENT_SCHEMA, publicBlocks, publicPage, adminContent } from './custom-content.js';
import { COUPON_SCHEMA, publicCouponCheck, adminCoupons, checkCoupon, redeem, calcDiscount } from './coupons.js';
import { adminData } from './data-import-export.js';
import { TPL_SCHEMA, tplFields, adminEmailTpl } from './email-templates.js';
import { ACCESS_SCHEMA, adminAccess, checkAccess } from './admin-access.js';
import { MFA_SCHEMA } from './mfa.js';
import { mfaGate, mfaPublic, mfaSettings } from './mfa-routes.js';
import { checkPassword } from './customer-auth.js';
import { RULES } from './rules.js';
import { xlsxResponse } from './xlsx.js';
import { sendEmail, noticeEmail, verifyEmail, mailConfig, setContactEmail } from './email.js';

const STATUSES = ['new', 'called', 'won', 'cancelled'];
const STATUS_LABEL = {
  new: 'Mới',
  called: 'Đã gọi',
  won: 'Đã chốt',
  cancelled: 'Huỷ'
};
const SOURCES = ['contact', 'home', 'admin'];
const DESTINATIONS = ['Vịnh Hạ Long', 'Sa Pa', 'Hội An', 'Huế', 'Đà Lạt', 'Phú Quốc'];
const TZ_OFFSET_S = 7 * 3600; // Việt Nam UTC+7
/* Phiên quản trị: mặc định 7 ngày và tự gia hạn khi đang dùng (phiên trượt), nên chỉ hết hạn khi bỏ không quá 7 ngày.
Muốn ngắn hơn / dài hơn: đặt biến ADMIN_SESSION_HOURS (1–720 giờ) trong wrangler.toml. */
const SESSION_DEFAULT_S = 7 * 24 * 3600;
const sessionTtl = env => {
  const h = Number(env.ADMIN_SESSION_HOURS);
  return h >= 1 && h <= 720 ? Math.floor(h * 3600) : SESSION_DEFAULT_S;
};
const RENEW = new WeakMap(); // request → giá trị cookie mới cần gửi kèm phản hồi

// Mật khẩu admin lấy từ secret của Worker (ADMIN_PASSWORD, hoặc ADMIN_SECRET nếu bạn đặt tên này).
const adminSecret = env => env.ADMIN_PASSWORD || env.ADMIN_SECRET || '';

const LIMITS = {
  booking: { max: 5, windowS: 600 }, // 5 đơn / 10 phút / IP
  login: { max: 5, windowS: 900 }, // 5 lần đăng nhập / 15 phút / IP
  admin: { max: 300, windowS: 60 }, // 300 yêu cầu admin / phút / IP
  register: { max: 5, windowS: 3600 }, // 5 lần đăng ký / giờ / IP
  userLogin: { max: 10, windowS: 900 }, // 10 lần đăng nhập khách / 15 phút / IP và / email
  resend: { max: 3, windowS: 3600 }, // 3 lần gửi lại email xác minh / giờ / IP và / email
  verify: { max: 20, windowS: 900 }, // 20 lần xác minh / 15 phút / IP
  chat: { max: 30, windowS: 300 }, // 30 tin nhắn / 5 phút / khách
  chatnew: { max: 6, windowS: 3600 }, // 6 phiên chat mới / giờ / khách
  review: { max: 5, windowS: 3600 }, // 5 lần gửi đánh giá / giờ / khách
  rvote: { max: 60, windowS: 3600 }, // 60 lần bấm "hữu ích" / giờ / khách
  forgot: { max: 3, windowS: 3600 }, // 3 lần quên mật khẩu / giờ / IP và / email
  fav: { max: 120, windowS: 300 }, // 120 lần thích / bỏ thích / 5 phút / IP
  coupon: { max: 20, windowS: 600 }, // 20 lần kiểm tra mã giảm giá / 10 phút / IP
  bug: { max: 5, windowS: 3600 } // 5 báo lỗi / giờ / IP
};

export const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS bookings (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at INTEGER NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL, destination TEXT, depart_date TEXT, people INTEGER, message TEXT, source TEXT NOT NULL DEFAULT \'contact\', status TEXT NOT NULL DEFAULT \'new\', note TEXT NOT NULL DEFAULT \'\', updated_at INTEGER NOT NULL, user_id INTEGER, amount INTEGER)',
  'CREATE INDEX IF NOT EXISTS idx_bookings_created ON bookings(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status)',
  'CREATE TABLE IF NOT EXISTS rate_limits (key TEXT NOT NULL, window INTEGER NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (key, window))',
  'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at INTEGER NOT NULL, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, phone TEXT, pass_hash TEXT NOT NULL, verified_at INTEGER, verify_hash TEXT, verify_exp INTEGER, verify_sent_at INTEGER, last_login INTEGER, blocked_at INTEGER, reset_hash TEXT, reset_exp INTEGER, reset_sent_at INTEGER)',
  'CREATE INDEX IF NOT EXISTS idx_users_verify ON users(verify_hash)',
  'CREATE TABLE IF NOT EXISTS admin_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL DEFAULT \'\')',
  'CREATE INDEX IF NOT EXISTS idx_admin_log_at ON admin_log(at)',
  'CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, sender TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL, read_at INTEGER)',
  'CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id, id)',
  // Phiên chat: mỗi khách có thể có nhiều phiên, tối đa một phiên đang mở; tin nhắn thuộc về một phiên
  'CREATE TABLE IF NOT EXISTS chat_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, title TEXT NOT NULL DEFAULT \'\', topic TEXT NOT NULL DEFAULT \'other\', status TEXT NOT NULL DEFAULT \'open\', created_by TEXT NOT NULL DEFAULT \'user\', closed_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, closed_at INTEGER)',
  'CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id, id)',
  'CREATE INDEX IF NOT EXISTS idx_chat_sessions_status ON chat_sessions(status, updated_at)',
  'CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, rating INTEGER NOT NULL, destination TEXT, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT \'pending\', reply TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, helpful_adj INTEGER NOT NULL DEFAULT 0)',
  'CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id)',
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_user_tour ON reviews(user_id, COALESCE(destination, ''))",
  'CREATE TABLE IF NOT EXISTS review_votes (review_id INTEGER NOT NULL, user_id INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (review_id, user_id))',
  'CREATE INDEX IF NOT EXISTS idx_review_votes_user ON review_votes(user_id)',
  ...TOURS_SCHEMA,
  ...BUG_SCHEMA,
  ...INBOX_SCHEMA,
  ...USER_SESSIONS_SCHEMA,
  ...IK_SCHEMA,
  ...ADMINS_SCHEMA,
  ...ACCESS_SCHEMA,
  ...MFA_SCHEMA,
  ...TPL_SCHEMA,
  ...COUPON_SCHEMA,
  ...SITE_SCHEMA,
  ...DEST_SCHEMA,
  ...CONTENT_SCHEMA,
  'CREATE TABLE IF NOT EXISTS favorites (user_id INTEGER NOT NULL, item TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, item))'
];
/* Cột thêm sau cho CSDL cũ ("đã có cột" thì bỏ qua). Mỗi dòng: bảng → danh sách "tên kiểu" */
const COLUMNS = {
  bookings: ['user_id INTEGER', 'amount INTEGER', 'coupon TEXT', 'discount INTEGER'],
  users: ['blocked_at INTEGER', 'reset_hash TEXT', 'reset_exp INTEGER', 'reset_sent_at INTEGER', 'avatar TEXT', 'delete_requested_at INTEGER'],
  admins: ['avatar TEXT', 'perms TEXT', 'sess_at INTEGER', 'access TEXT'],
  messages: ['bot INTEGER NOT NULL DEFAULT 0', 'session_id INTEGER'],
  tours: ['image TEXT', 'summary TEXT']
};
/* Bảng reviews có thể vừa được dựng lại ở migrateReviewsPerTour nên thêm cột sau bước đó */
const LATE_COLUMNS = { reviews: ['helpful_adj INTEGER NOT NULL DEFAULT 0'] };
async function addColumns(env, spec) {
  for (const [table, cols] of Object.entries(spec)) {
    for (const col of cols) {
      await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${col}`).run().catch(() => {});
    }
  }
}
let schemaReady = null;

// Tự tạo bảng ở lần gọi đầu tiên, nên không cần chạy migration thủ công.
function ensureSchema(env) {
  if (!env.DB) {
    throw new HttpError(500, 'Chưa gắn database D1 với tên binding là DB.');
  }
  if (!schemaReady) {
    schemaReady = env.DB.batch(SCHEMA.map(sql => env.DB.prepare(sql)))
      // CSDL cũ chưa có cột user_id (đơn gắn với tài khoản): thêm vào, lỗi "đã có cột" thì bỏ qua
      .then(() => addColumns(env, COLUMNS))
      .then(() => env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, id)').run())
      .then(() => migrateChatSessions(env))
      .then(() => migrateReviewsPerTour(env))
      .then(() => addColumns(env, LATE_COLUMNS))
      .then(() => env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id)').run())
      .then(() => seedTours(env))
      .then(() => seedDestinations(env))
      .then(() => purgeDeletedUsers(env).catch(() => {}))
      .catch(err => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

/* Tin nhắn cũ (trước khi có phiên) gom thành một phiên cho mỗi khách. Chạy lại nhiều lần vẫn an toàn:
chỉ xử lý các tin chưa có session_id. Khách nhắn trong 7 ngày gần đây thì phiên còn mở, cũ hơn thì đã kết thúc. */
async function migrateChatSessions(env) {
  const todo = await env.DB.prepare('SELECT 1 FROM messages WHERE session_id IS NULL LIMIT 1').first();
  if (!todo) {
    return;
  }
  const weekAgo = Date.now() - 7 * 86400000;
  await env.DB.prepare("INSERT INTO chat_sessions (user_id, title, topic, status, created_by, closed_by, created_at, updated_at, closed_at) " +
    "SELECT user_id, 'Cuộc trò chuyện trước đây', 'other', CASE WHEN MAX(created_at) >= ?1 THEN 'open' ELSE 'closed' END, 'user', " +
    "CASE WHEN MAX(created_at) >= ?1 THEN NULL ELSE 'admin' END, MIN(created_at), MAX(created_at), CASE WHEN MAX(created_at) >= ?1 THEN NULL ELSE MAX(created_at) END " +
    "FROM messages WHERE session_id IS NULL GROUP BY user_id").bind(weekAgo).run();
  await env.DB.prepare('UPDATE messages SET session_id = (SELECT MAX(s.id) FROM chat_sessions s WHERE s.user_id = messages.user_id) WHERE session_id IS NULL').run();
}

/* Bảng reviews cũ có "user_id INTEGER NOT NULL UNIQUE" (mỗi khách một đánh giá) nên khách không đăng được đánh giá thứ hai.
Worker chỉ CREATE TABLE IF NOT EXISTS, không chạy migration 0024, nên tự dựng lại bảng ở đây. Bảng đã đúng thì bỏ qua. */
async function migrateReviewsPerTour(env) {
  const row = await env.DB.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'reviews'").first();
  if (!row || !/user_id\s+INTEGER\s+NOT\s+NULL\s+UNIQUE/i.test(row.sql || '')) {
    return;
  }
  await env.DB.batch([
    'DROP TABLE IF EXISTS reviews_per_tour',
    'CREATE TABLE reviews_per_tour (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, rating INTEGER NOT NULL, destination TEXT, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT \'pending\', reply TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)',
    'INSERT INTO reviews_per_tour (id, user_id, rating, destination, body, status, reply, created_at, updated_at) SELECT id, user_id, rating, destination, body, status, reply, created_at, updated_at FROM reviews',
    'DROP TABLE reviews',
    'ALTER TABLE reviews_per_tour RENAME TO reviews',
    'CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id)',
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_user_tour ON reviews(user_id, COALESCE(destination, ''))"
  ].map(sql => env.DB.prepare(sql)));
}

export default {
  /* Cron hằng ngày: xoá hẳn các tài khoản đã quá 30 ngày chờ xoá */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(ensureSchema(env).then(() => purgeDeletedUsers(env)));
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (!url.pathname.startsWith('/api/')) {
        /* Trang của tính năng đã tắt: trả đúng trang 404 (public/404.html), giống hệt trang không tồn tại.
        Hỏi một đường dẫn không có thật để nền tảng tự trả 404.html với mã 404 (not_found_handling = "404-page"). */
        if (await pageOffFlag(env, url.pathname)) {
          return env.ASSETS.fetch(new Request(new URL('/__tinh-nang-da-tat__', url), { method: 'GET', headers: request.headers }));
        }
        // Trang tự tạo: /p/ten-trang dùng chung một khung page.html, nội dung nạp qua /api/pages/ten-trang
        if (/^\/p\/[a-z0-9-]+\/?$/.test(url.pathname)) {
          return env.ASSETS.fetch(new Request(new URL('/page', url), request));
        }
        return env.ASSETS.fetch(request);
      }
      await ensureSchema(env);
      let res = await route(request, env, url, ctx);
      if (MASKED.has(request)) {
        res = await maskResponse(res);
      }
      const renew = RENEW.get(request);
      if (renew && !res.headers.has('Set-Cookie')) {
        res = new Response(res.body, res);
        res.headers.append('Set-Cookie', cookie(renew.value, renew.ttl, url));
      }
      return res;
    } catch (err) {
      if (err instanceof HttpError) {
        return json({ error: err.message, ...(err.code ? { code: err.code } : {}) }, err.status, err.headers);
      }
      console.error('Worker error:', err && err.stack || err);
      return json({ error: 'Lỗi máy chủ. Vui lòng thử lại sau.' }, 500);
    }
  }
};

/* Quản trị viên không có quyền "pii": số điện thoại và email trong dữ liệu trả về bị che (••••123, a•••@gmail.com) */
const MASKED = new WeakSet();
async function maskResponse(res) {
  if (!/json/.test(res.headers.get('Content-Type') || '')) {
    return res;
  }
  return new Response(JSON.stringify(maskPII(await res.json())), { status: res.status, headers: res.headers });
}

class HttpError extends Error {
  constructor(status, message, headers, code) {
    super(message);
    this.status = status;
    this.headers = headers;
    this.code = code;
  }
}

/* ---------- Định tuyến ---------- */
async function route(request, env, url, ctx) {
  const { pathname } = url;
  const method = request.method;
  const ip = request.headers.get('CF-Connecting-IP') || 'local';

  const site = (env.SITE_URL || url.origin).replace(/\/+$/, '');
  const defer = p => {
    try {
      if (ctx && ctx.waitUntil) {
        ctx.waitUntil(p);
      }
    } catch { /* bỏ qua */
    }
  };
  // Gửi email thông báo ở nền, không làm chậm phản hồi; lỗi chỉ ghi log
  const mail = (to, content) => defer(Promise.resolve(content).then(c => sendEmail(env, { to, ...c })).catch(err => console.error('Gửi email thông báo lỗi:', err && err.message || err)));
  setContactEmail(env.EMAIL_FROM || env.GMAIL_USER);
  const adminTo = env.ADMIN_EMAIL || env.GMAIL_USER || '';
  const helpers = { notify: (uid, n) => notify(env, uid, n), turnstile: (b, action) => verifyTurnstile(request, env, b, action, HttpError), adminTo, DESTINATIONS, destExists, HttpError, json, readJson, clean, cleanSite: (k, v) => cleanValue(k, v, { HttpError, clean }), limit, LIMITS, vName, vPhone, vDest, vDate, vPeople, logAct, site, defer, mail, notice: noticeEmail, adminMail: content => mail(adminTo, content),
    // Email theo mẫu chỉnh được trong trang quản trị: tpl('khoá mẫu', biến, { rows, quote, link })
    tpl: async (key, vars, extra) => noticeEmail({ ...(await tplFields(env, key, vars)).fields, ...extra }) };

  if (pathname === '/api/site' && method === 'GET') {
    return publicSite(env, helpers);
  }
  if (pathname === '/api/destinations' && method === 'GET') {
    return publicDestinations(env, helpers);
  }
  if (pathname === '/api/blocks' && method === 'GET') {
    return publicBlocks(env, helpers);
  }
  {
    const pm = pathname.match(/^\/api\/pages\/([a-z0-9-]+)$/);
    if (pm && method === 'GET') {
      await requireFlag(env, 'feat_pages', helpers, 'Không tìm thấy.');
      return publicPage(env, helpers, pm[1]);
    }
  }
  /* Công tắc tính năng / bảo trì do quản trị đặt trong Cài đặt website */
  if (method === 'POST') {
    if (pathname === '/api/booking') {
      await requireFeature(env, 'feat_booking', helpers, 'Tạm ngừng nhận đặt tour. Vui lòng gọi hotline để được hỗ trợ.');
    } else if (pathname === '/api/auth/register') {
      await requireFeature(env, 'feat_register', helpers, 'Tạm ngừng đăng ký tài khoản mới.');
    } else if (pathname === '/api/chat/send' || pathname === '/api/chat/sessions') {
      await requireFeature(env, 'feat_chat', helpers, 'Tin nhắn trực tuyến đang tạm tắt. Vui lòng gọi hotline.');
    } else if (pathname === '/api/reviews') {
      await requireFeature(env, 'feat_reviews', helpers, 'Tạm ngừng nhận đánh giá mới.');
    } else if (pathname === '/api/auth/login') {
      await requireFlag(env, 'feat_login', helpers, 'Tạm ngừng đăng nhập tài khoản khách. Vui lòng thử lại sau.');
    } else if (pathname === '/api/bug-report') {
      await requireFlag(env, 'feat_bugreport', helpers, 'Tạm ngừng nhận báo lỗi. Vui lòng liên hệ hotline.');
    }
  }
  /* Công tắc ẩn tính năng: khi tắt, máy chủ từ chối luôn (giao diện đã ẩn nút tương ứng) */
  if (pathname === '/api/auth/forgot' || pathname === '/api/auth/reset') {
    await requireFlag(env, 'feat_forgot', helpers, 'Tính năng quên mật khẩu đang tạm tắt.');
  } else if (pathname === '/api/auth/bookings/cancel') {
    await requireFlag(env, 'feat_cancel', helpers, 'Khách tự huỷ đơn đang tạm tắt. Vui lòng gọi hotline.');
  } else if (/^\/api\/reviews\/\d+\/helpful$/.test(pathname)) {
    await requireFlag(env, 'feat_votes', helpers, 'Bình chọn hữu ích đang tạm tắt.');
  } else if (pathname === '/api/auth/favorite' || pathname === '/api/auth/favorites') {
    await requireFlag(env, 'feat_favorites', helpers, 'Tính năng yêu thích đang tạm tắt.');
  } else if (pathname === '/api/inbox' || pathname.startsWith('/api/inbox/')) {
    await requireFlag(env, 'feat_inbox', helpers, 'Hòm thư thông báo đang tạm tắt.');
  } else if (pathname === '/api/coupon/check') {
    await requireFlag(env, 'feat_coupons', helpers, 'Mã giảm giá đang tạm tắt.');
  } else if (pathname === '/api/reviews' || pathname.startsWith('/api/reviews/')) {
    await requireFlag(env, 'feat_reviews', helpers, 'Đánh giá đang tạm tắt.');
  } else if (pathname.startsWith('/api/chat/')) {
    await requireFlag(env, 'feat_chat', helpers, 'Tin nhắn trực tuyến đang tạm tắt. Vui lòng gọi hotline.');
  }
  if (pathname === '/api/booking' && method === 'POST') {
    return createBooking(request, env, ip, helpers);
  }
  if (pathname === '/api/bug-report' && method === 'POST') {
    return publicBugReport(request, env, ip, helpers);
  }
  if (pathname === '/api/tours' && method === 'GET') {
    return publicTours(env, helpers);
  }
  if (pathname === '/api/coupon/check' && method === 'POST') {
    return publicCouponCheck(request, env, helpers, ip);
  }
  if (pathname === '/api/admin/login' && method === 'POST') {
    return login(request, env, ip, url);
  }
  if (pathname.startsWith('/api/admin/mfa/')) {
    const sub = pathname.slice('/api/admin/mfa'.length);
    const open = await mfaPublic(sub, request, env, url, ip, helpers, adminMfaCtx(env, request, url, ip));
    if (open) {
      return open;
    }
  }
  if (pathname === '/api/admin/logout' && method === 'POST') {
    return json({ ok: true }, 200, { 'Set-Cookie': cookie('', 0, url) });
  }

  if (pathname.startsWith('/api/auth/')) {
    return handleAuth(request, env, url, ip, helpers);
  }
  if (pathname === '/api/inbox' || pathname.startsWith('/api/inbox/')) {
    return handleInbox(request, env, url, helpers);
  }
  if (pathname.startsWith('/api/chat/')) {
    return handleChat(request, env, url, ip, helpers);
  }
  if (pathname === '/api/reviews' || pathname.startsWith('/api/reviews/')) {
    return handleReviews(request, env, url, ip, helpers);
  }

  if (!pathname.startsWith('/api/admin/')) {
    throw new HttpError(404, 'Không tìm thấy.');
  }

  const actor = await requireAdmin(request, env);
  env = Object.assign(Object.create(env), { __actor: actor.name }); // nhật ký ghi rõ ai thao tác
  await limit(env, 'admin:' + ip, LIMITS.admin);
  if (!authorize(actor.role, pathname, method, actor.perms)) {
    throw new HttpError(403, 'Bạn không có quyền thực hiện thao tác này.');
  }
  if (pathname.startsWith('/api/admin/mfa/')) {
    if (!actor.id) {
      throw new HttpError(400, 'Tài khoản chủ dùng mật khẩu chung không hỗ trợ xác thực hai lớp. Hãy tạo tài khoản quản trị riêng.');
    }
    const r = await mfaSettings(pathname.slice('/api/admin/mfa'.length), request, env, url, ip, helpers, adminMfaCtx(env, request, url, ip), actor);
    if (r) {
      return r;
    }
    throw new HttpError(404, 'Không tìm thấy.');
  }
  if (pathname === '/api/admin/admins' || pathname.startsWith('/api/admin/admins/') || pathname === '/api/admin/roles' || pathname.startsWith('/api/admin/roles/')) {
    return adminApi(request, env, url, helpers, actor);
  }
  if (actor.perms.pii !== 'rw' && pathname !== '/api/admin/me') {
    MASKED.add(request);
  }

  if (pathname === '/api/admin/accounts.csv' || pathname.startsWith('/api/admin/accounts')) {
    return adminAccounts(request, env, url, helpers);
  }
  if (pathname.startsWith('/api/admin/faq')) {
    return adminFaq(request, env, url, helpers);
  }
  if (pathname === '/api/admin/review-count' || pathname.startsWith('/api/admin/reviews')) {
    return adminReviews(request, env, url, helpers);
  }
  if (pathname === '/api/admin/inbox' || pathname.startsWith('/api/admin/inbox/')) {
    return adminInbox(request, env, url, helpers);
  }
  if (pathname === '/api/admin/bug-count' || pathname.startsWith('/api/admin/bugs')) {
    return adminBugs(request, env, url, helpers);
  }
  if (pathname === '/api/admin/chat-unread' || pathname.startsWith('/api/admin/conversations')) {
    return adminChat(request, env, url, helpers);
  }

  if (/^\/api\/admin\/(tours|templates|report)/.test(pathname)) {
    return adminTools(request, env, url, helpers);
  }
  if (pathname.startsWith('/api/admin/coupons')) {
    return adminCoupons(request, env, url, helpers);
  }
  if (pathname.startsWith('/api/admin/data/')) {
    return adminData(request, env, url, helpers, actor);
  }
  if (pathname.startsWith('/api/admin/destinations')) {
    return adminDestinations(request, env, url, helpers);
  }
  if (pathname === '/api/admin/site') {
    return adminSite(request, env, helpers, actor);
  }
  if (pathname === '/api/admin/access') {
    return adminAccess(request, env, helpers, actor, ip);
  }
  if (pathname === '/api/admin/layout') {
    return adminLayout(request, env, helpers);
  }
  if (pathname.startsWith('/api/admin/content-blocks') || pathname.startsWith('/api/admin/pages')) {
    return adminContent(request, env, url, helpers);
  }
  if (pathname === '/api/admin/imagekit' && method === 'GET') {
    return ikAuth(env, helpers, '/vietduky/tours');
  }
  if (pathname === '/api/admin/me' && method === 'GET') {
    return json({
      ok: true,
      name: actor.name,
      email: actor.email || '',
      role: actor.role,
      roleLabel: actor.roleLabel || ROLES[actor.role],
      avatar: actor.avatar || '',
      perms: actor.perms || permsOf(actor.role),
      rules: RULES
    });
  }
  if (pathname === '/api/admin/me' && method === 'PATCH') { // quản trị viên tự đổi ảnh đại diện của mình
    if (!actor.id) {
      throw new HttpError(400, 'Tài khoản chủ gốc dùng logo mặc định, không đổi được ảnh.');
    }
    const b = await readJson(request), v = b.avatar === '' || b.avatar == null ? null : b.avatar;
    if (v !== null && !ikUrlOk(env, v)) {
      throw new HttpError(400, 'Ảnh đại diện phải là ảnh đã tải lên hệ thống.');
    }
    await env.DB.prepare('UPDATE admins SET avatar = ?1 WHERE id = ?2').bind(v, actor.id).run();
    return json({ ok: true, avatar: v || '' });
  }
  if (pathname === '/api/admin/email-templates' || pathname.startsWith('/api/admin/email-templates/')) {
    return adminEmailTpl(request, env, url, helpers, noticeEmail, verifyEmail, sendEmail);
  }
  if (pathname === '/api/admin/email-test' && method === 'POST') {
    return emailTest(env, adminTo, site);
  }
  if (pathname === '/api/admin/email-status' && method === 'GET') {
    const c = mailConfig(env);
    return json({
      ready: c.ready,
      user: c.ready ? c.user : '',
      to: adminTo
    });
  }
  if (pathname === '/api/admin/stats' && method === 'GET') {
    return stats(env, url);
  }
  if (pathname === '/api/admin/bookings' && method === 'GET') {
    return listBookings(env, url);
  }
  if (pathname === '/api/admin/export.csv' && method === 'GET') {
    return exportCsv(env, url);
  }
  if (pathname === '/api/admin/export.xlsx' && method === 'GET') {
    return exportCsv(env, url, true);
  }
  if (pathname === '/api/admin/customers' && method === 'GET') {
    return listCustomers(env, url);
  }
  if (pathname === '/api/admin/departures' && method === 'GET') {
    return departures(env);
  }
  if (pathname === '/api/admin/customers.xlsx' && method === 'GET') {
    return customersXlsx(env, url);
  }
  if (pathname === '/api/admin/activity' && method === 'GET') {
    return activity(env);
  }
  if (pathname === '/api/admin/activity.xlsx' && method === 'GET') {
    return activityXlsx(env);
  }
  if (pathname === '/api/admin/backup.json' && method === 'GET') {
    return backup(env);
  }
  if (pathname === '/api/admin/bookings' && method === 'POST') {
    return adminCreateBooking(request, env);
  }
  if (pathname === '/api/admin/bookings/bulk' && method === 'POST') {
    return bulkBookings(request, env);
  }

  const m = pathname.match(/^\/api\/admin\/bookings\/(\d+)$/);
  if (m && method === 'PATCH') {
    return updateBooking(request, env, Number(m[1]), helpers);
  }
  if (m && method === 'DELETE') {
    return deleteBooking(env, Number(m[1]));
  }

  throw new HttpError(404, 'Không tìm thấy.');
}

/* ---------- Tiện ích ---------- */
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers
    }
  });
}

async function readJson(request) {
  const type = request.headers.get('Content-Type') || '';
  if (!type.includes('application/json')) {
    throw new HttpError(415, 'Dữ liệu gửi lên không hợp lệ.');
  }
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'Dữ liệu gửi lên không hợp lệ.');
  }
}

/* ---------- Kiểm tra dữ liệu đơn (dùng cho khách gửi và admin sửa) ---------- */
function vName(v) {
  const s = clean(v, 80);
  if (s.length < 2) {
    throw new HttpError(400, 'Vui lòng nhập họ và tên.');
  }
  return s;
}
function vPhone(v) {
  const s = clean(v, 20).replace(/[\s.\-()]/g, '');
  if (!/^(\+?84|0)\d{8,10}$/.test(s)) {
    throw new HttpError(400, 'Số điện thoại chưa đúng. Ví dụ: 0912345678.');
  }
  return s;
}
function vDest(v) {
  const s = clean(v, 40);
  if (s && !DESTINATIONS.includes(s)) {
    throw new HttpError(400, 'Điểm đến không hợp lệ.');
  }
  return s || null;
}
/* Điểm đến hoặc tên tour (kể cả tour tự tạo trong trang quản trị) */
async function vDestAny(env, v) {
  const s = clean(v, 80);
  if (!s || DESTINATIONS.includes(s) || await destExists(env, s)) {
    return s || null;
  }
  const t = await env.DB.prepare('SELECT 1 FROM tours WHERE (name = ?1 OR destination = ?1) AND active = 1').bind(s).first().catch(() => null);
  if (!t) {
    throw new HttpError(400, 'Điểm đến không hợp lệ.');
  }
  return s;
}
function vDate(v) {
  const s = clean(v, 10);
  if (s && !/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new HttpError(400, 'Ngày khởi hành không hợp lệ.');
  }
  return s || null;
}
function vPeople(v) {
  if (v === '' || v == null) {
    return null;
  }
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 200) {
    throw new HttpError(400, 'Số người phải từ 1 đến 200.');
  }
  return n;
}

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);

/* ---------- Giới hạn tần suất (cửa sổ cố định, lưu trong D1) ---------- */
async function limit(env, key, { max, windowS }) {
  const now = Math.floor(Date.now() / 1000);
  const win = Math.floor(now / windowS);
  const row = await env.DB.prepare('INSERT INTO rate_limits (key, window, count) VALUES (?1, ?2, 1) ' +
    'ON CONFLICT(key, window) DO UPDATE SET count = count + 1 RETURNING count').bind(key, win).first();

  if (Math.random() < 0.02) {
    // dọn dần các cửa sổ cũ (cửa sổ nhỏ nhất là 60 giây)
    await env.DB.prepare('DELETE FROM rate_limits WHERE window < ?1').bind(Math.floor(now / 3600) - 1).run().catch(() => {});
  }

  if (row.count > max) {
    const retry = windowS - (now % windowS);
    throw new HttpError(429, `Bạn thao tác quá nhanh. Vui lòng thử lại sau ${Math.ceil(retry / 60)} phút.`, { 'Retry-After': String(retry) });
  }
}

/* ---------- Gửi đơn từ website ---------- */
async function createBooking(request, env, ip, h) {
  await limit(env, 'booking:' + ip, LIMITS.booking);

  // Chặn gửi chéo trang
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) {
    throw new HttpError(403, 'Yêu cầu không hợp lệ.');
  }

  // Cần tài khoản đã xác minh email mới đặt được đơn. Riêng khi quản trị tắt đăng nhập thì ai cũng đặt được
  // (đơn không gắn tài khoản, gửi thẳng cho quản trị).
  let user = null;
  try {
    user = await currentUser(request, env, { HttpError });
  } catch { /* chưa cấu hình khoá phiên: coi như chưa đăng nhập */
  }
  const guest = !user && (await getSite(env)).feat_login === false;
  if (!user && !guest) {
    throw new HttpError(401, 'Bạn cần đăng nhập để đặt tour.', undefined, 'login_required');
  }

  const b = await readJson(request);
  await verifyTurnstile(request, env, b, 'booking', HttpError);

  // Ô ẩn dành cho bot: người thật không điền. Trả về thành công giả để bot không dò được.
  if (clean(b.website, 100)) {
    return json({ ok: true });
  }

  const name = vName(clean(b.name, 80) || (user ? user.name : ''));
  const phone = vPhone(clean(b.phone, 20) || (user ? user.phone : '') || '');
  /* khách không đăng nhập: email là tuỳ chọn (để nhận thư xác nhận), SĐT mới là bắt buộc */
  const guestEmail = guest ? clean(b.email, 254).toLowerCase() : '';
  const email = user ? user.email : (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(guestEmail) ? guestEmail : '');
  const destination = await vDestAny(env, b.destination);
  const date = vDate(b.date);
  const people = vPeople(b.people);
  const message = clean(b.message, 1000);
  await assertClean(env, HttpError, name, message);
  const source = b.source === 'home' ? 'home' : 'contact';

  // Mã giảm giá (không bắt buộc): kiểm tra lại ở máy chủ rồi trừ một lượt dùng
  const code = (await getSite(env)).feat_coupons === false ? '' : clean(b.coupon, 30); // tắt mã giảm giá: bỏ qua mã
  const cp = code ? await checkCoupon(env, h, code, { destination, people }) : null;
  if (cp) {
    await redeem(env, h, cp.c);
  }
  const now = Date.now();
  await env.DB.prepare('INSERT INTO bookings (created_at, updated_at, name, phone, destination, depart_date, people, message, source, user_id, coupon, discount) ' +
    'VALUES (?1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)').bind(now, name, phone, destination || null, date, people, message || null, source, user ? user.id : null, cp ? cp.c.code : null, cp ? cp.discount : null).run();
  const cpRow = cp ? [['Mã giảm giá', cp.c.code +
        (cp.discount ? ' (−' +
          String(cp.discount).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ)' : '')]] : [];

  const tv = {
    ten: name.split(/\s+/).pop(),
    ho_ten: name,
    email,
    diem_den: destination || ''
  };
  h.adminMail(h.tpl('booking_admin', tv, {
    rows: [['Họ tên', name], ['SĐT', phone], ['Email', email || (guest ? 'Không có (khách không đăng nhập)' : '')], ['Điểm đến', destination || ''], ['Ngày đi', date ? date.split('-').reverse().join('/') : ''], ['Số người', people ? String(people) : ''], ...cpRow],
    quote: message || '',
    link: h.site + '/admin/#/bookings'
  }));
  if (email) { // khách không đăng nhập và không để email thì không có thư xác nhận
    h.mail(email, h.tpl('booking_user', tv, {
      rows: [['Điểm đến', destination || 'Chưa chọn'], ['Ngày đi', date ? date.split('-').reverse().join('/') : ''], ['Số người', people ? String(people) : ''], ['SĐT liên hệ', phone], ...cpRow],
      quote: message || '',
      link: h.site + (user ? '/account' : '')
    }));
  }
  return json({ ok: true }, 201);
}

/* ---------- Đăng nhập admin ---------- */
const enc = new TextEncoder();

async function hmac(env, data) {
  const secret = env.SESSION_SECRET || adminSecret(env);
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return [...new Uint8Array(sig)].map(x => x.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a, b) {
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    diff |= (x[i] || 0) ^ (y[i] || 0);
  }
  return diff === 0;
}

function cookie(value, maxAge, url) {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `vdk_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

async function login(request, env, ip, url) {
  if (!adminSecret(env)) {
    throw new HttpError(500, 'Chưa đặt mật khẩu admin (ADMIN_PASSWORD).');
  }
  await limit(env, 'login:' + ip, LIMITS.login);
  const body = await readJson(request);
  const deny = async (who, why) => {
    await logAct(env, 'Chặn truy cập', `${who} · ${ip} · ${why}`);
    throw new HttpError(403, why, undefined, 'access_denied');
  };
  {
    const why = await checkAccess(env, ip, null, 'pre');
    if (why) {
      await deny('đăng nhập', why);
    }
  }
  await verifyTurnstile(request, env, body, 'admin_login', HttpError);
  const password = String(body.password ?? '');

  const email = clean(body.email, 254).toLowerCase();
  if (email) { // tài khoản quản trị riêng (nhiều vai trò)
    const a = await adminLogin(env, email, password);
    if (!a) {
      throw new HttpError(401, 'Email hoặc mật khẩu chưa đúng.');
    }
    {
      const why = await checkAccess(env, ip, { role: a.role, access: a.access });
      if (why) {
        await deny(a.name, why);
      }
    }
    const gate = await mfaGate(env, { json }, 'admin', a.id); // đã bật Authenticator / passkey: cần thêm một bước
    if (gate) {
      return gate;
    }
    return issueAdminSession(env, a, request, url, ip, 'mật khẩu');
  }

  const ok = safeEqual(await hmac(env, password), await hmac(env, adminSecret(env)));
  if (!ok) {
    throw new HttpError(401, 'Mật khẩu chưa đúng.');
  }

  {
    const why = await checkAccess(env, ip, { role: 'owner', access: null });
    if (why) {
      await deny('Chủ (mật khẩu chung)', why);
    }
  }
  await logAct(env, 'Đăng nhập quản trị', ip);
  const ttl = sessionTtl(env), exp = Math.floor(Date.now() / 1000) + ttl;
  const token = `${exp}.${await hmac(env, 'session:' + exp + ':' + deviceInfo(request).key)}`;
  return json({ ok: true }, 200, { 'Set-Cookie': cookie(token, ttl, url) });
}

/* Cấp cookie phiên cho tài khoản quản trị riêng (đã qua mật khẩu / Google / mã xác thực / passkey) */
async function issueAdminSession(env, a, request, url, ip, how) {
  await logAct(env, 'Đăng nhập quản trị', `${a.name} (${await roleName(env, a.role)}) · ${ip} · ${how}`);
  const ttl = sessionTtl(env), exp = Math.floor(Date.now() / 1000) + ttl;
  return json({ ok: true }, 200, { 'Set-Cookie': cookie(`a${a.id}.${exp}.${await hmac(env, 'adm:' + a.id + ':' + exp + ':' + deviceInfo(request).key)}`, ttl, url) });
}

/* Cách Google / Authenticator / passkey gắn vào tài khoản quản trị: chỉ tài khoản đã được chủ tạo, đang bật, và qua kiểm tra truy cập */
function adminMfaCtx(env, request, url, ip) {
  return {
    kind: 'admin',
    async userById(id) {
      const a = await adminById(env, id);
      return a && a.active ? a : null;
    },
    async googleUser(p) {
      // chỉ vào được khi tài khoản quản trị đã tự liên kết Google (đăng nhập bằng email rồi bấm "Liên kết Google" ở mục Bảo mật)
      const link = await env.DB.prepare("SELECT uid FROM mfa_google WHERE sub = ?1 AND kind = 'admin'").bind(p.sub).first();
      const a = link ? await adminById(env, link.uid) : null;
      if (!a || !a.active) {
        throw new HttpError(403, 'Tài khoản Google này chưa liên kết với tài khoản quản trị. Hãy đăng nhập bằng email, rồi liên kết Google ở mục Bảo mật.');
      }
      return a;
    },
    async finish(a, req, u, ipAddr, how) {
      const why = await checkAccess(env, ip, { role: a.role, access: a.access });
      if (why) {
        await logAct(env, 'Chặn truy cập', `${a.name} · ${ip} · ${why}`);
        throw new HttpError(403, why, undefined, 'access_denied');
      }
      await env.DB.prepare('UPDATE admins SET last_login = ?1 WHERE id = ?2').bind(Date.now(), a.id).run();
      return issueAdminSession(env, a, req, u, ip, how);
    },
    hasPassword: () => true,
    async checkPassword(actor, pw) {
      const row = await env.DB.prepare('SELECT pass_hash FROM admins WHERE id = ?1').bind(actor.id).first();
      return !!row && checkPassword(pw, row.pass_hash);
    },
    googleLinked: async (a) => !!(await env.DB.prepare("SELECT 1 FROM mfa_google WHERE kind = 'admin' AND uid = ?1").bind(a.id).first())
  };
}

async function requireAdmin(request, env) {
  if (!adminSecret(env)) {
    throw new HttpError(500, 'Chưa đặt mật khẩu admin (ADMIN_PASSWORD).');
  }
  const raw = (request.headers.get('Cookie') || '').split(/;\s*/).find(c => c.startsWith('vdk_session='));
  const token = raw ? raw.slice('vdk_session='.length) : '';
  const parts = token.split('.');
  let actor = null;
  if (parts.length === 3 && /^a\d+$/.test(parts[0])) { // phiên của tài khoản quản trị riêng
    const id = Number(parts[0].slice(1)), exp = parts[1];
    if (Number(exp) >= Date.now() / 1000 && safeEqual(parts[2], await hmac(env, 'adm:' + id + ':' + exp + ':' +
      deviceInfo(request).key))) {
      const a = await adminById(env, id); // đọc lại mỗi lần: đổi vai trò / khoá có hiệu lực ngay
      // sess_at: thời điểm Chủ bấm "đăng xuất mọi thiết bị" hoặc đổi mật khẩu; phiên cấp trước đó mất hiệu lực
      if (a && a.active && !(a.sess_at && (Number(exp) - sessionTtl(env)) * 1000 + 1000 <= a.sess_at)) {
        actor = {
          id: a.id,
          name: a.name,
          email: a.email,
          role: a.role,
          roleLabel: await roleName(env, a.role),
          avatar: a.avatar || '',
          access: a.access,
          perms: await resolvePerms(env, a)
        };
      }
    }
  } else if (parts.length === 2 && parts[0] && Number(parts[0]) >= Date.now() / 1000 && safeEqual(parts[1], await hmac(env, 'session:' +
    parts[0] + ':' + deviceInfo(request).key))) {
    actor = {
      id: 0,
      name: 'Chủ (mật khẩu chung)',
      email: '',
      role: 'owner',
      perms: permsOf('owner')
    };
  }
  if (!actor) {
    throw new HttpError(401, 'Phiên đăng nhập đã hết hạn.');
  }
  {
    const why = await checkAccess(env, request.headers.get('CF-Connecting-IP') || 'local', { role: actor.role, access: actor.access });
    if (why) {
      throw new HttpError(403, why, undefined, 'access_denied');
    }
  } // hết giờ / đổi IP: phiên đang mở cũng bị cắt
  // Chặn gửi chéo trang cho thao tác ghi
  if (request.method !== 'GET') {
    const origin = request.headers.get('Origin');
    if (origin && origin !== new URL(request.url).origin) {
      throw new HttpError(403, 'Yêu cầu không hợp lệ.');
    }
  }
  /* Phiên trượt: đã dùng quá 1/10 thời hạn thì cấp lại cookie mới (kéo dài thêm một kỳ đầy đủ) */
  {
    const ttl = sessionTtl(env), now = Math.floor(Date.now() / 1000), exp = Number(parts[parts.length === 3 ? 1 : 0]);
    if (exp - now < ttl * 0.9) {
      const nexp = now + ttl, dev = deviceInfo(request).key;
      RENEW.set(request, {
        value: actor.id ? `a${actor.id}.${nexp}.${await hmac(env, 'adm:' + actor.id + ':' + nexp + ':' + dev)}` : `${nexp}.${await hmac(env, 'session:' + nexp + ':' + dev)}`,
        ttl
      });
    }
  }
  return actor;
}

/* ---------- Lọc & liệt kê đơn ---------- */
const SORTS = {
  created_at: 'created_at',
  name: 'name',
  destination: 'destination',
  depart_date: 'depart_date',
  status: 'status'
};

function buildFilter(url) {
  const p = url.searchParams;
  const where = [], args = [];
  const q = clean(p.get('q'), 80);
  if (q) {
    where.push("(name LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' OR message LIKE ? ESCAPE '\\')");
    const like = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
    args.push(like, like, like);
  }
  const status = p.get('status');
  if (STATUSES.includes(status)) {
    where.push('status = ?');
    args.push(status);
  }
  const dest = p.get('destination');
  if (dest && dest.length <= 80) {
    where.push('destination = ?');
    args.push(dest);
  }
  const phone = clean(p.get('phone'), 20);
  if (phone) {
    where.push('phone = ?');
    args.push(phone);
  }
  const source = p.get('source');
  if (SOURCES.includes(source)) {
    where.push('source = ?');
    args.push(source);
  }
  const from = p.get('from'), to = p.get('to');
  if (/^\d{4}-\d{2}-\d{2}$/.test(from || '')) {
    where.push(`date(created_at/1000 + ${TZ_OFFSET_S}, 'unixepoch') >= ?`);
    args.push(from);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(to || '')) {
    where.push(`date(created_at/1000 + ${TZ_OFFSET_S}, 'unixepoch') <= ?`);
    args.push(to);
  }
  return { clause: where.length ? 'WHERE ' + where.join(' AND ') : '', args };
}

function buildOrder(url) {
  const col = SORTS[url.searchParams.get('sort')] || 'created_at';
  const dir = url.searchParams.get('dir') === 'asc' ? 'ASC' : 'DESC';
  return `ORDER BY ${col} ${dir}, id DESC`;
}

async function listBookings(env, url) {
  const { clause, args } = buildFilter(url);
  const pageSize = Math.min(Math.max(parseInt(url.searchParams.get('pageSize')) || 20, 1), 100);
  const page = Math.max(parseInt(url.searchParams.get('page')) || 1, 1);

  const total = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM bookings ${clause}`).bind(...args).first()).n;
  const { results } = await env.DB.prepare(`SELECT * FROM bookings ${clause} ${buildOrder(url)} LIMIT ? OFFSET ?`).bind(...args, pageSize, (page - 1) * pageSize).all();

  return json({
    items: results,
    total,
    page,
    pageSize
  });
}

/* ---------- Thống kê ---------- */
/* Tổng quan: ?days=7|30|90 (mặc định 30). Doanh thu = tổng số tiền các đơn "Đã chốt" (cột amount), tính theo ngày tạo đơn, giống trang Báo cáo. */
async function stats(env, url) {
  const days = [7, 30, 90].includes(Number(url && url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 30;
  const day = `date(created_at/1000 + ${TZ_OFFSET_S}, 'unixepoch')`;
  const today = new Date(Date.now() + TZ_OFFSET_S * 1000).toISOString().slice(0, 10);
  const dayMs = 86400000;
  const shift = n => new Date(Date.parse(today) + n * dayMs).toISOString().slice(0, 10);
  const ym = today.slice(0, 7);
  const prevYm = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 2, 1)).toISOString().slice(0, 7);
  const month = `strftime('%Y-%m', created_at/1000 + ${TZ_OFFSET_S}, 'unixepoch')`;
  const REAL = "email NOT LIKE '%@virtual.invalid'";
  const REV = "COALESCE(SUM(CASE WHEN status='won' THEN amount END),0)";
  const from = shift(-(days - 1));

  const [byStatus, byDay, byDest, bySource, byWeekday, soon, byMonth, upcoming] = await Promise.all([
    env.DB.prepare('SELECT status, COUNT(*) AS n FROM bookings GROUP BY status').all(),
    env.DB.prepare(`SELECT ${day} AS d, COUNT(*) AS n, COALESCE(SUM(status='won'),0) AS w, ${REV} AS rev, COALESCE(SUM(CASE WHEN status='won' THEN people END),0) AS ppl FROM bookings WHERE ${day} >= ?1 GROUP BY d`).bind(shift(-(days * 2 - 1))).all(),
    env.DB.prepare(`SELECT destination AS name, COUNT(*) AS n, COALESCE(SUM(status='won'),0) AS won, ${REV} AS revenue FROM bookings WHERE destination IS NOT NULL AND destination <> '' AND ${day} >= ?1 GROUP BY destination ORDER BY n DESC, revenue DESC`).bind(from).all(),
    env.DB.prepare(`SELECT source, COUNT(*) AS n FROM bookings WHERE ${day} >= ?1 GROUP BY source`).bind(from).all(),
    env.DB.prepare(`SELECT CAST(strftime('%w', created_at/1000 + ${TZ_OFFSET_S}, 'unixepoch') AS INTEGER) AS wd, COUNT(*) AS n FROM bookings WHERE ${day} >= ?1 GROUP BY wd`).bind(from).all(),
    env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(people), 0) AS p FROM bookings WHERE status <> 'cancelled' AND depart_date >= ?1 AND depart_date <= ?2").bind(today, shift(14)).first(),
    env.DB.prepare(`SELECT ${month} AS ym, COUNT(*) AS n, COALESCE(SUM(status='won'),0) AS w, ${REV} AS rev FROM bookings WHERE ${month} >= ?1 GROUP BY ym`).bind(prevYm).all(),
    env.DB.prepare("SELECT id, name, destination, depart_date, people, status FROM bookings WHERE status <> 'cancelled' AND depart_date >= ?1 ORDER BY depart_date ASC, id ASC LIMIT 5").bind(today).all()
  ]);

  const counts = {
    new: 0,
    called: 0,
    won: 0,
    cancelled: 0
  };
  byStatus.results.forEach(r => {
    counts[r.status] = r.n;
  });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const map = Object.fromEntries(byDay.results.map(r => [r.d, r]));
  const row = d => map[d] || {
    n: 0,
    w: 0,
    rev: 0,
    ppl: 0
  };
  const daily = Array.from({ length: days }, (_, i) => {
    const d = shift(i - (days - 1));
    const r = row(d);
    return {
      date: d,
      count: r.n,
      revenue: r.rev
    };
  });
  const sumRange = (a, b) => {
    const o = {
      n: 0,
      w: 0,
      rev: 0,
      ppl: 0
    };
    for (let i = a; i <= b; i++) {
      const r = row(shift(i));
      o.n += r.n;
      o.w += r.w;
      o.rev += r.rev;
      o.ppl += r.ppl;
    }
    return o;
  };
  const cur = sumRange(-(days - 1), 0), prev = sumRange(-(days * 2 - 1), -days);
  const d1 = row(today), d0 = row(shift(-1));
  const sum7 = sumRange(-6, 0), prev7 = sumRange(-13, -7);

  const mo = Object.fromEntries(byMonth.results.map(r => [r.ym, r]));
  const m0 = mo[ym] || {
    n: 0,
    w: 0,
    rev: 0
  }, m1 = mo[prevYm] || {
    n: 0,
    w: 0,
    rev: 0
  };

  const wd = Array(7).fill(0);
  byWeekday.results.forEach(r => {
    wd[r.wd] = r.n;
  });

  const since30 = Date.now() - 30 * dayMs;
  const [acc, signups, rev, revDist, chatOpen, chatUnread, chatReply, chatNew] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(verified_at IS NOT NULL), 0) AS v, COALESCE(SUM(created_at >= ?1), 0) AS w FROM users WHERE ${REAL}`).bind(Date.now() - 7 * dayMs).first(),
    env.DB.prepare(`SELECT ${day} AS d, COUNT(*) AS n FROM users WHERE ${REAL} AND ${day} >= ?1 GROUP BY d`).bind(from).all(),
    env.DB.prepare("SELECT COALESCE(SUM(status = 'pending'), 0) AS pending, COALESCE(SUM(status = 'approved'), 0) AS approved, COALESCE(AVG(CASE WHEN status = 'approved' THEN rating END), 0) AS avg FROM reviews").first(),
    env.DB.prepare("SELECT MIN(5, MAX(1, CAST(rating + 0.5 AS INTEGER))) AS k, COUNT(*) AS n FROM reviews WHERE status = 'approved' GROUP BY k").all(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM chat_sessions s JOIN users u ON u.id = s.user_id WHERE s.status = 'open' AND u.email NOT LIKE '%@virtual.invalid'").first(),
    env.DB.prepare("SELECT COUNT(*) AS n, COUNT(DISTINCT session_id) AS c FROM messages WHERE sender = 'user' AND read_at IS NULL").first(),
    // Thời gian từ tin đầu tiên của khách đến lúc nhân viên (không phải trả lời tự động) trả lời lần đầu, các phiên 30 ngày gần đây
    env.DB.prepare('SELECT AVG(r - u) AS a, COUNT(*) AS n FROM (SELECT t.u AS u, (SELECT MIN(a.created_at) FROM messages a WHERE a.session_id = t.id AND a.sender = \'admin\' AND a.bot = 0 AND a.created_at >= t.u) AS r ' +
      "FROM (SELECT s.id, (SELECT MIN(m.created_at) FROM messages m WHERE m.session_id = s.id AND m.sender = 'user') AS u FROM chat_sessions s WHERE s.created_at >= ?1) t) WHERE u IS NOT NULL AND r IS NOT NULL").bind(since30).first(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM chat_sessions WHERE created_at >= ?1').bind(from ? Date.parse(from) - TZ_OFFSET_S * 1000 : 0).first()
  ]);
  const sg = Object.fromEntries(signups.results.map(r => [r.d, r.n]));
  const dist = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0
  };
  revDist.results.forEach(r => {
    dist[r.k] = r.n;
  });

  return json({
    days,
    accounts: {
      total: acc.n,
      verified: acc.v,
      last7: acc.w,
      daily: daily.map(x => sg[x.date] || 0)
    }, pendingReviews: rev.pending, unreadMessages: chatUnread.n,
    total, counts,
    // giữ các trường cũ để tương thích
    today: d1.n, yesterday: d0.n, last7: sum7.n, prev7: prev7.n,
    daily,
    period: {
      orders: cur.n,
      prevOrders: prev.n,
      won: cur.w,
      prevWon: prev.w,
      revenue: cur.rev,
      prevRevenue: prev.rev,
      people: cur.ppl
    },
    month: {
      key: ym,
      orders: m0.n,
      won: m0.w,
      revenue: m0.rev,
      prevOrders: m1.n,
      prevWon: m1.w,
      prevRevenue: m1.rev
    },
    destinations: byDest.results,
    sources: bySource.results,
    weekday: wd,
    soon: { count: soon.n, people: soon.p },
    upcoming: upcoming.results,
    reviews: {
      pending: rev.pending,
      approved: rev.approved,
      avg: Math.round(rev.avg * 10) / 10,
      dist
    },
    chat: {
      open: chatOpen.n,
      unread: chatUnread.n,
      unreadSessions: chatUnread.c,
      avgReplyMs: chatReply.n ? Math.round(chatReply.a) : null,
      replied: chatReply.n,
      sessions: chatNew.n
    }
  });
}

/* ---------- Cập nhật, xoá, xuất CSV ---------- */
async function updateBooking(request, env, id, h) {
  const body = await readJson(request);
  const sets = [], args = [];
  if ('status' in body) {
    if (!STATUSES.includes(body.status)) {
      throw new HttpError(400, 'Trạng thái không hợp lệ.');
    }
    sets.push('status = ?');
    args.push(body.status);
  }
  if ('note' in body) {
    sets.push('note = ?');
    args.push(clean(body.note, 2000));
  }
  if ('name' in body) {
    sets.push('name = ?');
    args.push(vName(body.name));
  }
  if ('phone' in body && !isMasked(body.phone)) {
    sets.push('phone = ?');
    args.push(vPhone(body.phone));
  } // giá trị đã bị che thì giữ nguyên số cũ
  if ('destination' in body) {
    sets.push('destination = ?');
    args.push(await vDestAny(env, body.destination));
  }
  if ('depart_date' in body) {
    sets.push('depart_date = ?');
    args.push(vDate(body.depart_date));
  }
  if ('people' in body) {
    sets.push('people = ?');
    args.push(vPeople(body.people));
  }
  if ('message' in body) {
    sets.push('message = ?');
    args.push(clean(body.message, 1000) || null);
  }
  if ('amount' in body) {
    const n = body.amount === '' || body.amount == null ? null : Number(body.amount);
    if (n !== null && (!Number.isInteger(n) || n < 0 || n > 1e10)) {
      throw new HttpError(400, 'Doanh thu phải là số nguyên không âm (đồng).');
    }
    sets.push('amount = ?');
    args.push(n);
  }
  if (!sets.length) {
    throw new HttpError(400, 'Không có gì để cập nhật.');
  }
  sets.push('updated_at = ?');
  args.push(Date.now());

  const row = await env.DB.prepare(`UPDATE bookings SET ${sets.join(', ')} WHERE id = ? RETURNING *`).bind(...args, id).first();
  if (!row) {
    throw new HttpError(404, 'Không tìm thấy đơn này.');
  }
  // chốt đơn mà chưa có doanh thu: tự ước tính = giá tour của điểm đến × số người
  if (row.status === 'won' && row.amount == null && !('amount' in body)) {
    let est = await estimateAmount(env, row).catch(() => null);
    if (est && row.coupon) { // trừ mã giảm giá đã dùng (theo cấu hình mã hiện tại)
      const c = await env.DB.prepare('SELECT kind, value FROM coupons WHERE code = ?1').bind(row.coupon).first().catch(() => null);
      est = Math.max(0, est - ((c && calcDiscount(c, est)) || row.discount || 0));
    }
    if (est) {
      await env.DB.prepare('UPDATE bookings SET amount = ?1 WHERE id = ?2').bind(est, id).run();
      row.amount = est;
    }
  }
  await logAct(env, 'Cập nhật đơn #' + id, row.name +
    ('status' in body ? ' → ' + STATUS_LABEL[body.status] : ''));
  if ('status' in body && row.user_id && h) {
    await h.notify(row.user_id, { kind: 'booking', title: 'Đơn #' + id + ': ' + STATUS_LABEL[row.status], body: (row.destination ? 'Điểm đến: ' + row.destination + '. ' : '') + 'Trạng thái đơn đặt tour của bạn đã được cập nhật.', link: '/account' });
  }
  if (body.status === 'won' && row.user_id && h) {
    const u = await env.DB.prepare('SELECT email, name FROM users WHERE id = ?1').bind(row.user_id).first().catch(() => null);
    if (u) {
      h.mail(u.email, h.tpl('booking_won', {
        ten: String(u.name || '').trim().split(/\s+/).pop(),
        ho_ten: u.name,
        email: u.email,
        diem_den: row.destination || '',
        ma_don: id
      }, {
        rows: [['Điểm đến', row.destination || ''], ['Ngày đi', row.depart_date ? row.depart_date.split('-').reverse().join('/') : ''], ['Số người', row.people ? String(row.people) : '']],
        link: h.site + '/account'
      }));
    }
  }
  return json(row);
}

async function deleteBooking(env, id) {
  const old = await env.DB.prepare('SELECT name FROM bookings WHERE id = ?').bind(id).first();
  const r = await env.DB.prepare('DELETE FROM bookings WHERE id = ?').bind(id).run();
  if (!r.meta.changes) {
    throw new HttpError(404, 'Không tìm thấy đơn này.');
  }
  await logAct(env, 'Xoá đơn #' + id, old ? old.name : '');
  return json({ ok: true });
}

async function exportCsv(env, url, xlsx = false) {
  const { clause, args } = buildFilter(url);
  const { results } = await env.DB.prepare(`SELECT * FROM bookings ${clause} ${buildOrder(url)} LIMIT 5000`).bind(...args).all();
  const label = {
    new: 'Mới',
    called: 'Đã gọi',
    won: 'Đã chốt',
    cancelled: 'Huỷ'
  };
  // Chống chèn công thức khi mở bằng Excel: ô bắt đầu bằng = + - @ được thêm dấu nháy
  const cell = v => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) {
      s = "'" + s;
    }
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const fmt = ms => new Date(ms + TZ_OFFSET_S * 1000).toISOString().replace('T', ' ').slice(0, 16);
  const head = ['Mã', 'Thời gian gửi', 'Họ tên', 'SĐT', 'Điểm đến', 'Ngày đi', 'Số người', 'Lời nhắn', 'Trạng thái', 'Ghi chú'];
  if (xlsx) {
    const day = new Date(Date.now() + TZ_OFFSET_S * 1000).toISOString().slice(0, 10);
    return xlsxResponse([{ name: 'Đơn đặt', rows: [head].concat(results.map(r => [r.id, fmt(r.created_at), r.name, r.phone, r.destination, r.depart_date, r.people, r.message, label[r.status], r.note])) }], 'don-dat-tour-' +
      day);
  }
  const lines = [head.map(cell).join(',')].concat(results.map(r => [
    r.id, fmt(r.created_at), r.name, r.phone, r.destination, r.depart_date, r.people, r.message, label[r.status], r.note
  ].map(cell).join(',')));
  return new Response('﻿' + lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="don-dat-tour.csv"',
      'Cache-Control': 'no-store'
    }
  });
}

/* ---------- Gửi thử email để kiểm tra cấu hình Gmail ---------- */
async function emailTest(env, to, site) {
  const c = mailConfig(env);
  if (!c.ready) {
    throw new HttpError(400, 'Chưa cấu hình Gmail: cần GMAIL_USER và secret GMAIL_APP_PASSWORD.');
  }
  const mail = noticeEmail({
    subject: 'Email thử từ Việt Du Ký',
    eyebrow: 'Kiểm tra cấu hình',
    heading: 'Gmail SMTP đã hoạt động',
    intro: 'Nếu bạn đọc được thư này, website đã gửi được email xác minh và thông báo.',
    rows: [['Gửi từ', c.user], ['Gửi tới', to]],
    button: 'Mở trang quản trị',
    link: site + '/admin/',
    footer: 'Thư thử do quản trị viên bấm nút "Gửi email thử".'
  });
  try {
    await sendEmail(env, { to, ...mail });
  } catch (err) {
    console.error('Gửi email thử lỗi:', err && err.message || err);
    throw new HttpError(502, String(err && err.message || 'Gửi email thất bại.'));
  }
  await logAct(env, 'Gửi email thử', to);
  return json({ ok: true, to });
}

/* ---------- Nhật ký thao tác của admin ---------- */
async function logAct(env, action, detail) {
  try {
    await env.DB.prepare('INSERT INTO admin_log (at, action, detail) VALUES (?1, ?2, ?3)').bind(Date.now(), action, ((env.__actor ? '[' +
      env.__actor + '] ' : '') +
      String(detail || '')).slice(0, 300)).run();
    if (Math.random() < 0.02) {
      await env.DB.prepare('DELETE FROM admin_log WHERE id < (SELECT MAX(id) FROM admin_log) - 1000').run();
    }
  } catch (err) {
    console.error('logAct:', err && err.message || err);
  }
}

async function activity(env) {
  const { results } = await env.DB.prepare('SELECT id, at, action, detail FROM admin_log ORDER BY id DESC LIMIT 100').all();
  return json({ items: results });
}

/* ---------- Admin tạo đơn thủ công (khách gọi điện, nhắn Zalo...) ---------- */
async function adminCreateBooking(request, env) {
  const b = await readJson(request);
  const name = vName(b.name), phone = vPhone(b.phone), destination = await vDestAny(env, b.destination);
  const date = vDate(b.date !== undefined ? b.date : b.depart_date), people = vPeople(b.people);
  const status = STATUSES.includes(b.status) ? b.status : 'new';
  const now = Date.now();
  const row = await env.DB.prepare('INSERT INTO bookings (created_at, updated_at, name, phone, destination, depart_date, people, message, source, status, note) ' +
    "VALUES (?1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, 'admin', ?8, ?9) RETURNING *").bind(now, name, phone, destination, date, people, clean(b.message, 1000) || null, status, clean(b.note, 2000)).first();
  await logAct(env, 'Tạo đơn #' + row.id, name);
  return json(row, 201);
}

/* ---------- Thao tác hàng loạt ---------- */
async function bulkBookings(request, env) {
  const b = await readJson(request);
  const ids = Array.isArray(b.ids) ? [...new Set(b.ids.map(Number).filter(n => Number.isInteger(n) && n > 0))].slice(0, 90) : [];
  if (!ids.length) {
    throw new HttpError(400, 'Chưa chọn đơn nào.');
  }
  const marks = ids.map(() => '?').join(',');
  let r;
  if (b.action === 'status') {
    if (!STATUSES.includes(b.status)) {
      throw new HttpError(400, 'Trạng thái không hợp lệ.');
    }
    r = await env.DB.prepare(`UPDATE bookings SET status = ?, updated_at = ? WHERE id IN (${marks})`).bind(b.status, Date.now(), ...ids).run();
    await logAct(env, 'Đổi trạng thái hàng loạt', r.meta.changes + ' đơn → ' + STATUS_LABEL[b.status]);
  } else if (b.action === 'delete') {
    r = await env.DB.prepare(`DELETE FROM bookings WHERE id IN (${marks})`).bind(...ids).run();
    await logAct(env, 'Xoá hàng loạt', r.meta.changes + ' đơn');
  } else {
    throw new HttpError(400, 'Thao tác không hợp lệ.');
  }
  return json({ ok: true, changed: r.meta.changes });
}

/* ---------- Khách hàng (gộp theo số điện thoại) ---------- */
async function listCustomers(env, url) {
  const q = clean(url.searchParams.get('q'), 80);
  const pageSize = 20;
  const page = Math.max(parseInt(url.searchParams.get('page')) || 1, 1);
  let where = '', args = [];
  if (q) {
    where = "WHERE (name LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\')";
    const like = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
    args = [like, like];
  }
  const total = (await env.DB.prepare(`SELECT COUNT(DISTINCT phone) AS n FROM bookings ${where}`).bind(...args).first()).n;
  const { results } = await env.DB.prepare('SELECT phone, (SELECT b2.name FROM bookings b2 WHERE b2.phone = bookings.phone ORDER BY b2.created_at DESC LIMIT 1) AS name, ' +
    "COUNT(*) AS bookings, SUM(status = 'won') AS won, SUM(status = 'cancelled') AS cancelled, MAX(created_at) AS last_at, " +
    `GROUP_CONCAT(DISTINCT destination) AS destinations FROM bookings ${where} GROUP BY phone ORDER BY last_at DESC LIMIT ? OFFSET ?`).bind(...args, pageSize, (page - 1) * pageSize).all();
  return json({
    items: results,
    total,
    page,
    pageSize
  });
}

/* Xuất Excel toàn bộ khách hàng (gộp theo SĐT), có lọc q như danh sách */
async function customersXlsx(env, url) {
  const q = clean(url.searchParams.get('q'), 80);
  let where = '', args = [];
  if (q) {
    where = "WHERE (name LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\')";
    const like = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
    args = [like, like];
  }
  const { results } = await env.DB.prepare('SELECT phone, (SELECT b2.name FROM bookings b2 WHERE b2.phone = bookings.phone ORDER BY b2.created_at DESC LIMIT 1) AS name, '
    + "COUNT(*) AS bookings, SUM(status = 'won') AS won, SUM(status = 'cancelled') AS cancelled, MAX(created_at) AS last_at, "
    + `GROUP_CONCAT(DISTINCT destination) AS destinations FROM bookings ${where} GROUP BY phone ORDER BY last_at DESC LIMIT 5000`).bind(...args).all();
  const fmt = ms => ms ? new Date(ms + TZ_OFFSET_S * 1000).toISOString().replace('T', ' ').slice(0, 16) : '';
  await logAct(env, 'Xuất danh sách khách hàng', results.length + ' khách (Excel)');
  return xlsxResponse([{ name: 'Khách hàng', rows: [['SĐT', 'Họ tên', 'Số đơn', 'Đã chốt', 'Đã huỷ', 'Đơn gần nhất', 'Điểm đến']].concat(results.map(r => [r.phone, r.name, r.bookings, r.won || 0, r.cancelled || 0, fmt(r.last_at), r.destinations])) }], 'khach-hang');
}

/* Xuất Excel nhật ký thao tác của quản trị viên (2000 dòng gần nhất) */
async function activityXlsx(env) {
  const { results } = await env.DB.prepare('SELECT id, at, action, detail FROM admin_log ORDER BY id DESC LIMIT 2000').all();
  const fmt = ms => new Date(ms + TZ_OFFSET_S * 1000).toISOString().replace('T', ' ').slice(0, 19);
  return xlsxResponse([{ name: 'Nhật ký', rows: [['Mã', 'Thời gian', 'Thao tác', 'Chi tiết']].concat(results.map(r => [r.id, fmt(r.at), r.action, r.detail])) }], 'nhat-ky-quan-tri');
}

/* ---------- Lịch khởi hành sắp tới ---------- */
async function departures(env) {
  const today = new Date(Date.now() + TZ_OFFSET_S * 1000).toISOString().slice(0, 10);
  const { results } = await env.DB.prepare("SELECT * FROM bookings WHERE depart_date >= ?1 AND status <> 'cancelled' ORDER BY depart_date ASC, id ASC LIMIT 300").bind(today).all();
  return json({ today, items: results });
}

/* ---------- Sao lưu toàn bộ đơn ra JSON ---------- */
async function backup(env) {
  const [b, u, r, m, tr, cu] = await Promise.all([
    env.DB.prepare('SELECT * FROM bookings ORDER BY id ASC LIMIT 20000').all(),
    // không đưa mật khẩu băm và mã xác minh vào bản sao lưu
    env.DB.prepare('SELECT id, created_at, email, name, phone, verified_at, last_login, blocked_at FROM users ORDER BY id ASC LIMIT 20000').all(),
    env.DB.prepare('SELECT * FROM reviews ORDER BY id ASC LIMIT 20000').all(),
    env.DB.prepare('SELECT * FROM messages ORDER BY id ASC LIMIT 50000').all(),
    env.DB.prepare('SELECT slug, name, price, old_price, duration, group_note, badge, destination, active FROM tours ORDER BY sort ASC').all(),
    env.DB.prepare('SELECT code, kind, value, min_people, max_uses, used, start_date, end_date, destination, active, note FROM coupons ORDER BY id ASC').all()
  ]);
  await logAct(env, 'Tải bản sao lưu', `${b.results.length} đơn, ${u.results.length} tài khoản, ${r.results.length} đánh giá, ${m.results.length} tin nhắn`);
  const day = new Date(Date.now() + TZ_OFFSET_S * 1000).toISOString().slice(0, 10);
  return new Response(JSON.stringify({
    exported_at: Date.now(),
    bookings: b.results,
    users: u.results,
    reviews: r.results,
    messages: m.results,
    tours: tr.results,
    coupons: cu.results
  }, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="vietduky-backup-${day}.json"`,
      'Cache-Control': 'no-store'
    }
  });
}
