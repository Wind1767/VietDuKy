import test from 'node:test';
import assert from 'node:assert/strict';
import { authorize } from '../../src/admin-accounts.js';

test('backup.json needs export + pii on top of backup', () => {
  const base = { backup: 'rw' };
  assert.equal(authorize('x', '/api/admin/backup.json', 'GET', base), false);
  assert.equal(authorize('x', '/api/admin/backup.json', 'GET', { ...base, export: 'rw' }), false);
  assert.equal(authorize('x', '/api/admin/backup.json', 'GET', { ...base, export: 'rw', pii: 'rw' }), true);
});
