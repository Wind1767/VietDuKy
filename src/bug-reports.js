/* Việt Du Ký – báo lỗi website: khách (đăng nhập hoặc không) gửi từ nút "Báo lỗi" dưới chân trang,
quản trị xem, đổi trạng thái và xoá ở mục "Báo lỗi". Nhóm quyền riêng: bugs. */
import { currentUser } from './customer-auth.js';

export const BUG_SCHEMA = [
  'CREATE TABLE IF NOT EXISTS bug_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, page TEXT, contact TEXT, user_id INTEGER, ua TEXT, status TEXT NOT NULL DEFAULT \'new\', note TEXT NOT NULL DEFAULT \'\')',
  'CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON bug_reports(status, created_at)'
];
const STATUSES = ['new', 'doing', 'done'];
const PAGE_SIZE = 15;

/* POST /api/bug-report */
export async function publicBugReport(request, env, ip, h) {
  await h.limit(env, 'bug:' + ip, h.LIMITS.bug);
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) {
    throw new h.HttpError(403, 'Yêu cầu không hợp lệ.');
  }
  const b = await h.readJson(request);
  if (h.clean(b.website, 100)) { // ô ẩn dành cho bot
    return h.json({ ok: true });
  }
  const title = h.clean(b.title, 120);
  const body = h.clean(b.body, 2000);
  const page = h.clean(b.page, 300);
  const contact = h.clean(b.contact, 120);
  if (title.length < 3) {
    throw new h.HttpError(400, 'Hãy nhập tiêu đề ngắn gọn cho lỗi (ít nhất 3 ký tự).');
  }
  if (body.length < 10) {
    throw new h.HttpError(400, 'Hãy mô tả lỗi chi tiết hơn (ít nhất 10 ký tự).');
  }
  let user = null;
  try {
    user = await currentUser(request, env, { HttpError: h.HttpError });
  } catch { /* chưa đăng nhập: vẫn cho báo lỗi */
  }
  const ua = h.clean(request.headers.get('User-Agent'), 300);
  const now = Date.now();
  const row = await env.DB.prepare('INSERT INTO bug_reports (created_at, updated_at, title, body, page, contact, user_id, ua) VALUES (?1, ?1, ?2, ?3, ?4, ?5, ?6, ?7) RETURNING id')
    .bind(now, title, body, page || null, contact || user?.email || null, user ? user.id : null, ua || null).first();
  h.adminMail({
    ...h.notice({
      subject: 'Báo lỗi mới: ' + title,
      eyebrow: 'Báo lỗi website',
      heading: title,
      rows: [['Trang', page], ['Liên hệ', contact || user?.email || ''], ['Tài khoản', user ? user.name : 'Khách chưa đăng nhập'], ['Thiết bị', ua]],
      quote: body,
      button: 'Xem trong trang quản trị',
      link: h.site + '/admin/#/bugs'
    })
  });
  return h.json({ ok: true, id: row.id }, 201);
}

/* GET /api/admin/bugs, GET /api/admin/bug-count, PATCH|DELETE /api/admin/bugs/:id */
export async function adminBugs(request, env, url, h) {
  const { pathname } = url, method = request.method;
  if (pathname === '/api/admin/bug-count' && method === 'GET') {
    const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM bug_reports WHERE status = 'new'").first();
    return h.json({ new: r.n });
  }
  if (pathname === '/api/admin/bugs' && method === 'GET') {
    const status = url.searchParams.get('status');
    const ok = STATUSES.includes(status);
    const page = Math.max(parseInt(url.searchParams.get('page')) || 1, 1);
    const where = ok ? 'WHERE b.status = ?1' : 'WHERE ?1 = ?1';
    const arg = ok ? status : '';
    const total = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM bug_reports b ${where}`).bind(arg).first()).n;
    const { results } = await env.DB.prepare(`SELECT b.*, u.name AS user_name FROM bug_reports b LEFT JOIN users u ON u.id = b.user_id ${where} ORDER BY b.created_at DESC, b.id DESC LIMIT ?2 OFFSET ?3`).bind(arg, PAGE_SIZE, (page - 1) * PAGE_SIZE).all();
    const c = await env.DB.prepare('SELECT status, COUNT(*) AS n FROM bug_reports GROUP BY status').all();
    const counts = { new: 0, doing: 0, done: 0 };
    for (const r of c.results) {
      if (r.status in counts) {
        counts[r.status] = r.n;
      }
    }
    return h.json({ items: results, total, page, pageSize: PAGE_SIZE, counts });
  }
  const m = pathname.match(/^\/api\/admin\/bugs\/(\d+)$/);
  if (m && method === 'PATCH') {
    const b = await h.readJson(request), sets = [], args = [];
    if (b.status !== undefined) {
      if (!STATUSES.includes(b.status)) {
        throw new h.HttpError(400, 'Trạng thái không hợp lệ.');
      }
      sets.push('status = ?' + (args.push(b.status)));
    }
    if (b.note !== undefined) {
      sets.push('note = ?' + (args.push(h.clean(b.note, 1000))));
    }
    if (!sets.length) {
      throw new h.HttpError(400, 'Không có gì để cập nhật.');
    }
    args.push(Date.now(), Number(m[1]));
    const r = await env.DB.prepare(`UPDATE bug_reports SET ${sets.join(', ')}, updated_at = ?${args.length - 1} WHERE id = ?${args.length} RETURNING id`).bind(...args).first();
    if (!r) {
      throw new h.HttpError(404, 'Không tìm thấy báo lỗi.');
    }
    await h.logAct(env, 'Cập nhật báo lỗi', '#' + r.id + (b.status ? ' → ' + b.status : ''));
    return h.json({ ok: true });
  }
  if (m && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM bug_reports WHERE id = ?1').bind(Number(m[1])).run();
    await h.logAct(env, 'Xoá báo lỗi', '#' + m[1]);
    return h.json({ ok: true });
  }
  throw new h.HttpError(404, 'Không tìm thấy.');
}
