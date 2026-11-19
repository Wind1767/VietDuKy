import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const css = fs.readFileSync(path.join(root, 'public/admin/admin.css'), 'utf8');

test('Luật nút trạng thái cũ không còn đè lên nút phân đoạn .seg-b', () => {
  assert.doesNotMatch(css, /^\.seg button \{/m);
  assert.doesNotMatch(css, /^\.seg button:active/m);
  assert.match(css, /\.seg button:not\(\.seg-b\) \{/);
});

test('Nút phân đoạn .seg-b luôn bo tròn đều (pill) trong khung pill', () => {
  assert.match(css, /\.seg > \.seg-b \{[^}]*border-radius: 99px;/);
  assert.match(css, /\.seg:has\(> \.seg-b\) \{[^}]*border-radius: 99px;/);
});
