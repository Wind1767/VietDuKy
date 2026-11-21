/* Việt Du Ký – hòm thư thông báo của khách. Mọi thông báo (đổi trạng thái đơn / báo lỗi / đánh giá, thông báo do admin gửi)
đều rơi vào đây. user_id NULL = gửi cho tất cả khách. Trạng thái đã đọc lưu riêng từng khách ở notif_reads. */
import { currentUser } from './customer-auth.js';

export const INBOX_SCHEMA = [
  'CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, kind TEXT NOT NULL DEFAULT \'admin\', title TEXT NOT NULL, body TEXT NOT NULL DEFAULT \'\', image TEXT, link TEXT, created_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, id)',
  'CREATE INDEX IF NOT EXISTS idx_notifications_kind ON notifications(kind, id)',
  'CREATE INDEX IF NOT EXISTS idx_notifications_bc ON notifications(user_id, created_at)',
  'CREATE TABLE IF NOT EXISTS notif_reads (user_id INTEGER NOT NULL, notif_id INTEGER NOT NULL, PRIMARY KEY (user_id, notif_id))',
  'CREATE TABLE IF NOT EXISTS notif_hidden (user_id INTEGER NOT NULL, notif_id INTEGER NOT NULL, PRIMARY KEY (user_id, notif_id))'
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

/* Khách xoá thông báo = ẩn riêng với họ (thông báo gửi cho tất cả vẫn còn với người khác) */
export const VISIBLE = '((n.user_id = ?1 OR (n.user_id IS NULL AND n.created_at >= ?2)) AND NOT EXISTS (SELECT 1 FROM notif_hidden x WHERE x.user_id = ?1 AND x.notif_id = n.id))';

/* Xoá hẳn thông báo (theo điều kiện) cùng dấu đã đọc / đã ẩn của chúng */
async function purge(env, where, arg) {
  await env.DB.prepare(`DELETE FROM notif_reads WHERE notif_id IN (SELECT id FROM notifications WHERE ${where})`).bind(arg).run();
  await env.DB.prepare(`DELETE FROM notif_hidden WHERE notif_id IN (SELECT id FROM notifications WHERE ${where})`).bind(arg).run();
  await env.DB.prepare(`DELETE FROM notifications WHERE ${where}`).bind(arg).run();
}

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
    /* Trả về TẤT CẢ thông báo. Bài viết (kind = post) chỉ gửi tiêu đề, nội dung đầy đủ lấy ở /api/inbox/:id */
    const [list, cnt] = await env.DB.batch([
      env.DB.prepare(`SELECT n.id, n.kind, n.title, CASE WHEN n.kind = 'post' THEN '' ELSE n.body END AS body, n.image, n.link, n.created_at, EXISTS (SELECT 1 FROM notif_reads r WHERE r.user_id = ?1 AND r.notif_id = n.id) AS read FROM notifications n WHERE ${VISIBLE} ORDER BY n.id DESC`).bind(user.id, since),
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
  const one = pathname.match(/^\/api\/inbox\/(\d+)$/);
  if (one && method === 'GET') {
    const n = await env.DB.prepare(`SELECT n.id, n.kind, n.title, n.body, n.image, n.link, n.created_at FROM notifications n WHERE n.id = ?3 AND ${VISIBLE}`).bind(user.id, since, Number(one[1])).first();
    if (!n) {
      throw new h.HttpError(404, 'Không tìm thấy thông báo.');
    }
    await env.DB.prepare('INSERT OR IGNORE INTO notif_reads (user_id, notif_id) VALUES (?1, ?2)').bind(user.id, n.id).run();
    return h.json({ item: n });
  }
  /* Khách xoá: thông báo riêng của họ (không phải bài viết) xoá hẳn khỏi DB cùng mọi dấu vết theo id;
     bài viết và thông báo gửi chung chỉ ẩn riêng với họ */
  if (one && method === 'DELETE') {
    const id = Number(one[1]);
    const n = await env.DB.prepare(`SELECT n.id, n.user_id, n.kind FROM notifications n WHERE n.id = ?3 AND ${VISIBLE}`).bind(user.id, since, id).first();
    if (n && n.user_id === user.id && n.kind !== 'post') {
      await purge(env, `id = ?1`, id);
    } else if (n) {
      await env.DB.prepare('INSERT OR IGNORE INTO notif_hidden (user_id, notif_id) VALUES (?1, ?2)').bind(user.id, id).run();
    }
    return h.json({ ok: true });
  }
  if (pathname === '/api/inbox' && method === 'DELETE') {
    await purge(env, `user_id = ?1 AND kind != 'post'`, user.id);
    await env.DB.prepare(`INSERT OR IGNORE INTO notif_hidden (user_id, notif_id) SELECT ?1, n.id FROM notifications n WHERE ${VISIBLE}`).bind(user.id, since).run();
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
  /* Tìm khách để chọn người nhận (tên / email / SĐT), không gồm tài khoản ảo và tài khoản bị khoá */
  if (pathname === '/api/admin/inbox/customers' && method === 'GET') {
    const q = h.clean(url.searchParams.get('q'), 80);
    const like = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
    const { results } = await env.DB.prepare("SELECT u.id, u.name, u.email, u.phone, u.avatar FROM users u WHERE u.email NOT LIKE '%@virtual.invalid' AND u.blocked_at IS NULL AND (?1 = '' OR u.name LIKE ?2 ESCAPE '\\' OR u.email LIKE ?2 ESCAPE '\\' OR u.phone LIKE ?2 ESCAPE '\\') ORDER BY (lower(u.name) LIKE lower(?1) || '%') DESC, u.name COLLATE NOCASE LIMIT 20").bind(q, like).all();
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
    /* Người nhận: 'all', hoặc danh sách id khách (users: [..]), hoặc một email (cách cũ) */
    let targets = [null], who = 'tất cả khách';
    if (Array.isArray(b.users)) {
      const ids = [...new Set(b.users.map(Number).filter(n => Number.isInteger(n) && n > 0))].slice(0, 500);
      if (!ids.length) {
        throw new h.HttpError(400, 'Hãy chọn ít nhất một khách.');
      }
      const { results } = await env.DB.prepare(`SELECT id, name FROM users WHERE id IN (${ids.map(() => '?').join(',')}) AND email NOT LIKE '%@virtual.invalid'`).bind(...ids).all();
      if (!results.length) {
        throw new h.HttpError(404, 'Không tìm thấy khách đã chọn.');
      }
      targets = results.map(r => r.id);
      who = results.length === 1 ? results[0].name : results.length + ' khách (' + results.slice(0, 3).map(r => r.name).join(', ') + (results.length > 3 ? '…' : '') + ')';
    } else if (b.to && b.to !== 'all') {
      const email = h.clean(b.to, 120).toLowerCase();
      const u = await env.DB.prepare('SELECT id, name FROM users WHERE lower(email) = ?1').bind(email).first();
      if (!u) {
        throw new h.HttpError(404, 'Không tìm thấy khách có email này.');
      }
      targets = [u.id];
      who = u.name;
    }
    const image = b.image ? okImage(b.image) : null;
    if (b.image && !image) {
      throw new h.HttpError(400, 'Ảnh phải là đường dẫn https.');
    }
    for (const uid of targets) {
      await notify(env, uid, { kind: post ? 'post' : 'admin', title, body, image, link: b.link });
    }
    await h.logAct(env, 'Gửi thông báo', title + ' → ' + who);
    return h.json({ ok: true }, 201);
  }
  const m = pathname.match(/^\/api\/admin\/inbox\/(\d+)$/);
  if (m && method === 'DELETE') {
    await purge(env, 'id = ?1', Number(m[1]));
    await h.logAct(env, 'Xoá thông báo', '#' + m[1]);
    return h.json({ ok: true });
  }
  throw new h.HttpError(404, 'Không tìm thấy.');
}
