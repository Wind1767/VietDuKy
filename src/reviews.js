import { assertClean } from './profanity.js';
/* Việt Du Ký – đánh giá thật: khách đã đặt tour viết, admin duyệt rồi mới hiện công khai.
Mỗi khách đánh giá được nhiều tour, mỗi tour một đánh giá (viết lại sẽ quay về trạng thái "chờ duyệt"). */
import { currentUser } from './customer-auth.js';

const STATUSES = ['pending', 'approved', 'rejected'];
const STATUS_LABEL = {
	pending: 'Chờ duyệt',
	approved: 'Đã duyệt',
	rejected: 'Không duyệt'
};
const PAGE_MAX = 20;
const VIRT = '%@virtual.invalid'; // đánh giá ảo do admin tạo: gắn với tài khoản ẩn có email đuôi này

/* Điểm sao: từ 0,5 đến 5, bước 0,5 (ví dụ 4,5). Lưu thẳng số thực trong cột rating (SQLite chấp nhận 4.5 trong cột INTEGER). */
function vRating(h, v) {
	const r = Number(v);
	if (!Number.isFinite(r) || r < 0.5 || r > 5 || Math.round(r * 2) !== r * 2) {
		throw new h.HttpError(400, 'Hãy chọn số sao từ 0,5 đến 5 (bước 0,5).');
	}
	return r;
}

const pub = r => ({
	id: r.id,
	name: r.name,
	avatar: r.avatar || '',
	rating: r.rating,
	destination: r.destination,
	body: r.body,
	reply: r.reply,
	created_at: r.created_at
});

/* Phân bố theo 5 mức sao: điểm x,5 làm tròn lên (4,5 tính vào mức 5; 0,5 tính vào mức 1). avg giữ một chữ số thập phân. */
const BUCKET = 'MIN(5, MAX(1, CAST(rating + 0.5 AS INTEGER)))';
const summarySql = "SELECT COUNT(*) AS n, COALESCE(AVG(rating), 0) AS a, " + [1, 2, 3, 4, 5].map(k => `COALESCE(SUM(${BUCKET} = ${k}), 0) AS s${k}`).join(', ') + " FROM reviews WHERE status = 'approved'";
const summaryOf = r => ({
	count: r.n,
	avg: Math.round(r.a * 10) / 10,
	dist: { 1: r.s1, 2: r.s2, 3: r.s3, 4: r.s4, 5: r.s5 }
});
/* Lượt thích hiển thị = số bình chọn thật + số admin chỉnh thêm (helpful_adj, có thể âm), không bao giờ âm */
const HELPFUL = 'MAX(0, r.helpful_adj + (SELECT COUNT(*) FROM review_votes v WHERE v.review_id = r.id))';

/* Khách chỉ được đánh giá khi có ít nhất một đơn (chưa huỷ) gắn với tài khoản của mình */
async function myBookings(env, uid) {
	const { results } = await env.DB.prepare("SELECT DISTINCT destination FROM bookings WHERE user_id = ?1 AND status <> 'cancelled'").bind(uid).all();
	return results.map(r => r.destination).filter(Boolean);
}

