import { assertClean } from './profanity.js';
/* Việt Du Ký – nhắn tin kiểu Messenger giữa khách (đã đăng nhập) và quản trị viên, chia theo PHIÊN.
Mỗi khách có nhiều phiên theo thời gian nhưng tối đa MỘT phiên đang mở. Bảng `chat_sessions`:
status = 'open' | 'closed'; created_by / closed_by = 'user' | 'admin'.
Bảng `messages`: session_id, sender = 'user' | 'admin'; read_at = lúc BÊN KIA mở xem (dùng cho dấu "Đã xem"). */
import { currentUser } from './customer-auth.js';

const MAX_BODY = 1000;
const HISTORY = 100;
const TOPICS = ['tour', 'booking', 'payment', 'other'];
const TOPIC_LABEL = {
	tour: 'Tư vấn tour',
	booking: 'Đơn đặt của tôi',
	payment: 'Thanh toán & hoàn huỷ',
	other: 'Khác'
};

const item = m => ({
	id: m.id,
	sender: m.sender,
	body: m.body,
	created_at: m.created_at,
	bot: m.bot || 0
});
const sess = s => s && ({
	id: s.id,
	title: s.title || '',
	topic: s.topic,
	status: s.status,
	created_by: s.created_by,
	closed_by: s.closed_by || null,
	created_at: s.created_at,
	updated_at: s.updated_at,
	closed_at: s.closed_at || null
});
const snippet = (t, n) => {
	const s = String(t || '').replace(/\s+/g, ' ').trim();
	return s.length > n ? s.slice(0, n - 1) + '…' : s;
};

/* ---------- Trả lời tự động: câu hỏi gợi ý + từ khoá ---------- */
const WAIT_DEFAULT = 'Cảm ơn bạn đã nhắn tin! Câu hỏi này mình chưa có câu trả lời soạn sẵn, vui lòng chờ tư vấn viên phản hồi nhé. Nếu cần gấp, bạn gọi hotline 1900 1234.';
const GREET_DEFAULT = 'Xin chào! Việt Du Ký có thể giúp gì cho chuyến đi của bạn? Bạn chọn một câu hỏi bên dưới hoặc nhắn trực tiếp nhé.';
const FAQ_SEED = [
	['Tour Hạ Long giá bao nhiêu?', 'Du thuyền Hạ Long 2 ngày 1 đêm có giá từ khoảng 2.990.000đ/khách, đã gồm tàu, ăn uống và vé tham quan. Giá chính xác theo ngày khởi hành nằm ở mục Tour trên trang chủ, hoặc bạn để lại SĐT để tư vấn viên báo giá nhé.', 'hạ long,ha long,halong'],
	['Đặt tour như thế nào?', 'Bạn bấm "Đặt tour" ở trang Liên hệ, điền họ tên, số điện thoại, điểm đến và ngày đi. Tư vấn viên sẽ gọi lại xác nhận trong 30 phút (8:00 – 21:00).', 'đặt tour,dat tour,cách đặt'],
	['Thanh toán và hoàn huỷ ra sao?', 'Bạn đặt cọc trước một phần để giữ chỗ, phần còn lại thanh toán trước ngày khởi hành. Huỷ sớm theo chính sách của từng tour sẽ được hoàn lại; tư vấn viên sẽ báo chi tiết khi xác nhận đơn.', 'thanh toán,thanh toan,hoàn,huỷ,huy tour,hoan tien'],
	['Liên hệ hotline ở đâu?', 'Hotline 1900 1234 (8:00 – 21:00 hằng ngày) hoặc email buivanphong7191@gmail.com. Văn phòng ở Phan Thiết, Lâm Đồng.', 'hotline,liên hệ,lien he,số điện thoại,sdt']
];
const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();

