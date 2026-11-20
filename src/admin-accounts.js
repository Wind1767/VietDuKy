/* Tài khoản quản trị nhiều vai trò + phân quyền theo nhóm chức năng */
import { hashPassword, checkPassword } from './customer-auth.js';
import { MIN_PASS, MAX_PASS } from './rules.js';
import { mfaWipe } from './mfa.js';
import { cleanAccount, parseAccount } from './admin-access.js';
import { ikUrlOk } from './imagekit.js';

/* Ảnh đại diện: để trống hoặc là ảnh đã tải lên ImageKit của chính website */
const vAvatar = (env, v, bad) => {
  if (v === '' || v == null) {
    return null;
  }
  if (!ikUrlOk(env, v)) {
    bad('Ảnh đại diện phải là ảnh đã tải lên hệ thống.');
  }
  return v;
};

export const ROLES = {
  owner: 'Chủ',
  manager: 'Quản lý',
  staff: 'Nhân viên tư vấn',
  viewer: 'Chỉ xem'
};
const R = 'r', RW = 'rw';
/* Nhóm chức năng (nhãn hiện trong trang phân quyền). "delete" là quyền riêng: xoá & thao tác hàng loạt. */
export const GROUP_LABELS = {
  overview: 'Tổng quan',
  bookings: 'Đơn đặt',
  chat: 'Tin nhắn',
  bot: 'Trả lời tự động',
  reviews: 'Đánh giá của khách (duyệt, trả lời, ẩn)',
  bugs: 'Báo lỗi website từ khách (xem, đổi trạng thái, xoá)',
  accounts: 'Tài khoản khách (tạo, sửa, khoá)',
  customers: 'Khách hàng',
  departures: 'Lịch khởi hành',
  destinations: 'Điểm đến (thêm, sửa, ẩn, đổi ảnh)',
  tours: 'Tour & giá',
  templates: 'Mẫu trả lời',
  reports: 'Báo cáo',
  activity: 'Nhật ký',
  admins: 'Quản trị viên & phân quyền',
  backup: 'Sao lưu dữ liệu',
  site: 'Cài đặt & giao diện website (thông tin, màu, banner, trang chủ)',
  layout: 'Menu điều hướng & các khối trang chủ (bật/tắt, sắp xếp)',
  content: 'Khối nội dung tự tạo & trang mới',
  email: 'Email thông báo (xem trạng thái, gửi thử)',
  security: 'Bảo mật: giới hạn giờ & IP truy cập trang quản trị',
  coupons: 'Mã giảm giá (tạo, sửa, bật / tắt)',
  dataio: 'Nhập / xuất dữ liệu hàng loạt (CSV, JSON)'
};
/* Quyền riêng dạng bật/tắt (chỉ có "được phép"). Tách khỏi nhóm để cấp từng việc nhạy cảm cho đúng người. */
export const FLAG_LABELS = {
  delete: 'Xoá và thao tác hàng loạt',
  export: 'Xuất dữ liệu ra file CSV / Excel',
  import: 'Nhập dữ liệu từ file CSV / JSON (thêm, cập nhật hàng loạt)',
  pii: 'Xem đầy đủ số điện thoại & email của khách',
  pricing: 'Tăng / giảm giá hàng loạt tất cả tour',
  vreview: 'Tạo đánh giá ảo',
  css: 'Chèn CSS tuỳ chỉnh vào website',
  maint: 'Bật chế độ bảo trì website'
};
const FLAGS = Object.keys(FLAG_LABELS);
const GROUPS = Object.keys(GROUP_LABELS);
// Mặc định theo vai trò: nhóm -> r (chỉ xem) | rw (xem và sửa). Quyền riêng (FLAGS): rw = được phép.
const MATRIX = {
  manager: {
    overview: R,
    bookings: RW,
    chat: RW,
    bot: RW,
    reviews: RW,
    bugs: RW,
    accounts: RW,
    customers: R,
    departures: R,
    destinations: RW,
    tours: RW,
    templates: RW,
    reports: R,
    activity: R,
    site: RW,
    layout: RW,
    content: RW,
    coupons: RW,
    dataio: RW,
    delete: RW,
    export: RW,
    pii: RW,
    pricing: RW,
    vreview: RW
  },
  staff: {
    coupons: R,
    overview: R,
    bookings: RW,
    chat: RW,
    bot: R,
    reviews: R,
    bugs: R,
    customers: R,
    departures: R,
    tours: R,
    templates: RW,
    pii: RW
  },
  viewer: {
    overview: R,
    bookings: R,
    reviews: R,
    customers: R,
    departures: R,
    tours: R,
    reports: R
  }
};
/* Quyền theo từng mục con. Mô hình "từ chối": mặc định một nhóm có quyền sửa thì làm được mọi việc con,
danh sách _deny liệt kê những việc con bị tắt. Nhờ vậy tài khoản và vai trò tạo trước đây giữ nguyên hành vi. */
export const SUBS = {
  'bookings.create': ['bookings', 'Đơn đặt: thêm đơn thủ công'],
  'bookings.edit': ['bookings', 'Đơn đặt: sửa thông tin, đổi trạng thái, ghi chú'],
  'bookings.bulk': ['bookings', 'Đơn đặt: thao tác hàng loạt'],
  'chat.reply': ['chat', 'Tin nhắn: gửi trả lời khách'],
  'chat.delete': ['chat', 'Tin nhắn: xoá tin nhắn'],
  'chat.session': ['chat', 'Tin nhắn: mở phiên mới, kết thúc / mở lại, đổi tên phiên'],
  'reviews.moderate': ['reviews', 'Đánh giá: duyệt, ẩn, trả lời'],
  'accounts.create': ['accounts', 'Tài khoản khách: tạo mới'],
  'accounts.edit': ['accounts', 'Tài khoản khách: sửa thông tin'],
  'accounts.lock': ['accounts', 'Tài khoản khách: khoá / mở khoá'],
  'accounts.verify': ['accounts', 'Tài khoản khách: xác minh và gửi lại email'],
  'tours.create': ['tours', 'Tour: thêm tour mới'],
  'tours.edit': ['tours', 'Tour: sửa nội dung và giá từng tour'],
  'destinations.create': ['destinations', 'Điểm đến: thêm mới'],
  'destinations.edit': ['destinations', 'Điểm đến: sửa, ẩn / hiện, sắp xếp'],
  'templates.create': ['templates', 'Mẫu trả lời: thêm mới'],
  'templates.edit': ['templates', 'Mẫu trả lời: sửa'],
  'content.blocks': ['content', 'Nội dung: khối trang chủ'],
  'content.pages': ['content', 'Nội dung: trang mới (/p/...)']
};
export const SUB_LABELS = Object.fromEntries(Object.entries(SUBS).map(([k, v]) => [k, { group: v[0], label: v[1] }]));
const SUB_KEYS = Object.keys(SUBS);
// [phương thức, đường dẫn, quyền con]. Chỉ áp dụng cho thao tác ghi.
const SUB_RULES = [
  ['POST', /^\/api\/admin\/bookings$/, 'bookings.create'],
  ['POST', /^\/api\/admin\/bookings\/bulk$/, 'bookings.bulk'],
  ['PATCH', /^\/api\/admin\/bookings\/\d+$/, 'bookings.edit'],
  ['POST', /^\/api\/admin\/conversations\/\d+$/, 'chat.reply'],
  ['DELETE', /^\/api\/admin\/conversations\/\d+\/messages\/\d+$/, 'chat.delete'],
  ['POST', /^\/api\/admin\/conversations$/, 'chat.session'],
  ['PATCH', /^\/api\/admin\/conversations\/\d+$/, 'chat.session'],
  ['DELETE', /^\/api\/admin\/conversations\/\d+$/, 'chat.delete'],
  ['PATCH', /^\/api\/admin\/reviews\/\d+$/, 'reviews.moderate'],
  ['POST', /^\/api\/admin\/accounts$/, 'accounts.create'],
  ['PATCH', /^\/api\/admin\/accounts\/\d+$/, 'accounts.edit'],
  ['POST', /^\/api\/admin\/accounts\/\d+\/(block|unblock)$/, 'accounts.lock'],
  ['POST', /^\/api\/admin\/accounts\/\d+\/(verify|resend)$/, 'accounts.verify'],
  ['POST', /^\/api\/admin\/tours$/, 'tours.create'],
  ['PATCH', /^\/api\/admin\/tours\/\d+$/, 'tours.edit'],
  ['POST', /^\/api\/admin\/destinations$/, 'destinations.create'],
  ['PATCH', /^\/api\/admin\/destinations\/\d+$/, 'destinations.edit'],
  ['POST', /^\/api\/admin\/destinations\/reorder$/, 'destinations.edit'],
  ['POST', /^\/api\/admin\/templates$/, 'templates.create'],
  ['PATCH', /^\/api\/admin\/templates\/\d+$/, 'templates.edit'],
  ['POST', /^\/api\/admin\/content-blocks$/, 'content.blocks'], ['PATCH', /^\/api\/admin\/content-blocks\/\d+$/, 'content.blocks'],
  ['POST', /^\/api\/admin\/pages$/, 'content.pages'], ['PATCH', /^\/api\/admin\/pages\/\d+$/, 'content.pages']
];
const subOf = (pathname, method) => {
  const r = SUB_RULES.find(x => x[0] === method && x[1].test(pathname));
  return r ? r[2] : null;
};

