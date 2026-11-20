/* Việt Du Ký – hòm thư thông báo của khách. Mọi thông báo (đổi trạng thái đơn / báo lỗi / đánh giá, thông báo do admin gửi)
đều rơi vào đây. user_id NULL = gửi cho tất cả khách. Trạng thái đã đọc lưu riêng từng khách ở notif_reads. */
import { currentUser } from './customer-auth.js';

export const INBOX_SCHEMA = [
  'CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, kind TEXT NOT NULL DEFAULT \'admin\', title TEXT NOT NULL, body TEXT NOT NULL DEFAULT \'\', image TEXT, link TEXT, created_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, id)',
  'CREATE INDEX IF NOT EXISTS idx_notifications_kind ON notifications(kind, id)',
  'CREATE INDEX IF NOT EXISTS idx_notifications_bc ON notifications(user_id, created_at)',
  'CREATE TABLE IF NOT EXISTS notif_reads (user_id INTEGER NOT NULL, notif_id INTEGER NOT NULL, PRIMARY KEY (user_id, notif_id))'
];

const okLink = v => (typeof v === 'string' && /^(\/(?!\/)|https:\/\/)/.test(v) ? v.slice(0, 300) : null);
const okImage = v => (typeof v === 'string' && /^https:\/\//.test(v) ? v.slice(0, 500) : null);

/* Gửi một thông báo cho một khách (userId) hoặc tất cả (null). Không bao giờ làm hỏng việc chính. */
export async function notify(env, userId, { kind = 'system', title, body = '', image = null, link = null }) {
  try {
    await env.DB.prepare('INSERT INTO notifications (user_id, kind, title, body, image, link, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
      .bind(userId, kind, String(title).slice(0, 120), String(body).slice(0, 20000), okImage(image), okLink(link), Date.now()).run();
  } catch (e) {
    console.error('Gửi thông báo lỗi:', e && e.message || e);
  }
}

const VISIBLE = '(n.user_id = ?1 OR (n.user_id IS NULL AND n.created_at >= ?2))';

/* GET /api/inbox, GET /api/inbox/count, POST /api/inbox/read */
export async function handleInbox(request, env, url, h) {
  const user = await currentUser(request, env, { HttpError: h.HttpError });
  if (!user) {
    throw new h.HttpError(401, 'Bạn cần đăng nhập.');
  }
  const since = user.created_at || 0, { pathname } = url, method = request.method;
  const unreadSql = `SELECT COUNT(*) AS n FROM notifications n WHERE ${VISIBLE} AND NOT EXISTS (SELECT 1 FROM notif_reads r WHERE r.user_id = ?1 AND r.notif_id = n.id)`;
  if (pathname === '/api/inbox/count' && method === 'GET') {
    return h.json({ unread: (await env.DB.prepare(unreadSql).bind(user.id, since).first()).n });
  }
  if (pathname === '/api/inbox' && method === 'GET') {
    const [list, cnt] = await env.DB.batch([
      env.DB.prepare(`SELECT n.id, n.kind, n.title, n.body, n.image, n.link, n.created_at, EXISTS (SELECT 1 FROM notif_reads r WHERE r.user_id = ?1 AND r.notif_id = n.id) AS read FROM notifications n WHERE ${VISIBLE} ORDER BY n.id DESC LIMIT 60`).bind(user.id, since),
      env.DB.prepare(unreadSql).bind(user.id, since)
    ]);
    return h.json({ items: list.results, unread: cnt.results[0].n });
  }
  if (pathname === '/api/inbox/read' && method === 'POST') {
    const b = await h.readJson(request);
    if (b.all) {
      await env.DB.prepare(`INSERT OR IGNORE INTO notif_reads (user_id, notif_id) SELECT ?1, n.id FROM notifications n WHERE ${VISIBLE}`).bind(user.id, since).run();
    } else if (Number.isInteger(b.id)) {
      await env.DB.prepare(`INSERT OR IGNORE INTO notif_reads (user_id, notif_id) SELECT ?1, n.id FROM notifications n WHERE n.id = ?3 AND ${VISIBLE}`).bind(user.id, since, b.id).run();
    }
    return h.json({ ok: true });
  }
  throw new h.HttpError(404, 'Không tìm thấy.');
}

/* Admin: GET /api/admin/inbox (lịch sử đã gửi), POST (gửi), DELETE /api/admin/inbox/:id */
export async function adminInbox(request, env, url, h) {
  const { pathname } = url, method = request.method;
  if (pathname === '/api/admin/inbox' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT n.*, u.name AS user_name, u.email AS user_email FROM notifications n LEFT JOIN users u ON u.id = n.user_id WHERE n.kind IN (\'admin\', \'post\') ORDER BY n.id DESC LIMIT 50').all();
    return h.json({ items: results });
  }
  if (pathname === '/api/admin/inbox' && method === 'POST') {
    const b = await h.readJson(request);
    const post = b.format === 'post';
    const title = h.clean(b.title, 120), body = h.clean(b.body, post ? 20000 : 2000);
    if (post && body.length < 10) {
      throw new h.HttpError(400, 'Bài viết cần nội dung ít nhất 10 ký tự.');
    }
    if (title.length < 2) {
      throw new h.HttpError(400, 'Hãy nhập tiêu đề thông báo.');
    }
    let uid = null, who = 'tất cả khách';
    if (b.to && b.to !== 'all') {
      const email = h.clean(b.to, 120).toLowerCase();
      const u = await env.DB.prepare('SELECT id, name FROM users WHERE lower(email) = ?1').bind(email).first();
      if (!u) {
        throw new h.HttpError(404, 'Không tìm thấy khách có email này.');
      }
      uid = u.id;
      who = u.name;
    }
    const image = b.image ? okImage(b.image) : null;
    if (b.image && !image) {
      throw new h.HttpError(400, 'Ảnh phải là đường dẫn https.');
    }
    await notify(env, uid, { kind: post ? 'post' : 'admin', title, body, image, link: b.link });
    await h.logAct(env, 'Gửi thông báo', title + ' → ' + who);
    return h.json({ ok: true }, 201);
  }
  const m = pathname.match(/^\/api\/admin\/inbox\/(\d+)$/);
  if (m && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM notifications WHERE id = ?1').bind(Number(m[1])).run();
    await env.DB.prepare('DELETE FROM notif_reads WHERE notif_id = ?1').bind(Number(m[1])).run();
    await h.logAct(env, 'Xoá thông báo', '#' + m[1]);
    return h.json({ ok: true });
  }
  throw new h.HttpError(404, 'Không tìm thấy.');
}
