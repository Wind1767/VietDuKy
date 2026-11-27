import test from 'node:test';
import assert from 'node:assert/strict';
import { authorize } from '../../src/admin-accounts.js';

test('backup.json needs export + pii on top of backup', () => {
	const base = { backup: 'rw' };
	assert.equal(authorize('x', '/api/admin/backup.json', 'GET', base), false);
	assert.equal(authorize('x', '/api/admin/backup.json', 'GET', { ...base, export: 'rw' }), false);
	assert.equal(authorize('x', '/api/admin/backup.json', 'GET', { ...base, export: 'rw', pii: 'rw' }), true);
});

import { maskPII } from '../../src/admin-accounts.js';
test('maskPII also masks prefixed keys like user_email', () => {
	const o = maskPII({ user_email: 'abc@x.com', phone: '0912345678', list: [{ customer_phone: '0987654321' }] });
	assert.ok(o.user_email.includes('•'));
	assert.ok(o.phone.includes('•'));
	assert.ok(o.list[0].customer_phone.includes('•'));
});