/* Vai trò tuỳ chỉnh: đặt tên tuỳ ý, lưu trong bảng custom_roles; tài khoản lưu role = "c" + id */
export const isCustomRole = r => /^c\d+$/.test(String(r || ''));
export async function customRoles(env) {
  const { results } = await env.DB.prepare('SELECT id, name, perms, updated_at FROM custom_roles ORDER BY id ASC').all();
  return results.map(r => ({
    key: 'c' + r.id,
    id: r.id,
    name: r.name,
    perms: parsePerms(r.perms) || {},
    updated_at: r.updated_at
  }));
}
export async function roleName(env, role) {
  if (ROLES[role]) {
    return ROLES[role];
  }
  if (!isCustomRole(role)) {
    return String(role || '');
  }
  const r = await env.DB.prepare('SELECT name FROM custom_roles WHERE id = ?1').bind(Number(role.slice(1))).first();
  return r ? r.name : 'Vai trò đã xoá';
}
/* Quyền thật của một tài khoản: quyền riêng (nếu có) > quyền của vai trò tuỳ chỉnh > mặc định theo vai trò */
export async function resolvePerms(env, a) {
  const own = parsePerms(a.perms);
  if (own || !isCustomRole(a.role)) {
    return permsOf(a.role, own);
  }
  const r = await env.DB.prepare('SELECT perms FROM custom_roles WHERE id = ?1').bind(Number(a.role.slice(1))).first();
  return permsOf(a.role, r ? (parsePerms(r.perms) || {}) : {}); // vai trò đã bị xoá: không còn quyền nào
}

