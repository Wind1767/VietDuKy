/* Dựng máy chủ tĩnh cho thư mục public/ và mở Chromium (Playwright) với các API được giả lập sẵn. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIME = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript',
	'.css': 'text/css',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.json': 'application/json'
};

export function loadPlaywright() {
	for (const base of [root + '/package.json', '/home/claude/.npm-global/lib/node_modules/']) {
		try {
			return createRequire(base)('playwright');
		} catch { /* thử nơi khác */
		}
	}
	return null;
}

export function staticServer() {
	const server = http.createServer((req, res) => {
		let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
		if (p.endsWith('/')) {
			p += 'index.html';
		}
		let file = path.join(root, 'public', p);
		if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
			file = file + '.html';
		}
		if (!file.startsWith(path.join(root, 'public')) || !fs.existsSync(file)) {
			res.writeHead(404);
			res.end('404');
			return;
		}
		res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
		fs.createReadStream(file).pipe(res);
	});
	return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, url: 'http://127.0.0.1:' +
			server.address().port })));
}

export const TOURS = [
	{
		slug: 'du-thuyen-ha-long',
		name: 'Du thuyền Hạ Long',
		price: 2890000,
		duration: '2 ngày 1 đêm',
		group_note: 'Từ 2 khách',
		badge: 'Bán chạy',
		destination: 'Vịnh Hạ Long',
		active: 1,
		rating_count: 12,
		rating_avg: 4.8
	},
	{
		slug: 'da-nang-hoi-an-hue',
		name: 'Đà Nẵng – Hội An – Huế',
		price: 5490000,
		duration: '4 ngày 3 đêm',
		group_note: 'Nhóm tối đa 15',
		badge: '',
		destination: 'Hội An',
		active: 1,
		rating_count: 0,
		rating_avg: 0
	},
	{
		slug: 'phu-quoc-nghi-duong',
		name: 'Phú Quốc nghỉ dưỡng',
		price: 4250000,
		duration: '3 ngày 2 đêm',
		group_note: 'Từ 2 khách',
		badge: 'Mới',
		destination: 'Phú Quốc',
		active: 1,
		rating_count: 3,
		rating_avg: 5
	},
	{
		slug: 'tour-tu-tao-1',
		name: 'Tour tự tạo số 1',
		price: 1000000,
		duration: '1 ngày',
		group_note: 'Nhóm nhỏ',
		badge: '',
		destination: 'Sa Pa',
		active: 1,
		rating_count: 0,
		rating_avg: 0
	},
	{
		slug: 'tour-tu-tao-2',
		name: 'Tour tự tạo số 2',
		price: 2000000,
		duration: '2 ngày',
		group_note: 'Nhóm nhỏ',
		badge: '',
		destination: 'Đà Lạt',
		active: 1,
		rating_count: 0,
		rating_avg: 0
	}
];
export const DESTS = ['Vịnh Hạ Long', 'Sa Pa', 'Hội An', 'Huế', 'Đà Lạt', 'Phú Quốc'].map((name, i) => ({
	id: i + 1,
	name,
	title: name,
	province: '',
	blurb: '',
	image: 'images/hero.jpg',
	active: 1,
	sort: i
}));

/* Trả lời giả cho /api/*; `over` ghi đè theo đường dẫn: { '/api/auth/me': {...} } */
export function mockApi(over = {}) {
	const base = {
		'/api/site': { site: {} },
		'/api/tours': { items: TOURS },
		'/api/destinations': { items: DESTS },
		'/api/blocks': { items: [] },
		'/api/reviews': {
			items: [],
			count: 0,
			avg: 0,
			dist: {},
			page: 1,
			size: 1
		},
		'/api/auth/me': { user: null },
		'/api/auth/bookings': { items: [] },
		'/api/auth/favorites': { items: [] },
		'/api/auth/avatars': { current: '', items: [] }
	};
	return { ...base, ...over };
}

export async function openPage(pw, base, pathname, api) {
	const browser = await pw.chromium.launch();
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	const calls = [];
	await page.route('**/*', async (route) => {
		const u = new URL(route.request().url());
		if (u.hostname !== '127.0.0.1') {
			return route.abort();
		} // không tải font / CDN ngoài
		if (u.pathname.startsWith('/api/')) {
			calls.push({
				method: route.request().method(),
				path: u.pathname,
				body: route.request().postData()
			});
			const key = u.pathname;
			const val = typeof api[key] === 'function' ? api[key](route.request()) : api[key];
			return route.fulfill({
				status: val === undefined ? 404 : 200,
				contentType: 'application/json',
				body: JSON.stringify(val === undefined ? { error: 'not mocked' } : val)
			});
		}
		return route.continue();
	});
	await page.goto(base + pathname, { waitUntil: 'domcontentloaded' });
	return {
		browser,
		page,
		calls
	};
}
