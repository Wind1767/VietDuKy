/* Email mẫu chỉnh được trong trang quản trị.
Mỗi loại email có một bộ chữ mặc định (đúng như trước đây). Quản trị chỉ lưu phần đã sửa (bảng email_templates),
chỗ nào để trống thì dùng lại chữ mặc định. Chữ có thể chứa biến dạng {ten}, {diem_den}... được thay khi gửi.
Bố cục (logo, màu, nút) cố định; không cho nhập HTML, mọi chữ đều được escape khi dựng thư. */
import { getSite } from './site-settings.js';

export const TPL_SCHEMA = [
	'CREATE TABLE IF NOT EXISTS email_templates (key TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)'
];

const F = {
	subject: { label: 'Tiêu đề thư', max: 150 },
	eyebrow: { label: 'Dòng nhỏ phía trên tiêu đề', max: 40 },
	heading: { label: 'Tiêu đề lớn trong thư', max: 160 },
	intro: {
		label: 'Đoạn mở đầu',
		max: 600,
		multi: true
	},
	button: { label: 'Chữ trên nút', max: 40 },
	note: { label: 'Ghi chú dưới nút', max: 160 },
	footer: {
		label: 'Dòng chân thư',
		max: 300,
		multi: true
	}
};
const V = {
	ten: 'Tên gọi của người nhận (từ cuối của họ tên, ví dụ “An”)',
	ho_ten: 'Họ và tên đầy đủ',
	email: 'Email của khách',
	diem_den: 'Điểm đến của đơn',
	ma_don: 'Mã đơn (số)',
	sao: 'Số sao khách chấm (1–5)',
	hotline: 'Số hotline trong Cài đặt website',
	ten_web: 'Tên website trong Cài đặt website'
};
const vars = (...k) => k.concat(['hotline', 'ten_web']);