export const roleDefaults = () => ({
  owner: permsOf('owner'),
  manager: permsOf('manager'),
  staff: permsOf('staff'),
  viewer: permsOf('viewer')
});

/* Làm sạch bảng quyền do người dùng gửi lên: chỉ nhận nhóm hợp lệ (r / rw) và quyền riêng (chỉ rw) */
export function cleanPerms(o) {
  if (!o || typeof o !== 'object') {
    return null;
  }
  const out = {};
  for (const g of GROUPS) {
    const v = o[g];
    if (v === RW || v === R) {
      out[g] = v;
    }
  }
  for (const f of FLAGS) {
    if (o[f] === RW) {
      out[f] = RW;
    }
  }
  if (Array.isArray(o._deny)) {
    const d = [...new Set(o._deny.filter(k => SUB_KEYS.includes(k)))];
    if (d.length) {
      out._deny = d;
    }
  }
  return out;
}
/* Bảng quyền riêng lưu trước khi có khoá _v: nhóm "system" tách thành sao lưu + email, các quyền mới giữ nguyên hành vi cũ */
function upgradeLegacy(c) {
  if (c.system) {
    c.backup = c.backup || c.system;
    c.email = c.email || c.system;
  }
  delete c.system;
  if (c.bookings || c.accounts) {
    c.export = RW;
  }
  c.pii = RW;
  if (c.tours === RW) {
    c.pricing = RW;
  }
  if (c.reviews === RW) {
    c.vreview = RW;
  }
  return c;
}
export function packPerms(custom) {
  return custom ? JSON.stringify({ ...custom, _v: 5 }) : null;
}
export function parsePerms(raw) {
  try {
    if (!raw) {
      return null;
    }
    const o = JSON.parse(raw), ver = (o && Number(o._v)) || 0, legacy = ver < 2;
    if (legacy && o && typeof o === 'object' && o.system) {
      o.backup = o.system;
      o.email = o.system;
    }
    const c = cleanPerms(o);
    if (!c) {
      return c;
    }
    if (legacy) {
      upgradeLegacy(c);
    }
    if (ver < 3 && c.site && !c.layout) {
      c.layout = c.site;
    } // nhóm layout mới, người đang sửa được cài đặt website giữ nguyên quyền sửa menu/trang chủ
    if (ver < 4 && c.layout && !c.content) {
      c.content = c.layout;
    } // nhóm content mới kế thừa quyền layout
    if (ver < 5 && c.bookings && !c.coupons) {
      c.coupons = c.bookings;
    } // nhóm coupons mới kế thừa quyền đơn đặt
    return c;
  } catch {
    return null;
  }
}

