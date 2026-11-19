/* Cài đặt website: mọi chữ/màu/bật-tắt chính của trang khách chỉnh được trong trang quản trị.
Lưu dạng khoá-giá trị trong bảng site_settings; trang khách đọc qua GET /api/site (công khai, không có bí mật nào). */
import { RULES } from './rules.js';
export const SITE_SCHEMA = [
  'CREATE TABLE IF NOT EXISTS site_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)'
];

/* Menu mặc định và các khối trang chủ có thể bật/tắt/sắp xếp (banner lớn đầu trang luôn ở trên cùng) */
export const BLOCKS = {
  dest: 'Điểm đến',
  why: 'Vì sao chọn chúng tôi',
  stats: 'Số liệu nổi bật',
  tours: 'Tour hot',
  journey: 'Hành trình xuyên Việt',
  reviews: 'Khách nói về chúng tôi',
  faq: 'Câu hỏi thường gặp',
  cta: 'Kêu gọi đặt tour'
};
const DEFAULT_BLOCKS = Object.keys(BLOCKS).map(id => ({ id, on: true }));
const DEFAULT_NAV = [['/', 'Trang chủ'], ['/#diem-den', 'Điểm đến'], ['/#tour', 'Tour hot'], ['/about', 'Về chúng tôi'], ['/reviews', 'Đánh giá'], ['/contact', 'Liên hệ']]
  .map(([url, label]) => ({
  label,
  url,
  header: true,
  footer: true,
  blank: false
}));
/* Đường dẫn cho phép trong menu/nút: nội bộ (/...), https://, tel:, mailto:. Chặn // (đổi sang trang khác) và ký tự nguy hiểm */
export const validUrl = s => /^(https:\/\/|\/(?!\/)|tel:|mailto:)[^\s"'<>\\]*$/i.test(s);
const flag = (x, d) => x === undefined ? d : (x === true || x === 1 || x === 'true');

/* kiểu: s = chữ, u = đường dẫn/URL, c = màu #rrggbb, b = bật/tắt, e = một trong các lựa chọn, n = số, css = mã CSS */
export const DEFS = {
  // Thông tin chung
  site_name: ['s', 40, 'Việt Du Ký'], tagline: ['s', 120, ''], hotline: ['s', 30, '1900 1234'], contact_email: ['s', 120, 'buivanphong7191@gmail.com'],
  address: ['s', 160, 'Phan Thiết, Lâm Đồng'], work_hours: ['s', 60, '8:00 – 21:00 hằng ngày'],
  zalo: ['u', 200, ''], facebook: ['u', 200, ''], instagram: ['u', 200, ''], youtube: ['u', 200, ''], tiktok: ['u', 200, ''],
  footer_about: ['s', 300, 'Đồng hành cùng bạn khám phá đất nước hình chữ S, từ Bắc vào Nam.'], copyright: ['s', 120, '© 2026 Việt Du Ký. Bảo lưu mọi quyền.'],
  // Giao diện
  color_brand: ['c', 7, '#0c3b36'], color_brand2: ['c', 7, '#145a50'], color_accent: ['c', 7, '#ffcd00'], color_red: ['c', 7, '#da251d'], color_mist: ['c', 7, '#eef4f1'],
  default_theme: ['e', ['light', 'dark'], 'light'], show_theme_toggle: ['b', 0, true], font_scale: ['n', [85, 125], 100], radius_scale: ['n', [0, 160], 100],
  // Thông báo đầu trang
  banner_on: ['b', 0, false], banner_text: ['s', 200, ''], banner_link: ['u', 200, ''], banner_link_text: ['s', 40, 'Xem ngay'],
  banner_style: ['e', ['info', 'promo', 'warn'], 'promo'], banner_closable: ['b', 0, true],
  // Trang chủ
  hero_lead: ['s', 240, 'Từ vịnh xanh ngọc bích đến phố cổ lung linh đèn lồng, mỗi chuyến đi là một câu chuyện riêng.'],
  typed_words: ['s', 200, 'Hạ Long, Sa Pa, Hội An, Huế, Đà Lạt, Phú Quốc'], hero_trust: ['s', 80, '4,9/5 từ hơn 9.800 khách hàng'],
  cta_title: ['s', 100, 'Sẵn sàng cho chuyến đi tiếp theo?'], cta_text: ['s', 160, 'Để lại thông tin, tư vấn viên sẽ gọi lại trong 30 phút.'], cta_btn: ['s', 40, 'Nhận tư vấn miễn phí'],
  // Nội dung các trang
  dest_title: ['s', 80, 'Sáu miền đất, sáu cảm xúc'], dest_sub: ['s', 160, 'Chọn điểm đến bạn mơ ước, chúng tôi lo phần còn lại.'],
  about_hero_title: ['s', 80, 'Về Việt Du Ký'], about_hero_sub: ['s', 160, 'Chạm ngõ những cung đường, kể câu chuyện Việt Nam'],
  about_title: ['s', 120, 'Chúng tôi là người Việt, đi cùng bạn khắp Việt Nam'],
  about_p1: ['s', 400, 'Được thành lập năm 2026 tại Lâm Đồng với một niềm tin giản dị: du lịch hay nhất khi được dẫn dắt bởi người hiểu và yêu nơi mình sống.'],
  about_p2: ['s', 400, 'Mỗi tour đều do hướng dẫn viên bản địa thiết kế, ưu tiên homestay, quán ăn gia đình và nghề thủ công địa phương.'],
  about_btn: ['s', 40, 'Lên kế hoạch cùng chúng tôi'], values_title: ['s', 80, 'Giá trị chúng tôi giữ'],
  values_items: ['l', { max: 6, cols: {
        icon: 24,
        title: 40,
        text: 160
      } }, [{
        "icon": "eco",
        "title": "Du lịch bền vững",
        "text": "Nhóm nhỏ, hạn chế nhựa dùng một lần, ủng hộ cộng đồng địa phương."
      }, {
        "icon": "handshake",
        "title": "Minh bạch",
        "text": "Giá trọn gói, không phụ thu ẩn."
      }, {
        "icon": "favorite",
        "title": "Tận tâm",
        "text": "Mỗi khách hàng là một người bạn."
      }]],
  faq_items: ['l', { max: 20, cols: { q: 160, a: 500 } }, [{ "q": "Đặt tour cần chuẩn bị giấy tờ gì?", "a": "Bạn cần CCCD hoặc hộ chiếu còn hạn. Trẻ em dưới 14 tuổi mang theo giấy khai sinh hoặc hộ chiếu." }, { "q": "Giá tour đã gồm những gì?", "a": "Giá trọn gói gồm khách sạn, xe đưa đón, vé tham quan, bữa ăn theo chương trình và hướng dẫn viên. Chi tiêu cá nhân không nằm trong giá." }, { "q": "Tôi có thể đổi ngày đi không?", "a": "Có. Bạn được đổi ngày miễn phí nếu báo trước 7 ngày khởi hành." }, { "q": "Tour có phù hợp với gia đình có trẻ nhỏ không?", "a": "Có. Chúng tôi có lịch trình nhịp chậm cho gia đình, người lớn tuổi và trẻ nhỏ." }]],
  // Tính năng bật/tắt
  feat_booking: ['b', 0, true], feat_register: ['b', 0, true], feat_chat: ['b', 0, true], feat_reviews: ['b', 0, true],
  maint_on: ['b', 0, false], maint_text: ['s', 240, 'Website đang được bảo trì, vui lòng quay lại sau ít phút.'],
  // SEO
  meta_title: ['s', 70, ''], meta_desc: ['s', 200, ''],
  // menu điều hướng và các khối trang chủ (sửa ở mục “Menu & trang chủ”, nhóm quyền layout)
  nav_items: ['nav', { max: 12 }, DEFAULT_NAV],
  home_blocks: ['blocks', { max: 40 }, DEFAULT_BLOCKS],
  // Mã tuỳ chỉnh (cần quyền riêng)
  custom_css: ['css', 8000, '']
};
/* Nhóm hiển thị trong trang quản trị (để Chủ phân quyền theo từng nhóm nhỏ nếu muốn) */
export const RESTRICTED = {
  custom_css: 'css',
  maint_on: 'maint',
  maint_text: 'maint',
  nav_items: 'layout',
  home_blocks: 'layout'
};

/* Biểu tượng cho phép (đã nạp sẵn trong font trang khách) */
export const ICONS = ['eco', 'handshake', 'favorite', 'verified', 'support_agent', 'star', 'groups', 'mood', 'route', 'map', 'restaurant', 'luggage', 'explore', 'lock', 'schedule', 'sell'];
const defaults = () => Object.fromEntries(Object.entries(DEFS).map(([k, d]) => [k, d[2]]));
let cache = null, cacheAt = 0;
export function dropSiteCache() {
  cache = null;
}

export async function getSite(env) {
  if (cache && Date.now() - cacheAt < 15000) {
    return cache;
  }
  const out = defaults();
  try {
    const { results } = await env.DB.prepare('SELECT key, value FROM site_settings').all();
    for (const r of results) {
      const d = DEFS[r.key];
      if (!d) {
        continue;
      }
      try {
        out[r.key] = JSON.parse(r.value);
      } catch { /* giữ mặc định */
      }
    }
  } catch { /* bảng chưa có: dùng mặc định */
  }
  cache = out;
  cacheAt = Date.now();
  return out;
}

export function cleanValue(key, v, h) {
  const [t, a] = DEFS[key];
  const bad = m => {
    throw new h.HttpError(400, m);
  };
  if (t === 'l') {
    if (!Array.isArray(v) || v.length > a.max) {
      bad(`Danh sách “${key}” tối đa ${a.max} mục.`);
    }
    return v.map(it => {
      const o = {};
      for (const [c, n] of Object.entries(a.cols)) {
        o[c] = h.clean(it && it[c], n);
      }
      if ('icon' in a.cols && !ICONS.includes(o.icon)) {
        o.icon = 'star';
      }
      if (Object.values(o).every(x => !x)) {
        return null;
      }
      if (('q' in o && !o.q) || ('title' in o && !o.title)) {
        bad('Mỗi mục cần có tiêu đề / câu hỏi.');
      }
      return o;
    }).filter(Boolean);
  }
  if (t === 'nav') {
    if (!Array.isArray(v) || v.length > a.max) {
      bad(`Menu tối đa ${a.max} mục.`);
    }
    return v.map(it => {
      const label = h.clean(it && it.label, 40), url = h.clean(it && it.url, 200);
      if (!label && !url) {
        return null;
      }
      if (!label) {
        bad('Mỗi mục menu cần có tên hiển thị.');
      }
      if (!validUrl(url)) {
        bad('Đường dẫn của “' + label + '” phải bắt đầu bằng /, https://, tel: hoặc mailto: (không dùng //).');
      }
      return {
        label,
        url,
        header: flag(it.header, true),
        footer: flag(it.footer, true),
        blank: flag(it.blank, false)
      };
    }).filter(Boolean);
  }
  if (t === 'blocks') {
    if (!Array.isArray(v) || v.length > a.max) {
      bad('Danh sách khối trang chủ không hợp lệ.');
    }
    const seen = new Set(), out = [];
    for (const it of v) {
      const id = String(it && it.id || '');
      if (seen.has(id) || !(BLOCKS[id] || /^c\d{1,9}$/.test(id))) {
        continue;
      } // bỏ khối lạ hoặc trùng
      seen.add(id);
      out.push({ id, on: flag(it.on, true) });
    }
    for (const id of Object.keys(BLOCKS)) {
      if (!seen.has(id)) {
        out.push({ id, on: true });
      }
    } // khối có sẵn không bao giờ mất
    return out;
  }
  if (t === 'b') {
    return v === true || v === 1 || v === 'true';
  }
  if (t === 'n') {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n) || n < a[0] || n > a[1]) {
      bad(`Giá trị “${key}” phải từ ${a[0]} đến ${a[1]}.`);
    }
    return n;
  }
  if (t === 'e') {
    if (!a.includes(v)) {
      bad(`Lựa chọn “${key}” không hợp lệ.`);
    }
    return v;
  }
  if (t === 'c') {
    const s = String(v || '').trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(s)) {
      bad('Màu phải có dạng #rrggbb.');
    }
    return s.toLowerCase();
  }
  if (t === 'u') {
    const s = h.clean(v, a);
    if (s && !/^(https:\/\/|\/(?!\/)|tel:|mailto:)/i.test(s)) {
      bad('Đường dẫn phải bắt đầu bằng https://, / , tel: hoặc mailto: (không dùng //).');
    }
    return s;
  }
  if (t === 'css') {
    const s = String(v || '').slice(0, a);
    if (/<\/?style|<script|@import|expression\s*\(|javascript:/i.test(s)) {
      bad('CSS chứa nội dung không được phép (thẻ HTML, @import, javascript:).');
    }
    return s;
  }
  return h.clean(v, a);
}