async function setting(env, key, dflt) {
	const r = await env.DB.prepare('SELECT value FROM settings WHERE key = ?1').bind(key).first();
	return r ? r.value : dflt;
}
export async function ensureFaq(env) {
	await env.DB.prepare('CREATE TABLE IF NOT EXISTS chat_faq (id INTEGER PRIMARY KEY AUTOINCREMENT, question TEXT NOT NULL, answer TEXT NOT NULL, keywords TEXT NOT NULL DEFAULT \'\', sort INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL)').run();
	const seeded = await env.DB.prepare("SELECT 1 FROM settings WHERE key = 'faq_seeded'").first();
	if (seeded) {
		return;
	}
	const now = Date.now();
	await env.DB.batch([
		...FAQ_SEED.map((f, i) => env.DB.prepare('INSERT INTO chat_faq (question, answer, keywords, sort, active, updated_at) VALUES (?1,?2,?3,?4,1,?5)').bind(f[0], f[1], f[2], i, now)),
		env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('faq_seeded', '1')")
	]);
}
async function findFaq(env, text) {
	const t = norm(text);
	const { results } = await env.DB.prepare('SELECT * FROM chat_faq WHERE active = 1 ORDER BY sort, id').all();
	return results.find(f => norm(f.question) === t) ||
		results.find(f => String(f.keywords || '').split(',').map(norm).filter(k => k.length >= 3).some(k => t.includes(k))) || null;
}
async function botSay(env, uid, sid, body, kind) {
	const now = Date.now();
	await env.DB.prepare('UPDATE chat_sessions SET updated_at = ?1 WHERE id = ?2').bind(now + 1, sid).run();
	return env.DB.prepare("INSERT INTO messages (user_id, session_id, sender, body, created_at, read_at, bot) VALUES (?1, ?2, 'admin', ?3, ?4, ?4, ?5) RETURNING id, sender, body, created_at, bot").bind(uid, sid, body, now +
		1, kind).first();
}

function vBody(h, v) {
	const s = h.clean(v, MAX_BODY);
	if (!s) {
		throw new h.HttpError(400, 'Vui lòng nhập nội dung tin nhắn.');
	}
	return s;
}
const vTopic = v => TOPICS.includes(v) ? v : 'other';

/* ---------- Phiên ---------- */
const getSession = (env, id) => env.DB.prepare('SELECT * FROM chat_sessions WHERE id = ?1').bind(id).first();
const openSessionOf = (env, uid) => env.DB.prepare("SELECT * FROM chat_sessions WHERE user_id = ?1 AND status = 'open' ORDER BY id DESC LIMIT 1").bind(uid).first();
async function createSession(env, uid, { topic, title, by }) {
	const now = Date.now();
	return env.DB.prepare("INSERT INTO chat_sessions (user_id, title, topic, status, created_by, created_at, updated_at) VALUES (?1, ?2, ?3, 'open', ?4, ?5, ?5) RETURNING *")
		.bind(uid, snippet(title, 80), vTopic(topic), by, now).first();
}
const touch = (env, sid, now) => env.DB.prepare('UPDATE chat_sessions SET updated_at = ?1 WHERE id = ?2').bind(now, sid).run();
/* Tin đầu tiên của khách đặt tên cho phiên nếu phiên chưa có tên */
const nameFromFirst = (env, s, body) => s.title ? null : env.DB.prepare("UPDATE chat_sessions SET title = ?1 WHERE id = ?2 AND title = ''").bind(snippet(body, 60), s.id).run();

/* Tin nhắn của một phiên: after = 0 lấy HISTORY tin gần nhất, after > 0 chỉ lấy tin mới hơn */
async function thread(env, sid, after) {
	const { results } = after > 0
		? await env.DB.prepare('SELECT id, sender, body, created_at, bot FROM messages WHERE session_id = ?1 AND id > ?2 ORDER BY id ASC LIMIT 200').bind(sid, after).all()
		: await env.DB.prepare('SELECT * FROM (SELECT id, sender, body, created_at, bot FROM messages WHERE session_id = ?1 ORDER BY id DESC LIMIT ?2) ORDER BY id ASC').bind(sid, HISTORY).all();
	return results.map(item);
}

/* id lớn nhất trong các tin của `sender` mà bên kia đã xem */
async function seenUpto(env, sid, sender) {
	const r = await env.DB.prepare('SELECT MAX(id) AS m FROM messages WHERE session_id = ?1 AND sender = ?2 AND read_at IS NOT NULL').bind(sid, sender).first();
	return (r && r.m) || 0;
}

