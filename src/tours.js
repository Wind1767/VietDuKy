/* Việt Du Ký – quản lý tour & giá, mẫu trả lời nhanh, báo cáo (dành cho admin) */
import { xlsxResponse } from './xlsx.js';
const TZ_S = 7 * 3600;
const DAY_MS = 86400000;

/* Dữ liệu mẫu nạp một lần duy nhất khi bảng còn trống (xem seedTours) */
const TOUR_SEED = [
	['du-thuyen-ha-long', 'Du thuyền Hạ Long', 2890000, null, '2 ngày 1 đêm', 'Từ 2 khách', 'Bán chạy', 'Vịnh Hạ Long', 1],
	['da-nang-hoi-an-hue', 'Đà Nẵng – Hội An – Huế', 5490000, 6100000, '4 ngày 3 đêm', 'Nhóm tối đa 15', 'Giảm 10%', 'Hội An', 2],
	['phu-quoc-nghi-duong', 'Phú Quốc nghỉ dưỡng', 4250000, null, '3 ngày 2 đêm', 'Từ 2 khách', 'Mới', 'Phú Quốc', 3]
];
const TEMPLATE_SEED = [
	['Chào khách mới', 'Chào {ten}, Việt Du Ký đã nhận được yêu cầu của bạn. Bạn dự định đi vào ngày nào và đi bao nhiêu người để mình tư vấn lịch trình phù hợp nhé?'],
	['Báo giá tham khảo', 'Dạ {ten}, giá tour {tour} hiện là {gia} / khách, đã gồm khách sạn, xe đưa đón, vé tham quan và bữa ăn theo chương trình. Bạn muốn mình giữ chỗ cho ngày nào ạ?'],
	['Xin SĐT để gọi tư vấn', 'Bạn để lại số điện thoại giúp mình, tư vấn viên sẽ gọi trong 30 phút (8:00 – 21:00 hằng ngày) để chốt lịch trình nhé.'],
	['Nhắc thanh toán cọc', 'Chào {ten}, để giữ chỗ chuyến đi bạn vui lòng đặt cọc 30% giá tour. Mình sẽ gửi thông tin chuyển khoản ngay khi bạn xác nhận nhé.'],
	['Cảm ơn sau chuyến đi', 'Cảm ơn {ten} đã đồng hành cùng Việt Du Ký! Nếu thấy hài lòng, bạn viết giúp mình vài dòng đánh giá trên website nhé, mình rất trân trọng.']
];

export const TOURS_SCHEMA = [
	'CREATE TABLE IF NOT EXISTS tours (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, price INTEGER NOT NULL DEFAULT 0, old_price INTEGER, duration TEXT NOT NULL DEFAULT \'\', group_note TEXT NOT NULL DEFAULT \'\', badge TEXT NOT NULL DEFAULT \'\', destination TEXT, active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)',
	'CREATE TABLE IF NOT EXISTS templates (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)',
	'CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)'
];

/* Chạy một lần sau khi tạo bảng: nạp 3 tour hiện có trên trang chủ và vài mẫu trả lời */
export async function seedTours(env) {
	const first = await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('seed5', '1') RETURNING key").first();
	if (!first) {
		return;
	}
	const now = Date.now();
	await env.DB.batch([
		...TOUR_SEED.map(t => env.DB.prepare('INSERT OR IGNORE INTO tours (slug, name, price, old_price, duration, group_note, badge, destination, sort, active, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,1,?10)').bind(...t, now)),
		...TEMPLATE_SEED.map((t, i) => env.DB.prepare('INSERT INTO templates (title, body, sort, updated_at) VALUES (?1, ?2, ?3, ?4)').bind(t[0], t[1], i +
			1, now))
	]);
}

/* Danh sách tour công khai cho trang chủ (chỉ tour đang bán) */
export async function publicTours(env, h) {
	const [t, r] = await Promise.all([
		env.DB.prepare('SELECT slug, name, price, old_price, duration, group_note, badge, destination, active, image, summary FROM tours ORDER BY sort ASC, id ASC').all(),
		env.DB.prepare("SELECT destination, COUNT(*) AS n, AVG(rating) AS a FROM reviews WHERE status = 'approved' AND destination IS NOT NULL AND destination <> '' GROUP BY destination").all().catch(() => ({ results: [] }))
	]);
	const by = {};
	for (const x of r.results) {
		by[x.destination] = x;
	}
	/* Đánh giá thật: gộp các đánh giá đã duyệt của điểm đến (hoặc tên tour) */
	const items = t.results.map(x => {
		const a = by[x.destination], b = x.name !== x.destination ? by[x.name] : null;
		const n = (a ? a.n : 0) + (b ? b.n : 0), sum = (a ? a.a * a.n : 0) + (b ? b.a * b.n : 0);
		return {
			...x,
			rating_count: n,
			rating_avg: n ? Math.round(sum / n * 10) / 10 : 0
		};
	});
	return h.json({ items }, 200, { 'Cache-Control': 'public, max-age=60' });
}

