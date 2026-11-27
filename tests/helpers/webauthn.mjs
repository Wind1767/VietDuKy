/* Bộ xác thực giả bằng Web Crypto, dùng cho test passkey */
import { b64u, sha256 } from '../../src/mfa.js';

const enc = new TextEncoder();

export function cborEnc(v) {
	const head = (major, n) => {
		if (n < 24) {
			return [(major << 5) | n];
		}
		if (n < 256) {
			return [(major << 5) | 24, n];
		}
		return [(major << 5) | 25, n >> 8, n & 255];
	};
	if (typeof v === 'number') {
		return v >= 0 ? head(0, v) : head(1, -1 - v);
	}
	if (typeof v === 'string') {
		const b = enc.encode(v);
		return [...head(3, b.length), ...b];
	}
	if (v instanceof Uint8Array) {
		return [...head(2, v.length), ...v];
	}
	if (v instanceof Map) {
		return [...head(5, v.size), ...[...v].flatMap(([k, x]) => [...cborEnc(k), ...cborEnc(x)])];
	}
	throw new Error('type');
}

function rawToDer(raw) {
	const int = (b) => {
		let i = 0;
		while (i < b.length - 1 && b[i] === 0) {
			i++;
		}
		let v = [...b.slice(i)];
		if (v[0] & 0x80) {
			v = [0, ...v];
		}
		return [2, v.length, ...v];
	};
	const body = [...int(raw.slice(0, 32)), ...int(raw.slice(32))];
	return new Uint8Array([0x30, body.length, ...body]);
}

export const ORIGIN = 'https://vietduky.example', RP_ID = 'vietduky.example';

export async function authenticator(RPID = RP_ID, ORIG = ORIGIN) {
	const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
	const jwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
	const credId = crypto.getRandomValues(new Uint8Array(16));
	const cose = new Map([[1, 2], [3, -7], [-1, 1], [-2, b64u.dec(jwk.x)], [-3, b64u.dec(jwk.y)]]);
	const rpHash = await sha256(RPID);
	const authData = (flags, counter, withCred) => {
		const c = new Uint8Array(4);
		new DataView(c.buffer).setUint32(0, counter);
		const base = [...rpHash, flags, ...c];
		if (!withCred) {
			return new Uint8Array(base);
		}
		const coseBytes = cborEnc(cose);
		return new Uint8Array([...base, ...new Uint8Array(16), 0, credId.length, ...credId, ...coseBytes]);
	};
	const clientData = (type, challenge, origin = ORIG) => enc.encode(JSON.stringify({
		type,
		challenge,
		origin
	}));
	return {
		credId,
		kp,
		register(challenge, opts = {}) {
			const ad = authData(opts.flags ?? 0x45, 0, true);
			const att = new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', ad]]);
			return {
				id: b64u.enc(credId),
				rawId: b64u.enc(credId),
				response: { clientDataJSON: b64u.enc(clientData('webauthn.create', challenge, opts.origin)), attestationObject: b64u.enc(new Uint8Array(cborEnc(att))) }
			};
		},
		async assert(challenge, counter, opts = {}) {
			const ad = authData(opts.flags ?? 0x05, counter, false);
			const cd = clientData('webauthn.get', opts.challenge ?? challenge, opts.origin);
			const signed = new Uint8Array([...ad, ...(await sha256(cd))]);
			const raw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, signed));
			return { rawId: b64u.enc(credId), response: {
					authenticatorData: b64u.enc(ad),
					clientDataJSON: b64u.enc(cd),
					signature: b64u.enc(rawToDer(raw))
				} };
		}
	};
}