/* custom (nếu có) thay thế hẳn bảng quyền của vai trò; Chủ luôn có đủ quyền */
export function permsOf(role, custom) {
  if (role === 'owner') {
    return Object.fromEntries([...GROUPS, ...FLAGS].map(g => [g, RW]));
  }
  if (custom && typeof custom === 'object') {
    return { ...custom };
  }
  return { ...(MATRIX[role] || {}) };
}

export function groupOf(p) {
  if (p === '/api/admin/me' || p.startsWith('/api/admin/mfa/')) {
    return null; // việc của chính tài khoản đang đăng nhập
  }
  if (p.startsWith('/api/admin/admins') || p.startsWith('/api/admin/roles')) {
    return 'admins';
  }
  if (p.startsWith('/api/admin/accounts')) {
    return 'accounts';
  }
  if (p === '/api/admin/review-count' || p.startsWith('/api/admin/reviews')) {
    return 'reviews';
  }
  if (p === '/api/admin/inbox' || p.startsWith('/api/admin/inbox/')) {
    return 'chat';
  }
  if (p === '/api/admin/bug-count' || p.startsWith('/api/admin/bugs')) {
    return 'bugs';
  }
  if (p === '/api/admin/chat-unread' || p.startsWith('/api/admin/conversations')) {
    return 'chat';
  }
  if (p.startsWith('/api/admin/faq')) {
    return 'bot';
  }
  if (p.startsWith('/api/admin/tours') || p === '/api/admin/imagekit') {
    return 'tours';
  }
  if (p.startsWith('/api/admin/templates')) {
    return 'templates';
  }
  if (p.startsWith('/api/admin/report')) {
    return 'reports';
  }
  if (p === '/api/admin/stats') {
    return 'overview';
  }
  if (p.startsWith('/api/admin/bookings') || p === '/api/admin/export.csv' || p === '/api/admin/export.xlsx') {
    return 'bookings';
  }
  if (p === '/api/admin/customers' || p === '/api/admin/customers.xlsx') {
    return 'customers';
  }
  if (p === '/api/admin/departures') {
    return 'departures';
  }
  if (p === '/api/admin/activity' || p === '/api/admin/activity.xlsx') {
    return 'activity';
  }
  if (p === '/api/admin/access') {
    return 'security';
  }
  if (p === '/api/admin/site') {
    return 'site';
  }
  if (p === '/api/admin/layout') {
    return 'layout';
  }
  if (p.startsWith('/api/admin/content-blocks') || p.startsWith('/api/admin/pages')) {
    return 'content';
  }
  if (p.startsWith('/api/admin/destinations')) {
    return 'destinations';
  }
  if (p === '/api/admin/backup.json') {
    return 'backup';
  }
  if (p.startsWith('/api/admin/coupons')) {
    return 'coupons';
  }
  if (p.startsWith('/api/admin/data/')) {
    return 'dataio';
  }
  if (p === '/api/admin/email-test' || p === '/api/admin/email-status' || p.startsWith('/api/admin/email-templates')) {
    return 'email';
  }
  return '_none'; // đường dẫn lạ: không nhóm nào có quyền
}

/* Đường dẫn cần thêm quyền riêng (ngoài quyền của nhóm). Xuất CSV có cả thông tin liên hệ nên cần cả "export" lẫn "pii". */
const NEEDS = [
  [/^\/api\/admin\/export\.(csv|xlsx)$/, ['export', 'pii']],
  [/^\/api\/admin\/accounts\.(csv|xlsx)$/, ['export', 'pii']],
  [/^\/api\/admin\/customers\.xlsx$/, ['export', 'pii']],
  [/^\/api\/admin\/activity\.xlsx$/, ['export']],
  [/^\/api\/admin\/data\/export$/, ['export']],
  [/^\/api\/admin\/data\/import$/, ['import']],
  [/^\/api\/admin\/tours\/price-adjust$/, ['pricing']],
  [/^\/api\/admin\/reviews\/virtual$/, ['vreview']]
];