/* Danh sách id các tin còn tồn tại trong HISTORY tin gần nhất: máy khách dùng để bỏ các tin đã bị admin xoá */
async function aliveIds(env, sid) {
	const { results } = await env.DB.prepare('SELECT id FROM messages WHERE session_id = ?1 ORDER BY id DESC LIMIT ?2').bind(sid, HISTORY).all();
	return results.map(r => r.id);
}

const afterParam = url => Math.max(parseInt(url.searchParams.get('after')) || 0, 0);

/* ---------- Phía khách: /api/chat/* ---------- */
export async function handleChat(request, env, url, ip, h) {
	let user = null;
	try {
		user = await currentUser(request, env, h);
	} catch { /* chưa cấu hình khoá phiên */
	}
	if (!user) {
		throw new h.HttpError(401, 'Bạn cần đăng nhập để nhắn tin.', undefined, 'login_required');
	}
	const { pathname } = url, method = request.method;
	const sameOrigin = () => {
		const o = request.headers.get('Origin');
		if (o && o !== url.origin) {
			throw new h.HttpError(403, 'Yêu cầu không hợp lệ.');
		}
	};

	if (pathname === '/api/chat/unread' && method === 'GET') {
		const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM messages WHERE user_id = ?1 AND sender = 'admin' AND read_at IS NULL").bind(user.id).first();
		return h.json({ unread: r.n });
	}

	/* Danh sách phiên của khách (mới nhất trước) */
	if (pathname === '/api/chat/sessions' && method === 'GET') {
		const { results } = await env.DB.prepare('SELECT s.*, (SELECT body FROM messages WHERE session_id = s.id ORDER BY id DESC LIMIT 1) AS last_body, ' +
			"(SELECT COUNT(*) FROM messages WHERE session_id = s.id AND sender = 'admin' AND read_at IS NULL) AS unread " +
			'FROM chat_sessions s WHERE s.user_id = ?1 ORDER BY s.id DESC LIMIT 30').bind(user.id).all();
		const items = results.map(r => ({
			...sess(r),
			last_body: snippet(r.last_body, 80),
			unread: r.unread
		}));
		const open = items.find(s => s.status === 'open');
		return h.json({
			items,
			open: open ? open.id : null,
			topics: TOPIC_LABEL
		});
	}

	/* Tạo phiên mới (chủ đề tuỳ chọn). Đang có phiên mở thì dùng lại phiên đó. */
	if (pathname === '/api/chat/sessions' && method === 'POST') {
		sameOrigin();
		const cur = await openSessionOf(env, user.id);
		if (cur) {
			return h.json({ session: sess(cur), existing: true });
		}
		await h.limit(env, 'chatnew:' + user.id, h.LIMITS.chatnew);
		const b = await h.readJson(request);
		const row = await createSession(env, user.id, {
			topic: b.topic,
			title: '',
			by: 'user'
		});
		return h.json({ session: sess(row), existing: false }, 201);
	}

	/* Kết thúc phiên */
	const cm = pathname.match(/^\/api\/chat\/sessions\/(\d+)\/close$/);
	if (cm && method === 'POST') {
		sameOrigin();
		const s = await getSession(env, Number(cm[1]));
		if (!s || s.user_id !== user.id) {
			throw new h.HttpError(404, 'Không tìm thấy phiên này.');
		}
		if (s.status === 'open') {
			const now = Date.now();
			await env.DB.prepare("UPDATE chat_sessions SET status = 'closed', closed_by = 'user', closed_at = ?1, updated_at = ?1 WHERE id = ?2").bind(now, s.id).run();
		}
		return h.json({ session: sess(await getSession(env, s.id)) });
	}

	if (pathname === '/api/chat/messages' && method === 'GET') {
		const want = Number(url.searchParams.get('session')) || 0;
		let s = want ? await getSession(env, want) : (await openSessionOf(env, user.id));
		if (want && (!s || s.user_id !== user.id)) {
			throw new h.HttpError(404, 'Không tìm thấy phiên này.');
		}
		if (!s) {
			return h.json({
				session: null,
				items: [],
				seen_upto: 0,
				alive: []
			});
		}
		const items = await thread(env, s.id, afterParam(url));
		// Mở khung chat = đã xem các tin của admin
		await env.DB.prepare("UPDATE messages SET read_at = ?1 WHERE session_id = ?2 AND sender = 'admin' AND read_at IS NULL").bind(Date.now(), s.id).run();
		return h.json({
			session: sess(s),
			items,
			seen_upto: await seenUpto(env, s.id, 'user'),
			alive: await aliveIds(env, s.id)
		});
	}

	if (pathname === '/api/chat/faq' && method === 'GET') {
		await ensureFaq(env);
		const { results } = await env.DB.prepare('SELECT id, question FROM chat_faq WHERE active = 1 ORDER BY sort, id LIMIT 12').all();
		return h.json({ items: results, greeting: await setting(env, 'chat_greeting', GREET_DEFAULT) });
	}

	if (pathname === '/api/chat/send' && method === 'POST') {
		sameOrigin();
		await h.limit(env, 'chat:' + user.id, h.LIMITS.chat);
		await ensureFaq(env);
		const b = await h.readJson(request);

		// Chọn phiên: phiên được chỉ định (phải còn mở) > phiên đang mở > tự tạo phiên mới
		let s;
		if (b.session) {
			s = await getSession(env, Number(b.session) || 0);
			if (!s || s.user_id !== user.id) {
				throw new h.HttpError(404, 'Không tìm thấy phiên này.');
			}
			if (s.status !== 'open') {
				throw new h.HttpError(409, 'Phiên trò chuyện này đã kết thúc. Hãy bắt đầu phiên mới.', undefined, 'session_closed');
			}
		} else {
			s = await openSessionOf(env, user.id);
		}

		let faq = null, body;
		if (b.faq) { // khách chọn câu hỏi gợi ý
			faq = await env.DB.prepare('SELECT * FROM chat_faq WHERE id = ?1 AND active = 1').bind(Number(b.faq) || 0).first();
			if (!faq) {
				throw new h.HttpError(404, 'Câu hỏi này không còn nữa.');
			}
			body = faq.question;
		} else {
			body = vBody(h, b.body);
			await assertClean(env, h.HttpError, body);
			faq = await findFaq(env, body); // gõ tay nhưng trùng câu hỏi / từ khoá thì cũng tự trả lời
		}
		let created = false;
		if (!s) {
			await h.limit(env, 'chatnew:' + user.id, h.LIMITS.chatnew);
			s = await createSession(env, user.id, {
				topic: b.topic,
				title: body,
				by: 'user'
			});
			created = true;
		} else {
			await nameFromFirst(env, s, body);
		}

		const now = Date.now();
		const out = { session: sess(await getSession(env, s.id)), created };
		if (faq) {
			// Câu hỏi đã được bot trả lời nên không tính là tin chưa đọc và không gửi email cho admin
			const row = await env.DB.prepare("INSERT INTO messages (user_id, session_id, sender, body, created_at, read_at, bot) VALUES (?1, ?2, 'user', ?3, ?4, ?4, 0) RETURNING id, sender, body, created_at, bot").bind(user.id, s.id, body, now).first();
			const reply = await botSay(env, user.id, s.id, faq.answer, 1);
			return h.json({
				...out,
				item: item(row),
				items: [item(row), item(reply)]
			}, 201);
		}
		// Chỉ báo email cho tin đầu tiên của mỗi đợt, để admin không bị dồn thư khi khách nhắn nhiều tin liên tiếp
		const pending = (await env.DB.prepare("SELECT COUNT(*) AS n FROM messages WHERE session_id = ?1 AND sender = 'user' AND read_at IS NULL").bind(s.id).first()).n;
		const row = await env.DB.prepare("INSERT INTO messages (user_id, session_id, sender, body, created_at, bot) VALUES (?1, ?2, 'user', ?3, ?4, 0) RETURNING id, sender, body, created_at, bot")
			.bind(user.id, s.id, body, now).first();
		await touch(env, s.id, now);
		if (!pending) {
			h.adminMail(h.tpl('chat_admin', {
				ho_ten: user.name,
				ten: String(user.name).trim().split(/\s+/).pop(),
				email: user.email
			}, {
				rows: [['Email', user.email], ['SĐT', user.phone || ''], ['Chủ đề', TOPIC_LABEL[s.topic] || '']],
				quote: body.length > 400 ? body.slice(0, 397) + '…' : body,
				link: h.site + '/admin/#/messages/' + s.id
			}));
		}
		// Báo "chờ admin" một lần cho mỗi đợt (không lặp lại khi khách nhắn tiếp mà admin chưa trả lời)
		const waiting = await env.DB.prepare("SELECT 1 FROM messages WHERE session_id = ?1 AND bot = 2 AND id > COALESCE((SELECT MAX(id) FROM messages WHERE session_id = ?1 AND sender = 'admin' AND bot = 0), 0) AND created_at > ?2").bind(s.id, now - 6 * 3600 * 1000).first();
		const items = [item(row)];
		if (!waiting) {
			items.push(item(await botSay(env, user.id, s.id, await setting(env, 'chat_wait', WAIT_DEFAULT), 2)));
		}
		return h.json({
			...out,
			item: item(row),
			items
		}, 201);
	}

	throw new h.HttpError(404, 'Không tìm thấy.');
}

