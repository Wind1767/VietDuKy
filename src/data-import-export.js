/* nhập / xuất dữ liệu hàng loạt (đơn đặt, tour & giá, mã giảm giá) bằng CSV hoặc JSON.
Nhập luôn chạy "kiểm tra trước" (dry) rồi mới ghi. File CSV xuất ra nhập lại được nguyên vẹn. */
import { slugify } from './tours.js';
import { normCode, cleanCoupon } from './coupons.js';
import { xlsxResponse } from './xlsx.js';

const TZ = 7 * 3600 * 1000, MAX_ROWS = 600, CHUNK = 50;
const STAT = {
  new: 'Mới',
  called: 'Đã gọi',
  won: 'Đã chốt',
  cancelled: 'Huỷ'
};
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '');
const fmtTime = ms => new Date(Number(ms) + TZ).toISOString().replace('T', ' ').slice(0, 16);

/* cols: [khoá, tiêu đề cột trong file]. Khi nhập, tiêu đề được so khớp không phân biệt dấu / hoa thường, nhận cả khoá. */
const KINDS = {
  bookings: {
    label: 'Đơn đặt',
    file: 'don-dat-tour',
    pii: true,
    cols: [['id', 'Mã'], ['created_at', 'Thời gian gửi'], ['name', 'Họ tên'], ['phone', 'SĐT'], ['destination', 'Điểm đến'], ['depart_date', 'Ngày đi'], ['people', 'Số người'], ['message', 'Lời nhắn'], ['status', 'Trạng thái'], ['note', 'Ghi chú'], ['amount', 'Doanh thu'], ['coupon', 'Mã giảm giá'], ['discount', 'Giảm giá']],
    sql: 'SELECT * FROM bookings ORDER BY id ASC LIMIT 20000',
    sample: {
      name: 'Nguyễn Văn An',
      phone: '0912345678',
      destination: 'Hội An',
      depart_date: '2026-12-20',
      people: 2,
      status: 'new',
      message: 'Cần xe đưa đón',
      note: ''
    }
  },
  tours: {
    label: 'Tour & giá',
    file: 'tour-gia',
    cols: [['slug', 'Mã tour'], ['name', 'Tên tour'], ['price', 'Giá'], ['old_price', 'Giá cũ'], ['duration', 'Thời lượng'], ['group_note', 'Nhóm'], ['badge', 'Nhãn'], ['destination', 'Điểm đến'], ['active', 'Hiển thị']],
    sql: 'SELECT slug, name, price, old_price, duration, group_note, badge, destination, active FROM tours ORDER BY sort ASC, id ASC',
    sample: {
      name: 'Hội An 3 ngày 2 đêm',
      price: 3500000,
      old_price: 4000000,
      duration: '3 ngày 2 đêm',
      group_note: '2–10 khách',
      badge: 'Bán chạy',
      destination: 'Hội An',
      active: 1
    }
  },
  coupons: {
    label: 'Mã giảm giá',
    file: 'ma-giam-gia',
    cols: [['code', 'Mã'], ['kind', 'Loại'], ['value', 'Giá trị'], ['min_people', 'Số người tối thiểu'], ['max_uses', 'Lượt tối đa'], ['used', 'Đã dùng'], ['start_date', 'Từ ngày'], ['end_date', 'Đến ngày'], ['destination', 'Điểm đến'], ['active', 'Đang bật'], ['note', 'Ghi chú']],
    sql: 'SELECT code, kind, value, min_people, max_uses, used, start_date, end_date, destination, active, note FROM coupons ORDER BY id ASC',
    sample: {
      code: 'HE2026',
      kind: 'percent',
      value: 10,
      min_people: 2,
      max_uses: 100,
      start_date: '2026-12-01',
      end_date: '2026-12-31',
      destination: '',
      active: 1,
      note: 'Khuyến mãi mùa đông'
    }
  }
};
const lookup = k => Object.fromEntries(KINDS[k].cols.flatMap(([key, label]) => [[norm(key), key], [norm(label), key]]));

