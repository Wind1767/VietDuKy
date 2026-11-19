/* mã giảm giá. Loại "percent" (giảm %) hoặc "amount" (giảm cố định trên mỗi đơn).
Khách nhập mã ở form đặt tour; máy chủ kiểm tra lại và trừ lượt dùng khi nhận đơn. */
import { estimateAmount } from './tours.js';

export const COUPON_SCHEMA = [
  'CREATE TABLE IF NOT EXISTS coupons (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, value INTEGER NOT NULL, min_people INTEGER NOT NULL DEFAULT 1, max_uses INTEGER, used INTEGER NOT NULL DEFAULT 0, start_date TEXT, end_date TEXT, destination TEXT, active INTEGER NOT NULL DEFAULT 1, note TEXT NOT NULL DEFAULT \'\', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)'
];

const today = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const money = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
export const normCode = v => String(v ?? '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 20);
export const couponLabel = c => c.kind === 'percent' ? `Giảm ${c.value}%` : `Giảm ${money(c.value)}đ`;
/* Số tiền giảm. Chưa biết giá gốc (thiếu điểm đến / số người): mã % trả null, mã cố định trả đúng số tiền. */
export const calcDiscount = (c, base) => {
  if (c.kind === 'amount') {
    return base ? Math.min(c.value, base) : c.value;
  }
  return base ? Math.floor(base * c.value / 100) : null;
};

/* Kiểm tra mã dùng được cho đơn này không; trả về { c, discount } hoặc ném lỗi 400 */
export async function checkCoupon(env, h, raw, { destination, people }) {
  const code = normCode(raw), bad = m => {
    throw new h.HttpError(400, m);
  };
  if (!code) {
    bad('Vui lòng nhập mã giảm giá.');
  }
  const c = await env.DB.prepare('SELECT * FROM coupons WHERE code = ?1').bind(code).first();
  if (!c || !c.active) {
    bad('Mã giảm giá không đúng hoặc đã ngừng áp dụng.');
  }
  const t = today();
  if (c.start_date && t < c.start_date) {
    bad('Mã chưa đến ngày áp dụng.');
  }
  if (c.end_date && t > c.end_date) {
    bad('Mã đã hết hạn.');
  }
  if (c.max_uses != null && c.used >= c.max_uses) {
    bad('Mã đã hết lượt sử dụng.');
  }
  if (c.destination && destination !== c.destination) {
    bad(`Mã chỉ áp dụng cho ${c.destination}.`);
  }
  if (c.min_people > 1 && !(people >= c.min_people)) {
    bad(`Mã áp dụng cho đơn từ ${c.min_people} người.`);
  }
  const base = await estimateAmount(env, { destination, people }).catch(() => null);
  return { c, discount: calcDiscount(c, base) };
}

/* Trừ một lượt dùng; cập nhật có điều kiện nên hai khách cùng lúc không vượt quá số lượt */
export async function redeem(env, h, c) {
  const r = await env.DB.prepare('UPDATE coupons SET used = used + 1 WHERE id = ?1 AND (max_uses IS NULL OR used < max_uses)').bind(c.id).run();
  if (!r.meta.changes) {
    throw new h.HttpError(400, 'Mã đã hết lượt sử dụng.');
  }
}

/* POST /api/coupon/check: khách bấm "Áp dụng" để xem trước mức giảm (chưa trừ lượt) */
export async function publicCouponCheck(request, env, h, ip) {
  await h.limit(env, 'coupon:' + ip, h.LIMITS.coupon);
  const b = await h.readJson(request);
  const people = b.people ? Number(b.people) : null;
  const { c, discount } = await checkCoupon(env, h, b.code, { destination: h.clean(b.destination, 80), people: Number.isInteger(people) ? people : null });
  return h.json({
    ok: true,
    code: c.code,
    label: couponLabel(c),
    discount
  });
}

/* ---------- Quản trị ---------- */
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export function cleanCoupon(b, h) {
  const bad = m => {
    throw new h.HttpError(400, m);
  }, int = (v, lo, hi, m) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < lo || n > hi) {
      bad(m);
    }
    return n;
  };
  const code = normCode(b.code);
  if (code.length < 3) {
    bad('Mã gồm 3–20 ký tự: chữ không dấu, số, gạch ngang.');
  }
  const kind = b.kind === 'amount' ? 'amount' : b.kind === 'percent' ? 'percent' : bad('Chọn loại giảm giá.');
  const value = kind === 'percent' ? int(b.value, 1, 100, 'Phần trăm giảm từ 1 đến 100.') : int(b.value, 1000, 1e9, 'Số tiền giảm tối thiểu 1.000đ.');
  const min_people = b.min_people === '' || b.min_people == null ? 1 : int(b.min_people, 1, 200, 'Số người tối thiểu từ 1 đến 200.');
  const max_uses = b.max_uses === '' || b.max_uses == null ? null : int(b.max_uses, 1, 1e6, 'Số lượt dùng tối đa từ 1 đến 1.000.000.');
  const date = (v, m) => {
    const s = h.clean(v, 10);
    if (s && !DATE.test(s)) {
      bad(m);
    }
    return s || null;
  };
  const start_date = date(b.start_date, 'Ngày bắt đầu không hợp lệ.'), end_date = date(b.end_date, 'Ngày kết thúc không hợp lệ.');
  if (start_date && end_date && start_date > end_date) {
    bad('Ngày kết thúc phải sau ngày bắt đầu.');
  }
  return {
    code,
    kind,
    value,
    min_people,
    max_uses,
    start_date,
    end_date,
    destination: h.clean(b.destination, 80) || null,
    active: b.active === false || b.active === 0 || b.active === '0' ? 0 : 1,
    note: h.clean(b.note, 200)
  };
}