export function authorize(role, pathname, method, perms) {
  const g = groupOf(pathname);
  if (g === null) {
    return true;
  }
  const mine = perms || permsOf(role);
  // Tải ảnh lên ImageKit: ai được sửa tour, điểm đến hoặc cài đặt website đều dùng được
  if (pathname === '/api/admin/imagekit') {
    return ['tours', 'destinations', 'site', 'content'].some(k => mine[k] === RW);
  }
  const have = mine[g];
  if (!have) {
    return false;
  }
  const write = method !== 'GET' || pathname === '/api/admin/imagekit';
  if (write && have !== RW) {
    return false;
  }
  // Xoá và thao tác hàng loạt cần quyền "delete" (mẫu trả lời, trả lời tự động và quản trị viên có quyền sửa là đủ)
  if (write && !['templates', 'bot', 'admins'].includes(g) && (method === 'DELETE' || pathname.endsWith('/bookings/bulk')) && mine.delete !== RW) {
    return false;
  }
  if (write) {
    const sub = subOf(pathname, method);
    if (sub && (mine._deny || []).includes(sub)) {
      return false;
    }
  }
  for (const [re, need] of NEEDS) {
    if (re.test(pathname) && !need.every(f => mine[f] === RW)) {
      return false;
    }
  }
  return true;
}

/* Không có quyền "pii": che số điện thoại và email trong dữ liệu trả về (xem cuối file worker.js) */
const maskPhone = v => {
  const d = String(v || '');
  return d.length > 3 ? '•'.repeat(Math.max(3, d.length - 3)) + d.slice(-3) : d;
};
const maskEmail = v => {
  const s = String(v || ''), i = s.indexOf('@');
  return i < 1 ? s : s[0] + '•••' + s.slice(i);
};
export function maskPII(x) {
  if (Array.isArray(x)) {
    return x.map(maskPII);
  }
  if (x && typeof x === 'object') {
    const o = {};
    for (const [k, v] of Object.entries(x)) {
      if (typeof v === 'string' && v && k === 'phone') {
        o[k] = maskPhone(v);
      } else if (typeof v === 'string' && v && k === 'email') {
        o[k] = maskEmail(v);
      } else {
        o[k] = maskPII(v);
      }
    }
    return o;
  }
  return x;
}
export const isMasked = v => typeof v === 'string' && v.includes('•');

export const ADMINS_SCHEMA = [
  'CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL, pass_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, last_login INTEGER, perms TEXT, sess_at INTEGER, access TEXT, avatar TEXT)',
  'CREATE TABLE IF NOT EXISTS custom_roles (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, perms TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)'
];

const DUMMY = 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

export async function adminLogin(env, email, password) {
  const a = await env.DB.prepare('SELECT * FROM admins WHERE email = ?1').bind(email).first();
  const ok = await checkPassword(password, a ? a.pass_hash : DUMMY); // luôn băm một lần để thời gian không lộ email nào tồn tại
  if (!a || !ok || !a.active) {
    return null;
  }
  await env.DB.prepare('UPDATE admins SET last_login = ?1 WHERE id = ?2').bind(Date.now(), a.id).run();
  return a;
}

export async function adminById(env, id) {
  return env.DB.prepare('SELECT id, email, name, role, active, perms, sess_at, access, avatar FROM admins WHERE id = ?1').bind(id).first();
}

const permsFor = (a, cr) => {
  const own = parsePerms(a.perms);
  if (own || !isCustomRole(a.role)) {
    return permsOf(a.role, own);
  }
  const r = (cr || []).find(x => x.key === a.role);
  return permsOf(a.role, r ? r.perms : {});
};
const pub = (a, cr) => ({
  id: a.id,
  email: a.email,
  name: a.name,
  avatar: a.avatar || '',
  role: a.role,
  active: !!a.active,
  last_login: a.last_login,
  created_at: a.created_at,
  custom: parsePerms(a.perms),
  perms: permsFor(a, cr),
  access: parseAccount(a.access)
});
const NAME_RE = /^[^\u0000-\u001F]{2,40}$/;

/* Người cấp quyền không được cấp vượt quá quyền của chính mình */
function withinActor(actor, perms) {
  if (actor.role === 'owner') {
    return true;
  }
  const mine = actor.perms || {};
  if (!(mine._deny || []).every(d => (perms._deny || []).includes(d))) {
    return false;
  } // việc con người cấp quyền không làm được thì không cấp được
  return Object.entries(perms).filter(([g]) => g !== '_deny').every(([g, v]) => mine[g] === RW || (v === R && mine[g] === R));
}