export const slugify = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const money = (n) => Number(n).toLocaleString('vi-VN') + 'đ';

function tourFields(b, h, partial) {
	const out = {};
	const bad = m => {
		throw new h.HttpError(400, m);
	};
	if (!partial || 'name' in b) {
		const v = h.clean(b.name, 80);
		if (v.length < 2) {
			bad('Vui lòng nhập tên tour.');
		}
		out.name = v;
	}
	if (!partial || 'price' in b) {
		const n = Number(b.price);
		if (!Number.isInteger(n) || n < 0 || n > 1e9) {
			bad('Giá phải là số nguyên từ 0 đến 1.000.000.000 (đồng).');
		}
		out.price = n;
	}
	if ('old_price' in b) {
		if (b.old_price === '' || b.old_price == null) {
			out.old_price = null;
		} else {
			const n = Number(b.old_price);
			if (!Number.isInteger(n) || n < 0 || n > 1e9) {
				bad('Giá gốc không hợp lệ.');
			}
			out.old_price = n;
		}
	}
	if ('duration' in b) {
		out.duration = h.clean(b.duration, 40);
	}
	if ('group_note' in b) {
		out.group_note = h.clean(b.group_note, 40);
	}
	if ('badge' in b) {
		out.badge = h.clean(b.badge, 20);
	}
	if ('destination' in b) {
		out.destination = h.vDest(b.destination);
	}
	if ('image' in b) {
		const v = String(b.image || '').trim().slice(0, 500);
		if (v && !/^https:\/\/ik\.imagekit\.io\/[^\s"'<>]+$/.test(v) && !/^images\/[\w.-]+$/.test(v)) {
			bad('Địa chỉ ảnh phải là ảnh ImageKit.');
		}
		out.image = v || null;
	}
	if ('summary' in b) {
		out.summary = h.clean(b.summary, 160);
	}
	if ('active' in b) {
		out.active = b.active ? 1 : 0;
	}
	return out;
}

async function tours(request, env, url, h) {
	const { pathname } = url, method = request.method;
	if (pathname === '/api/admin/tours' && method === 'GET') {
		const { results } = await env.DB.prepare('SELECT * FROM tours ORDER BY sort ASC, id ASC').all();
		return h.json({ items: results });
	}
	if (pathname === '/api/admin/tours' && method === 'POST') {
		const b = await h.readJson(request);
		const f = tourFields(b, h, false);
		const slug = slugify(h.clean(b.slug, 60) || f.name);
		if (!slug) {
			throw new h.HttpError(400, 'Tên tour không hợp lệ.');
		}
		if (await env.DB.prepare('SELECT 1 FROM tours WHERE slug = ?1').bind(slug).first()) {
			throw new h.HttpError(409, 'Đã có tour trùng tên/mã. Hãy đổi tên khác.');
		}
		const max = (await env.DB.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM tours').first()).m;
		const row = await env.DB.prepare('INSERT INTO tours (slug, name, price, old_price, duration, group_note, badge, destination, active, sort, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11) RETURNING *')
			.bind(slug, f.name, f.price, f.old_price ?? null, f.duration || '', f.group_note || '', f.badge || '', f.destination ?? null, f.active ?? 1, max +
			1, Date.now()).first();
		if (f.image || f.summary) {
			await env.DB.prepare('UPDATE tours SET image = ?1, summary = ?2 WHERE id = ?3').bind(f.image ?? null, f.summary ?? null, row.id).run();
			row.image = f.image ?? null;
			row.summary = f.summary ?? null;
		}
		await h.logAct(env, 'Thêm tour', f.name + ' · ' + money(f.price));
		return h.json(row, 201);
	}
	if (pathname === '/api/admin/tours/price-adjust' && method === 'POST') {
		const b = await h.readJson(request);
		const pct = Number(b.percent);
		if (!Number.isFinite(pct) || pct < -90 || pct > 200 || pct === 0) {
			throw new h.HttpError(400, 'Phần trăm phải khác 0 và nằm trong khoảng -90 đến 200.');
		}
		const { results } = await env.DB.prepare('SELECT id, price FROM tours').all();
		const now = Date.now();
		// làm tròn tới 10.000đ cho giá dễ nhớ
		await env.DB.batch(results.map(t => env.DB.prepare('UPDATE tours SET price = ?1, updated_at = ?2 WHERE id = ?3').bind(Math.max(0, Math.round(t.price * (1 +
			pct / 100) / 10000) * 10000), now, t.id)));
		await h.logAct(env, 'Đổi giá hàng loạt', (pct > 0 ? '+' : '') + pct + '% cho ' + results.length + ' tour');
		return h.json({ ok: true, changed: results.length });
	}
	const m = pathname.match(/^\/api\/admin\/tours\/(\d+)$/);
	if (m && method === 'PATCH') {
		const id = Number(m[1]);
		const b = await h.readJson(request);
		const old = await env.DB.prepare('SELECT * FROM tours WHERE id = ?1').bind(id).first();
		if (!old) {
			throw new h.HttpError(404, 'Không tìm thấy tour.');
		}
		if (b.move === 'up' || b.move === 'down') {
			const { results: all } = await env.DB.prepare('SELECT id FROM tours ORDER BY sort ASC, id ASC').all();
			const ids = all.map(x => x.id), at = ids.indexOf(id), to = b.move === 'up' ? at - 1 : at + 1;
			if (to >= 0 && to < ids.length) {
				[ids[at], ids[to]] = [ids[to], ids[at]];
				await env.DB.batch(ids.map((x, n) => env.DB.prepare('UPDATE tours SET sort = ?1 WHERE id = ?2').bind(n +
					1, x)));
			}
			return h.json({ ok: true });
		}
		const f = tourFields(b, h, true);
		const keys = Object.keys(f);
		if (!keys.length) {
			throw new h.HttpError(400, 'Không có gì để cập nhật.');
		}
		const row = await env.DB.prepare(`UPDATE tours SET ${keys.map(k => k + ' = ?').join(', ')}, updated_at = ? WHERE id = ? RETURNING *`).bind(...keys.map(k => f[k]), Date.now(), id).first();
		const note = [];
		if ('price' in f && f.price !== old.price) {
			note.push(money(old.price) + ' → ' + money(f.price));
		}
		if ('active' in f && f.active !== old.active) {
			note.push(f.active ? 'bật bán' : 'tạm ẩn');
		}
		await h.logAct(env, 'Sửa tour', row.name + (note.length ? ' · ' + note.join(', ') : ''));
		return h.json(row);
	}
	if (m && method === 'DELETE') {
		const old = await env.DB.prepare('SELECT name FROM tours WHERE id = ?1').bind(Number(m[1])).first();
		if (!old) {
			throw new h.HttpError(404, 'Không tìm thấy tour.');
		}
		await env.DB.prepare('DELETE FROM tours WHERE id = ?1').bind(Number(m[1])).run();
		await h.logAct(env, 'Xoá tour', old.name);
		return h.json({ ok: true });
	}
	throw new h.HttpError(404, 'Không tìm thấy.');
}

async function templates(request, env, url, h) {
	const { pathname } = url, method = request.method;
	const fields = (b, partial) => {
		const o = {};
		if (!partial || 'title' in b) {
			const v = h.clean(b.title, 60);
			if (!v) {
				throw new h.HttpError(400, 'Vui lòng nhập tên mẫu.');
			}
			o.title = v;
		}
		if (!partial || 'body' in b) {
			const v = h.clean(b.body, 1000);
			if (!v) {
				throw new h.HttpError(400, 'Vui lòng nhập nội dung mẫu.');
			}
			o.body = v;
		}
		return o;
	};
	if (pathname === '/api/admin/templates' && method === 'GET') {
		const { results } = await env.DB.prepare('SELECT * FROM templates ORDER BY sort ASC, id ASC').all();
		return h.json({ items: results });
	}
	if (pathname === '/api/admin/templates' && method === 'POST') {
		const f = fields(await h.readJson(request), false);
		const count = (await env.DB.prepare('SELECT COUNT(*) AS n FROM templates').first()).n;
		if (count >= 50) {
			throw new h.HttpError(400, 'Tối đa 50 mẫu. Hãy xoá bớt mẫu ít dùng.');
		}
		const max = (await env.DB.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM templates').first()).m;
		const row = await env.DB.prepare('INSERT INTO templates (title, body, sort, updated_at) VALUES (?1,?2,?3,?4) RETURNING *').bind(f.title, f.body, max +
			1, Date.now()).first();
		await h.logAct(env, 'Thêm mẫu trả lời', f.title);
		return h.json(row, 201);
	}
	const m = pathname.match(/^\/api\/admin\/templates\/(\d+)$/);
	if (m && method === 'PATCH') {
		const f = fields(await h.readJson(request), true);
		const keys = Object.keys(f);
		if (!keys.length) {
			throw new h.HttpError(400, 'Không có gì để cập nhật.');
		}
		const row = await env.DB.prepare(`UPDATE templates SET ${keys.map(k => k + ' = ?').join(', ')}, updated_at = ? WHERE id = ? RETURNING *`).bind(...keys.map(k => f[k]), Date.now(), Number(m[1])).first();
		if (!row) {
			throw new h.HttpError(404, 'Không tìm thấy mẫu.');
		}
		await h.logAct(env, 'Sửa mẫu trả lời', row.title);
		return h.json(row);
	}
	if (m && method === 'DELETE') {
		const r = await env.DB.prepare('DELETE FROM templates WHERE id = ?1 RETURNING title').bind(Number(m[1])).first();
		if (!r) {
			throw new h.HttpError(404, 'Không tìm thấy mẫu.');
		}
		await h.logAct(env, 'Xoá mẫu trả lời', r.title);
		return h.json({ ok: true });
	}
	throw new h.HttpError(404, 'Không tìm thấy.');
}

/* ---------- Báo cáo ---------- */
const isoDay = ms => new Date(ms + TZ_S * 1000).toISOString().slice(0, 10);
const dayExpr = `date(created_at/1000 + ${TZ_S}, 'unixepoch')`;

function range(url) {
	const p = url.searchParams, ok = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(Date.parse(s));
	const today = isoDay(Date.now());
	let to = ok(p.get('to')) ? p.get('to') : today;
	let from = ok(p.get('from')) ? p.get('from') : isoDay(Date.parse(to) - 29 * DAY_MS);
	if (from > to) {
		[from, to] = [to, from];
	}
	if ((Date.parse(to) - Date.parse(from)) / DAY_MS > 730) {
		from = isoDay(Date.parse(to) - 730 * DAY_MS);
	}
	const days = Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1;
	const prevTo = isoDay(Date.parse(from) - DAY_MS), prevFrom = isoDay(Date.parse(from) - days * DAY_MS);
	return {
		from,
		to,
		days,
		prevFrom,
		prevTo
	};
}

const TOT = "COUNT(*) AS bookings, COALESCE(SUM(status='won'),0) AS won, COALESCE(SUM(status='cancelled'),0) AS cancelled, COALESCE(SUM(status='called'),0) AS called, COALESCE(SUM(status='new'),0) AS fresh, COALESCE(SUM(CASE WHEN status='won' THEN people END),0) AS people, COALESCE(SUM(CASE WHEN status='won' THEN amount END),0) AS revenue";

async function buildReport(env, url) {
	const r = range(url);
	const W = `${dayExpr} >= ?1 AND ${dayExpr} <= ?2`;
	const [cur, prev, byDest, bySource, series, rv, acc, msgs, pending] = await Promise.all([
		env.DB.prepare(`SELECT ${TOT} FROM bookings WHERE ${W}`).bind(r.from, r.to).first(),
		env.DB.prepare(`SELECT ${TOT} FROM bookings WHERE ${W}`).bind(r.prevFrom, r.prevTo).first(),
		env.DB.prepare(`SELECT COALESCE(NULLIF(destination,''),'Chưa chọn') AS name, ${TOT} FROM bookings WHERE ${W} GROUP BY name ORDER BY bookings DESC`).bind(r.from, r.to).all(),
		env.DB.prepare(`SELECT source AS name, ${TOT} FROM bookings WHERE ${W} GROUP BY source ORDER BY bookings DESC`).bind(r.from, r.to).all(),
		env.DB.prepare(`SELECT ${r.days > 62 ? `substr(${dayExpr},1,7)` : dayExpr} AS k, ${TOT} FROM bookings WHERE ${W} GROUP BY k ORDER BY k`).bind(r.from, r.to).all(),
		env.DB.prepare(`SELECT COUNT(*) AS n, COALESCE(AVG(rating),0) AS avg FROM reviews WHERE status='approved' AND date(created_at/1000 + ${TZ_S}, 'unixepoch') BETWEEN ?1 AND ?2`).bind(r.from, r.to).first(),
		env.DB.prepare(`SELECT COUNT(*) AS n FROM users WHERE date(created_at/1000 + ${TZ_S}, 'unixepoch') BETWEEN ?1 AND ?2`).bind(r.from, r.to).first(),
		env.DB.prepare(`SELECT COUNT(DISTINCT user_id) AS n FROM messages WHERE sender='user' AND date(created_at/1000 + ${TZ_S}, 'unixepoch') BETWEEN ?1 AND ?2`).bind(r.from, r.to).first(),
		env.DB.prepare("SELECT COUNT(*) AS n FROM bookings WHERE status='won' AND (amount IS NULL OR amount = 0)").first()
	]);
	// dãy liên tục: điền ngày/tháng không có đơn bằng 0 để biểu đồ không bị đứt
	const map = Object.fromEntries(series.results.map(x => [x.k, x]));
	const keys = [];
	if (r.days > 62) {
		let [y, m] = r.from.slice(0, 7).split('-').map(Number);
		const end = r.to.slice(0, 7);
		for (;;) {
			const k = y + '-' + String(m).padStart(2, '0');
			keys.push(k);
			if (k >= end) {
				break;
			}
			if (++m > 12) {
				m = 1;
				y++;
			}
		}
	} else {
		for (let i = 0; i < r.days; i++) {
			keys.push(isoDay(Date.parse(r.from) + i * DAY_MS));
		}
	}
	const zero = {
		bookings: 0,
		won: 0,
		revenue: 0
	};
	return {
		range: r,
		unit: r.days > 62 ? 'month' : 'day',
		totals: cur,
		previous: prev,
		series: keys.map(k => ({
			key: k,
			bookings: (map[k] || zero).bookings,
			won: (map[k] || zero).won,
			revenue: (map[k] || zero).revenue
		})),
		destinations: byDest.results,
		sources: bySource.results,
		reviews: { count: rv.n, avg: Math.round(rv.avg * 10) / 10 },
		newAccounts: acc.n,
		chatCustomers: msgs.n,
		wonWithoutAmount: pending.n
	};
}

async function reportCsv(env, url, h, xlsx = false) {
	const rep = await buildReport(env, url);
	if (xlsx) {
		const unit = rep.unit === 'month' ? 'Tháng' : 'Ngày';
		return xlsxResponse([
			{ name: 'Theo ' + unit.toLowerCase(), rows: [[unit, 'Số đơn', 'Đã chốt', 'Doanh thu (đ)']].concat(rep.series.map(x => [x.key, x.bookings, x.won, x.revenue])) },
			{ name: 'Theo điểm đến', rows: [['Điểm đến', 'Số đơn', 'Đã chốt', 'Doanh thu (đ)']].concat(rep.destinations.map(x => [x.name, x.bookings, x.won, x.revenue])) }
		], `bao-cao-${rep.range.from}_${rep.range.to}`);
	}
	const cell = v => {
		let s = String(v ?? '');
		if (/^[=+\-@\t\r]/.test(s)) {
			s = "'" + s;
		}
		return '"' + s.replace(/"/g, '""') + '"';
	};
	const rows = [[rep.unit === 'month' ? 'Tháng' : 'Ngày', 'Số đơn', 'Đã chốt', 'Doanh thu (đ)']].concat(rep.series.map(x => [x.key, x.bookings, x.won, x.revenue]));
	rows.push([], ['Điểm đến', 'Số đơn', 'Đã chốt', 'Doanh thu (đ)']);
	rep.destinations.forEach(x => rows.push([x.name, x.bookings, x.won, x.revenue]));
	return new Response('﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n'), {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="bao-cao-${rep.range.from}_${rep.range.to}.csv"`,
			'Cache-Control': 'no-store'
		}
	});
}

export async function adminTools(request, env, url, h) {
	const p = url.pathname;
	if (p === '/api/admin/report' && request.method === 'GET') {
		return h.json(await buildReport(env, url));
	}
	if (p === '/api/admin/report.csv' && request.method === 'GET') {
		return reportCsv(env, url, h);
	}
	if (p === '/api/admin/report.xlsx' && request.method === 'GET') {
		return reportCsv(env, url, h, true);
	}
	if (p === '/api/admin/tours' || p.startsWith('/api/admin/tours/')) {
		return tours(request, env, url, h);
	}
	if (p === '/api/admin/templates' || p.startsWith('/api/admin/templates/')) {
		return templates(request, env, url, h);
	}
	throw new h.HttpError(404, 'Không tìm thấy.');
}

/* Doanh thu ước tính khi chốt đơn: giá tour của điểm đến × số người (admin có thể sửa lại) */
export async function estimateAmount(env, row) {
	if (!row.destination || !row.people) {
		return null;
	}
	/* đơn có thể ghi tên tour (tour tự tạo) hoặc tên điểm đến: ưu tiên đúng tên tour */
	const t = await env.DB.prepare('SELECT price FROM tours WHERE (name = ?1 OR destination = ?1) AND price > 0 ORDER BY (name = ?1) DESC, active DESC, sort ASC LIMIT 1').bind(row.destination).first();
	return t ? t.price * row.people : null;
}
