import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isProfane, assertClean } from '../../src/profanity.js';

class HttpError extends Error {
	constructor(status, message, _x, code) {
		super(message);
		this.status = status;
		this.code = code;
	}
}
const reply = (data, ok = true) => async () => ({ ok, json: async () => data });

test('API báo có từ cấm thì isProfane = true, gửi đúng body', async () => {
	let sent;
	const f = async (url, o) => {
		sent = { url, o };
		return { ok: true, json: async () => ({ isProfanity: true }) };
	};
	assert.equal(await isProfane('bad words', f), true);
	assert.equal(sent.url, 'https://vector.profanity.dev');
	assert.deepEqual(JSON.parse(sent.o.body), { message: 'bad words' });
});

test('Sạch, rỗng, lỗi mạng hoặc API lỗi đều cho qua', async () => {
	assert.equal(await isProfane('xin chào', reply({ isProfanity: false })), false);
	assert.equal(await isProfane('   ', reply({ isProfanity: true })), false);
	assert.equal(await isProfane('x', async () => {
		throw new Error('net');
	}), false);
	assert.equal(await isProfane('x', reply({}, false)), false);
});

test('assertClean ném 400 khi có từ cấm và tắt được bằng PROFANITY_FILTER=off', async () => {
	const real = globalThis.fetch;
	globalThis.fetch = reply({ isProfanity: true });
	try {
		await assert.rejects(assertClean({}, HttpError, 'a', 'b'), e => e.status === 400 && e.code === 'profanity');
		await assertClean({ PROFANITY_FILTER: 'off' }, HttpError, 'a');
	} finally {
		globalThis.fetch = real;
	}
});