/* ---------- Phía admin: /api/admin/chat-unread, /api/admin/conversations[/:sid] ---------- */
const REAL = "u.email NOT LIKE '%@virtual.invalid'";
export async function adminChat(request, env, url, h) {
	const { pathname } = url, method = request.method;

	if (pathname === '/api/admin/chat-unread' && method === 'GET') {
		const r = await env.DB.prepare("SELECT COUNT(*) AS n, COUNT(DISTINCT session_id) AS c FROM messages WHERE sender = 'user' AND read_at IS NULL").first();
		return h.json({ unread: r.n, conversations: r.c });
	}

	/* Danh sách phiên: ?status=open|closed|all (mặc định all), ?unread=1, ?q= */
	if (pathname === '/api/admin/conversations' && method === 'GET') {
		const st = url.searchParams.get('status');
		const status = st === 'open' || st === 'closed' ? st : '';
		const { results } = await env.DB.prepare('SELECT s.id, s.user_id, s.title, s.topic, s.status, s.created_by, s.closed_by, s.created_at, s.updated_at, s.closed_at, u.name, u.email, u.phone, u.avatar, ' +
			'm.body AS last_body, m.sender AS last_sender, m.bot AS last_bot, COALESCE(m.created_at, s.created_at) AS last_at, ' +
			"(SELECT COUNT(*) FROM messages x WHERE x.session_id = s.id AND x.sender = 'user' AND x.read_at IS NULL) AS unread, " +
			'(SELECT COUNT(*) FROM messages x WHERE x.session_id = s.id) AS msgs ' +
			'FROM chat_sessions s JOIN users u ON u.id = s.user_id LEFT JOIN messages m ON m.id = (SELECT MAX(id) FROM messages WHERE session_id = s.id) ' +
			`WHERE ${REAL} AND (?1 = '' OR s.status = ?1) ORDER BY (s.status = 'open') DESC, COALESCE(m.created_at, s.created_at) DESC, s.id DESC LIMIT 300`).bind(status).all();
		const c = await env.DB.prepare(`SELECT s.status, COUNT(*) AS n FROM chat_sessions s JOIN users u ON u.id = s.user_id WHERE ${REAL} GROUP BY s.status`).all();
		const counts = { open: 0, closed: 0 };
		c.results.forEach(r => {
			counts[r.status] = r.n;
		});
		return h.json({
			items: results,
			counts,
			topics: TOPIC_LABEL
		});
	}

	/* Tìm khách thật (không phải tài khoản ảo, chưa bị khoá) để mở phiên mới */
	if (pathname === '/api/admin/conversations/customers' && method === 'GET') {
		const q = h.clean(url.searchParams.get('q'), 80);
		const like = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
		const { results } = await env.DB.prepare("SELECT u.id, u.name, u.email, u.phone, u.avatar, EXISTS(SELECT 1 FROM chat_sessions x WHERE x.user_id = u.id) AS has_chat, " +
			"(SELECT id FROM chat_sessions x WHERE x.user_id = u.id AND x.status = 'open' ORDER BY id DESC LIMIT 1) AS open_session FROM users u " +
			"WHERE u.email NOT LIKE '%@virtual.invalid' AND u.blocked_at IS NULL AND (?1 = '' OR u.name LIKE ?2 ESCAPE '\\' OR (?3 = 0 AND (u.email LIKE ?2 ESCAPE '\\' OR u.phone LIKE ?2 ESCAPE '\\'))) ORDER BY u.created_at DESC, u.id DESC LIMIT 30").bind(q, like, url.noPii ? 1 : 0).all();
		return h.json({ items: results });
	}

	/* Tạo phiên mới cho một khách. Khách đang có phiên mở thì trả về phiên đó. */
	if (pathname === '/api/admin/conversations' && method === 'POST') {
		const b = await h.readJson(request);
		const uid = Number(b.user_id) || 0;
		const user = await env.DB.prepare("SELECT id, name FROM users WHERE id = ?1 AND email NOT LIKE '%@virtual.invalid'").bind(uid).first();
		if (!user) {
			throw new h.HttpError(404, 'Không tìm thấy khách này.');
		}
		const cur = await openSessionOf(env, uid);
		if (cur) {
			return h.json({ session: sess(cur), existing: true });
		}
		const row = await createSession(env, uid, {
			topic: b.topic,
			title: h.clean(b.title, 80),
			by: 'admin'
		});
		await h.logAct(env, 'Mở phiên chat #' + row.id, user.name);
		return h.json({ session: sess(row), existing: false }, 201);
	}

	/* Xoá một tin nhắn (cả hai phía đều không còn thấy) */
	const dm = pathname.match(/^\/api\/admin\/conversations\/(\d+)\/messages\/(\d+)$/);
	if (dm) {
		if (method !== 'DELETE') {
			throw new h.HttpError(404, 'Không tìm thấy.');
		}
		const row = await env.DB.prepare('SELECT id, body FROM messages WHERE id = ?1 AND session_id = ?2').bind(Number(dm[2]), Number(dm[1])).first();
		if (!row) {
			throw new h.HttpError(404, 'Tin nhắn này không còn nữa.');
		}
		await env.DB.prepare('DELETE FROM messages WHERE id = ?1').bind(row.id).run();
		await h.logAct(env, 'Xoá tin nhắn #' + row.id + ' ở phiên #' + dm[1], String(row.body).slice(0, 80));
		return h.json({ ok: true });
	}

	const m = pathname.match(/^\/api\/admin\/conversations\/(\d+)$/);
	if (!m) {
		throw new h.HttpError(404, 'Không tìm thấy.');
	}
	const sid = Number(m[1]);
	const s = await getSession(env, sid);
	if (!s) {
		throw new h.HttpError(404, 'Không tìm thấy phiên này.');
	}
	const user = await env.DB.prepare('SELECT id, name, email, phone, avatar FROM users WHERE id = ?1').bind(s.user_id).first();
	if (!user) {
		throw new h.HttpError(404, 'Không tìm thấy khách này.');
	}

	const reopen = async () => {
		const other = await env.DB.prepare("SELECT id FROM chat_sessions WHERE user_id = ?1 AND status = 'open' AND id <> ?2 LIMIT 1").bind(s.user_id, sid).first();
		if (other) {
			throw new h.HttpError(409, 'Khách này đang có phiên #' + other.id +
				' đang mở. Hãy dùng phiên đó hoặc kết thúc nó trước.', undefined, 'other_open');
		}
		await env.DB.prepare("UPDATE chat_sessions SET status = 'open', closed_by = NULL, closed_at = NULL, updated_at = ?1 WHERE id = ?2").bind(Date.now(), sid).run();
	};

	if (method === 'GET') {
		const items = await thread(env, sid, afterParam(url));
		// Admin mở phiên = đã xem các tin của khách
		await env.DB.prepare("UPDATE messages SET read_at = ?1 WHERE session_id = ?2 AND sender = 'user' AND read_at IS NULL").bind(Date.now(), sid).run();
		const { results: others } = await env.DB.prepare('SELECT s.id, s.title, s.topic, s.status, s.updated_at, (SELECT COUNT(*) FROM messages WHERE session_id = s.id) AS msgs FROM chat_sessions s WHERE s.user_id = ?1 ORDER BY s.id DESC LIMIT 20').bind(s.user_id).all();
		return h.json({
			session: sess(s),
			user,
			items,
			seen_upto: await seenUpto(env, sid, 'admin'),
			alive: await aliveIds(env, sid),
			others,
			topics: TOPIC_LABEL
		});
	}

	if (method === 'POST') {
		const body = vBody(h, (await h.readJson(request)).body);
		if (s.status === 'closed') {
			await reopen();
		} // trả lời vào phiên đã kết thúc sẽ mở lại phiên
		const pending = (await env.DB.prepare("SELECT COUNT(*) AS n FROM messages WHERE session_id = ?1 AND sender = 'admin' AND read_at IS NULL").bind(sid).first()).n;
		const now = Date.now();
		const row = await env.DB.prepare("INSERT INTO messages (user_id, session_id, sender, body, created_at) VALUES (?1, ?2, 'admin', ?3, ?4) RETURNING id, sender, body, created_at, bot")
			.bind(s.user_id, sid, body, now).first();
		await touch(env, sid, now);
		// Báo email cho khách (tin đầu tiên của đợt chưa được xem) để khách biết mà quay lại đọc
		if (!pending) {
			const first = String(user.name).trim().split(/\s+/).pop();
			h.mail(user.email, h.tpl('chat_user', {
				ten: first,
				ho_ten: user.name,
				email: user.email
			}, {
				quote: body.length > 400 ? body.slice(0, 397) + '…' : body, link: h.site + '/?chat=1'
			}));
		}
		return h.json({ item: item(row), session: sess(await getSession(env, sid)) }, 201);
	}

	/* Kết thúc / mở lại / đổi tên / đổi chủ đề */
	if (method === 'PATCH') {
		const b = await h.readJson(request);
		const sets = [], args = [];
		if ('title' in b) {
			sets.push('title = ?');
			args.push(snippet(h.clean(b.title, 80), 80));
		}
		if ('topic' in b) {
			if (!TOPICS.includes(b.topic)) {
				throw new h.HttpError(400, 'Chủ đề không hợp lệ.');
			}
			sets.push('topic = ?');
			args.push(b.topic);
		}
		if ('status' in b) {
			if (b.status !== 'open' && b.status !== 'closed') {
				throw new h.HttpError(400, 'Trạng thái không hợp lệ.');
			}
			if (b.status === 'open' && s.status === 'closed') {
				await reopen();
			} else if (b.status === 'closed' && s.status === 'open') {
				const now = Date.now();
				sets.push("status = 'closed'", "closed_by = 'admin'", 'closed_at = ?', 'updated_at = ?');
				args.push(now, now);
			}
		}
		if (sets.length) {
			await env.DB.prepare(`UPDATE chat_sessions SET ${sets.join(', ')} WHERE id = ?`).bind(...args, sid).run();
		} else if (!('status' in b)) {
			throw new h.HttpError(400, 'Không có gì để cập nhật.');
		}
		const now2 = await getSession(env, sid);
		if ('status' in b && now2.status !== s.status) {
			await h.logAct(env, (now2.status === 'closed' ? 'Kết thúc' : 'Mở lại') + ' phiên chat #' + sid, user.name);
		}
		return h.json({ session: sess(now2) });
	}

	/* Xoá cả phiên (kèm toàn bộ tin nhắn) */
	if (method === 'DELETE') {
		await env.DB.batch([
			env.DB.prepare('DELETE FROM messages WHERE session_id = ?1').bind(sid),
			env.DB.prepare('DELETE FROM chat_sessions WHERE id = ?1').bind(sid)
		]);
		await h.logAct(env, 'Xoá phiên chat #' + sid, user.name);
		return h.json({ ok: true });
	}

	throw new h.HttpError(404, 'Không tìm thấy.');
}

