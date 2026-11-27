/* Số liệu nổi bật chỉ hiện số thật: auto:* đếm từ CSDL, còn lại admin nhập; rỗng hoặc 0 thì ẩn */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDB } from '../helpers/d1.mjs';
import { siteStats, DEFS } from '../../src/site-settings.js';

test('Mặc định không còn con số bịa: trang chủ không chứa số cố định, hero_trust rỗng', () => {
	assert.equal(DEFS.hero_trust[2], '');
	const html = readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');
	assert.doesNotMatch(html, /data-n="\d{2,}"/);
});

test('auto:* lấy số thật, số tự nhập được giữ, rỗng / 0 / rác bị ẩn', async () => {
	const env = { DB: createDB() };
	const raw = env.DB.raw;
	raw.exec("INSERT INTO users (id, created_at, email, name, pass_hash, verified_at) VALUES (1, 1, 'a@x.vn', 'An', 'x', 5), (2, 1, 'v@virtual.invalid', 'Ảo', 'x', 5), (3, 1, 'c@x.vn', 'Chi', 'x', NULL)");
	const items = [
		{ icon: 'groups', label: 'Khách', value: 'auto:customers' },
		{ icon: 'badge', label: 'Hướng dẫn viên', value: '12' },
		{ icon: 'badge', label: 'Trống', value: '' },
		{ icon: 'map', label: 'Rác', value: 'abc' },
		{ icon: 'map', label: 'Số lớn', value: '12.500' }
	];
	const out = await siteStats(env, items);
	assert.deepEqual(out.map((x) => [x.label, x.n]), [['Khách', 1], ['Hướng dẫn viên', 12], ['Số lớn', 12500]]);
	assert.deepEqual(await siteStats(env, undefined), []);
});