/* GET /api/site – công khai */
export async function publicSite(env, h) {
  return h.json({ site: await getSite(env), rules: RULES }, 200, { 'Cache-Control': 'public, max-age=30' });
}

/* GET/PUT /api/admin/site */
export async function adminSite(request, env, h, actor) {
  if (request.method === 'GET') {
    return h.json({
      site: await getSite(env),
      defaults: defaults(),
      restricted: RESTRICTED
    });
  }
  if (request.method === 'PUT' || request.method === 'PATCH') {
    const b = await h.readJson(request);
    const patch = (b && typeof b.site === 'object' && b.site) || {};
    const stmts = [], changed = [];
    const cur = await getSite(env);
    for (const [k, v] of Object.entries(patch)) {
      if (!DEFS[k]) {
        continue;
      }
      const need = RESTRICTED[k];
      const val = cleanValue(k, v, h);
      if (JSON.stringify(val) === JSON.stringify(cur[k])) {
        continue;
      }
      if (need && actor.perms[need] !== 'rw') {
        throw new h.HttpError(403, 'Bạn không có quyền sửa mục “' + k + '”.');
      }
      changed.push(k);
      stmts.push(env.DB.prepare('INSERT INTO site_settings (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(k, JSON.stringify(val), Date.now()));
    }
    if (stmts.length) {
      await env.DB.batch(stmts);
      dropSiteCache();
      await h.logAct(env, 'Sửa cài đặt website', changed.slice(0, 12).join(', ') +
        (changed.length > 12 ? '…' : ''));
    }
    return h.json({ site: await getSite(env), changed });
  }
  if (request.method === 'DELETE') { // khôi phục mặc định toàn bộ
    await env.DB.prepare('DELETE FROM site_settings').run();
    dropSiteCache();
    await h.logAct(env, 'Khôi phục cài đặt website', 'Về mặc định');
    return h.json({ site: await getSite(env) });
  }
  throw new h.HttpError(405, 'Phương thức không hỗ trợ.');
}

/* Chặn thao tác khi tính năng đang tắt (gọi từ worker / auth / chat / reviews) */
export async function requireFeature(env, key, h, msg) {
  const s = await getSite(env);
  if (s.maint_on || s[key] === false) {
    throw new h.HttpError(503, msg || 'Tính năng này đang tạm tắt.');
  }
}
