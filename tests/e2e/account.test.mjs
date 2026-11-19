/* Trang tài khoản: sửa thông tin, yêu cầu dữ liệu, xoá tài khoản (chờ 30 ngày), kéo thả ảnh đại diện. */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, staticServer, mockApi, openPage } from '../helpers/browser.mjs';

const pw = loadPlaywright();
const skip = pw ? false : 'chưa cài playwright (npm i)';
const user = {
  id: 1,
  name: 'Nguyễn Văn A',
  email: 'a@example.com',
  phone: '0901234567',
  avatar: '',
  delete_at: null
};
const opened = [];
let srv;

async function open(over = {}) {
  srv = srv || (await staticServer());
  const ctx = await openPage(pw, srv.url, '/account', mockApi({ '/api/auth/me': { user }, ...over }));
  opened.push(ctx);
  await ctx.page.waitForSelector('#profileForm', { state: 'attached' });
  return ctx;
}
after(async () => {
  for (const c of opened) {
    await c.browser.close();
  }
  if (srv) {
    srv.server.close();
  }
});

test('Yêu cầu dữ liệu và xoá tài khoản đều phải nhập mật khẩu', { skip }, async () => {
  const { page } = await open();
  assert.equal(await page.locator('#dataForm input[name="current"]').getAttribute('required'), '');
  assert.equal(await page.locator('#delForm input[name="current"]').getAttribute('required'), '');
  assert.equal(await page.locator('#delCancel').count(), 0);
});

test('Form đổi mật khẩu yêu cầu từ 10 ký tự', { skip }, async () => {
  const { page } = await open();
  assert.equal(await page.locator('#passForm input[name="password"]').getAttribute('minlength'), '10');
});

test('Gửi yêu cầu xoá: gọi API với mật khẩu', { skip }, async () => {
  const { page, calls } = await open({ '/api/auth/delete-request': { ok: true, delete_at: Date.now() +
        30 * 86400000 } });
  await page.locator('summary', { hasText: 'Dữ liệu' }).click();
  await page.locator('#delForm input[name="current"]').fill('mat-khau-dai-123');
  await page.locator('#delForm button:not(.pw-eye)').click();
  await page.waitForTimeout(500);
  const c = calls.find((x) => x.path === '/api/auth/delete-request');
  assert.ok(c, 'phải gọi /api/auth/delete-request');
  assert.equal(JSON.parse(c.body).current, 'mat-khau-dai-123');
});

test('Đang chờ xoá: hiện ngày xoá và nút huỷ, ẩn form xoá', { skip }, async () => {
  const at = Date.now() + 20 * 86400000;
  const { page, calls } = await open({ '/api/auth/me': { user: { ...user, delete_at: at } }, '/api/auth/delete-cancel': { ok: true } });
  assert.match(await page.locator('.del-note').textContent(), new RegExp(new Date(at).toLocaleDateString('vi-VN').replace(/\//g, '\\/')));
  assert.equal(await page.locator('#delForm').count(), 0);
  await page.locator('#delCancel').click();
  await page.waitForTimeout(400);
  assert.ok(calls.some((x) => x.path === '/api/auth/delete-cancel'));
});

test('Sửa thông tin: giữ giá trị mới sau khi lưu (không quay về giá trị cũ)', { skip }, async () => {
  const { page } = await open({ '/api/auth/profile': { ok: true, user: {
        ...user,
        name: 'Tên Mới',
        phone: '0999888777'
      } } });
  await page.locator('summary', { hasText: 'Sửa thông tin' }).click();
  await page.locator('#profileForm input[name="name"]').fill('Tên Mới');
  await page.locator('#profileForm input[name="phone"]').fill('0999888777');
  await page.locator('#profileForm button').click();
  await page.waitForTimeout(500);
  assert.equal(await page.inputValue('#profileForm input[name="name"]'), 'Tên Mới');
  assert.match(await page.textContent('#aName'), /Tên Mới/);
});

test('Yêu thích: hiện tên tour thật thay vì mã tour', { skip }, async () => {
  const { page } = await open({ '/api/auth/favorites': { items: ['tour-tu-tao-1'] } });
  await page.waitForSelector('.fav-list');
  assert.match(await page.textContent('.fav-list'), /Tour tự tạo số 1/);
});

test('Kéo thả ảnh vào nút đổi ảnh đại diện thì ô chọn file nhận được file', { skip }, async () => {
  const { page } = await open();
  await page.evaluate(() => {
    window.__dropped = null;
    document.getElementById('avFile').addEventListener('change', (e) => {
      window.__dropped = e.target.files[0] && e.target.files[0].name;
    });
  });
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'anh-test.png', { type: 'image/png' }));
    const t = document.getElementById('avBtn');
    t.dispatchEvent(new DragEvent('dragover', {
      bubbles: true,
      cancelable: true,
      dataTransfer: dt
    }));
    t.dispatchEvent(new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer: dt
    }));
  });
  assert.equal(await page.evaluate(() => window.__dropped), 'anh-test.png');
});