const csvCell = v => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) {
    s = "'" + s;
  }
  return '"' + s.replace(/"/g, '""') + '"';
};
const unquote = s => typeof s === 'string' ? s.replace(/^'(?=[=+\-@\t\r])/, '') : s;
const cellOf = (key, v) => key === 'created_at' ? (v ? fmtTime(v) : '') : key === 'status' ? (STAT[v] || v || '') : v;

/* ---------- Xuất ---------- */
/* Ô Excel: số giữ là số (trừ cột thời gian), còn lại dùng cùng cách hiển thị với CSV (ngày giờ, trạng thái tiếng Việt) */
const xcell = (key, v) => (typeof v === 'number' && key !== 'created_at' ? v : cellOf(key, v));
const xrows = (k, rows) => [k.cols.map(c => c[1])].concat(rows.map(r => k.cols.map(([key]) => xcell(key, r[key]))));

/* Xuất tất cả vào một file Excel nhiều sheet. Sheet đơn đặt chỉ có khi người dùng có quyền xem đầy đủ SĐT & email */
async function exportAll(env, h, actor) {
  const sheets = [];
  for (const k of Object.values(KINDS)) {
    if (k.pii && (actor.perms || {}).pii !== 'rw') {
      continue;
    }
    sheets.push({ name: k.label, rows: xrows(k, (await env.DB.prepare(k.sql).all()).results) });
  }
  await h.logAct(env, 'Xuất dữ liệu', `Tất cả (Excel nhiều sheet: ${sheets.map(s => s.name).join(', ')})`);
  return xlsxResponse(sheets, 'viet-du-ky-' + new Date(Date.now() + TZ).toISOString().slice(0, 10));
}

async function exportData(url, env, h, actor) {
  const name = url.searchParams.get('kind'), k = KINDS[name];
  if (name === 'all' && url.searchParams.get('format') === 'xlsx') {
    return exportAll(env, h, actor);
  }
  if (!k) {
    throw new h.HttpError(400, 'Loại dữ liệu không hợp lệ.');
  }
  if (k.pii && (actor.perms || {}).pii !== 'rw') {
    throw new h.HttpError(403, 'Xuất đơn đặt cần quyền xem đầy đủ SĐT & email.');
  }
  const fmtQ = url.searchParams.get('format'), xlsx = fmtQ === 'xlsx', json = fmtQ === 'json', tpl = url.searchParams.get('template') === '1';
  const rows = tpl ? [k.sample] : (await env.DB.prepare(k.sql).all()).results;
  if (!tpl) {
    await h.logAct(env, 'Xuất dữ liệu', `${k.label}: ${rows.length} dòng (${json ? 'JSON' : xlsx ? 'Excel' : 'CSV'})`);
  }
  const day = new Date(Date.now() + TZ).toISOString().slice(0, 10), base = k.file + (tpl ? '-mau' : '-' + day);
  if (xlsx) {
    return xlsxResponse([{ name: k.label, rows: xrows(k, rows) }], base);
  }
  const head = { 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="${base}.${json ? 'json' : 'csv'}"` };
  if (json) {
    return new Response(JSON.stringify(rows, null, 2), { headers: { ...head, 'Content-Type': 'application/json; charset=utf-8' } });
  }
  const lines = [k.cols.map(c => csvCell(c[1])).join(',')].concat(rows.map(r => k.cols.map(([key]) => csvCell(cellOf(key, r[key]))).join(',')));
  return new Response('﻿' + lines.join('\r\n'), { headers: { ...head, 'Content-Type': 'text/csv; charset=utf-8' } });
}

/* ---------- Nhập ---------- */
const toInt = v => {
  if (v === '' || v == null) {
    return null;
  }
  const n = Number(String(v).replace(/[.,\s₫đ]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};
const toBool = v => !/^(0|false|khong|no|an|tat|off)$/i.test(String(v ?? '1').trim());
const isoDate = v => {
  const s = String(v ?? '').trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : s.slice(0, 10);
};
function toMs(v) {
  const s = String(v ?? '').trim();
  if (!s) {
    return null;
  }
  if (/^\d{11,}$/.test(s)) {
    return Number(s);
  }
  const m = s.match(/^(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (!m) {
    return NaN;
  }
  const t = Date.parse(`${isoDate(m[1])}T${(m[2] || '00').padStart(2, '0')}:${m[3] || '00'}:00Z`);
  return Number.isNaN(t) ? NaN : t - TZ;
}
const statusOf = v => {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) {
    return 'new';
  }
  if (STAT[s]) {
    return s;
  }
  const f = Object.entries(STAT).find(([, l]) => l.toLowerCase() === s);
  return f ? f[0] : null;
};
const batchRun = async (env, stmts) => {
  for (let i = 0; i < stmts.length; i += CHUNK) {
    await env.DB.batch(stmts.slice(i, i + CHUNK));
  }
};

const IMPORT = {
  async bookings(env, h, rows, apply, out) {
    const have = new Set((await env.DB.prepare("SELECT phone || '|' || COALESCE(destination,'') || '|' || COALESCE(depart_date,'') || '|' || COALESCE(people,0) AS k FROM bookings LIMIT 50000").all()).results.map(r => r.k));
    const stmts = [], now = Date.now();
    rows.forEach((r, i) => {
      try {
        const name = h.vName(r.name), phone = h.vPhone(r.phone), date = h.vDate(isoDate(r.depart_date)), people = h.vPeople(toInt(r.people));
        const status = statusOf(r.status);
        if (!status) {
          throw new h.HttpError(400, 'Trạng thái không hợp lệ (Mới / Đã gọi / Đã chốt / Huỷ).');
        }
        const amount = toInt(r.amount), discount = toInt(r.discount), at = toMs(r.created_at);
        if ((amount != null && !(amount >= 0 && amount <= 1e10)) || (discount != null && !(discount >= 0 && discount <= 1e10))) {
          throw new h.HttpError(400, 'Doanh thu / giảm giá phải là số không âm.');
        }
        if (Number.isNaN(at)) {
          throw new h.HttpError(400, 'Thời gian gửi không đọc được (dùng YYYY-MM-DD HH:MM hoặc dd/mm/yyyy).');
        }
        const dest = h.clean(r.destination, 80) || null, key = [phone, dest || '', date || '', people || 0].join('|');
        if (have.has(key)) {
          out.skip++;
          return;
        }
        have.add(key);
        out.add++;
        const t = at || now;
        stmts.push(env.DB.prepare("INSERT INTO bookings (created_at, updated_at, name, phone, destination, depart_date, people, message, source, status, note, amount, coupon, discount) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'admin',?9,?10,?11,?12,?13)")
          .bind(t, now, name, phone, dest, date, people, h.clean(r.message, 1000) || null, status, h.clean(r.note, 2000), amount, normCode(r.coupon) || null, discount));
      } catch (e) {
        out.errors.push({ row: out.offset + i + 2, msg: e.message });
      }
    });
    if (apply) {
      await batchRun(env, stmts);
    }
  },
  async tours(env, h, rows, apply, out) {
    const have = new Set((await env.DB.prepare('SELECT slug FROM tours').all()).results.map(r => r.slug));
    let sort = ((await env.DB.prepare('SELECT MAX(sort) AS m FROM tours').first()) || {}).m || 0;
    const stmts = [], now = Date.now(), seen = new Set();
    rows.forEach((r, i) => {
      try {
        const name = h.clean(r.name, 80);
        if (name.length < 2) {
          throw new h.HttpError(400, 'Thiếu tên tour.');
        }
        const slug = slugify(h.clean(r.slug, 60) || name);
        if (!slug) {
          throw new h.HttpError(400, 'Tên tour không hợp lệ.');
        }
        if (seen.has(slug)) {
          out.skip++;
          return;
        }
        seen.add(slug);
        const price = toInt(r.price), old = toInt(r.old_price);
        if (!(price >= 0 && price <= 1e10) || (old != null && !(old >= 0 && old <= 1e10))) {
          throw new h.HttpError(400, 'Giá phải là số nguyên không âm (đồng).');
        }
        const f = [name, price, old, h.clean(r.duration, 40), h.clean(r.group_note, 60), h.clean(r.badge, 30), h.clean(r.destination, 80) || null, toBool(r.active) ? 1 : 0];
        if (have.has(slug)) {
          out.update++;
          stmts.push(env.DB.prepare('UPDATE tours SET name=?1, price=?2, old_price=?3, duration=?4, group_note=?5, badge=?6, destination=?7, active=?8, updated_at=?9 WHERE slug=?10').bind(...f, now, slug));
        } else {
          out.add++;
          have.add(slug);
          stmts.push(env.DB.prepare('INSERT INTO tours (name, price, old_price, duration, group_note, badge, destination, active, slug, sort, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)').bind(...f, slug, ++sort, now));
        }
      } catch (e) {
        out.errors.push({ row: out.offset + i + 2, msg: e.message });
      }
    });
    if (apply) {
      await batchRun(env, stmts);
    }
  },
  async coupons(env, h, rows, apply, out) {
    const have = new Set((await env.DB.prepare('SELECT code FROM coupons').all()).results.map(r => r.code));
    const stmts = [], now = Date.now(), seen = new Set();
    rows.forEach((r, i) => {
      try {
        const kind = /%|percent|phan\s?tram/i.test(String(r.kind ?? '')) ? 'percent' : /amount|dong|đ|vnd|tien/i.test(String(r.kind ?? '')) ? 'amount' : '';
        const f = cleanCoupon({
          code: r.code,
          kind,
          value: toInt(r.value),
          min_people: toInt(r.min_people),
          max_uses: toInt(r.max_uses),
          start_date: isoDate(r.start_date),
          end_date: isoDate(r.end_date),
          destination: r.destination,
          active: toBool(r.active),
          note: r.note
        }, h);
        if (seen.has(f.code)) {
          out.skip++;
          return;
        }
        seen.add(f.code);
        const a = [f.kind, f.value, f.min_people, f.max_uses, f.start_date, f.end_date, f.destination, f.active, f.note, now];
        if (have.has(f.code)) {
          out.update++;
          stmts.push(env.DB.prepare('UPDATE coupons SET kind=?1, value=?2, min_people=?3, max_uses=?4, start_date=?5, end_date=?6, destination=?7, active=?8, note=?9, updated_at=?10 WHERE code=?11').bind(...a, f.code));
        } // giữ nguyên số lượt đã dùng
        else {
          out.add++;
          have.add(f.code);
          stmts.push(env.DB.prepare('INSERT INTO coupons (kind, value, min_people, max_uses, start_date, end_date, destination, active, note, updated_at, code, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?10)').bind(...a, f.code));
        }
      } catch (e) {
        out.errors.push({ row: out.offset + i + 2, msg: e.message });
      }
    });
    if (apply) {
      await batchRun(env, stmts);
    }
  }
};

async function importData(request, env, h) {
  const b = await h.readJson(request), name = b.kind, k = KINDS[name];
  if (!k) {
    throw new h.HttpError(400, 'Loại dữ liệu không hợp lệ.');
  }
  const raw = Array.isArray(b.rows) ? b.rows : [];
  if (!raw.length) {
    throw new h.HttpError(400, 'File không có dòng dữ liệu nào.');
  }
  if (raw.length > MAX_ROWS) {
    throw new h.HttpError(400, `Mỗi lần gửi tối đa ${MAX_ROWS} dòng.`);
  }
  const look = lookup(name), unknown = new Set(), rows = raw.map(o => {
    const r = {};
    for (const [key, v] of Object.entries(o && typeof o === 'object' ? o : {})) {
      const m = look[norm(key)];
      if (m) {
        r[m] = unquote(v);
      } else {
        unknown.add(key);
      }
    }
    return r;
  });
  const dry = b.dry !== false, offset = Math.max(0, Math.min(Number(b.offset) || 0, 1e6));
  const out = {
    add: 0,
    update: 0,
    skip: 0,
    errors: [],
    offset
  };
  await IMPORT[name](env, h, rows, !dry, out);
  if (!dry && (out.add || out.update)) {
    await h.logAct(env, 'Nhập dữ liệu', `${k.label}: thêm ${out.add}, cập nhật ${out.update}, bỏ qua ${out.skip}, lỗi ${out.errors.length}`);
  }
  return h.json({
    ok: true,
    dry,
    total: rows.length,
    add: out.add,
    update: out.update,
    skip: out.skip,
    errors: out.errors.slice(0, 30),
    errorCount: out.errors.length,
    unknown: [...unknown].slice(0, 10)
  });
}

export async function adminData(request, env, url, h, actor) {
  if (url.pathname === '/api/admin/data/export' && request.method === 'GET') {
    return exportData(url, env, h, actor);
  }
  if (url.pathname === '/api/admin/data/import' && request.method === 'POST') {
    return importData(request, env, h);
  }
  throw new h.HttpError(404, 'Không tìm thấy.');
}
