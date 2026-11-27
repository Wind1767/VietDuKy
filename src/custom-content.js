/* Khối nội dung tự tạo (thêm vào trang chủ) và trang mới (/p/ten-trang).
Chỉ nhận chữ thuần + ảnh + nút + thẻ biểu tượng; KHÔNG nhận HTML tự do nên không có nguy cơ chèn mã.
Khối trang chủ: hiện/ẩn và thứ tự chỉnh ở mục “Menu & trang chủ” (khoá home_blocks, id dạng c12). */
import { ICONS, getSite, dropSiteCache, cleanValue, validUrl } from './site-settings.js';

export const CONTENT_SCHEMA = [
	'CREATE TABLE IF NOT EXISTS content_blocks (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL)',
	'CREATE TABLE IF NOT EXISTS pages (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, descr TEXT NOT NULL DEFAULT \'\', blocks TEXT NOT NULL DEFAULT \'[]\', active INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL)'
];
const KINDS = ['text', 'image', 'cards'], BGS = ['plain', 'tint', 'brand'];
const MAX_BLOCKS = 30, MAX_PAGES = 50, MAX_PAGE_BLOCKS = 20;

/* Làm sạch một khối nội dung (dùng cho cả khối trang chủ và khối trong trang mới) */
export function cleanBlock(b, h) {
	const bad = m => {
		throw new h.HttpError(400, m);
	};
	if (!b || typeof b !== 'object') {
		bad('Khối nội dung không hợp lệ.');
	}
	const o = {
		kind: KINDS.includes(b.kind) ? b.kind : 'text',
		bg: BGS.includes(b.bg) ? b.bg : 'plain',
		title: h.clean(b.title, 100),
		sub: h.clean(b.sub, 200),
		text: h.clean(b.text, 3000),
		image: h.clean(b.image, 500),
		side: b.side === 'left' ? 'left' : 'right',
		btn_text: h.clean(b.btn_text, 40),
		btn_url: h.clean(b.btn_url, 200),
		items: []
	};
	if (o.image && !/^(https:\/\/|images\/|\/images\/)[^\s"'<>\\]*$/.test(o.image)) {
		bad('Ảnh phải là đường dẫn https:// hoặc images/…');
	}
	if (o.btn_url && !validUrl(o.btn_url)) {
		bad('Đường dẫn của nút phải bắt đầu bằng /, https://, tel: hoặc mailto: (không dùng //).');
	}
	if (o.btn_url && !o.btn_text) {
		bad('Nút có đường dẫn thì cần có chữ trên nút.');
	}
	if (Array.isArray(b.items)) {
		if (b.items.length > 6) {
			bad('Mỗi khối tối đa 6 thẻ.');
		}
		o.items = b.items.map(it => {
			const x = {
				icon: ICONS.includes(it && it.icon) ? it.icon : 'star',
				title: h.clean(it && it.title, 60),
				text: h.clean(it && it.text, 200)
			};
			return x.title || x.text ? x : null;
		}).filter(Boolean);
	}
	if (o.kind === 'image' && !o.image) {
		bad('Khối “Ảnh + chữ” cần có ảnh.');
	}
	if (o.kind === 'cards' && !o.items.length) {
		bad('Khối “Thẻ” cần ít nhất một thẻ.');
	}
	if (!o.title && !o.text && !o.image && !o.items.length) {
		bad('Khối đang trống: hãy nhập tiêu đề, nội dung hoặc ảnh.');
	}
	return o;
}
const parse = (s, d) => {
	try {
		return JSON.parse(s);
	} catch {
		return d;
	}
};
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/* Thêm / bỏ khối tự tạo trong danh sách khối trang chủ */
async function syncHome(env, h, id, add) {
	const cur = (await getSite(env)).home_blocks || [], key = 'c' + id;
	let next = cur.filter(x => x.id !== key);
	if (add) {
		next.push({ id: key, on: true });
	}
	next = cleanValue('home_blocks', next, h);
	await env.DB.prepare('INSERT INTO site_settings (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind('home_blocks', JSON.stringify(next), Date.now()).run();
	dropSiteCache();
}

/* ---- Công khai ---- */
export async function publicBlocks(env, h) {
	const { results } = await env.DB.prepare('SELECT id, data FROM content_blocks ORDER BY id ASC').all();
	return h.json({ items: results.map(r => ({ id: 'c' + r.id, data: parse(r.data, {}) })) }, 200, { 'Cache-Control': 'public, max-age=30' });
}
export async function publicPage(env, h, slug) {
	const r = SLUG.test(slug) ? await env.DB.prepare('SELECT slug, title, descr, blocks FROM pages WHERE slug = ?1 AND active = 1').bind(slug).first() : null;
	if (!r) {
		throw new h.HttpError(404, 'Không tìm thấy trang này.');
	}
	return h.json({ page: {
			slug: r.slug,
			title: r.title,
			desc: r.descr,
			blocks: parse(r.blocks, [])
		} }, 200, { 'Cache-Control': 'public, max-age=30' });
}
/* Dùng cho mục “Menu & trang chủ”: tên khối tự tạo và danh sách trang đang bật (để gợi ý đường dẫn menu) */
export async function layoutExtras(env) {
	const [b, p] = await Promise.all([
		env.DB.prepare('SELECT id, name FROM content_blocks').all().catch(() => ({ results: [] })),
		env.DB.prepare('SELECT slug, title FROM pages WHERE active = 1 ORDER BY title').all().catch(() => ({ results: [] }))
	]);
	return { custom: Object.fromEntries(b.results.map(r => ['c' + r.id, r.name])), pages: p.results };
}

/* ---- Quản trị: /api/admin/content-blocks và /api/admin/pages ---- */
export async function adminContent(request, env, url, h) {
	const path = url.pathname, method = request.method, db = env.DB;
	const mb = path.match(/^\/api\/admin\/content-blocks(?:\/(\d+))?$/), mp = path.match(/^\/api\/admin\/pages(?:\/(\d+))?$/);
	if (mb) {
		const id = mb[1] ? Number(mb[1]) : null;
		const out = r => ({
			id: r.id,
			name: r.name,
			data: parse(r.data, {}),
			updated_at: r.updated_at
		});
		if (!id && method === 'GET') {
			const { results } = await db.prepare('SELECT * FROM content_blocks ORDER BY id ASC').all();
			return h.json({ items: results.map(out) });
		}
		if (!id && method === 'POST') {
			const b = await h.readJson(request), name = h.clean(b.name, 60);
			if (name.length < 2) {
				throw new h.HttpError(400, 'Vui lòng đặt tên khối (chỉ để bạn dễ nhận ra).');
			}
			if ((await db.prepare('SELECT COUNT(*) AS n FROM content_blocks').first()).n >= MAX_BLOCKS) {
				throw new h.HttpError(400, `Tối đa ${MAX_BLOCKS} khối tự tạo.`);
			}
			const data = cleanBlock(b.data, h);
			const row = await db.prepare('INSERT INTO content_blocks (name, data, updated_at) VALUES (?1, ?2, ?3) RETURNING *').bind(name, JSON.stringify(data), Date.now()).first();
			await syncHome(env, h, row.id, true);
			await h.logAct(env, 'Thêm khối trang chủ', name);
			return h.json({ item: out(row) }, 201);
		}
		if (id) {
			const old = await db.prepare('SELECT * FROM content_blocks WHERE id = ?1').bind(id).first();
			if (!old) {
				throw new h.HttpError(404, 'Không tìm thấy khối.');
			}
			if (method === 'DELETE') {
				await db.prepare('DELETE FROM content_blocks WHERE id = ?1').bind(id).run();
				await syncHome(env, h, id, false);
				await h.logAct(env, 'Xoá khối trang chủ', old.name);
				return h.json({ ok: true });
			}
			if (method === 'PATCH') {
				const b = await h.readJson(request), name = 'name' in b ? h.clean(b.name, 60) : old.name;
				if (name.length < 2) {
					throw new h.HttpError(400, 'Vui lòng đặt tên khối.');
				}
				const data = 'data' in b ? cleanBlock(b.data, h) : parse(old.data, {});
				const row = await db.prepare('UPDATE content_blocks SET name = ?1, data = ?2, updated_at = ?3 WHERE id = ?4 RETURNING *').bind(name, JSON.stringify(data), Date.now(), id).first();
				await h.logAct(env, 'Sửa khối trang chủ', name);
				return h.json({ item: out(row) });
			}
		}
	}
	if (mp) {
		const id = mp[1] ? Number(mp[1]) : null;
		const out = r => ({
			id: r.id,
			slug: r.slug,
			title: r.title,
			desc: r.descr,
			blocks: parse(r.blocks, []),
			active: !!r.active,
			updated_at: r.updated_at
		});
		const fields = (b, old) => {
			const o = {}, bad = m => {
				throw new h.HttpError(400, m);
			};
			o.slug = 'slug' in b ? h.clean(b.slug, 50).toLowerCase() : old.slug;
			if (!SLUG.test(o.slug)) {
				bad('Đường dẫn chỉ gồm chữ thường không dấu, số và dấu gạch ngang (ví dụ: tin-tuc).');
			}
			o.title = 'title' in b ? h.clean(b.title, 80) : old.title;
			if (o.title.length < 2) {
				bad('Vui lòng nhập tiêu đề trang.');
			}
			o.descr = 'desc' in b ? h.clean(b.desc, 200) : old.descr;
			o.active = 'active' in b ? (b.active ? 1 : 0) : old.active;
			if ('blocks' in b) {
				if (!Array.isArray(b.blocks) || b.blocks.length > MAX_PAGE_BLOCKS) {
					bad(`Mỗi trang tối đa ${MAX_PAGE_BLOCKS} khối.`);
				}
				o.blocks = JSON.stringify(b.blocks.map(x => cleanBlock(x, h)));
			} else {
				o.blocks = old.blocks;
			}
			return o;
		};
		if (!id && method === 'GET') {
			const { results } = await db.prepare('SELECT * FROM pages ORDER BY id ASC').all();
			return h.json({ items: results.map(out) });
		}
		if (!id && method === 'POST') {
			const f = fields(await h.readJson(request), {
				slug: '',
				title: '',
				descr: '',
				blocks: '[]',
				active: 1
			});
			if ((await db.prepare('SELECT COUNT(*) AS n FROM pages').first()).n >= MAX_PAGES) {
				throw new h.HttpError(400, `Tối đa ${MAX_PAGES} trang.`);
			}
			if (await db.prepare('SELECT 1 FROM pages WHERE slug = ?1').bind(f.slug).first()) {
				throw new h.HttpError(409, 'Đường dẫn này đã có trang khác dùng.');
			}
			const row = await db.prepare('INSERT INTO pages (slug, title, descr, blocks, active, updated_at) VALUES (?1,?2,?3,?4,?5,?6) RETURNING *').bind(f.slug, f.title, f.descr, f.blocks, f.active, Date.now()).first();
			await h.logAct(env, 'Thêm trang', '/p/' + f.slug);
			return h.json({ item: out(row) }, 201);
		}
		if (id) {
			const old = await db.prepare('SELECT * FROM pages WHERE id = ?1').bind(id).first();
			if (!old) {
				throw new h.HttpError(404, 'Không tìm thấy trang.');
			}
			if (method === 'DELETE') {
				await db.prepare('DELETE FROM pages WHERE id = ?1').bind(id).run();
				await h.logAct(env, 'Xoá trang', '/p/' + old.slug);
				return h.json({ ok: true });
			}
			if (method === 'PATCH') {
				const f = fields(await h.readJson(request), old);
				if (f.slug !== old.slug && await db.prepare('SELECT 1 FROM pages WHERE slug = ?1').bind(f.slug).first()) {
					throw new h.HttpError(409, 'Đường dẫn này đã có trang khác dùng.');
				}
				const row = await db.prepare('UPDATE pages SET slug = ?1, title = ?2, descr = ?3, blocks = ?4, active = ?5, updated_at = ?6 WHERE id = ?7 RETURNING *').bind(f.slug, f.title, f.descr, f.blocks, f.active, Date.now(), id).first();
				await h.logAct(env, 'Sửa trang', '/p/' + f.slug +
					(f.active !== old.active ? (f.active ? ' · hiện' : ' · ẩn') : ''));
				return h.json({ item: out(row) });
			}
		}
	}
	throw new h.HttpError(404, 'Không tìm thấy.');
}
