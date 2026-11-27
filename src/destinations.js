/* Điểm đến quản lý được: thêm / sửa / ẩn / sắp xếp, đổi ảnh. Trang chủ, ô chọn điểm đến và kiểm tra đơn đều đọc từ đây. */
export const DEST_SCHEMA = [
	'CREATE TABLE IF NOT EXISTS destinations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, title TEXT NOT NULL DEFAULT \'\', province TEXT NOT NULL DEFAULT \'\', blurb TEXT NOT NULL DEFAULT \'\', image TEXT NOT NULL DEFAULT \'\', active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)'
];
const SEED = [
	['Vịnh Hạ Long', 'Vịnh Hạ Long', 'Quảng Ninh', 'Du thuyền qua hàng nghìn đảo đá vôi, chèo kayak trong hang động.', 'images/d-halong.jpg'],
	['Sa Pa', 'Sa Pa', 'Lào Cai', 'Ruộng bậc thang vàng mùa lúa chín và chợ phiên vùng cao.', 'images/d-sapa.jpg'],
	['Hội An', 'Hội An', 'Quảng Nam', 'Phố cổ đèn lồng, thả hoa đăng trên sông Hoài.', 'images/d-hoian.jpg'],
	['Huế', 'Cố đô Huế', 'Thừa Thiên Huế', 'Đại Nội, lăng tẩm và ẩm thực cung đình.', 'images/d-hue.jpg'],
	['Đà Lạt', 'Đà Lạt', 'Lâm Đồng', 'Săn mây, đồi thông và những quán cà phê sương sớm.', 'images/d-dalat.jpg'],
	['Phú Quốc', 'Phú Quốc', 'Kiên Giang', 'Biển trong, cát trắng và hoàng hôn rực rỡ.', 'images/d-phuquoc.jpg']
];
export async function seedDestinations(env) {
	const first = await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('seed92', '1') RETURNING key").first();
	if (!first) {
		return;
	}
	const now = Date.now();
	await env.DB.batch(SEED.map((d, i) => env.DB.prepare('INSERT OR IGNORE INTO destinations (name, title, province, blurb, image, active, sort, updated_at) VALUES (?1,?2,?3,?4,?5,1,?6,?7)').bind(...d, i +
		1, now)));
}

const COLS = 'id, name, title, province, blurb, image, active, sort';
export async function publicDestinations(env, h) {
	const { results } = await env.DB.prepare(`SELECT ${COLS} FROM destinations WHERE active = 1 ORDER BY sort ASC, id ASC`).all();
	return h.json({ items: results }, 200, { 'Cache-Control': 'public, max-age=60' });
}
/* Tên điểm đến hợp lệ khi đặt tour / yêu thích (kể cả điểm đã ẩn: đơn cũ vẫn sửa được) */
export async function destExists(env, name) {
	return !!(await env.DB.prepare('SELECT 1 FROM destinations WHERE name = ?1').bind(name).first().catch(() => null));
}

function fields(b, h, partial) {
	const o = {}, bad = m => {
		throw new h.HttpError(400, m);
	};
	if (!partial || 'name' in b) {
		const v = h.clean(b.name, 40);
		if (v.length < 2) {
			bad('Vui lòng nhập tên điểm đến.');
		}
		o.name = v;
	}
	if ('title' in b) {
		o.title = h.clean(b.title, 60);
	}
	if ('province' in b) {
		o.province = h.clean(b.province, 40);
	}
	if ('blurb' in b) {
		o.blurb = h.clean(b.blurb, 200);
	}
	if ('image' in b) {
		const v = h.clean(b.image, 500);
		if (v && !/^(https:\/\/|images\/|\/images\/)/.test(v)) {
			bad('Ảnh phải là đường dẫn https:// hoặc images/…');
		}
		o.image = v;
	}
	if ('active' in b) {
		o.active = b.active ? 1 : 0;
	}
	return o;
}

export async function adminDestinations(request, env, url, h) {
	const p = url.pathname, m = p.match(/^\/api\/admin\/destinations\/(\d+)$/), db = env.DB, method = request.method;
	if (p === '/api/admin/destinations' && method === 'GET') {
		const { results } = await db.prepare(`SELECT ${COLS}, updated_at FROM destinations ORDER BY sort ASC, id ASC`).all();
		return h.json({ items: results });
	}
	if (p === '/api/admin/destinations' && method === 'POST') {
		const f = fields(await h.readJson(request), h, false);
		if (await db.prepare('SELECT 1 FROM destinations WHERE name = ?1').bind(f.name).first()) {
			throw new h.HttpError(409, 'Điểm đến này đã có.');
		}
		const max = (await db.prepare('SELECT COALESCE(MAX(sort),0) AS n FROM destinations').first()).n;
		const row = await db.prepare('INSERT INTO destinations (name, title, province, blurb, image, active, sort, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8) RETURNING *')
			.bind(f.name, f.title || f.name, f.province || '', f.blurb || '', f.image || '', f.active ?? 1, max + 1, Date.now()).first();
		await h.logAct(env, 'Thêm điểm đến', f.name);
		return h.json({ item: row }, 201);
	}
	if (p === '/api/admin/destinations/reorder' && method === 'POST') {
		const ids = (await h.readJson(request)).ids;
		if (!Array.isArray(ids) || ids.length > 100 || !ids.every(Number.isInteger)) {
			throw new h.HttpError(400, 'Danh sách không hợp lệ.');
		}
		await db.batch(ids.map((id, i) => db.prepare('UPDATE destinations SET sort = ?1, updated_at = ?2 WHERE id = ?3').bind(i +
			1, Date.now(), id)));
		await h.logAct(env, 'Sắp xếp điểm đến', ids.length + ' mục');
		return h.json({ ok: true });
	}
	if (m) {
		const id = Number(m[1]), old = await db.prepare('SELECT * FROM destinations WHERE id = ?1').bind(id).first();
		if (!old) {
			throw new h.HttpError(404, 'Không tìm thấy điểm đến.');
		}
		if (method === 'DELETE') {
			await db.prepare('DELETE FROM destinations WHERE id = ?1').bind(id).run();
			await h.logAct(env, 'Xoá điểm đến', old.name);
			return h.json({ ok: true });
		}
		if (method === 'PATCH') {
			const f = fields(await h.readJson(request), h, true), keys = Object.keys(f);
			if (!keys.length) {
				throw new h.HttpError(400, 'Không có gì để cập nhật.');
			}
			if (f.name && f.name !== old.name && await db.prepare('SELECT 1 FROM destinations WHERE name = ?1').bind(f.name).first()) {
				throw new h.HttpError(409, 'Tên này đã được dùng.');
			}
			const row = await db.prepare(`UPDATE destinations SET ${keys.map(k => k + ' = ?').join(', ')}, updated_at = ? WHERE id = ? RETURNING *`).bind(...keys.map(k => f[k]), Date.now(), id).first();
			await h.logAct(env, 'Sửa điểm đến', old.name + ('active' in f ? (f.active ? ' · hiện' : ' · ẩn') : ''));
			return h.json({ item: row });
		}
	}
	throw new h.HttpError(404, 'Không tìm thấy.');
}
