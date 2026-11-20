/* Công tắc bật/tắt tính năng (Cài đặt → Bật / tắt tính năng): Turnstile, tải ảnh, đăng nhập, báo lỗi. */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createDB, HttpError, h } from '../helpers/d1.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { DEFS, RESTRICTED, SITE_SCHEMA, PAGE_FLAG, dropSiteCache, requireFlag, pageOffFlag } from '../../src/site-settings.js';
import { verifyTurnstile } from '../../src/turnstile.js';

let env;
const hh = { ...h };

function setFlag(key, value) {
  env.DB.raw.prepare('INSERT OR REPLACE INTO site_settings (key, value, updated_at) VALUES (?1, ?2, 0)').run(key, JSON.stringify(value));
  dropSiteCache();
}

beforeEach(() => {
  env = { DB: createDB() };
  for (const sql of SITE_SCHEMA) {
    env.DB.raw.exec(sql);
  }
  dropSiteCache();
});

test('Các công tắc mới đều bật sẵn theo mặc định', () => {
  for (const k of ['feat_login', 'feat_bugreport', 'feat_upload', 'feat_turnstile', 'feat_turnstile_admin', 'feat_email_verify', 'feat_favorites', 'feat_compare', 'feat_coupons', 'feat_inbox']) {
    assert.deepEqual(DEFS[k], ['b', 0, true], k);
  }
});

test('Tắt lớp bảo vệ (Turnstile, xác minh email) chỉ cho người có quyền bảo trì chỉnh', () => {
  for (const k of ['feat_turnstile', 'feat_turnstile_admin', 'feat_email_verify']) {
    assert.equal(RESTRICTED[k], 'maint', k);
  }
});

test('Turnstile bật mà chưa cấu hình thì vẫn báo lỗi như cũ', async () => {
  const body = { 'cf-turnstile-response': 'x' };
  await assert.rejects(() => verifyTurnstile(new Request('https://x.test'), env, body, 'booking', HttpError), (e) => e.status === 503);
});

test('Tắt Turnstile thì form khách không cần xác minh và token bị bỏ khỏi dữ liệu', async () => {
  setFlag('feat_turnstile', false);
  const body = { name: 'A', 'cf-turnstile-response': 'x' };
  await verifyTurnstile(new Request('https://x.test'), env, body, 'booking', HttpError);
  assert.equal('cf-turnstile-response' in body, false);
  assert.equal(body.name, 'A');
});

test('Đăng nhập quản trị theo công tắc riêng: tắt form khách không làm lỏng đăng nhập quản trị', async () => {
  setFlag('feat_turnstile', false);
  await assert.rejects(() => verifyTurnstile(new Request('https://x.test'), env, { 'cf-turnstile-response': 'x' }, 'admin_login', HttpError), (e) => e.status === 503);
  setFlag('feat_turnstile_admin', false);
  const body = { 'cf-turnstile-response': 'x', password: 'p' };
  await verifyTurnstile(new Request('https://x.test'), env, body, 'admin_login', HttpError);
  assert.equal('cf-turnstile-response' in body, false);
});

test('requireFlag chặn khi công tắc tắt, cho qua khi bật', async () => {
  await requireFlag(env, 'feat_upload', hh, 'tắt');
  setFlag('feat_upload', false);
  await assert.rejects(() => requireFlag(env, 'feat_upload', hh, 'Tải ảnh đang tắt'), (e) => e.status === 503 && e.message === 'Tải ảnh đang tắt');
});

test('requireFlag không bị ảnh hưởng bởi chế độ bảo trì (bảo trì vẫn như cũ)', async () => {
  setFlag('maint_on', true);
  await requireFlag(env, 'feat_login', hh);
  await requireFlag(env, 'feat_bugreport', hh);
  await requireFlag(env, 'feat_upload', hh);
});

test('Trang của tính năng đã tắt bị 404, bật lại thì hiện bình thường', async () => {
  assert.equal(await pageOffFlag(env, '/reviews'), '');
  setFlag('feat_reviews', false);
  assert.equal(await pageOffFlag(env, '/reviews'), 'feat_reviews');
  assert.equal(await pageOffFlag(env, '/reviews.html'), 'feat_reviews');
  assert.equal(await pageOffFlag(env, '/reviews/'), 'feat_reviews');
  assert.equal(await pageOffFlag(env, '/tours'), '', 'trang không có công tắc không bị ảnh hưởng');
  setFlag('feat_reviews', true);
  assert.equal(await pageOffFlag(env, '/reviews'), '');
});

test('Mỗi trang có công tắc đều tồn tại và được Worker chạy trước (run_worker_first)', () => {
  const toml = readFileSync(new URL('../../wrangler.toml', import.meta.url), 'utf8');
  const first = toml.match(/run_worker_first\s*=\s*\[([^\]]*)\]/)[1];
  for (const [path, flag] of Object.entries(PAGE_FLAG)) {
    assert.ok(DEFS[flag], flag + ' phải có trong DEFS');
    assert.ok(existsSync(new URL('../../public' + path + '.html', import.meta.url)), path + '.html');
    assert.ok(first.includes('"' + path + '*"'), path + ' thiếu trong run_worker_first');
  }
});

test('Mỗi công tắc phía khách đều có luật ẩn trong CSS và có tên trong site.js', () => {
  const css = readFileSync(new URL('../../public/css/components.css', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../../public/js/site.js', import.meta.url), 'utf8');
  for (const k of ['upload', 'login', 'register', 'email_verify', 'chat', 'reviews', 'inbox', 'bugreport', 'favorites', 'compare', 'coupons', 'booking']) {
    assert.ok(css.includes('.no-' + k + ' '), 'thiếu luật .no-' + k);
    assert.ok(js.includes("'" + k + "'"), 'site.js thiếu ' + k);
  }
});

test('Worker: trang của tính năng đã tắt trả 404, các trang khác vẫn phục vụ bình thường', async () => {
  const { default: worker } = await import('../../src/worker.js');
  const served = [];
  const ASSETS = {
    fetch: async (req) => {
      const p = new URL(req.url).pathname;
      served.push(p);
      return p === '/__tinh-nang-da-tat__' ? new Response('nf', { status: 404 }) : new Response('ok', { status: 200 });
    }
  };
  const e = { ...env, ASSETS };
  const get = (path) => worker.fetch(new Request('https://x.test' + path), e, { waitUntil() {} });
  assert.equal((await get('/reviews')).status, 200);
  setFlag('feat_reviews', false);
  setFlag('feat_login', false);
  for (const path of ['/reviews', '/reviews.html', '/login', '/account']) {
    assert.equal((await get(path)).status, 404, path);
  }
  assert.equal((await get('/tours')).status, 200, 'trang không gắn công tắc vẫn hiện');
  assert.equal((await get('/register')).status, 200, 'công tắc khác vẫn bật');
});