/* ---------- Admin: /api/admin/faq (câu hỏi gợi ý + lời nhắn chờ) ---------- */
export async function adminFaq(request, env, url, h) {
	const { pathname } = url, method = request.method;
	await ensureFaq(env);
	const bad = msg => {
		throw new h.HttpError(400, msg);
	};
	if (pathname === '/api/admin/faq' && method === 'GET') {
		const { results } = await env.DB.prepare('SELECT * FROM chat_faq ORDER BY sort, id').all();
		return h.json({
			items: results,
			wait: await setting(env, 'chat_wait', WAIT_DEFAULT),
			greeting: await setting(env, 'chat_greeting', GREET_DEFAULT)
		});
	}
	if (pathname === '/api/admin/faq/settings' && method === 'PUT') {
		const b = await h.readJson(request);
		const wait = h.clean(b.wait, 500), greeting = h.clean(b.greeting, 300);
		if (!wait || !greeting) {
			bad('Lời chào và lời nhắn chờ không được để trống.');
		}
		await env.DB.batch([
			env.DB.prepare('INSERT INTO settings (key, value) VALUES (\'chat_wait\', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(wait),
			env.DB.prepare('INSERT INTO settings (key, value) VALUES (\'chat_greeting\', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(greeting)
		]);
		await h.logAct(env, 'Sửa lời chào / lời nhắn chờ của chat', '');
		return h.json({ ok: true });
	}
	const fields = b => {
		const question = h.clean(b.question, 120), answer = String(b.answer == null ? '' : b.answer).trim().slice(0, 1000), keywords = h.clean(b.keywords, 300);
		if (question.length < 3) {
			bad('Câu hỏi cần ít nhất 3 ký tự.');
		}
		if (answer.length < 2) {
			bad('Hãy nhập câu trả lời.');
		}
		return {
			question,
			answer,
			keywords
		};
	};
	if (pathname === '/api/admin/faq' && method === 'POST') {
		const f = fields(await h.readJson(request));
		const max = (await env.DB.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM chat_faq').first()).m;
		const row = await env.DB.prepare('INSERT INTO chat_faq (question, answer, keywords, sort, active, updated_at) VALUES (?1,?2,?3,?4,1,?5) RETURNING *').bind(f.question, f.answer, f.keywords, max +
			1, Date.now()).first();
		await h.logAct(env, 'Thêm câu trả lời tự động', f.question);
		return h.json({ item: row }, 201);
	}
	const m = pathname.match(/^\/api\/admin\/faq\/(\d+)$/);
	if (!m) {
		throw new h.HttpError(404, 'Không tìm thấy.');
	}
	const id = Number(m[1]);
	if (method === 'PATCH') {
		const b = await h.readJson(request), old = await env.DB.prepare('SELECT * FROM chat_faq WHERE id = ?1').bind(id).first();
		if (!old) {
			throw new h.HttpError(404, 'Không tìm thấy.');
		}
		const f = 'question' in b || 'answer' in b ? fields({
			question: b.question ?? old.question,
			answer: b.answer ?? old.answer,
			keywords: 'keywords' in b ? b.keywords : old.keywords
		}) : {
			question: old.question,
			answer: old.answer,
			keywords: old.keywords
		};
		const active = 'active' in b ? (b.active ? 1 : 0) : old.active, sort = Number.isFinite(Number(b.sort)) && 'sort' in b ? Number(b.sort) : old.sort;
		const row = await env.DB.prepare('UPDATE chat_faq SET question = ?1, answer = ?2, keywords = ?3, active = ?4, sort = ?5, updated_at = ?6 WHERE id = ?7 RETURNING *').bind(f.question, f.answer, f.keywords, active, sort, Date.now(), id).first();
		await h.logAct(env, 'Sửa câu trả lời tự động', f.question);
		return h.json({ item: row });
	}
	if (method === 'DELETE') {
		const old = await env.DB.prepare('SELECT question FROM chat_faq WHERE id = ?1').bind(id).first();
		if (!old) {
			throw new h.HttpError(404, 'Không tìm thấy.');
		}
		await env.DB.prepare('DELETE FROM chat_faq WHERE id = ?1').bind(id).run();
		await h.logAct(env, 'Xoá câu trả lời tự động', old.question);
		return h.json({ ok: true });
	}
	throw new h.HttpError(404, 'Không tìm thấy.');
}