/* ---------- Công khai và phía khách: /api/reviews* ---------- */
export async function handleReviews(request, env, url, ip, h) {
	const { pathname } = url, method = request.method;

	if (pathname === '/api/reviews' && method === 'GET') {
		const size = Math.min(Math.max(parseInt(url.searchParams.get('size')) || 10, 1), PAGE_MAX);
		const page = Math.max(parseInt(url.searchParams.get('page')) || 1, 1);
		let me = null;
		try {
			me = await currentUser(request, env, h);
		} catch { /* khách chưa đăng nhập vẫn xem được */
		}
		/* Danh sách + tổng hợp sao trong một lượt gọi CSDL */
		const [{ results }, { results: [sum] }] = await env.DB.batch([env.DB.prepare("SELECT r.id, r.user_id, r.rating, r.destination, r.body, r.reply, r.created_at, u.name, u.avatar, " +
			HELPFUL + " AS helpful, " +
			"EXISTS(SELECT 1 FROM review_votes v WHERE v.review_id = r.id AND v.user_id = ?3) AS voted " +
			"FROM reviews r JOIN users u ON u.id = r.user_id " +
			"WHERE r.status = 'approved' ORDER BY r.created_at DESC, r.id DESC LIMIT ?1 OFFSET ?2").bind(size, (page - 1) * size, me ? me.id : 0), env.DB.prepare(summarySql)]);
		const s = summaryOf(sum);
		return h.json({
			logged_in: !!me,
			items: results.map(r => ({ ...pub(r), helpful: r.helpful, voted: !!r.voted, own: !!me && r.user_id === me.id })),
			page,
			size,
			...s
		});
	}

	let user = null;
	try {
		user = await currentUser(request, env, h);
	} catch { /* chưa cấu hình khoá phiên */
	}
	if (!user) {
		throw new h.HttpError(401, 'Bạn cần đăng nhập để đánh giá.', undefined, 'login_required');
	}
	if (method !== 'GET') {
		const origin = request.headers.get('Origin');
		if (origin && origin !== url.origin) {
			throw new h.HttpError(403, 'Yêu cầu không hợp lệ.');
		}
	}

	if (pathname === '/api/reviews/mine' && method === 'GET') {
		const { results } = await env.DB.prepare('SELECT id, rating, destination, body, status, reply, created_at, updated_at FROM reviews WHERE user_id = ?1 ORDER BY updated_at DESC, id DESC').bind(user.id).all();
		const destinations = await myBookings(env, user.id);
		return h.json({
			reviews: results,
			can_review: destinations.length > 0,
			destinations,
			name: user.name
		});
	}

	const vote = pathname.match(/^\/api\/reviews\/(\d+)\/helpful$/);
	if (vote && method === 'POST') {
		await h.limit(env, 'rvote:' + user.id, h.LIMITS.rvote);
		const id = Number(vote[1]);
		/* Một lượt đọc: chủ đánh giá, đã bình chọn chưa, số bình chọn thật + số chỉnh của admin */
		const r = await env.DB.prepare("SELECT r.user_id, r.helpful_adj AS adj, EXISTS(SELECT 1 FROM review_votes v WHERE v.review_id = r.id AND v.user_id = ?2) AS voted, " +
			"(SELECT COUNT(*) FROM review_votes v WHERE v.review_id = r.id) AS n FROM reviews r WHERE r.id = ?1 AND r.status = 'approved'").bind(id, user.id).first();
		if (!r) {
			throw new h.HttpError(404, 'Không tìm thấy đánh giá này.');
		}
		if (r.user_id === user.id) {
			throw new h.HttpError(400, 'Bạn không thể bình chọn cho đánh giá của chính mình.');
		}
		const voted = !r.voted; // bấm lần nữa = bỏ bình chọn
		await (voted
			? env.DB.prepare('INSERT OR IGNORE INTO review_votes (review_id, user_id, created_at) VALUES (?1, ?2, ?3)').bind(id, user.id, Date.now())
			: env.DB.prepare('DELETE FROM review_votes WHERE review_id = ?1 AND user_id = ?2').bind(id, user.id)).run();
		return h.json({ helpful: Math.max(0, r.adj + r.n + (voted ? 1 : -1)), voted });
	}

	const del = pathname.match(/^\/api\/reviews\/mine\/(\d+)$/);
	if (del && method === 'DELETE') {
		const id = Number(del[1]);
		/* Xoá bình chọn rồi xoá đánh giá trong một lượt; bình chọn chỉ bị xoá khi đánh giá đúng là của khách này */
		const [, r] = await env.DB.batch([
			env.DB.prepare('DELETE FROM review_votes WHERE review_id = ?1 AND EXISTS (SELECT 1 FROM reviews WHERE id = ?1 AND user_id = ?2)').bind(id, user.id),
			env.DB.prepare('DELETE FROM reviews WHERE id = ?1 AND user_id = ?2').bind(id, user.id)
		]);
		if (!r.meta.changes) {
			throw new h.HttpError(404, 'Không tìm thấy đánh giá này.');
		}
		return h.json({ ok: true });
	}

	if (pathname === '/api/reviews' && method === 'POST') {
		await h.limit(env, 'review:' + user.id, h.LIMITS.review);
		const booked = await myBookings(env, user.id);
		if (!booked.length) {
			throw new h.HttpError(403, 'Bạn cần có đơn đặt tour (chưa huỷ) trước khi viết đánh giá.', undefined, 'no_booking');
		}
		const b = await h.readJson(request);
		await h.turnstile(b, 'review');
		const rating = vRating(h, b.rating);
		const body = h.clean(b.body, 600);
		if (body.length < 10) {
			throw new h.HttpError(400, 'Hãy viết ít nhất 10 ký tự để chia sẻ trải nghiệm của bạn.');
		}
		await assertClean(env, h.HttpError, body);
		const destination = h.clean(b.destination, 80);
		if (!destination || !booked.includes(destination)) {
			throw new h.HttpError(400, 'Hãy chọn một tour bạn đã đặt để đánh giá.', undefined, 'tour_required');
		}
		const now = Date.now();
		const old = await env.DB.prepare('SELECT id FROM reviews WHERE user_id = ?1 AND destination = ?2').bind(user.id, destination).first();
		const cols = 'id, rating, destination, body, status, reply, created_at, updated_at';
		const row = old
			? await env.DB.prepare(`UPDATE reviews SET rating = ?1, body = ?2, status = 'pending', updated_at = ?3 WHERE id = ?4 RETURNING ${cols}`).bind(rating, body, now, old.id).first()
			: await env.DB.prepare(`INSERT INTO reviews (user_id, rating, destination, body, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 'pending', ?5, ?5) RETURNING ${cols}`).bind(user.id, rating, destination, body, now).first();
		h.adminMail(h.tpl('review_admin', {
			ho_ten: user.name,
			ten: String(user.name).trim().split(/\s+/).pop(),
			email: user.email,
			sao: String(rating).replace('.', ','),
			diem_den: destination
		}, {
			rows: [['Tour', destination]],
			quote: body,
			link: h.site + '/admin/#/reviews'
		}));
		return h.json({ review: row }, 201);
	}

	throw new h.HttpError(404, 'Không tìm thấy.');
}

