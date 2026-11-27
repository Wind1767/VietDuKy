/* Việt Du Ký – lõi xác thực nhiều lớp: TOTP (Google Authenticator), passkey (WebAuthn), đăng nhập Google.
Chỉ dùng Web Crypto có sẵn trong Workers, không cần thư viện ngoài. Dùng chung cho khách (kind = 'user') và quản trị (kind = 'admin'). */
const enc = new TextEncoder();
const dec = new TextDecoder();

export const MFA_SCHEMA = [
	// bí mật TOTP được mã hoá AES-GCM trước khi lưu; last_step chống dùng lại cùng một mã
	'CREATE TABLE IF NOT EXISTS mfa_totp (kind TEXT NOT NULL, uid INTEGER NOT NULL, secret TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0, last_step INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, PRIMARY KEY (kind, uid))',
	'CREATE TABLE IF NOT EXISTS mfa_recovery (kind TEXT NOT NULL, uid INTEGER NOT NULL, code_hash TEXT NOT NULL, used_at INTEGER, PRIMARY KEY (kind, uid, code_hash))',
	'CREATE TABLE IF NOT EXISTS mfa_passkeys (id TEXT PRIMARY KEY, kind TEXT NOT NULL, uid INTEGER NOT NULL, pub TEXT NOT NULL, alg INTEGER NOT NULL, counter INTEGER NOT NULL DEFAULT 0, name TEXT NOT NULL DEFAULT \'\', transports TEXT NOT NULL DEFAULT \'\', created_at INTEGER NOT NULL, last_used INTEGER)',
	'CREATE INDEX IF NOT EXISTS idx_mfa_passkeys_owner ON mfa_passkeys(kind, uid)',
	'CREATE TABLE IF NOT EXISTS mfa_google (sub TEXT PRIMARY KEY, kind TEXT NOT NULL, uid INTEGER NOT NULL, email TEXT NOT NULL DEFAULT \'\', created_at INTEGER NOT NULL)',
	'CREATE TABLE IF NOT EXISTS mfa_challenges (id TEXT PRIMARY KEY, kind TEXT NOT NULL, uid INTEGER NOT NULL DEFAULT 0, purpose TEXT NOT NULL, data TEXT NOT NULL DEFAULT \'\', tries INTEGER NOT NULL DEFAULT 0, exp INTEGER NOT NULL)'
];

/* ---------- Mã hoá chữ ---------- */
export const b64u = {
	enc(buf) {
		const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
		let s = '';
		for (let i = 0; i < b.length; i++) {
			s += String.fromCharCode(b[i]);
		}
		return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	},
	dec(str) {
		const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
		const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
		return Uint8Array.from(bin, c => c.charCodeAt(0));
	}
};
const hex = buf => [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
export const sha256 = async (data) => new Uint8Array(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? enc.encode(data) : data));
export const sha256Hex = async (data) => hex(await sha256(data));
const rand = n => crypto.getRandomValues(new Uint8Array(n));

export function ctEqual(a, b) {
	const x = a instanceof Uint8Array ? a : enc.encode(String(a)), y = b instanceof Uint8Array ? b : enc.encode(String(b));
	let diff = x.length ^ y.length;
	for (let i = 0; i < Math.max(x.length, y.length); i++) {
		diff |= (x[i] || 0) ^ (y[i] || 0);
	}
	return diff === 0;
}

