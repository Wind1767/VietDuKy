/* ImageKit: ký yêu cầu tải ảnh lên từ trình duyệt (khoá bí mật chỉ nằm ở Worker, secret IMAGEKIT_PRIVATE_KEY) */
import { requireFlag } from './site-settings.js';
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

export const IK_SCHEMA = [
  'CREATE TABLE IF NOT EXISTS user_avatars (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, url TEXT NOT NULL, file_id TEXT, created_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS idx_avatars_user ON user_avatars(user_id)'
];

function cfg(env, h) {
  const priv = env.IMAGEKIT_PRIVATE_KEY, pub = env.IMAGEKIT_PUBLIC_KEY, ep = (env.IMAGEKIT_URL_ENDPOINT || '').replace(/\/+$/, '');
  if (!priv || !pub || !ep) {
    throw new h.HttpError(500, 'Chưa cấu hình ImageKit (IMAGEKIT_PRIVATE_KEY).');
  }
  return {
    priv,
    pub,
    ep
  };
}

/* Tham số xác thực: signature = HMAC-SHA1(privateKey, token + expire) */
export async function ikAuth(env, h, folder) {
  const { priv, pub, ep } = cfg(env, h);
  const token = crypto.randomUUID(), expire = Math.floor(Date.now() / 1000) + 600;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(priv), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const signature = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(token + expire)));
  return h.json({
    token,
    expire,
    signature,
    publicKey: pub,
    urlEndpoint: ep,
    folder,
    uploadUrl: 'https://upload.imagekit.io/api/v1/files/upload'
  });
}

export function ikUrlOk(env, url) {
  const ep = (env.IMAGEKIT_URL_ENDPOINT || '').replace(/\/+$/, '');
  return typeof url === 'string' && url.length < 500 && ep && url.startsWith(ep + '/') && !/[\s"'<>]/.test(url);
}

/* fileId do trình duyệt gửi lên: chỉ tin khi chính ImageKit xác nhận tệp đó có đúng địa chỉ ảnh này,
   nếu không người dùng có thể điền mã tệp của người khác để xoá ảnh của họ về sau. */
async function ikOwns(env, fileId, url) {
  if (!fileId || !/^[A-Za-z0-9_-]{8,40}$/.test(fileId) || !env.IMAGEKIT_PRIVATE_KEY) {
    return false;
  }
  try {
    const r = await fetch('https://api.imagekit.io/v1/files/' + encodeURIComponent(fileId) + '/details', { headers: { Authorization: 'Basic ' + btoa(env.IMAGEKIT_PRIVATE_KEY + ':') } });
    return r.ok && (await r.json()).url === url;
  } catch {
    return false;
  }
}

async function ikDelete(env, fileId) {
  if (!fileId || !env.IMAGEKIT_PRIVATE_KEY) {
    return;
  }
  try {
    await fetch('https://api.imagekit.io/v1/files/' + encodeURIComponent(fileId), { method: 'DELETE', headers: { Authorization: 'Basic ' +
          btoa(env.IMAGEKIT_PRIVATE_KEY +
            ':') } });
  } catch { /* bỏ qua: ảnh mồ côi không ảnh hưởng người dùng */
  }
}

/* ---- API avatar cho người dùng (needUser do auth.js truyền vào) ---- */
export async function avatarApi(request, env, url, h, user) {
  const p = url.pathname, db = env.DB;
  if (p === '/api/auth/imagekit') {
    await requireFlag(env, 'feat_upload', h, 'Tải ảnh lên đang tạm tắt. Vui lòng thử lại sau.');
    return ikAuth(env, h, '/vietduky/avatars');
  }
  if (p === '/api/auth/avatars') { // dọn các ảnh cũ còn sót từ bản trước (chỉ giữ ảnh đang dùng)
    const { results } = await db.prepare('SELECT id, url, file_id FROM user_avatars WHERE user_id = ?1').bind(user.id).all();
    const stale = results.filter(r => r.url !== user.avatar);
    for (const r of stale) {
      await db.prepare('DELETE FROM user_avatars WHERE id = ?1').bind(r.id).run();
      if (r.file_id) {
        h.defer(ikDelete(env, r.file_id));
      }
    }
    return h.json({ current: user.avatar || '' });
  }
  const b = await h.readJson(request);
  if (p === '/api/auth/avatar') { // chỉ giữ MỘT ảnh đại diện: ảnh mới ghi đè và xoá ảnh cũ
    if (!ikUrlOk(env, b.url)) {
      throw new h.HttpError(400, 'Địa chỉ ảnh không hợp lệ.');
    }
    const fileId = typeof b.fileId === 'string' && await ikOwns(env, b.fileId, b.url) ? b.fileId : null;
    const { results: olds } = await db.prepare('SELECT id, url, file_id FROM user_avatars WHERE user_id = ?1').bind(user.id).all();
    await db.batch([
      db.prepare('DELETE FROM user_avatars WHERE user_id = ?1').bind(user.id),
      db.prepare('INSERT INTO user_avatars (user_id, url, file_id, created_at) VALUES (?1,?2,?3,?4)').bind(user.id, b.url, fileId, Date.now()),
      db.prepare('UPDATE users SET avatar = ?1 WHERE id = ?2').bind(b.url, user.id)
    ]);
    olds.forEach(o => {
      if (o.file_id && o.file_id !== fileId) {
        h.defer(ikDelete(env, o.file_id));
      }
    });
    return h.json({ ok: true, avatar: b.url });
  }
  if (p === '/api/auth/avatar/delete') { // gỡ ảnh đại diện
    const { results: olds } = await db.prepare('SELECT file_id FROM user_avatars WHERE user_id = ?1').bind(user.id).all();
    await db.batch([db.prepare('DELETE FROM user_avatars WHERE user_id = ?1').bind(user.id), db.prepare('UPDATE users SET avatar = NULL WHERE id = ?1').bind(user.id)]);
    olds.forEach(o => {
      if (o.file_id) {
        h.defer(ikDelete(env, o.file_id));
      }
    });
    return h.json({ ok: true });
  }
  throw new h.HttpError(404, 'Không tìm thấy.');
}
