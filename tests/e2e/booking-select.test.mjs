/* Trang đặt tour: ô chọn tour chia nhóm "Điểm đến" / "Tour" rõ ràng. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, staticServer, mockApi, openPage } from '../helpers/browser.mjs';

const pw = loadPlaywright();
const skip = pw ? false : 'chưa cài playwright (npm i)';
let srv, ctx;

before(async () => {
  if (skip) {
    return;
  }
  srv = await staticServer();
  ctx = await openPage(pw, srv.url, '/contact', mockApi({ '/api/auth/me': { user: {
        id: 1,
        name: 'Nguyễn Văn A',
        email: 'a@example.com',
        phone: '0901234567',
        avatar: ''
      } } }));
  await ctx.page.waitForSelector('.vui-btn');
  await ctx.page.waitForSelector('select[name="destination"] optgroup', { state: 'attached' });
  await ctx.page.waitForLoadState('networkidle');
  await ctx.page.waitForTimeout(300);
});
after(async () => {
  if (ctx) {
    await ctx.browser.close();
  }
  if (srv) {
    srv.server.close();
  }
});

/* Mở danh sách của ô "Điểm đến / tour". Trang có thể dịch chuyển khi tải tour nên thử lại nếu danh sách tự đóng. */
async function openDestPop(page) {
  const btn = page.locator('select[name="destination"]').locator('xpath=..').locator('.vui-btn').first();
  for (let i = 0; i < 4; i++) {
    await btn.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await btn.click();
    try {
      await page.waitForSelector('.vui-pop .vui-opt', { timeout: 1500 });
      return;
    } catch { /* thử lại */
    }
  }
  throw new Error('Không mở được danh sách điểm đến');
}

test('Ô chọn có 2 nhóm: Điểm đến và Tour', { skip }, async () => {
  const groups = await ctx.page.$$eval('select[name="destination"] optgroup', (g) => g.map((x) => ({ label: x.label, n: x.children.length })));
  assert.deepEqual(groups.map((g) => g.label), ['Điểm đến', 'Tour']);
  assert.equal(groups[0].n, 6);
  assert.equal(groups[1].n, 5, 'mọi tour đang bán đều có trong nhóm Tour');
});

test('Danh sách thả xuống hiện tiêu đề nhóm và chọn được tour', { skip }, async () => {
  await openDestPop(ctx.page);
  const heads = await ctx.page.$$eval('.vui-pop .vui-grp', (e) => e.map((x) => x.textContent.trim()));
  assert.deepEqual(heads, ['Điểm đến', 'Tour']);
  await ctx.page.locator('.vui-pop .vui-opt', { hasText: 'Tour tự tạo số 1' }).click();
  assert.equal(await ctx.page.$eval('select[name="destination"]', (s) => s.value), 'Tour tự tạo số 1');
});

test('Danh sách thả xuống nằm trên cùng, không bị che bởi phần tử khác', { skip }, async () => {
  await openDestPop(ctx.page);
  const top = await ctx.page.evaluate(() => {
    const pop = document.querySelector('.vui-pop');
    const r = pop.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + 20);
    return !!el && pop.contains(el);
  });
  assert.equal(top, true);
});