/* ---------- Phía admin: /api/admin/reviews*, /api/admin/review-count ---------- */
export async function adminReviews(request, env, url, h) {
	const { pathname } = url, method = request.method;

	if (pathname === '/api/admin/review-count' && method === 'GET') {
		const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM reviews WHERE status = 'pending'").first();
		return h.json({ pending: r.n });
	}

	if (pathname === '/api/admin/reviews' && method === 'GET') {
		const status = url.searchParams.get('status');
		const pageSize = 15;
		const page = Math.max(parseInt(url.searchParams.get('page')) || 1, 1);
		const where = STATUSES.includes(status) ? 'WHERE r.status = ?1' : 'WHERE ?1 = ?1';
		const arg = STATUSES.includes(status) ? status : '';
		/* Tổng số, trang hiện tại và số theo trạng thái: một lượt gọi CSDL */
		const [{ results: [t] }, { results }, c] = await env.DB.batch([
			env.DB.prepare(`SELECT COUNT(*) AS n FROM reviews r ${where}`).bind(arg),
			env.DB.prepare(`SELECT r.*, ${HELPFUL} AS helpful, u.name, u.email, u.phone, u.avatar, (u.email LIKE '%@virtual.invalid') AS virtual FROM reviews r JOIN users u ON u.id = r.user_id ${where} ORDER BY r.created_at DESC, r.id DESC LIMIT ?2 OFFSET ?3`).bind(arg, pageSize, (page - 1) * pageSize),
			env.DB.prepare('SELECT status, COUNT(*) AS n FROM reviews GROUP BY status')
		]);
		const total = t.n;
		const counts = {
			pending: 0,
			approved: 0,
			rejected: 0
		};
		c.results.forEach(r => {
			counts[r.status] = r.n;
		});
		return h.json({
			items: results,
			total,
			page,
			pageSize,
			counts
		});
	}

	if (pathname === '/api/admin/reviews/virtual' && method === 'POST') {
		const b = await h.readJson(request);
		const name = h.clean(b.name, 60), body = h.clean(b.body, 600), rating = vRating(h, b.rating);
		if (name.length < 2) {
			throw new h.HttpError(400, 'Hãy nhập tên người đánh giá.');
		}
		if (body.length < 10) {
			throw new h.HttpError(400, 'Nội dung đánh giá ít nhất 10 ký tự.');
		}
		const destination = h.vDest(b.destination), now = Date.now();
		let at = Number(b.created_at);
		if (!Number.isFinite(at) || at <= 0 || at > now) {
			at = now;
		}
		const avatar = typeof b.avatar === 'string' && /^https:\/\//.test(b.avatar) ? b.avatar.slice(0, 500) : null;
		const rnd = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
		const u = await env.DB.prepare('INSERT INTO users (created_at, email, name, pass_hash, verified_at, avatar) VALUES (?1,?2,?3,?4,?1,?5) RETURNING id').bind(at, 'vr-' +
			rnd + '@virtual.invalid', name, 'disabled$' +
			rnd, avatar).first();
		const row = await env.DB.prepare("INSERT INTO reviews (user_id, rating, destination, body, status, reply, created_at, updated_at) VALUES (?1,?2,?3,?4,'approved',?5,?6,?6) RETURNING *")
			.bind(u.id, rating, destination, body, h.clean(b.reply, 600) || null, at).first();
		await h.logAct(env, 'Thêm đánh giá ảo #' + row.id, name);
		return h.json({
			...row,
			name,
			virtual: 1
		}, 201);
	}

	const m = pathname.match(/^\/api\/admin\/reviews\/(\d+)$/);
	if (!m) {
		throw new h.HttpError(404, 'Không tìm thấy.');
	}
	const id = Number(m[1]);

	if (method === 'PATCH') {
		const b = await h.readJson(request);
		const sets = [], args = [];
		if ('status' in b) {
			if (!STATUSES.includes(b.status)) {
				throw new h.HttpError(400, 'Trạng thái không hợp lệ.');
			}
			sets.push('status = ?');
			args.push(b.status);
		}
		if ('reply' in b) {
			sets.push('reply = ?');
			args.push(h.clean(b.reply, 600) || null);
		}
		/* Một lượt đọc đủ thông tin chủ đánh giá và số bình chọn thật (dùng cho cả phản hồi lẫn tính lượt thích) */
		const cur = await env.DB.prepare("SELECT r.user_id, u.name, u.email, u.phone, (u.email LIKE '%@virtual.invalid') AS v, (SELECT COUNT(*) FROM review_votes x WHERE x.review_id = r.id) AS votes FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.id = ?1").bind(id).first();
		if (!cur) {
			throw new h.HttpError(404, 'Không tìm thấy đánh giá này.');
		}
		/* Admin chỉnh số lượt thích hiển thị: lưu phần chênh so với bình chọn thật */
		if ('helpful' in b) {
			const n = Number(b.helpful);
			if (!Number.isInteger(n) || n < 0 || n > 1000000) {
				throw new h.HttpError(400, 'Lượt thích phải là số nguyên từ 0 đến 1.000.000.');
			}
			sets.push('helpful_adj = ?');
			args.push(n - cur.votes);
		}
		if (cur.v && ('rating' in b || 'body' in b || 'destination' in b || 'name' in b || 'created_at' in b)) { // chỉ đánh giá ảo mới sửa được nội dung
			if ('rating' in b) {
				sets.push('rating = ?');
				args.push(vRating(h, b.rating));
			}
			if ('body' in b) {
				const t = h.clean(b.body, 600);
				if (t.length < 10) {
					throw new h.HttpError(400, 'Nội dung đánh giá ít nhất 10 ký tự.');
				}
				sets.push('body = ?');
				args.push(t);
			}
			if ('destination' in b) {
				sets.push('destination = ?');
				args.push(h.vDest(b.destination));
			}
			if ('created_at' in b) {
				const t = Number(b.created_at);
				if (Number.isFinite(t) && t > 0 && t <= Date.now()) {
					sets.push('created_at = ?');
					args.push(t);
				}
			}
			if ('name' in b) {
				const n = h.clean(b.name, 60);
				if (n.length < 2) {
					throw new h.HttpError(400, 'Hãy nhập tên người đánh giá.');
				}
				await env.DB.prepare('UPDATE users SET name = ?1 WHERE id = ?2').bind(n, cur.user_id).run();
				cur.name = n;
			}
		}
		if (!sets.length && !(cur.v && 'name' in b)) {
			throw new h.HttpError(400, 'Không có gì để cập nhật.');
		}
		sets.push('updated_at = ?');
		args.push(Date.now());
		const hit = await env.DB.prepare(`UPDATE reviews SET ${sets.join(', ')} WHERE id = ? RETURNING *`).bind(...args, id).first();
		if (!hit) {
			throw new h.HttpError(404, 'Không tìm thấy đánh giá này.');
		}
		const u = { name: cur.name, email: cur.email, phone: cur.phone };
		await h.logAct(env, 'status' in b ? `${STATUS_LABEL[b.status]} đánh giá #${id}` : 'helpful' in b && !('reply' in b) ? `Sửa lượt thích đánh giá #${id} thành ${b.helpful}` : 'Phản hồi đánh giá #' +
			id, u.name);
		if ('status' in b && hit.user_id) {
			await h.notify(hit.user_id, { kind: 'review', title: 'Đánh giá của bạn: ' + STATUS_LABEL[b.status], body: b.status === 'approved' ? 'Cảm ơn bạn! Đánh giá đã được hiển thị trên website.' : 'Đánh giá của bạn chưa được hiển thị công khai.', link: '/reviews' });
		}
		return h.json({ ...hit, ...u, helpful: Math.max(0, hit.helpful_adj + cur.votes) });
	}

	if (method === 'DELETE') {
		const old = await env.DB.prepare("SELECT u.id AS uid, u.name, (u.email LIKE '%@virtual.invalid') AS v FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.id = ?1").bind(id).first();
		if (!old) {
			throw new h.HttpError(404, 'Không tìm thấy đánh giá này.');
		}
		/* Xoá bình chọn + đánh giá (+ tài khoản ẩn của đánh giá ảo) trong một lượt */
		await env.DB.batch([
			env.DB.prepare('DELETE FROM review_votes WHERE review_id = ?1').bind(id),
			env.DB.prepare('DELETE FROM reviews WHERE id = ?1').bind(id),
			env.DB.prepare("DELETE FROM users WHERE id = ?1 AND email LIKE '%@virtual.invalid'").bind(old.uid)
		]);
		await h.logAct(env, 'Xoá đánh giá #' + id, old.name);
		return h.json({ ok: true });
	}

	throw new h.HttpError(404, 'Không tìm thấy.');
}