export async function adminApi(request, env, url, h, actor) {
  const p = url.pathname, m = p.match(/^\/api\/admin\/admins\/(\d+)$/), db = env.DB;
  const bad = msg => {
    throw new h.HttpError(400, msg);
  };
  const isOwner = actor.role === 'owner';
  const roleOk = async (r) => ROLES[r] ? true : isCustomRole(r) && !!(await db.prepare('SELECT 1 FROM custom_roles WHERE id = ?1').bind(Number(r.slice(1))).first());
  const roleCustomPerms = async (r) => isCustomRole(r) ? ((await customRoles(env)).find(x => x.key === r) || { perms: {} }).perms : null;
  const ownerCount = async () => (await db.prepare("SELECT COUNT(*) AS n FROM admins WHERE role = 'owner' AND active = 1").first()).n;
  if (p === '/api/admin/admins' && request.method === 'GET') {
    const { results } = await db.prepare('SELECT * FROM admins ORDER BY id ASC').all(), cr = await customRoles(env);
    const defaults = roleDefaults();
    for (const r of cr) {
      defaults[r.key] = permsOf(r.key, r.perms);
    }
    const roles = { ...ROLES };
    for (const r of cr) {
      roles[r.key] = r.name;
    }
    return h.json({
      items: results.map(a => pub(a, cr)),
      roles,
      customRoles: cr.map(r => ({
        key: r.key,
        id: r.id,
        name: r.name,
        perms: r.perms,
        users: results.filter(a => a.role === r.key).length
      })),
      me: actor.id,
      groups: GROUP_LABELS,
      flags: FLAG_LABELS,
      subs: SUB_LABELS,
      defaults,
      actorRole: actor.role
    });
  }
  /* Vai trò tuỳ chỉnh: GET danh sách đã nằm ở /admins; ở đây thêm / sửa / xoá */
  const rm = p.match(/^\/api\/admin\/roles(?:\/(\d+))?$/);
  if (rm) {
    const rid = rm[1] ? Number(rm[1]) : null;
    if (!rid && request.method === 'POST') {
      const b = await h.readJson(request), name = h.clean(b.name, 40);
      if (!NAME_RE.test(name)) {
        bad('Tên vai trò từ 2 đến 40 ký tự.');
      }
      if (Object.values(ROLES).some(x => x.toLowerCase() === name.toLowerCase())) {
        bad('Tên này trùng với vai trò có sẵn.');
      }
      const perms = cleanPerms(b.perms) || {};
      if (!withinActor(actor, perms)) {
        throw new h.HttpError(403, 'Bạn không thể cấp quyền cao hơn quyền của chính mình.');
      }
      if (await db.prepare('SELECT 1 FROM custom_roles WHERE name = ?1 COLLATE NOCASE').bind(name).first()) {
        throw new h.HttpError(409, 'Đã có vai trò tên này.');
      }
      if ((await db.prepare('SELECT COUNT(*) AS n FROM custom_roles').first()).n >= 30) {
        bad('Tối đa 30 vai trò tuỳ chỉnh.');
      }
      const now = Date.now(), row = await db.prepare('INSERT INTO custom_roles (name, perms, created_at, updated_at) VALUES (?1,?2,?3,?3) RETURNING id').bind(name, packPerms(perms), now).first();
      await h.logAct(env, 'Thêm vai trò', name);
      return h.json({ item: {
          key: 'c' + row.id,
          id: row.id,
          name,
          perms
        } }, 201);
    }
    if (rid) {
      const old = await db.prepare('SELECT * FROM custom_roles WHERE id = ?1').bind(rid).first();
      if (!old) {
        throw new h.HttpError(404, 'Không tìm thấy vai trò.');
      }
      const key = 'c' + rid, oldPerms = parsePerms(old.perms) || {};
      if (!isOwner && !withinActor(actor, oldPerms)) {
        throw new h.HttpError(403, 'Vai trò này có quyền cao hơn quyền của bạn nên bạn không sửa được.');
      }
      if (actor.role === key) {
        throw new h.HttpError(400, 'Bạn không thể sửa vai trò đang dùng của chính mình.');
      }
      if (request.method === 'DELETE') {
        const n = (await db.prepare('SELECT COUNT(*) AS n FROM admins WHERE role = ?1').bind(key).first()).n;
        if (n) {
          bad(`Còn ${n} tài khoản đang dùng vai trò này. Hãy đổi vai trò của họ trước.`);
        }
        await db.prepare('DELETE FROM custom_roles WHERE id = ?1').bind(rid).run();
        await h.logAct(env, 'Xoá vai trò', old.name);
        return h.json({ ok: true });
      }
      if (request.method === 'PATCH') {
        const b = await h.readJson(request), sets = [], args = [];
        if ('name' in b) {
          const name = h.clean(b.name, 40);
          if (!NAME_RE.test(name)) {
            bad('Tên vai trò từ 2 đến 40 ký tự.');
          }
          if (Object.values(ROLES).some(x => x.toLowerCase() === name.toLowerCase())) {
            bad('Tên này trùng với vai trò có sẵn.');
          }
          if (await db.prepare('SELECT 1 FROM custom_roles WHERE name = ?1 COLLATE NOCASE AND id <> ?2').bind(name, rid).first()) {
            throw new h.HttpError(409, 'Đã có vai trò tên này.');
          }
          sets.push('name = ?');
          args.push(name);
        }
        if ('perms' in b) {
          const perms = cleanPerms(b.perms) || {};
          if (!withinActor(actor, perms)) {
            throw new h.HttpError(403, 'Bạn không thể cấp quyền cao hơn quyền của chính mình.');
          }
          sets.push('perms = ?');
          args.push(packPerms(perms));
        }
        if (!sets.length) {
          bad('Không có gì để cập nhật.');
        }
        sets.push('updated_at = ?');
        args.push(Date.now());
        await db.prepare(`UPDATE custom_roles SET ${sets.join(', ')} WHERE id = ?`).bind(...args, rid).run();
        await h.logAct(env, 'Sửa vai trò', old.name + ('name' in b ? ' → ' + h.clean(b.name, 40) : '') +
          ('perms' in b ? ' · đổi phân quyền' : ''));
        return h.json({ ok: true });
      }
    }
    throw new h.HttpError(404, 'Không tìm thấy.');
  }
  if (p === '/api/admin/admins' && request.method === 'POST') {
    const b = await h.readJson(request);
    const email = h.clean(b.email, 254).toLowerCase(), name = h.clean(b.name, 60), role = String(b.role || '');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      bad('Email không hợp lệ.');
    }
    if (name.length < 2) {
      bad('Vui lòng nhập tên.');
    }
    if (!(await roleOk(role))) {
      bad('Vai trò không hợp lệ.');
    }
    if (isCustomRole(role) && !withinActor(actor, await roleCustomPerms(role))) {
      throw new h.HttpError(403, 'Vai trò này có quyền cao hơn quyền của bạn.');
    }
    if (role === 'owner' && !isOwner) {
      throw new h.HttpError(403, 'Chỉ Chủ mới tạo được tài khoản Chủ.');
    }
    const custom = role === 'owner' ? null : cleanPerms(b.perms);
    if (custom && !withinActor(actor, custom)) {
      throw new h.HttpError(403, 'Bạn không thể cấp quyền cao hơn quyền của chính mình.');
    }
    const pw = String(b.password || '');
    if (pw.length < MIN_PASS || pw.length > MAX_PASS) {
      bad(`Mật khẩu từ ${MIN_PASS} đến ${MAX_PASS} ký tự.`);
    }
    if (await db.prepare('SELECT 1 FROM admins WHERE email = ?1').bind(email).first()) {
      throw new h.HttpError(409, 'Email này đã có tài khoản quản trị.');
    }
    const acc = cleanAccount(b.access, bad);
    const row = await db.prepare('INSERT INTO admins (email, name, role, pass_hash, active, created_at, perms, access, avatar) VALUES (?1,?2,?3,?4,1,?5,?6,?7,?8) RETURNING *').bind(email, name, role, await hashPassword(pw), Date.now(), packPerms(custom), acc ? JSON.stringify(acc) : null, vAvatar(env, b.avatar, bad)).first();
    await h.logAct(env, 'Thêm quản trị viên', `${name} (${await roleName(env, role)}${custom ? ', quyền tuỳ chỉnh' : ''})`);
    return h.json({ item: pub(row, await customRoles(env)) }, 201);
  }
  if (m) {
    const id = Number(m[1]), old = await db.prepare('SELECT * FROM admins WHERE id = ?1').bind(id).first();
    if (!old) {
      throw new h.HttpError(404, 'Không tìm thấy tài khoản.');
    }
    if (old.role === 'owner' && !isOwner) {
      throw new h.HttpError(403, 'Chỉ Chủ mới sửa được tài khoản Chủ.');
    }
    if (request.method === 'DELETE') {
      if (id === actor.id) {
        throw new h.HttpError(400, 'Bạn không thể tự xoá tài khoản của mình.');
      }
      if (old.role === 'owner' && old.active && (await ownerCount()) <= 1) {
        throw new h.HttpError(400, 'Phải còn ít nhất một tài khoản Chủ.');
      }
      await db.prepare('DELETE FROM admins WHERE id = ?1').bind(id).run();
      await db.batch(mfaWipe(env, 'admin', id));
      await h.logAct(env, 'Xoá quản trị viên', old.name);
      return h.json({ ok: true });
    }
    if (request.method === 'PATCH') {
      const b = await h.readJson(request), sets = [], args = [], self = id === actor.id;
      if (b.reset_mfa) { // quản trị viên mất điện thoại / passkey: Chủ gỡ xác thực hai lớp để họ đăng nhập lại bằng mật khẩu
        if (!isOwner) {
          throw new h.HttpError(403, 'Chỉ Chủ mới đặt lại xác thực hai lớp.');
        }
        await db.batch(mfaWipe(env, 'admin', id));
        await h.logAct(env, 'Đặt lại xác thực hai lớp', old.name);
        return h.json({ ok: true });
      }
      if ('name' in b) {
        const v = h.clean(b.name, 60);
        if (v.length < 2) {
          bad('Vui lòng nhập tên.');
        }
        sets.push('name = ?');
        args.push(v);
      }
      if ('role' in b && b.role !== old.role) {
        if (self) {
          bad('Bạn không thể tự đổi vai trò của mình.');
        }
        if (!(await roleOk(b.role))) {
          bad('Vai trò không hợp lệ.');
        }
        if (isCustomRole(b.role) && !withinActor(actor, await roleCustomPerms(b.role))) {
          throw new h.HttpError(403, 'Vai trò này có quyền cao hơn quyền của bạn.');
        }
        if (b.role === 'owner' && !isOwner) {
          throw new h.HttpError(403, 'Chỉ Chủ mới cấp được vai trò Chủ.');
        }
        if (old.role === 'owner' && old.active && (await ownerCount()) <= 1) {
          throw new h.HttpError(400, 'Phải còn ít nhất một tài khoản Chủ.');
        }
        sets.push('role = ?');
        args.push(b.role);
      }
      if ('perms' in b) {
        if (self) {
          bad('Bạn không thể tự đổi quyền của mình.');
        }
        const custom = cleanPerms(b.perms);
        if (custom && !withinActor(actor, custom)) {
          throw new h.HttpError(403, 'Bạn không thể cấp quyền cao hơn quyền của chính mình.');
        }
        sets.push('perms = ?');
        args.push(packPerms(custom));
      }
      if ('access' in b) { // giới hạn IP / giờ riêng cho tài khoản này
        if (self) {
          bad('Bạn không thể tự đổi giới hạn truy cập của mình.');
        }
        sets.push('access = ?');
        args.push((a => a ? JSON.stringify(a) : null)(cleanAccount(b.access, bad)));
      }
      if ('active' in b) {
        if (self && !b.active) {
          bad('Bạn không thể tự khoá tài khoản của mình.');
        }
        if (!b.active && old.role === 'owner' && old.active && (await ownerCount()) <= 1) {
          throw new h.HttpError(400, 'Phải còn ít nhất một tài khoản Chủ đang hoạt động.');
        }
        sets.push('active = ?');
        args.push(b.active ? 1 : 0);
      }
      if ('avatar' in b) {
        sets.push('avatar = ?');
        args.push(vAvatar(env, b.avatar, bad));
      }
      if (b.password) {
        const pw = String(b.password);
        if (pw.length < MIN_PASS || pw.length > MAX_PASS) {
          bad(`Mật khẩu từ ${MIN_PASS} đến ${MAX_PASS} ký tự.`);
        }
        sets.push('pass_hash = ?');
        args.push(await hashPassword(pw));
        sets.push('sess_at = ?');
        args.push(Date.now());
      }
      if (b.logout_all && !b.password) {
        if (self) {
          bad('Hãy dùng nút Đăng xuất để thoát tài khoản của bạn.');
        }
        sets.push('sess_at = ?');
        args.push(Date.now());
      }
      if (!sets.length) {
        bad('Không có gì để cập nhật.');
      }
      const row = await db.prepare(`UPDATE admins SET ${sets.join(', ')} WHERE id = ? RETURNING *`).bind(...args, id).first();
      await h.logAct(env, 'Sửa quản trị viên', `${old.name}${'role' in b && b.role !== old.role ? ' → ' + await roleName(env, b.role) : ''}${'perms' in b ? ' · đổi phân quyền' : ''}${'access' in b ? ' · đổi giới hạn truy cập' : ''}${'active' in b ? (b.active ? ' · bật' : ' · khoá') : ''}${b.password ? ' · đổi mật khẩu' : ''}${b.logout_all ? ' · đăng xuất mọi thiết bị' : ''}`);
      return h.json({ item: pub(row, await customRoles(env)) });
    }
  }
  throw new h.HttpError(404, 'Không tìm thấy.');
}
