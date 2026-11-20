/* Bảng quản trị: sao chép / CSV / tìm kiếm / sắp xếp không được lấy tên icon Material (innerText gồm cả chữ ligature). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../../public/admin/admin-plus.js', import.meta.url), 'utf8');

test('admin-plus.js đọc chữ của ô bằng cellText, không dùng innerText', () => {
  assert.match(src, /function cellText\(/);
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(/\.innerText/.test(code), false, 'innerText lấy cả tên icon (check_circle, edit...)');
});

test('cellText bỏ qua icon .ms, phần tử ẩn và chỉ lấy lựa chọn đang chọn của ô chọn', () => {
  const fn = src.slice(src.indexOf('function cellText'), src.indexOf('function toast'));
  assert.ok(fn.includes("classList.contains('ms')"));
  assert.ok(fn.includes('n.hidden'));
  assert.ok(fn.includes('selectedOptions'));
});