export async function adminCoupons(request, env, url, h) {
  const m = url.pathname.match(/^\/api\/admin\/coupons(?:\/(\d+))?$/), method = request.method, id = m && m[1] ? Number(m[1]) : null;
  if (!m) {
    throw new h.HttpError(404, 'Không tìm thấy.');
  }
  const list = async () => ({ today: today(), items: (await env.DB.prepare('SELECT * FROM coupons ORDER BY active DESC, id DESC LIMIT 500').all()).results });
  if (!id && method === 'GET') {
    return h.json(await list());
  }
  if (!id && method === 'POST') {
    const f = cleanCoupon(await h.readJson(request), h), now = Date.now();
    try {
      await env.DB.prepare('INSERT INTO coupons (code, kind, value, min_people, max_uses, start_date, end_date, destination, active, note, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?11)')
        .bind(f.code, f.kind, f.value, f.min_people, f.max_uses, f.start_date, f.end_date, f.destination, f.active, f.note, now).run();
    } catch {
      throw new h.HttpError(409, 'Mã này đã tồn tại.');
    }
    await h.logAct(env, 'Tạo mã giảm giá', f.code);
    return h.json(await list(), 201);
  }
  if (id && method === 'PATCH') {
    const b = await h.readJson(request), old = await env.DB.prepare('SELECT * FROM coupons WHERE id = ?1').bind(id).first();
    if (!old) {
      throw new h.HttpError(404, 'Không tìm thấy mã này.');
    }
    if (Object.keys(b).length === 1 && 'active' in b) { // chỉ bật / tắt
      await env.DB.prepare('UPDATE coupons SET active = ?1, updated_at = ?2 WHERE id = ?3').bind(b.active ? 1 : 0, Date.now(), id).run();
      await h.logAct(env, (b.active ? 'Bật' : 'Tắt') + ' mã giảm giá', old.code);
      return h.json(await list());
    }
    const f = cleanCoupon(b, h);
    if (f.max_uses != null && f.max_uses < old.used) {
      throw new h.HttpError(400, `Mã đã dùng ${old.used} lượt, không đặt giới hạn thấp hơn.`);
    }
    try {
      await env.DB.prepare('UPDATE coupons SET code=?1, kind=?2, value=?3, min_people=?4, max_uses=?5, start_date=?6, end_date=?7, destination=?8, active=?9, note=?10, updated_at=?11 WHERE id=?12')
        .bind(f.code, f.kind, f.value, f.min_people, f.max_uses, f.start_date, f.end_date, f.destination, f.active, f.note, Date.now(), id).run();
    } catch {
      throw new h.HttpError(409, 'Mã này đã tồn tại.');
    }
    await h.logAct(env, 'Sửa mã giảm giá', f.code);
    return h.json(await list());
  }
  if (id && method === 'DELETE') {
    const old = await env.DB.prepare('SELECT code FROM coupons WHERE id = ?1').bind(id).first();
    if (!old) {
      throw new h.HttpError(404, 'Không tìm thấy mã này.');
    }
    await env.DB.prepare('DELETE FROM coupons WHERE id = ?1').bind(id).run(); // đơn cũ vẫn giữ mã và số tiền đã giảm
    await h.logAct(env, 'Xoá mã giảm giá', old.code);
    return h.json(await list());
  }
  throw new h.HttpError(405, 'Phương thức không hỗ trợ.');
}
