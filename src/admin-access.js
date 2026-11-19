/* Giới hạn truy cập trang quản trị theo IP và theo thời gian (giờ Việt Nam).
Áp dụng ở 2 tầng: chung cho cả trang quản trị, và riêng cho từng tài khoản (cả hai phải cùng cho phép).
Kiểm tra ở lúc đăng nhập VÀ ở mọi yêu cầu, nên hết giờ là phiên đang mở cũng bị cắt.
Cứu hộ khi bị khoá ngoài: đặt biến ACCESS_BYPASS = 1 trong Worker để tạm tắt mọi giới hạn. */
export const ACCESS_SCHEMA = [
  'CREATE TABLE IF NOT EXISTS access_settings (id INTEGER PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)'
];
const TZ_MS = 7 * 3600 * 1000;
const DAY_NAMES = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
export const defaultAccess = () => ({
  ip: { mode: 'off', list: [] },
  time: {
    on: false,
    days: [0, 1, 2, 3, 4, 5, 6],
    from: '08:00',
    to: '21:00'
  },
  owner_exempt: true
});

/* ---------- IP: IPv4 / IPv6, đơn lẻ hoặc dải CIDR ---------- */
function parseIp(s) {
  s = String(s || '').trim();
  let m = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const p = m.slice(1).map(Number);
    if (p.some(x => x > 255)) {
      return null;
    }
    return {
      v: 4,
      n: p.reduce((a, x) => (a << 8n) | BigInt(x), 0n),
      bits: 32
    };
  }
  if (!/^[0-9a-fA-F:.]+$/.test(s) || !s.includes(':')) {
    return null;
  }
  let head = s, tail = '';
  if (s.includes('::')) {
    if (s.split('::').length > 2) {
      return null;
    }
    [head, tail] = s.split('::');
  }
  const a = head ? head.split(':') : [], b = tail ? tail.split(':') : [];
  if (!s.includes('::') && a.length !== 8) {
    return null;
  }
  const fill = 8 - a.length - b.length;
  if (fill < 0 || (s.includes('::') && fill < 1)) {
    return null;
  }
  const parts = [...a, ...Array(s.includes('::') ? fill : 0).fill('0'), ...b];
  if (parts.length !== 8 || parts.some(x => !/^[0-9a-fA-F]{1,4}$/.test(x))) {
    return null;
  }
  return {
    v: 6,
    n: parts.reduce((acc, x) => (acc << 16n) | BigInt(parseInt(x, 16)), 0n),
    bits: 128
  };
}
/* "1.2.3.4", "1.2.3.0/24", "2001:db8::/32" → { v, n, len } hoặc null nếu sai */
export function parseRule(s) {
  s = String(s || '').trim();
  if (!s) {
    return null;
  }
  const [addr, l, extra] = s.split('/');
  if (extra !== undefined) {
    return null;
  }
  const ip = parseIp(addr);
  if (!ip) {
    return null;
  }
  let len = ip.bits;
  if (l !== undefined) {
    if (!/^\d{1,3}$/.test(l)) {
      return null;
    }
    len = Number(l);
    if (len > ip.bits) {
      return null;
    }
  }
  return {
    v: ip.v,
    n: ip.n,
    len,
    bits: ip.bits
  };
}
export function ipIn(ip, rules) {
  const x = parseIp(ip);
  if (!x) {
    return false;
  }
  return rules.some(r => {
    const q = parseRule(r);
    if (!q || q.v !== x.v) {
      return false;
    }
    const sh = BigInt(q.bits - q.len);
    return (x.n >> sh) === (q.n >> sh);
  });
}

