/* Menu điều hướng & các khối trang chủ: bật/tắt, sắp xếp, đổi tên mục menu.
Dữ liệu lưu trong site_settings (khoá nav_items, home_blocks) nên trang khách đọc chung qua GET /api/site.
Nhóm quyền riêng: layout (xem / sửa). */
import { DEFS, BLOCKS, getSite, dropSiteCache } from './site-settings.js';
import { layoutExtras } from './custom-content.js';

const KEYS = ['nav_items', 'home_blocks'];

async function save(env, h, patch) {
  const cur = await getSite(env), stmts = [], changed = [];
  for (const k of KEYS) {
    if (!(k in patch)) {
      continue;
    }
    const val = h.cleanSite(k, patch[k]);
    if (JSON.stringify(val) === JSON.stringify(cur[k])) {
      continue;
    }
    changed.push(k);
    stmts.push(env.DB.prepare('INSERT INTO site_settings (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(k, JSON.stringify(val), Date.now()));
  }
  if (stmts.length) {
    await env.DB.batch(stmts);
    dropSiteCache();
    await h.logAct(env, 'Sửa menu & trang chủ', changed.map(k => k === 'nav_items' ? 'menu' : 'khối trang chủ').join(', '));
  }
  return changed;
}

/* GET/PUT/DELETE /api/admin/layout */
export async function adminLayout(request, env, h) {
  const meta = async () => {
    const s = await getSite(env);
    return {
      nav_items: s.nav_items,
      home_blocks: s.home_blocks,
      blocks: BLOCKS,
      ...(await layoutExtras(env)),
      defaults: { nav_items: DEFS.nav_items[2], home_blocks: DEFS.home_blocks[2] }
    };
  };
  if (request.method === 'GET') {
    return h.json(await meta());
  }
  if (request.method === 'PUT' || request.method === 'PATCH') {
    const b = await h.readJson(request);
    const changed = await save(env, h, b && typeof b === 'object' ? b : {});
    return h.json({ ...(await meta()), changed });
  }
  if (request.method === 'DELETE') { // khôi phục menu và thứ tự khối mặc định
    await env.DB.prepare('DELETE FROM site_settings WHERE key IN (?1, ?2)').bind(...KEYS).run();
    dropSiteCache();
    await h.logAct(env, 'Khôi phục menu & trang chủ', 'Về mặc định');
    return h.json(await meta());
  }
  throw new h.HttpError(405, 'Phương thức không hỗ trợ.');
}