test('Kéo thả file sai loại (không phải ảnh) bị bỏ qua', { skip }, async () => {
  const { page } = await open();
  await page.evaluate(() => {
    window.__dropped = 'chưa';
    document.getElementById('avFile').addEventListener('change', () => {
      window.__dropped = 'đã nhận';
    });
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'tai-lieu.pdf', { type: 'application/pdf' }));
    const t = document.getElementById('avBtn');
    t.dispatchEvent(new DragEvent('dragover', {
      bubbles: true,
      cancelable: true,
      dataTransfer: dt
    }));
    t.dispatchEvent(new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer: dt
    }));
  });
  assert.equal(await page.evaluate(() => window.__dropped), 'chưa');
});

test('Tải dữ liệu: gửi mật khẩu bằng POST rồi tải file JSON', { skip }, async () => {
  const { page, calls } = await open({ '/api/auth/export': { account: { email: 'a@example.com' } } });
  await page.locator('summary', { hasText: 'Dữ liệu' }).click();
  await page.locator('#dataForm input[name="current"]').fill('mat-khau-dai-123');
  const download = page.waitForEvent('download');
  await page.locator('#dataForm button:not(.pw-eye)').click();
  assert.equal((await download).suggestedFilename(), 'du-lieu-viet-du-ky.json');
  const c = calls.find((x) => x.path === '/api/auth/export');
  assert.equal(c.method, 'POST');
  assert.equal(JSON.parse(c.body).current, 'mat-khau-dai-123');
});

test('Thiết bị đăng nhập: hiện danh sách, đánh dấu thiết bị này, gỡ được thiết bị khác', { skip }, async () => {
  const items = [
    {
      id: 'aaaaaaaaaaaaaaaa',
      label: 'Chrome · Windows',
      country: 'VN',
      ip: '113.161.xxx.xxx',
      last_seen: Date.now(),
      created_at: Date.now(),
      current: true
    },
    {
      id: 'bbbbbbbbbbbbbbbb',
      label: 'Safari · iOS',
      country: 'VN',
      ip: '27.64.xxx.xxx',
      last_seen: Date.now(),
      created_at: Date.now(),
      current: false
    }
  ];
  const { page, calls } = await open({ '/api/auth/sessions': { items }, '/api/auth/sessions/revoke': { ok: true } });
  await page.locator('summary', { hasText: 'Thiết bị đăng nhập' }).click();
  await page.waitForSelector('#sessList li');
  assert.equal(await page.locator('#sessList li').count(), 2);
  assert.match(await page.textContent('#sessList li:first-child'), /thiết bị này/);
  await page.locator('#sessList li:nth-child(2) button').click();
  await page.waitForTimeout(400);
  const c = calls.find((x) => x.path === '/api/auth/sessions/revoke');
  assert.equal(JSON.parse(c.body).id, 'bbbbbbbbbbbbbbbb');
});
