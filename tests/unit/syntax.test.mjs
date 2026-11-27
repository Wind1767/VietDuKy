/* Mọi file JS phải đọc được (cú pháp hợp lệ): src/ là ES module, public/ là script thường chạy trên trình duyệt. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const list = (dir) => fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.js')).map((f) => path.join(dir, f));

for (const file of list('src')) {
	test('ES module hợp lệ: ' + file, () => {
		const r = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
		assert.equal(r.status, 0, r.stderr);
	});
}

for (const file of [...list('public/js'), 'public/admin/admin.js']) {
	test('Script trình duyệt hợp lệ: ' + file, () => {
		assert.doesNotThrow(() => new vm.Script(fs.readFileSync(path.join(root, file), 'utf8'), { filename: file }));
	});
}
