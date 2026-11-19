/* Cấu trúc file: tên theo chức năng, mọi import trỏ tới file có thật, không còn tên cũ. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const src = fs.readdirSync(path.join(root, 'src')).filter((f) => f.endsWith('.js'));

test('Các file src/ có tên theo chức năng', () => {
  for (const f of ['customer-auth.js', 'customer-accounts.js', 'admin-accounts.js', 'admin-access.js', 'tours.js', 'site-settings.js', 'site-layout.js', 'custom-content.js', 'email-templates.js', 'data-import-export.js', 'session-device.js', 'privacy.js']) {
    assert.ok(src.includes(f), 'thiếu src/' + f);
  }
  for (const old of ['auth.js', 'accounts.js', 'roles.js', 'access.js', 'admin5.js', 'site.js', 'layout.js', 'content.js', 'emailtpl.js', 'dataio.js']) {
    assert.ok(!src.includes(old), 'còn tên cũ src/' + old);
  }
});

test('Mọi import tương đối trong src/ và tests/ trỏ tới file có thật', () => {
  const dirs = ['src', 'tests/unit', 'tests/helpers', 'tests/e2e'];
  for (const d of dirs) {
    for (const f of fs.readdirSync(path.join(root, d)).filter((x) => /\.m?js$/.test(x))) {
      for (const m of read(d + '/' + f).matchAll(/from '(\.[^']+)'/g)) {
        assert.ok(fs.existsSync(path.join(root, d, m[1])), `${d}/${f} import ${m[1]}`);
      }
    }
  }
});

test('Không còn tên hàm / biến mang số phần (PART5, seedPart5)', () => {
  for (const f of src) {
    assert.doesNotMatch(read('src/' + f), /PART\d|seedPart\d/, f);
  }
});

test('CSS / JS dùng chung đặt tên theo chức năng', () => {
  for (const f of ['public/css/form-controls.css', 'public/css/components.css', 'public/js/form-controls.js']) {
    assert.ok(fs.existsSync(path.join(root, f)), f);
  }
  for (const f of ['public/css/vui.css', 'public/css/extra.css', 'public/js/ui.js']) {
    assert.ok(!fs.existsSync(path.join(root, f)), 'còn file cũ ' + f);
  }
});

test('Cookie phiên khách không còn dùng chữ ký HMAC bí mật suy ra từ mật khẩu khác', () => {
  const auth = read('src/customer-auth.js');
  assert.doesNotMatch(auth, /ADMIN_PASSWORD|GMAIL_APP_PASSWORD|SESSION_SECRET/);
  assert.match(auth, /user_sessions/);
});
