/* Trang chủ: navbar theo dõi cuộn, đánh giá thật, nút "Tất cả tour". Cần: npm i && npx playwright install chromium */
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
	ctx = await openPage(pw, srv.url, '/', mockApi({ '/api/reviews': {
			items: [],
			count: 15,
			avg: 4.8,
			dist: {},
			page: 1,
			size: 1
		} }));
	await ctx.page.waitForSelector('.menu a');
	await ctx.page.waitForTimeout(400);
});
after(async () => {
	if (ctx) {
		await ctx.browser.close();
	}
	if (srv) {
		srv.server.close();
	}
});

const activeLabel = (page) => page.evaluate(() => [...document.querySelectorAll('.menu li[data-nl] > a.on')].map((a) => a.textContent.trim()));
const scrollToId = async (page, id) => {
	await page.evaluate((i) => window.scrollTo(0, document.getElementById(i).getBoundingClientRect().top +
		window.scrollY - 40), id);
	await page.waitForTimeout(350);
};

test('Navbar: ở đầu trang chỉ "Trang chủ" sáng', { skip }, async () => {
	assert.deepEqual(await activeLabel(ctx.page), ['Trang chủ']);
});

test('Navbar: cuộn xuống "Điểm đến" thì gạch chân chuyển sang Điểm đến', { skip }, async () => {
	await scrollToId(ctx.page, 'diem-den');
	assert.deepEqual(await activeLabel(ctx.page), ['Điểm đến']);
});

test('Navbar: cuộn xuống "Tour hot" thì gạch chân chuyển sang Tour hot', { skip }, async () => {
	await scrollToId(ctx.page, 'tour');
	assert.deepEqual(await activeLabel(ctx.page), ['Tour hot']);
});

test('Navbar: cuộn lên đầu trang thì quay về "Trang chủ"', { skip }, async () => {
	await ctx.page.evaluate(() => window.scrollTo(0, 0));
	await ctx.page.waitForTimeout(350);
	assert.deepEqual(await activeLabel(ctx.page), ['Trang chủ']);
});

test('Đánh giá thật: hiện số liệu từ API, tour chưa có thì ghi "Chưa có đánh giá"', { skip }, async () => {
	const rates = await ctx.page.$$eval('.tour:not([hidden]) .rate', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
	assert.ok(rates.some((t) => /4,8 \(12 đánh giá\)/.test(t)), rates.join(' | '));
	assert.ok(rates.some((t) => /5 \(3 đánh giá\)/.test(t)), rates.join(' | '));
	assert.ok(rates.some((t) => /Chưa có đánh giá/.test(t)), rates.join(' | '));
	assert.ok(!rates.some((t) => /320|510|180/.test(t)), 'không còn số đánh giá viết cứng');
});

test('Banner: dòng tin cậy lấy theo đánh giá thật', { skip }, async () => {
	const t = await ctx.page.textContent('#heroTrust');
	assert.match(t, /4,8\/5 từ 15 đánh giá/);
});

test('Tour hot: mặc định 3 tour, bấm "Tất cả tour" hiện đủ 5 rồi "Thu gọn"', { skip }, async () => {
	const visible = () => ctx.page.$$eval('.tours .tour', (els) => els.filter((e) => e.offsetParent !== null).length);
	assert.equal(await visible(), 3);
	const btn = ctx.page.locator('#toursAllBtn');
	assert.match(await btn.textContent(), /Tất cả tour \(5\)/);
	await btn.click();
	assert.equal(await visible(), 5);
	assert.match(await btn.textContent(), /Thu gọn/);
	await btn.click();
	assert.equal(await visible(), 3);
});