/* ---------- Giờ ---------- */
const toMin = t => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(t || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
export function vnNow(now = Date.now()) {
  const d = new Date(now + TZ_MS);
  return {
    day: d.getUTCDay(),
    min: d.getUTCHours() * 60 + d.getUTCMinutes(),
    text: d.toISOString().slice(11, 16) + ' ' + DAY_NAMES[d.getUTCDay()]
  };
}
/* Cho phép nếu hôm nay nằm trong days và giờ nằm trong khoảng; khoảng qua đêm (22:00 → 06:00) tính cho ngày bắt đầu */
export function timeOk(t, now = Date.now()) {
  if (!t || !t.on) {
    return true;
  }
  const v = vnNow(now), f = toMin(t.from), e = toMin(t.to);
  if (f === null || e === null) {
    return true;
  }
  const days = t.days || [];
  if (f === e) {
    return days.includes(v.day);
  }
  if (f < e) {
    return days.includes(v.day) && v.min >= f && v.min < e;
  }
  if (v.min >= f) {
    return days.includes(v.day);
  }
  return days.includes((v.day + 6) % 7) && v.min < e;
}

/* ---------- Làm sạch dữ liệu gửi lên ---------- */
function cleanIpList(list, bad) {
  if (!Array.isArray(list)) {
    return [];
  }
  const out = [];
  for (const raw of list) {
    const s = String(raw || '').trim();
    if (!s) {
      continue;
    }
    if (!parseRule(s)) {
      bad(`“${s.slice(0, 50)}” không phải địa chỉ IP hoặc dải IP hợp lệ. Ví dụ: 203.0.113.5 hoặc 203.0.113.0/24.`);
    }
    if (!out.includes(s)) {
      out.push(s);
    }
  }
  if (out.length > 100) {
    bad('Tối đa 100 địa chỉ / dải IP.');
  }
  return out;
}
function cleanTime(t, bad) {
  t = t && typeof t === 'object' ? t : {};
  const days = [...new Set((Array.isArray(t.days) ? t.days : []).map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  const on = t.on === true || t.on === 1 || t.on === 'true';
  const from = String(t.from || '08:00'), to = String(t.to || '21:00');
  if (toMin(from) === null || toMin(to) === null) {
    bad('Giờ không hợp lệ. Dùng dạng 08:00.');
  }
  if (on && !days.length) {
    bad('Hãy chọn ít nhất một ngày trong tuần.');
  }
  return {
    on,
    days: days.length ? days : [0, 1, 2, 3, 4, 5, 6],
    from,
    to
  };
}
export function cleanAccess(b, bad) {
  b = b && typeof b === 'object' ? b : {};
  const mode = ['off', 'allow', 'deny'].includes(b.ip && b.ip.mode) ? b.ip.mode : 'off';
  const list = cleanIpList(b.ip && b.ip.list, bad);
  if (mode !== 'off' && !list.length) {
    bad('Hãy nhập ít nhất một địa chỉ IP, hoặc tắt giới hạn IP.');
  }
  return {
    ip: { mode, list },
    time: cleanTime(b.time, bad),
    owner_exempt: b.owner_exempt !== false
  };
}
/* Giới hạn riêng của một tài khoản: danh sách IP được phép (rỗng = không giới hạn) + khung giờ */
export function cleanAccount(b, bad) {
  if (b === null || b === undefined) {
    return null;
  }
  b = typeof b === 'object' ? b : {};
  const ip = cleanIpList(b.ip, bad), time = cleanTime(b.time, bad);
  if (!ip.length && !time.on) {
    return null;
  }
  return { ip, time };
}
export const parseAccount = raw => {
  try {
    const o = raw ? JSON.parse(raw) : null;
    return o && typeof o === 'object' ? { ip: Array.isArray(o.ip) ? o.ip : [], time: o.time || { on: false } } : null;
  } catch {
    return null;
  }
};

/* ---------- Đọc / lưu ---------- */
let cache = null;
export const dropAccessCache = () => {
  cache = null;
};
export async function getAccess(env) {
  if (cache && cache.at > Date.now() - 15000) {
    return cache.v;
  }
  const row = await env.DB.prepare('SELECT data FROM access_settings WHERE id = 1').first().catch(() => null);
  let v = defaultAccess();
  try {
    if (row) {
      const o = JSON.parse(row.data);
      v = {
        ip: { mode: o.ip && o.ip.mode || 'off', list: o.ip && o.ip.list || [] },
        time: { ...v.time, ...(o.time || {}) },
        owner_exempt: o.owner_exempt !== false
      };
    }
  } catch { /* dùng mặc định */
  }
  cache = { at: Date.now(), v };
  return v;
}

/* Trả về null nếu được phép, hoặc câu thông báo lý do bị chặn.
who: { role, access } của tài khoản (access = cột admins.access); phase 'pre' chỉ xét IP chung (trước khi biết ai đăng nhập) */
export async function checkAccess(env, ip, who, phase = 'full') {
  if (String(env.ACCESS_BYPASS || '') === '1') {
    return null;
  }
  const g = await getAccess(env);
  if (g.ip.mode === 'allow' && !ipIn(ip, g.ip.list)) {
    return 'Địa chỉ IP của bạn không được phép vào trang quản trị.';
  }
  if (g.ip.mode === 'deny' && ipIn(ip, g.ip.list)) {
    return 'Địa chỉ IP của bạn đã bị chặn khỏi trang quản trị.';
  }
  if (phase === 'pre' || !who) {
    return null;
  }
  const owner = who.role === 'owner';
  if (g.time.on && !(owner && g.owner_exempt) && !timeOk(g.time)) {
    return 'Hiện không nằm trong khung giờ được phép vào trang quản trị.';
  }
  const a = parseAccount(who.access);
  if (a) {
    if (a.ip.length && !ipIn(ip, a.ip)) {
      return 'Tài khoản này chỉ được đăng nhập từ các địa chỉ IP đã đăng ký.';
    }
    if (a.time && a.time.on && !timeOk(a.time)) {
      return 'Tài khoản này hiện nằm ngoài khung giờ được phép làm việc.';
    }
  }
  return null;
}
/* Kiểm tra trước khi lưu: người đang lưu không được tự khoá mình ngoài */
export function wouldLockOut(g, ip, role) {
  if (g.ip.mode === 'allow' && !ipIn(ip, g.ip.list)) {
    return `IP hiện tại của bạn (${ip}) chưa có trong danh sách được phép. Hãy thêm vào để không bị khoá ngoài.`;
  }
  if (g.ip.mode === 'deny' && ipIn(ip, g.ip.list)) {
    return `IP hiện tại của bạn (${ip}) đang nằm trong danh sách bị chặn.`;
  }
  if (g.time.on && !(role === 'owner' && g.owner_exempt) && !timeOk(g.time)) {
    return 'Bây giờ đang nằm ngoài khung giờ bạn vừa đặt, lưu xong bạn sẽ bị đăng xuất ngay. Hãy chỉnh khung giờ hoặc bật “Chủ không bị giới hạn giờ”.';
  }
  return null;
}

/* GET/PUT /api/admin/access */
export async function adminAccess(request, env, h, actor, ip) {
  const meta = async () => {
    const { results } = await env.DB.prepare("SELECT at, detail FROM admin_log WHERE action = 'Chặn truy cập' ORDER BY id DESC LIMIT 15").all();
    return {
      settings: await getAccess(env),
      myIp: ip,
      now: vnNow().text,
      bypass: String(env.ACCESS_BYPASS || '') === '1',
      blocked: results,
      days: DAY_NAMES
    };
  };
  if (request.method === 'GET') {
    return h.json(await meta());
  }
  if (request.method === 'PUT') {
    const b = await h.readJson(request), bad = m => {
      throw new h.HttpError(400, m);
    };
    const next = cleanAccess(b.settings, bad), why = wouldLockOut(next, ip, actor.role);
    if (why && b.force !== true) {
      throw new h.HttpError(400, why);
    }
    await env.DB.prepare('INSERT INTO access_settings (id, data, updated_at) VALUES (1, ?1, ?2) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at').bind(JSON.stringify(next), Date.now()).run();
    dropAccessCache();
    await h.logAct(env, 'Sửa giới hạn truy cập', `IP: ${next.ip.mode}${next.ip.list.length ? ' (' + next.ip.list.length + ')' : ''} · Giờ: ${next.time.on ? next.time.from + '–' + next.time.to : 'tắt'}`);
    return h.json(await meta());
  }
  throw new h.HttpError(405, 'Phương thức không hỗ trợ.');
}