/* label: tên hiện trong trang quản trị · to: ai nhận · fields: ô được sửa · vars: biến dùng được · def: chữ mặc định */
export const TEMPLATES = {
	verify: {
		label: 'Xác minh email đăng ký',
		to: 'Khách',
		fields: ['subject', 'eyebrow', 'heading', 'intro', 'button', 'note', 'footer'],
		vars: vars('ten', 'email'),
		def: {
			subject: 'Xác minh email để hoàn tất tài khoản Việt Du Ký',
			eyebrow: 'Xác minh email',
			heading: 'Xin chào {ten}, chào mừng bạn lên đường!',
			intro: 'Cảm ơn bạn đã tạo tài khoản Việt Du Ký. Chỉ còn một bước nữa: bấm nút bên dưới để xác minh địa chỉ {email}, rồi bạn có thể đăng nhập và bắt đầu đặt tour.',
			button: 'Xác minh email của tôi',
			note: 'Liên kết có hiệu lực trong 24 giờ.',
			footer: 'Bạn nhận được email này vì có người dùng địa chỉ này để đăng ký tại Việt Du Ký. Nếu không phải bạn, cứ bỏ qua email này, tài khoản sẽ không được kích hoạt.'
		}
	},
	reset: {
		label: 'Đặt lại mật khẩu',
		to: 'Khách',
		fields: ['subject', 'eyebrow', 'heading', 'intro', 'button', 'footer'],
		vars: vars('ten', 'email'),
		def: {
			subject: 'Đặt lại mật khẩu Việt Du Ký',
			eyebrow: 'Đặt lại mật khẩu',
			heading: 'Xin chào {ten}, đặt lại mật khẩu của bạn',
			intro: 'Bấm nút bên dưới để chọn mật khẩu mới. Liên kết có hiệu lực trong 1 giờ.',
			button: 'Đặt mật khẩu mới',
			footer: 'Nếu bạn không yêu cầu, cứ bỏ qua email này, mật khẩu hiện tại vẫn giữ nguyên.'
		}
	},
	booking_user: {
		label: 'Đã nhận yêu cầu đặt tour',
		to: 'Khách',
		fields: ['subject', 'eyebrow', 'heading', 'intro', 'button', 'footer'],
		vars: vars('ten', 'ho_ten', 'diem_den'),
		def: {
			subject: 'Việt Du Ký đã nhận yêu cầu đặt tour của bạn',
			eyebrow: 'Đã nhận yêu cầu',
			heading: 'Cảm ơn {ten}, chúng tôi đã nhận được yêu cầu',
			intro: 'Tư vấn viên sẽ gọi cho bạn trong 30 phút (8:00 – 21:00 hằng ngày). Bạn cũng có thể theo dõi đơn trong tài khoản.',
			button: 'Xem đơn của tôi',
			footer: 'Bạn nhận được email này vì đã đặt tour tại Việt Du Ký.'
		}
	},
	booking_won: {
		label: 'Đơn đã được chốt',
		to: 'Khách',
		fields: ['subject', 'eyebrow', 'heading', 'intro', 'button', 'footer'],
		vars: vars('ten', 'ho_ten', 'diem_den', 'ma_don'),
		def: {
			subject: 'Đơn đặt tour của bạn đã được chốt',
			eyebrow: 'Đã chốt',
			heading: 'Chuyến đi của bạn đã được xác nhận',
			intro: 'Việt Du Ký đã chốt đơn của bạn. Tư vấn viên sẽ gửi chi tiết lịch trình và hướng dẫn thanh toán.',
			button: 'Xem đơn của tôi',
			footer: 'Cần hỗ trợ? Gọi hotline {hotline}.'
		}
	},
	chat_user: {
		label: 'Báo khách có tin nhắn trả lời',
		to: 'Khách',
		fields: ['subject', 'eyebrow', 'heading', 'intro', 'button', 'footer'],
		vars: vars('ten', 'ho_ten'),
		def: {
			subject: 'Việt Du Ký vừa trả lời bạn',
			eyebrow: 'Tin nhắn mới',
			heading: 'Xin chào {ten}, bạn có tin nhắn mới',
			intro: 'Tư vấn viên Việt Du Ký vừa trả lời bạn:',
			button: 'Mở cuộc trò chuyện',
			footer: 'Bạn nhận được email này vì đã trò chuyện với Việt Du Ký trên website.'
		}
	},
	booking_admin: {
		label: 'Báo admin có đơn mới',
		to: 'Quản trị viên',
		fields: ['subject', 'eyebrow', 'heading', 'button', 'footer'],
		vars: vars('ho_ten', 'diem_den'),
		def: {
			subject: 'Đơn đặt tour mới từ {ho_ten}',
			eyebrow: 'Đơn mới',
			heading: '{ho_ten} vừa gửi yêu cầu đặt tour',
			button: 'Xem đơn trong trang quản trị',
			footer: 'Email tự động gửi tới quản trị viên.'
		}
	},
	cancel_admin: {
		label: 'Báo admin khách huỷ đơn',
		to: 'Quản trị viên',
		fields: ['subject', 'eyebrow', 'heading', 'button', 'footer'],
		vars: vars('ho_ten', 'diem_den', 'ma_don'),
		def: {
			subject: 'Khách huỷ đơn #{ma_don}',
			eyebrow: 'Đơn bị huỷ',
			heading: '{ho_ten} vừa huỷ đơn đặt tour',
			button: 'Xem trong trang quản trị',
			footer: 'Email tự động gửi tới quản trị viên.'
		}
	},
	chat_admin: {
		label: 'Báo admin có tin nhắn mới',
		to: 'Quản trị viên',
		fields: ['subject', 'eyebrow', 'heading', 'button', 'footer'],
		vars: vars('ho_ten'),
		def: {
			subject: 'Tin nhắn mới từ {ho_ten}',
			eyebrow: 'Tin nhắn mới',
			heading: '{ho_ten} vừa nhắn cho bạn',
			button: 'Trả lời trong trang quản trị',
			footer: 'Email tự động gửi tới quản trị viên. Các tin tiếp theo trong cùng đợt sẽ không gửi thêm email.'
		}
	},
	review_admin: {
		label: 'Báo admin có đánh giá mới',
		to: 'Quản trị viên',
		fields: ['subject', 'eyebrow', 'heading', 'button', 'footer'],
		vars: vars('ho_ten', 'sao', 'diem_den'),
		def: {
			subject: 'Đánh giá mới chờ duyệt từ {ho_ten}',
			eyebrow: 'Đánh giá mới',
			heading: '{ho_ten} vừa gửi đánh giá {sao}/5 sao',
			button: 'Duyệt trong trang quản trị',
			footer: 'Đánh giá chỉ hiện trên website sau khi bạn duyệt.'
		}
	}
};
/* Dữ liệu minh hoạ cho xem thử / gửi thử */
export const SAMPLE_VARS = {
	ten: 'An',
	ho_ten: 'Nguyễn Văn An',
	email: 'an@example.com',
	diem_den: 'Hội An',
	ma_don: '1024',
	sao: '5'
};
export const SAMPLE_EXTRA = {
	verify: { link: 'https://example.com/verify?token=abc123' },
	reset: { link: 'https://example.com/reset?token=abc123' },
	booking_user: { rows: [['Điểm đến', 'Hội An'], ['Ngày đi', '20/12/2026'], ['Số người', '4'], ['SĐT liên hệ', '0912345678']], link: 'https://example.com/account' },
	booking_won: { rows: [['Điểm đến', 'Hội An'], ['Ngày đi', '20/12/2026'], ['Số người', '4']], link: 'https://example.com/account' },
	chat_user: { quote: 'Chào bạn, tour Hội An – Huế 3 ngày 2 đêm vẫn còn chỗ ngày 20/12 nhé.', link: 'https://example.com/?chat=1' },
	booking_admin: {
		rows: [['Họ tên', 'Nguyễn Văn An'], ['SĐT', '0912345678'], ['Điểm đến', 'Hội An']],
		quote: 'Mình muốn đi 4 người, có xe đón sân bay không ạ?',
		link: 'https://example.com/admin/#/bookings'
	},
	cancel_admin: { rows: [['Điểm đến', 'Hội An'], ['Email', 'an@example.com']], link: 'https://example.com/admin/#/bookings' },
	chat_admin: {
		rows: [['Email', 'an@example.com']],
		quote: 'Cho mình hỏi tour Hội An còn chỗ ngày 20/12 không ạ?',
		link: 'https://example.com/admin/#/messages/1'
	},
	review_admin: {
		rows: [['Điểm đến', 'Hội An']],
		quote: 'Chuyến đi tuyệt vời, hướng dẫn viên rất nhiệt tình.',
		link: 'https://example.com/admin/#/reviews'
	}
};

