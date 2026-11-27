/* Xuất Excel (.xlsx): bộ tạo file tự viết + các đường dẫn xuất của trang quản trị. */
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createDB, UA } from '../helpers/d1.mjs';
import worker from '../../src/worker.js';
import { buildXlsx, XLSX_TYPE } from '../../src/xlsx.js';
import { authorize, permsOf } from '../../src/admin-accounts.js';

const ADMIN_PASSWORD = 'mat-khau-quan-tri-rat-dai-123';
let env;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
	if (String(url).includes('challenges.cloudflare.com')) {
		return new Response(JSON.stringify({
			success: true,
			action: 'admin_login',
			hostname: 'localhost'
		}), { headers: { 'Content-Type': 'application/json' } });
	}
	return realFetch(url, init);
};
after(() => {
	globalThis.fetch = realFetch;
});
beforeEach(() => {
	env = {
		DB: createDB(),
		ADMIN_PASSWORD,
		TURNSTILE_SECRET: 'test-secret',
		TURNSTILE_HOSTNAMES: 'localhost',
		ASSETS: { fetch: async () => new Response('asset') }
	};
});

async function call(method, path, { body, cookie } = {}) {
	const headers = {
		'User-Agent': UA.chromeWin,
		'CF-IPCountry': 'VN',
		'CF-Connecting-IP': '113.161.10.20',
		'Content-Type': 'application/json',
		Origin: 'http://localhost'
	};
	if (cookie) {
		headers.Cookie = 'vdk_session=' + cookie;
	}
	return worker.fetch(new Request('http://localhost' + path, {
		method,
		headers,
		body: body ? JSON.stringify(body) : undefined
	}), env, { waitUntil() {} });
}
async function login() {
	const res = await call('POST', '/api/admin/login', { body: { password: ADMIN_PASSWORD, 'cf-turnstile-response': 'ok-token' } });
	return /vdk_session=([^;]+)/.exec(res.headers.get('Set-Cookie'))[1];
}

/* Đọc danh sách tên file trong zip (thư mục trung tâm) */
function zipNames(u8) {
	const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
	let eocd = u8.length - 22;
	assert.equal(dv.getUint32(eocd, true), 0x06054b50, 'có cuối zip');
	const n = dv.getUint16(eocd + 10, true);
	let p = dv.getUint32(eocd + 16, true);
	const out = [];
	for (let i = 0; i < n; i++) {
		const len = dv.getUint16(p + 28, true), ex = dv.getUint16(p + 30, true), cm = dv.getUint16(p + 32, true);
		out.push(new TextDecoder().decode(u8.slice(p + 46, p + 46 + len)));
		p += 46 + len + ex + cm;
	}
	return out;
}

test('buildXlsx tạo zip hợp lệ có đủ các phần của sổ tính', () => {
	const u = buildXlsx([{ name: 'Đơn: 1/2', rows: [['Mã', 'Tên'], [1, '=1+1']] }, { name: 'Đơn: 1/2', rows: [['A']] }]);
	assert.equal(u[0], 0x50);
	assert.equal(u[1], 0x4b);
	const names = zipNames(u);
	for (const f of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) {
		assert.ok(names.includes(f), f);
	}
});

test('Công thức và ký tự đặc biệt chỉ được lưu dạng chữ, không bao giờ chạy', () => {
	const u = buildXlsx([{ name: 'S', rows: [['A'], ['=HYPERLINK("x")'], ['<b>&</b>']] }]);
	const text = new TextDecoder().decode(u);
	assert.ok(!/<f>/.test(text), 'không có thẻ công thức');
	assert.match(text, /t="inlineStr"/);
	assert.match(text, /&lt;b&gt;&amp;&lt;\/b&gt;/);
});

test('Các đường dẫn xuất Excel trả về file .xlsx', async () => {
	const cookie = await login();
	for (const path of ['/api/admin/export.xlsx', '/api/admin/accounts.xlsx', '/api/admin/report.xlsx', '/api/admin/customers.xlsx', '/api/admin/activity.xlsx', '/api/admin/data/export?kind=tours&format=xlsx', '/api/admin/data/export?kind=all&format=xlsx']) {
		const res = await call('GET', path, { cookie });
		assert.equal(res.status, 200, path);
		assert.equal(res.headers.get('Content-Type'), XLSX_TYPE, path);
		assert.match(res.headers.get('Content-Disposition'), /\.xlsx"/, path);
		const u = new Uint8Array(await res.arrayBuffer());
		assert.equal(String.fromCharCode(u[0], u[1]), 'PK', path);
	}
});

test('Chưa đăng nhập thì không tải được file Excel', async () => {
	for (const path of ['/api/admin/export.xlsx', '/api/admin/data/export?kind=all&format=xlsx']) {
		assert.equal((await call('GET', path)).status, 401, path);
	}
});

test('Xuất Excel cần cùng quyền như xuất CSV (export + pii)', () => {
	const viewer = permsOf('viewer');
	for (const p of ['/api/admin/export.xlsx', '/api/admin/accounts.xlsx', '/api/admin/customers.xlsx', '/api/admin/activity.xlsx']) {
		assert.equal(authorize('viewer', p, 'GET', {
			...viewer,
			export: undefined,
			pii: undefined
		}), false, p);
	}
	for (const p of ['/api/admin/export.xlsx', '/api/admin/accounts.xlsx', '/api/admin/customers.xlsx', '/api/admin/activity.xlsx']) {
		assert.equal(authorize('owner', p, 'GET'), true, p);
	}
});
