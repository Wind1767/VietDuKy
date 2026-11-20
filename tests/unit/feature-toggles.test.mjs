/* Công tắc bật/tắt tính năng (Cài đặt → Bật / tắt tính năng): Turnstile, tải ảnh, đăng nhập, báo lỗi. */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createDB, HttpError, h } from '../helpers/d1.mjs';
import { DEFS, RESTRICTED, SITE_SCHEMA, dropSiteCache, requireFlag } from '../../src/site-settings.js';
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
  for (const k of ['feat_login', 'feat_bugreport', 'feat_upload', 'feat_turnstile']) {
    assert.deepEqual(DEFS[k], ['b', 0, true], k);
  }
});

test('Tắt Turnstile chỉ cho người có quyền bảo trì chỉnh', () => {
  assert.equal(RESTRICTED.feat_turnstile, 'maint');
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

test('Đăng nhập quản trị luôn bắt buộc Turnstile, kể cả khi đã tắt', async () => {
  setFlag('feat_turnstile', false);
  await assert.rejects(() => verifyTurnstile(new Request('https://x.test'), env, { 'cf-turnstile-response': 'x' }, 'admin_login', HttpError), (e) => e.status === 503);
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