/* Thay {biến} trong chữ; biến lạ giữ nguyên để người sửa nhìn thấy lỗi gõ */
export const fill = (s, v) => String(s == null ? '' : s).replace(/\{([a-z_]+)\}/g, (m, k) => (v && v[k] != null ? String(v[k]) : m));

/* ---------- Đọc dữ liệu đã lưu (cache ngắn) ---------- */
let cache = null;
export const dropTplCache = () => {
	cache = null;
};
async function overrides(env) {
	if (cache && cache.at > Date.now() - 15000) {
		return cache.v;
	}
	const v = {};
	try {
		const { results } = await env.DB.prepare('SELECT key, data FROM email_templates').all();
		for (const r of results) {
			try {
				v[r.key] = JSON.parse(r.data);
			} catch { /* bỏ qua dòng hỏng */
			}
		}
	} catch { /* chưa có bảng: dùng mặc định */
	}
	cache = { at: Date.now(), v };
	return v;
}
/* Chữ hiệu lực của một loại email (mặc định + phần đã sửa), CHƯA thay biến */
export async function getTpl(env, key) {
	const t = TEMPLATES[key];
	if (!t) {
		throw new Error('Loại email không tồn tại: ' + key);
	}
	const o = (await overrides(env))[key] || {};
	const out = { ...t.def };
	for (const f of t.fields) {
		if (typeof o[f] === 'string' && o[f].trim()) {
			out[f] = o[f];
		}
	}
	return out;
}
/* Chữ đã thay biến, sẵn sàng đưa vào noticeEmail */
export async function tplFields(env, key, v) {
	const t = await getTpl(env, key), site = await getSite(env).catch(() => ({}));
	const all = {
		hotline: site.hotline || '',
		ten_web: site.site_name || 'Việt Du Ký',
		...v
	};
	return { fields: Object.fromEntries(Object.entries(t).map(([k, s]) => [k, fill(s, all)])), vars: all };
}

/* ---------- Làm sạch dữ liệu gửi lên ---------- */
export function cleanFields(key, b, bad) {
	const t = TEMPLATES[key], out = {};
	b = b && typeof b === 'object' ? b : {};
	for (const f of t.fields) {
		if (!(f in b)) {
			continue;
		}
		const s = String(b[f] == null ? '' : b[f]).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/\r\n?/g, '\n').trim();
		if (s.length > F[f].max) {
			bad(`“${F[f].label}” tối đa ${F[f].max} ký tự.`);
		}
		if (!F[f].multi && s.includes('\n')) {
			bad(`“${F[f].label}” chỉ một dòng.`);
		}
		if (f === 'subject' && !s) {
			continue;
		}
		out[f] = s;
	}
	return out;
}