/* ---------- Khoá hệ thống (mã hoá bí mật TOTP, ký nonce) ---------- */
function masterSecret(env) {
	const s = env.MFA_KEY || env.SESSION_SECRET || env.ADMIN_PASSWORD || '';
	if (!s) {
		throw new Error('Chưa cấu hình MFA_KEY / SESSION_SECRET / ADMIN_PASSWORD.');
	}
	return s;
}
async function aesKey(env) {
	return crypto.subtle.importKey('raw', await sha256('vdk-mfa-aes|' + masterSecret(env)), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function sealSecret(env, text) {
	const iv = rand(12);
	const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(env), enc.encode(text)));
	return b64u.enc(new Uint8Array([...iv, ...ct]));
}
export async function openSecret(env, sealed) {
	const all = b64u.dec(sealed);
	return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, await aesKey(env), all.slice(12)));
}
async function hmacHex(env, data) {
	const key = await crypto.subtle.importKey('raw', await sha256('vdk-mfa-hmac|' + masterSecret(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	return hex(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

/* Nonce cho đăng nhập Google: ký bằng khoá hệ thống, sống 10 phút, gắn vào id_token để chống dùng lại token cũ */
export async function newNonce(env) {
	const body = b64u.enc(rand(16)) + '.' + (Math.floor(Date.now() / 1000) + 600);
	return body + '.' + (await hmacHex(env, 'nonce|' + body));
}
export async function checkNonce(env, nonce) {
	const p = String(nonce || '').split('.');
	if (p.length !== 3 || Number(p[1]) < Date.now() / 1000) {
		return false;
	}
	return ctEqual(p[2], await hmacHex(env, 'nonce|' + p[0] + '.' + p[1]));
}

/* ---------- TOTP (RFC 6238, SHA-1, 6 số, 30 giây) ---------- */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function b32enc(bytes) {
	let bits = 0, val = 0, out = '';
	for (const b of bytes) {
		val = (val << 8) | b;
		bits += 8;
		while (bits >= 5) {
			out += B32[(val >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	return bits ? out + B32[(val << (5 - bits)) & 31] : out;
}
export function b32dec(str) {
	let bits = 0, val = 0;
	const out = [];
	for (const ch of String(str).toUpperCase().replace(/[\s=-]/g, '')) {
		const i = B32.indexOf(ch);
		if (i < 0) {
			throw new Error('base32');
		}
		val = (val << 5) | i;
		bits += 5;
		if (bits >= 8) {
			out.push((val >>> (bits - 8)) & 255);
			bits -= 8;
		}
	}
	return new Uint8Array(out);
}
export const newTotpSecret = () => b32enc(rand(20));

export async function hotp(keyBytes, counter) {
	const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
	const msg = new Uint8Array(8);
	new DataView(msg.buffer).setUint32(4, counter >>> 0);
	new DataView(msg.buffer).setUint32(0, Math.floor(counter / 4294967296));
	const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
	const o = sig[19] & 15;
	const n = ((sig[o] & 0x7f) << 24) | (sig[o + 1] << 16) | (sig[o + 2] << 8) | sig[o + 3];
	return String(n % 1000000).padStart(6, '0');
}

/* Trả về số bước (> 0) nếu mã đúng và chưa dùng; 0 nếu sai. Cho phép lệch ±30 giây. */
export async function verifyTotp(secretB32, code, lastStep = 0, now = Date.now()) {
	const c = String(code ?? '').replace(/\s+/g, '');
	if (!/^\d{6}$/.test(c)) {
		return 0;
	}
	const key = b32dec(secretB32), step = Math.floor(now / 30000);
	let hit = 0;
	for (const d of [0, -1, 1]) { // luôn tính đủ cả 3 mã để thời gian không lộ mã nào gần đúng
		const s = step + d;
		if (ctEqual(await hotp(key, s), c) && s > lastStep) {
			hit = Math.max(hit, s);
		}
	}
	return hit;
}

export const otpauthUri = (issuer, account, secret) => `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

/* Mã khôi phục: 10 ký tự dễ đọc, dùng một lần */
const RC = 'abcdefghjkmnpqrstuvwxyz23456789';
export function newRecoveryCodes(n = 8) {
	return Array.from({ length: n }, () => {
		const b = rand(10);
		const s = [...b].map(x => RC[x % RC.length]).join('');
		return s.slice(0, 5) + '-' + s.slice(5);
	});
}
export const normRecovery = c => String(c ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/* ---------- CBOR tối giản (đủ để đọc attestationObject và khoá COSE) ---------- */
export function cborDecode(buf, start = 0) {
	const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
	let p = start;
	const read = () => {
		if (p >= b.length) {
			throw new Error('cbor');
		}
		const ib = b[p++], major = ib >> 5, info = ib & 31;
		let len = info;
		if (info === 24) {
			len = b[p++];
		} else if (info === 25) {
			len = (b[p] << 8) | b[p + 1];
			p += 2;
		} else if (info === 26) {
			len = ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;
			p += 4;
		} else if (info === 27) {
			len = Number(new DataView(b.buffer, b.byteOffset + p, 8).getBigUint64(0));
			p += 8;
		} else if (info > 27) {
			throw new Error('cbor');
		}
		switch (major) {
			case 0: return len;
			case 1: return -1 - len;
			case 2: {
				if (p + len > b.length) {
					throw new Error('cbor');
				}
				const v = b.slice(p, p + len);
				p += len;
				return v;
			}
			case 3: {
				if (p + len > b.length) {
					throw new Error('cbor');
				}
				const v = dec.decode(b.slice(p, p + len));
				p += len;
				return v;
			}
			case 4: {
				if (len > 1024) {
					throw new Error('cbor');
				}
				return Array.from({ length: len }, read);
			}
			case 5: {
				if (len > 1024) {
					throw new Error('cbor');
				}
				const m = new Map();
				for (let i = 0; i < len; i++) {
					const k = read();
					m.set(k, read());
				}
				return m;
			}
			case 6: return read();
			default:
				if (info === 20) {
					return false;
				}
				if (info === 21) {
					return true;
				}
				if (info === 22 || info === 23) {
					return null;
				}
				throw new Error('cbor');
		}
	};
	const value = read();
	return [value, p];
}

/* ---------- WebAuthn ---------- */
export function rpOf(env, url) {
	return {
		id: url.hostname,
		origin: url.origin,
		name: env.EMAIL_NAME || 'Việt Du Ký'
	};
}

function parseAuthData(ad) {
	if (ad.length < 37) {
		throw new Error('authData');
	}
	const out = {
		rpIdHash: ad.slice(0, 32),
		flags: ad[32],
		counter: new DataView(ad.buffer, ad.byteOffset + 33, 4).getUint32(0)
	};
	if (out.flags & 0x40) {
		const idLen = (ad[53] << 8) | ad[54];
		out.credId = ad.slice(55, 55 + idLen);
		out.cose = cborDecode(ad, 55 + idLen)[0];
	}
	return out;
}

function coseToJwk(cose) {
	if (!(cose instanceof Map)) {
		throw new Error('cose');
	}
	const kty = cose.get(1), alg = cose.get(3);
	if (kty === 2 && alg === -7 && cose.get(-1) === 1) {
		return { alg, jwk: {
				kty: 'EC',
				crv: 'P-256',
				x: b64u.enc(cose.get(-2)),
				y: b64u.enc(cose.get(-3)),
				ext: true
			} };
	}
	if (kty === 3 && alg === -257) {
		return { alg, jwk: {
				kty: 'RSA',
				alg: 'RS256',
				n: b64u.enc(cose.get(-1)),
				e: b64u.enc(cose.get(-2)),
				ext: true
			} };
	}
	throw new Error('Loại khoá chưa được hỗ trợ.');
}

function checkClient(clientDataJSON, type, challenge, origin) {
	const c = JSON.parse(dec.decode(clientDataJSON));
	if (c.type !== type || c.crossOrigin === true || c.origin !== origin || !ctEqual(String(c.challenge), challenge)) {
		throw new Error('clientData');
	}
}

/* Đăng ký passkey mới: nhận credential từ trình duyệt, trả về dữ liệu cần lưu */
export async function verifyRegistration(cred, { challenge, origin, rpId }) {
	const clientDataJSON = b64u.dec(cred.response.clientDataJSON);
	checkClient(clientDataJSON, 'webauthn.create', challenge, origin);
	const [att] = cborDecode(b64u.dec(cred.response.attestationObject));
	const ad = parseAuthData(att.get('authData'));
	if (!ctEqual(ad.rpIdHash, await sha256(rpId)) || !(ad.flags & 0x01) || !(ad.flags & 0x04) || !ad.credId) {
		throw new Error('authData');
	}
	const { alg, jwk } = coseToJwk(ad.cose);
	return {
		id: b64u.enc(ad.credId),
		alg,
		pub: JSON.stringify(jwk),
		counter: ad.counter
	};
}

function derToRaw(der) {
	// chữ ký ECDSA dạng DER -> r||s (64 byte) cho Web Crypto
	let p = 2;
	if (der[0] !== 0x30) {
		throw new Error('sig');
	}
	if (der[1] & 0x80) {
		p += der[1] & 0x7f;
	}
	const part = () => {
		if (der[p] !== 0x02) {
			throw new Error('sig');
		}
		let len = der[p + 1];
		let v = der.slice(p + 2, p + 2 + len);
		p += 2 + len;
		while (v.length > 32 && v[0] === 0) {
			v = v.slice(1);
		}
		const out = new Uint8Array(32);
		out.set(v, 32 - v.length);
		return out;
	};
	const r = part(), s = part();
	return new Uint8Array([...r, ...s]);
}

/* Xác minh lần đăng nhập bằng passkey; trả về bộ đếm mới */
export async function verifyAssertion(cred, { challenge, origin, rpId, pub, alg, counter }) {
	const clientDataJSON = b64u.dec(cred.response.clientDataJSON);
	checkClient(clientDataJSON, 'webauthn.get', challenge, origin);
	const authData = b64u.dec(cred.response.authenticatorData);
	const ad = parseAuthData(authData);
	if (!ctEqual(ad.rpIdHash, await sha256(rpId)) || !(ad.flags & 0x01) || !(ad.flags & 0x04)) {
		throw new Error('authData');
	}
	const signed = new Uint8Array([...authData, ...(await sha256(clientDataJSON))]);
	const sig = b64u.dec(cred.response.signature);
	const jwk = JSON.parse(pub);
	let ok;
	if (alg === -7) {
		const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
		ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, derToRaw(sig), signed);
	} else if (alg === -257) {
		const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
		ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, signed);
	}
	if (!ok) {
		throw new Error('sig');
	}
	if ((counter > 0 || ad.counter > 0) && ad.counter <= counter) {
		throw new Error('counter'); // bộ đếm không tăng: nghi khoá bị sao chép
	}
	return ad.counter;
}

/* ---------- Đăng nhập Google (Google Identity Services trả về id_token) ---------- */
const GOOGLE_JWKS = 'https://www.googleapis.com/oauth2/v3/certs';
let jwksCache = { at: 0, keys: [] };

async function googleKeys(fetcher, force) {
	if (!force && jwksCache.keys.length && Date.now() - jwksCache.at < 3600000) {
		return jwksCache.keys;
	}
	const r = await fetcher(GOOGLE_JWKS);
	if (!r.ok) {
		throw new Error('jwks');
	}
	jwksCache = { at: Date.now(), keys: (await r.json()).keys || [] };
	return jwksCache.keys;
}

export function resetGoogleKeyCache() {
	jwksCache = { at: 0, keys: [] };
}

/* Kiểm tra chữ ký RS256, issuer, audience (client ID của mình), hạn dùng, email đã xác minh và nonce. */
export async function verifyGoogleToken(idToken, { clientId, nonce, fetcher = fetch, now = Date.now() }) {
	const parts = String(idToken || '').split('.');
	if (parts.length !== 3 || !clientId) {
		throw new Error('token');
	}
	const header = JSON.parse(dec.decode(b64u.dec(parts[0])));
	if (header.alg !== 'RS256' || !header.kid) {
		throw new Error('alg');
	}
	let jwk = (await googleKeys(fetcher)).find(k => k.kid === header.kid);
	if (!jwk) {
		jwk = (await googleKeys(fetcher, true)).find(k => k.kid === header.kid); // Google vừa xoay khoá
	}
	if (!jwk) {
		throw new Error('kid');
	}
	const key = await crypto.subtle.importKey('jwk', {
		...jwk,
		alg: 'RS256',
		ext: true
	}, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
	const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u.dec(parts[2]), enc.encode(parts[0] +
		'.' + parts[1]));
	if (!ok) {
		throw new Error('sig');
	}
	const p = JSON.parse(dec.decode(b64u.dec(parts[1])));
	const sec = Math.floor(now / 1000);
	if (!['https://accounts.google.com', 'accounts.google.com'].includes(p.iss) || p.aud !== clientId || !(p.exp > sec - 30) || p.iat > sec +
		300) {
		throw new Error('claims');
	}
	if (!p.sub || !p.email || (p.email_verified !== true && p.email_verified !== 'true')) {
		throw new Error('email');
	}
	if (nonce !== undefined && p.nonce !== nonce) {
		throw new Error('nonce');
	}
	return {
		sub: String(p.sub),
		email: String(p.email).toLowerCase(),
		name: String(p.name || ''),
		picture: String(p.picture || '')
	};
}

/* ---------- Thử thách một lần dùng (vé đăng nhập, challenge passkey) ---------- */
const CHALLENGE_TTL_MS = 5 * 60000;
export async function putChallenge(env, { kind, uid = 0, purpose, data = '', challenge }) {
	const id = challenge || b64u.enc(rand(32));
	await env.DB.prepare('DELETE FROM mfa_challenges WHERE exp < ?1').bind(Date.now()).run().catch(() => {});
	await env.DB.prepare('INSERT INTO mfa_challenges (id, kind, uid, purpose, data, exp) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
		.bind(id, kind, uid, purpose, typeof data === 'string' ? data : JSON.stringify(data), Date.now() +
		CHALLENGE_TTL_MS).run();
	return id;
}
export async function peekChallenge(env, id, purpose) {
	return env.DB.prepare('SELECT * FROM mfa_challenges WHERE id = ?1 AND purpose = ?2 AND exp > ?3').bind(String(id || ''), purpose, Date.now()).first();
}
export async function takeChallenge(env, id, purpose) {
	return env.DB.prepare('DELETE FROM mfa_challenges WHERE id = ?1 AND purpose = ?2 AND exp > ?3 RETURNING *').bind(String(id || ''), purpose, Date.now()).first();
}
export async function burnChallenge(env, id) {
	await env.DB.prepare('DELETE FROM mfa_challenges WHERE id = ?1').bind(String(id || '')).run().catch(() => {});
}
/* Mỗi vé cho thử tối đa 5 lần */
export async function bumpTries(env, id) {
	const r = await env.DB.prepare('UPDATE mfa_challenges SET tries = tries + 1 WHERE id = ?1 RETURNING tries').bind(id).first();
	if (r && r.tries >= 5) {
		await burnChallenge(env, id);
	}
	return r ? r.tries : 99;
}

/* ---------- Trạng thái và thao tác theo tài khoản ---------- */
export async function mfaState(env, kind, uid) {
	const t = await env.DB.prepare('SELECT enabled FROM mfa_totp WHERE kind = ?1 AND uid = ?2').bind(kind, uid).first();
	const { results } = await env.DB.prepare('SELECT id, name, created_at, last_used FROM mfa_passkeys WHERE kind = ?1 AND uid = ?2 ORDER BY created_at').bind(kind, uid).all();
	const left = (await env.DB.prepare('SELECT COUNT(*) AS n FROM mfa_recovery WHERE kind = ?1 AND uid = ?2 AND used_at IS NULL').bind(kind, uid).first()).n;
	return {
		totp: !!(t && t.enabled),
		passkeys: results,
		recovery_left: left
	};
}

/* Các cách xác minh lớp hai mà tài khoản này đã bật */
export async function methodsOf(env, kind, uid) {
	const s = await mfaState(env, kind, uid);
	return [...(s.totp ? ['totp'] : []), ...(s.passkeys.length ? ['passkey'] : [])];
}

export async function totpBegin(env, kind, uid) {
	const secret = newTotpSecret();
	await env.DB.prepare('INSERT INTO mfa_totp (kind, uid, secret, enabled, last_step, created_at) VALUES (?1, ?2, ?3, 0, 0, ?4) ON CONFLICT(kind, uid) DO UPDATE SET secret = ?3, enabled = 0, last_step = 0, created_at = ?4 WHERE mfa_totp.enabled = 0')
		.bind(kind, uid, await sealSecret(env, secret), Date.now()).run();
	return secret;
}

/* Bật TOTP sau khi người dùng nhập đúng mã đầu tiên; trả về mã khôi phục (chỉ hiện một lần) */
export async function totpActivate(env, kind, uid, code) {
	const row = await env.DB.prepare('SELECT secret, enabled FROM mfa_totp WHERE kind = ?1 AND uid = ?2').bind(kind, uid).first();
	if (!row || row.enabled) {
		return null;
	}
	const step = await verifyTotp(await openSecret(env, row.secret), code);
	if (!step) {
		return false;
	}
	await env.DB.prepare('UPDATE mfa_totp SET enabled = 1, last_step = ?3 WHERE kind = ?1 AND uid = ?2').bind(kind, uid, step).run();
	return regenRecovery(env, kind, uid);
}

export async function regenRecovery(env, kind, uid) {
	const codes = newRecoveryCodes();
	await env.DB.prepare('DELETE FROM mfa_recovery WHERE kind = ?1 AND uid = ?2').bind(kind, uid).run();
	for (const c of codes) {
		await env.DB.prepare('INSERT INTO mfa_recovery (kind, uid, code_hash) VALUES (?1, ?2, ?3)').bind(kind, uid, await sha256Hex('rc|' +
			normRecovery(c))).run();
	}
	return codes;
}

export async function totpRemove(env, kind, uid) {
	await env.DB.prepare('DELETE FROM mfa_totp WHERE kind = ?1 AND uid = ?2').bind(kind, uid).run();
	const left = await env.DB.prepare('SELECT COUNT(*) AS n FROM mfa_passkeys WHERE kind = ?1 AND uid = ?2').bind(kind, uid).first();
	if (!left.n) {
		await env.DB.prepare('DELETE FROM mfa_recovery WHERE kind = ?1 AND uid = ?2').bind(kind, uid).run();
	}
}

/* Kiểm tra mã TOTP hoặc mã khôi phục; mã đúng chỉ dùng được một lần */
export async function checkSecondFactor(env, kind, uid, input) {
	const raw = String(input ?? '').trim();
	if (/^\d[\d\s]{5,7}$/.test(raw)) {
		const row = await env.DB.prepare('SELECT secret, last_step FROM mfa_totp WHERE kind = ?1 AND uid = ?2 AND enabled = 1').bind(kind, uid).first();
		if (!row) {
			return false;
		}
		const step = await verifyTotp(await openSecret(env, row.secret), raw, row.last_step);
		if (!step) {
			return false;
		}
		const r = await env.DB.prepare('UPDATE mfa_totp SET last_step = ?3 WHERE kind = ?1 AND uid = ?2 AND last_step < ?3 RETURNING uid').bind(kind, uid, step).first();
		return !!r; // hai yêu cầu cùng lúc với cùng một mã: chỉ một yêu cầu thắng
	}
	const n = normRecovery(raw);
	if (n.length !== 10) {
		return false;
	}
	const r = await env.DB.prepare('UPDATE mfa_recovery SET used_at = ?4 WHERE kind = ?1 AND uid = ?2 AND code_hash = ?3 AND used_at IS NULL RETURNING uid')
		.bind(kind, uid, await sha256Hex('rc|' + n), Date.now()).first();
	return !!r;
}

/* ----- passkey ----- */
export async function passkeyRegOptions(env, kind, uid, user, rp) {
	const { results } = await env.DB.prepare('SELECT id, transports FROM mfa_passkeys WHERE kind = ?1 AND uid = ?2').bind(kind, uid).all();
	const challenge = b64u.enc(rand(32));
	await putChallenge(env, {
		kind,
		uid,
		purpose: 'pk-reg',
		challenge
	});
	return {
		challengeId: challenge,
		publicKey: {
			challenge,
			rp: { id: rp.id, name: rp.name },
			user: {
				id: b64u.enc(enc.encode(kind + ':' + uid)),
				name: user.email,
				displayName: user.name || user.email
			},
			pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
			authenticatorSelection: {
				residentKey: 'required',
				requireResidentKey: true,
				userVerification: 'required'
			},
			attestation: 'none',
			timeout: 60000,
			excludeCredentials: results.map(r => ({
				type: 'public-key',
				id: r.id,
				transports: r.transports ? r.transports.split(',') : undefined
			}))
		}
	};
}

export async function passkeyRegister(env, kind, uid, body, rp) {
	const ch = await takeChallenge(env, body.challengeId, 'pk-reg');
	if (!ch || ch.kind !== kind || ch.uid !== uid) {
		throw new Error('challenge');
	}
	const r = await verifyRegistration(body.credential, {
		challenge: ch.id,
		origin: rp.origin,
		rpId: rp.id
	});
	const transports = (Array.isArray(body.credential.response.transports) ? body.credential.response.transports : []).filter(t => /^[a-z-]{2,12}$/.test(t)).join(',');
	const name = String(body.name || '').replace(/[\u0000-\u001F]/g, '').trim().slice(0, 40) || 'Passkey';
	await env.DB.prepare('INSERT INTO mfa_passkeys (id, kind, uid, pub, alg, counter, name, transports, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)')
		.bind(r.id, kind, uid, r.pub, r.alg, r.counter, name, transports, Date.now()).run();
	return { id: r.id, name };
}

/* uid = 0: đăng nhập không cần nhập tài khoản (passkey có sẵn trong thiết bị) */
export async function passkeyAuthOptions(env, kind, uid, rp) {
	const challenge = b64u.enc(rand(32));
	await putChallenge(env, {
		kind,
		uid,
		purpose: 'pk-auth',
		challenge
	});
	const publicKey = {
		challenge,
		rpId: rp.id,
		timeout: 60000,
		userVerification: 'required'
	};
	if (uid) {
		const { results } = await env.DB.prepare('SELECT id, transports FROM mfa_passkeys WHERE kind = ?1 AND uid = ?2').bind(kind, uid).all();
		publicKey.allowCredentials = results.map(r => ({
			type: 'public-key',
			id: r.id,
			transports: r.transports ? r.transports.split(',') : undefined
		}));
	}
	return { challengeId: challenge, publicKey };
}

/* Trả về { kind, uid } của chủ passkey, hoặc ném lỗi nếu không hợp lệ. wantUid > 0: bắt buộc đúng người (bước 2FA). */
export async function passkeyAuthVerify(env, kind, body, rp, wantUid = 0) {
	const ch = await takeChallenge(env, body.challengeId, 'pk-auth');
	if (!ch || ch.kind !== kind || (wantUid && ch.uid !== wantUid)) {
		throw new Error('challenge');
	}
	const id = b64u.enc(b64u.dec(String(body.credential?.rawId || '')));
	const k = await env.DB.prepare('SELECT * FROM mfa_passkeys WHERE id = ?1 AND kind = ?2').bind(id, kind).first();
	if (!k || (wantUid && k.uid !== wantUid)) {
		throw new Error('credential');
	}
	const counter = await verifyAssertion(body.credential, {
		challenge: ch.id,
		origin: rp.origin,
		rpId: rp.id,
		pub: k.pub,
		alg: k.alg,
		counter: k.counter
	});
	await env.DB.prepare('UPDATE mfa_passkeys SET counter = ?2, last_used = ?3 WHERE id = ?1').bind(k.id, counter, Date.now()).run();
	return { kind, uid: k.uid };
}

/* Câu lệnh xoá mọi dữ liệu xác thực của một tài khoản (dùng khi xoá tài khoản hoặc Chủ đặt lại 2FA) */
export function mfaWipe(env, kind, uid) {
	return ['mfa_totp', 'mfa_recovery', 'mfa_passkeys', 'mfa_google', 'mfa_challenges'].map(t => env.DB.prepare(`DELETE FROM ${t} WHERE kind = ?1 AND uid = ?2`).bind(kind, uid));
}