/* GET /api/admin/email-templates · PUT|DELETE /…/:key · POST /…/:key/preview|test */
export async function adminEmailTpl(request, env, url, h, noticeEmail, verifyEmail, sendEmail) {
	const m = url.pathname.match(/^\/api\/admin\/email-templates(?:\/([a-z_]+)(?:\/(preview|test))?)?$/), method = request.method;
	if (!m) {
		throw new h.HttpError(404, 'Không tìm thấy.');
	}
	const bad = msg => {
		throw new h.HttpError(400, msg);
	};
	const list = async () => {
		const o = await overrides(env);
		return { items: Object.entries(TEMPLATES).map(([key, t]) => ({
				key,
				label: t.label,
				to: t.to,
				defaults: t.def,
				values: Object.fromEntries(t.fields.map(f => [f, (typeof (o[key] || {})[f] === 'string' && o[key][f].trim()) ? o[key][f] : t.def[f]])),
				custom: Object.keys(o[key] || {}).some(f => t.fields.includes(f) && String(o[key][f] || '').trim() && o[key][f] !== t.def[f]),
				fields: t.fields.map(f => ({
					name: f,
					label: F[f].label,
					max: F[f].max,
					multi: !!F[f].multi
				})),
				vars: t.vars.map(k => ({ name: k, desc: V[k] }))
			})) };
	};
	if (!m[1] && method === 'GET') {
		return h.json(await list());
	}
	const key = m[1];
	if (!TEMPLATES[key]) {
		throw new h.HttpError(404, 'Không tìm thấy loại email này.');
	}
	const t = TEMPLATES[key];
	// Dựng thư từ chữ đang soạn (chưa lưu) để xem thử / gửi thử
	const build = async (fields) => {
		const base = await getTpl(env, key), merged = { ...base, ...Object.fromEntries(Object.entries(fields).filter(([, s]) => s)) };
		const site = await getSite(env).catch(() => ({})), all = {
			hotline: site.hotline || '',
			ten_web: site.site_name || 'Việt Du Ký',
			...SAMPLE_VARS
		};
		const f = Object.fromEntries(Object.entries(merged).map(([k, s]) => [k, fill(s, all)])), ex = SAMPLE_EXTRA[key] || {};
		return key === 'verify' ? verifyEmail({
			name: SAMPLE_VARS.ho_ten,
			email: SAMPLE_VARS.email,
			link: ex.link,
			site: h.site
		}, merged, all) : noticeEmail({ ...f, ...ex });
	};
	if (m[2] === 'preview' && method === 'POST') {
		const b = await h.readJson(request), mail = await build(cleanFields(key, b.fields, bad));
		return h.json({ subject: mail.subject, html: mail.html });
	}
	if (m[2] === 'test' && method === 'POST') {
		if (!h.adminTo) {
			bad('Chưa có địa chỉ email quản trị để nhận thư thử (ADMIN_EMAIL hoặc GMAIL_USER).');
		}
		const b = await h.readJson(request), mail = await build(cleanFields(key, b.fields, bad));
		try {
			await sendEmail(env, {
				to: h.adminTo,
				...mail,
				subject: '[Thử] ' + mail.subject
			});
		} catch (err) {
			throw new h.HttpError(502, String(err && err.message || 'Gửi email thất bại.'));
		}
		await h.logAct(env, 'Gửi thử email mẫu', t.label + ' → ' + h.adminTo);
		return h.json({ ok: true, to: h.adminTo });
	}
	if (!m[2] && method === 'PUT') {
		const b = await h.readJson(request), f = cleanFields(key, b.fields, bad), keep = {};
		for (const [k, s] of Object.entries(f)) {
			if (s && s !== t.def[k]) {
				keep[k] = s;
			}
		} // chỉ lưu chỗ khác mặc định
		if (Object.keys(keep).length) {
			await env.DB.prepare('INSERT INTO email_templates (key, data, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at').bind(key, JSON.stringify(keep), Date.now()).run();
		} else {
			await env.DB.prepare('DELETE FROM email_templates WHERE key = ?1').bind(key).run();
		}
		dropTplCache();
		await h.logAct(env, 'Sửa email mẫu', t.label);
		return h.json(await list());
	}
	if (!m[2] && method === 'DELETE') {
		await env.DB.prepare('DELETE FROM email_templates WHERE key = ?1').bind(key).run();
		dropTplCache();
		await h.logAct(env, 'Khôi phục email mẫu', t.label);
		return h.json(await list());
	}
	throw new h.HttpError(405, 'Phương thức không hỗ trợ.');
}
