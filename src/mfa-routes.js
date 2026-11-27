/* Việt Du Ký – các đường dẫn xác thực nhiều lớp, dùng chung cho khách và quản trị.
ctx cho biết cách lấy phiên, tạo phiên và tìm người dùng của từng loại tài khoản (xem customer-auth.js và worker.js). */
import { newNonce, checkNonce, verifyGoogleToken, putChallenge, peekChallenge, burnChallenge, bumpTries, mfaState, methodsOf, totpBegin, totpActivate, totpRemove, regenRecovery, checkSecondFactor, otpauthUri, rpOf, passkeyRegOptions, passkeyRegister, passkeyAuthOptions, passkeyAuthVerify } from './mfa.js';

import { getSite } from './site-settings.js';

const MFA_LIMIT = { max: 20, windowS: 900 }; // 20 lần thử xác minh / 15 phút / IP

/* Công tắc đăng nhập Google / passkey (Cài đặt → Bật / tắt tính năng): khách theo feat_google / feat_passkey,
quản trị theo bản *_admin. Tắt Google = không đăng nhập / liên kết bằng Google. Tắt passkey = không đăng nhập bằng
passkey, không thêm passkey mới, và passkey không còn bị đòi làm lớp hai (bỏ qua luôn, không chặn). */
export async function loginFlags(env, kind) {
	const s = await getSite(env);
	const sfx = kind === 'admin' ? '_admin' : '';
	return { google: s['feat_google' + sfx] !== false, passkey: s['feat_passkey' + sfx] !== false };
}
async function needFlag(env, h, kind, which, msg) {
	if (!(await loginFlags(env, kind))[which]) {
		throw new h.HttpError(503, msg);
	}
}
const GOOGLE_OFF = 'Đăng nhập bằng Google đang tạm tắt.';
const PASSKEY_OFF = 'Passkey đang tạm tắt.';

/* Sau khi mật khẩu đúng: nếu tài khoản bật lớp hai thì chưa cấp phiên, trả "vé" để nhập mã / dùng passkey. */
export async function mfaGate(env, h, kind, uid) {
	let methods = await methodsOf(env, kind, uid);
	if (!(await loginFlags(env, kind)).passkey) {
		methods = methods.filter((m) => m !== 'passkey'); // đã tắt passkey: không đòi passkey làm lớp hai
	}
	if (!methods.length) {
		return null;
	}
	const ticket = await putChallenge(env, {
		kind,
		uid,
		purpose: 'login'
	});
	return h.json({
		ok: false,
		mfa: true,
		ticket,
		methods
	});
}

export async function mfaConfig(env, h, kind) {
	const f = await loginFlags(env, kind);
	const clientId = f.google ? String(env.GOOGLE_CLIENT_ID || '').trim() : '';
	return h.json({
		google_client_id: clientId,
		nonce: clientId ? await newNonce(env) : '',
		passkey: f.passkey
	});
}

/* Đường dẫn chưa cần phiên: trả Response, hoặc null nếu không khớp */
export async function mfaPublic(sub, request, env, url, ip, h, ctx) {
	const { kind } = ctx;
	const bad = (msg = 'Xác minh không thành công. Hãy thử lại.') => new h.HttpError(401, msg);

	if (sub === '/config' && request.method === 'GET') {
		return mfaConfig(env, h, kind);
	}
	if (request.method !== 'POST') {
		return null;
	}
	const origin = request.headers.get('Origin');
	if (origin && origin !== url.origin) {
		throw new h.HttpError(403, 'Yêu cầu không hợp lệ.');
	}

	if (sub === '/google') {
		await needFlag(env, h, kind, 'google', GOOGLE_OFF);
		await h.limit(env, 'mfa:' + ip, MFA_LIMIT);
		const b = await h.readJson(request);
		const clientId = String(env.GOOGLE_CLIENT_ID || '').trim();
		if (!clientId) {
			throw new h.HttpError(503, 'Đăng nhập bằng Google chưa được bật.');
		}
		if (!(await checkNonce(env, b.nonce))) {
			throw bad('Phiên đăng nhập Google đã hết hạn. Hãy tải lại trang.');
		}
		let profile;
		try {
			profile = await verifyGoogleToken(String(b.credential || ''), { clientId, nonce: String(b.nonce) });
		} catch {
			throw bad('Không xác minh được tài khoản Google.');
		}
		const user = await ctx.googleUser(profile);
		return ctx.finish(user, request, url, ip, 'Google');
	}

	if (sub === '/verify') { // nhập mã Authenticator / mã khôi phục sau khi đã nhập đúng mật khẩu
		await h.limit(env, 'mfa:' + ip, MFA_LIMIT);
		const b = await h.readJson(request);
		const t = await peekChallenge(env, b.ticket, 'login');
		if (!t || t.kind !== kind) {
			throw bad('Phiên xác minh đã hết hạn. Hãy đăng nhập lại.');
		}
		await h.limit(env, 'mfa-uid:' + kind + t.uid, MFA_LIMIT);
		if (!(await checkSecondFactor(env, kind, t.uid, b.code))) {
			await bumpTries(env, t.id);
			throw bad('Mã chưa đúng hoặc đã được dùng.');
		}
		await burnChallenge(env, t.id);
		const user = await ctx.userById(t.uid);
		if (!user) {
			throw bad();
		}
		return ctx.finish(user, request, url, ip, 'mã xác thực');
	}

	if (sub === '/passkey/options') {
		await needFlag(env, h, kind, 'passkey', PASSKEY_OFF);
		await h.limit(env, 'mfa:' + ip, MFA_LIMIT);
		const b = await h.readJson(request);
		let uid = 0;
		if (b.ticket) {
			const t = await peekChallenge(env, b.ticket, 'login');
			if (!t || t.kind !== kind) {
				throw bad('Phiên xác minh đã hết hạn. Hãy đăng nhập lại.');
			}
			uid = t.uid;
		}
		return h.json(await passkeyAuthOptions(env, kind, uid, rpOf(env, url)));
	}

	if (sub === '/passkey/verify') {
		await needFlag(env, h, kind, 'passkey', PASSKEY_OFF);
		await h.limit(env, 'mfa:' + ip, MFA_LIMIT);
		const b = await h.readJson(request);
		let want = 0, ticket = null;
		if (b.ticket) {
			ticket = await peekChallenge(env, b.ticket, 'login');
			if (!ticket || ticket.kind !== kind) {
				throw bad('Phiên xác minh đã hết hạn. Hãy đăng nhập lại.');
			}
			want = ticket.uid;
		}
		let who;
		try {
			who = await passkeyAuthVerify(env, kind, b, rpOf(env, url), want);
		} catch {
			if (ticket) {
				await bumpTries(env, ticket.id);
			}
			throw bad('Passkey không hợp lệ.');
		}
		if (ticket) {
			await burnChallenge(env, ticket.id);
		}
		const user = await ctx.userById(who.uid);
		if (!user) {
			throw bad();
		}
		return ctx.finish(user, request, url, ip, 'passkey');
	}
	return null;
}

/* Đường dẫn của người đã đăng nhập: xem và chỉnh cài đặt bảo mật của chính mình */
export async function mfaSettings(sub, request, env, url, ip, h, ctx, user) {
	const { kind } = ctx;
	const uid = user.id;
	const rp = rpOf(env, url);
	const needReauth = async () => ctx.hasPassword(user) || (await mfaState(env, kind, uid)).totp;
	const reauth = async (b) => {
		if (!(await needReauth())) {
			return true;
		}
		await h.limit(env, 'mfa-uid:' + kind + uid, MFA_LIMIT);
		if (b.password && ctx.hasPassword(user) && await ctx.checkPassword(user, String(b.password).slice(0, 200))) {
			return true;
		}
		return b.code ? checkSecondFactor(env, kind, uid, b.code) : false;
	};

	if (sub === '/security' && request.method === 'GET') {
		const s = await mfaState(env, kind, uid);
		const f = await loginFlags(env, kind);
		return h.json({
			...s,
			google: await ctx.googleLinked(user),
			has_password: ctx.hasPassword(user),
			google_enabled: !!env.GOOGLE_CLIENT_ID && f.google,
			passkey_enabled: f.passkey
		});
	}
	if (request.method !== 'POST') {
		return null;
	}
	const origin = request.headers.get('Origin');
	if (origin && origin !== url.origin) {
		throw new h.HttpError(403, 'Yêu cầu không hợp lệ.');
	}
	await h.limit(env, 'mfa:' + ip, MFA_LIMIT);

	if (sub === '/google/link') { // đã đăng nhập bằng email: chứng minh quyền sở hữu tài khoản Google rồi liên kết
		await needFlag(env, h, kind, 'google', GOOGLE_OFF);
		const b = await h.readJson(request);
		const clientId = String(env.GOOGLE_CLIENT_ID || '').trim();
		if (!clientId) {
			throw new h.HttpError(503, 'Đăng nhập bằng Google chưa được bật.');
		}
		if (!(await checkNonce(env, b.nonce))) {
			throw new h.HttpError(400, 'Phiên Google đã hết hạn. Hãy tải lại trang.');
		}
		let profile;
		try {
			profile = await verifyGoogleToken(String(b.credential || ''), { clientId, nonce: String(b.nonce) });
		} catch {
			throw new h.HttpError(400, 'Không xác minh được tài khoản Google.');
		}
		if (await ctx.googleLinked(user)) {
			throw new h.HttpError(409, 'Tài khoản đã liên kết Google. Hãy gỡ liên kết cũ trước.');
		}
		const taken = await env.DB.prepare('SELECT kind, uid FROM mfa_google WHERE sub = ?1').bind(profile.sub).first();
		if (taken) {
			const alive = await env.DB.prepare(`SELECT 1 FROM ${taken.kind === 'admin' ? 'admins' : 'users'} WHERE id = ?1`).bind(taken.uid).first();
			if (!alive) { // tài khoản cũ đã bị xoá: bỏ liên kết mồ côi
				await env.DB.prepare('DELETE FROM mfa_google WHERE sub = ?1').bind(profile.sub).run();
			} else {
				const who = taken.kind === kind ? (kind === 'admin' ? 'một tài khoản quản trị khác' : 'một tài khoản khách khác') : (taken.kind === 'admin' ? 'một tài khoản quản trị' : 'một tài khoản khách');
				throw new h.HttpError(409, `Tài khoản Google này đã liên kết với ${who}. Hãy gỡ liên kết ở tài khoản đó trước, hoặc dùng tài khoản Google khác.`);
			}
		}
		await env.DB.prepare('INSERT INTO mfa_google (sub, kind, uid, email, created_at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(profile.sub, kind, uid, profile.email, Date.now()).run();
		await h.logAct(env, 'Liên kết Google', `${kind} #${uid}`);
		return h.json({ ok: true, email: profile.email });
	}
	if (sub === '/google/unlink') {
		const b = await h.readJson(request);
		if (!ctx.hasPassword(user)) {
			throw new h.HttpError(400, 'Hãy đặt mật khẩu trước khi gỡ liên kết Google, nếu không bạn sẽ không đăng nhập lại được.');
		}
		if (!(await reauth(b))) {
			throw new h.HttpError(400, 'Cần nhập đúng mật khẩu hoặc mã xác thực để gỡ.');
		}
		await env.DB.prepare('DELETE FROM mfa_google WHERE kind = ?1 AND uid = ?2').bind(kind, uid).run();
		await h.logAct(env, 'Gỡ liên kết Google', `${kind} #${uid}`);
		return h.json({ ok: true });
	}
	if (sub === '/totp/setup') {
		if ((await mfaState(env, kind, uid)).totp) {
			throw new h.HttpError(409, 'Đã bật mã xác thực. Hãy tắt trước khi thiết lập lại.');
		}
		const secret = await totpBegin(env, kind, uid);
		return h.json({ secret, uri: otpauthUri(rp.name, user.email, secret) });
	}
	if (sub === '/totp/enable') {
		const b = await h.readJson(request);
		const codes = await totpActivate(env, kind, uid, b.code);
		if (codes === null) {
			throw new h.HttpError(409, 'Hãy bấm “Thiết lập” để tạo mã QR trước.');
		}
		if (codes === false) {
			throw new h.HttpError(400, 'Mã chưa đúng. Kiểm tra giờ trên điện thoại rồi thử lại.');
		}
		await h.logAct(env, 'Bật Google Authenticator', `${kind} #${uid}`);
		return h.json({ ok: true, recovery: codes });
	}
	if (sub === '/totp/disable') {
		const b = await h.readJson(request);
		if (!(await reauth(b))) {
			throw new h.HttpError(400, 'Cần nhập đúng mật khẩu hoặc mã xác thực để tắt.');
		}
		await totpRemove(env, kind, uid);
		await h.logAct(env, 'Tắt Google Authenticator', `${kind} #${uid}`);
		return h.json({ ok: true });
	}
	if (sub === '/recovery/regen') {
		const b = await h.readJson(request);
		if (!(await mfaState(env, kind, uid)).totp && !(await mfaState(env, kind, uid)).passkeys.length) {
			throw new h.HttpError(400, 'Chưa bật xác thực hai lớp.');
		}
		if (!(await reauth(b))) {
			throw new h.HttpError(400, 'Cần nhập đúng mật khẩu hoặc mã xác thực.');
		}
		return h.json({ ok: true, recovery: await regenRecovery(env, kind, uid) });
	}
	if (sub === '/passkey/reg-options') {
		await needFlag(env, h, kind, 'passkey', PASSKEY_OFF);
		return h.json(await passkeyRegOptions(env, kind, uid, user, rp));
	}
	if (sub === '/passkey/register') {
		await needFlag(env, h, kind, 'passkey', PASSKEY_OFF);
		const b = await h.readJson(request);
		try {
			const k = await passkeyRegister(env, kind, uid, b, rp);
			await h.logAct(env, 'Thêm passkey', `${kind} #${uid}`);
			// chưa có mã khôi phục (chỉ dùng passkey) thì tạo luôn, tránh bị khoá khi mất thiết bị
			const recovery = (await mfaState(env, kind, uid)).recovery_left ? undefined : await regenRecovery(env, kind, uid);
			return h.json({
				ok: true,
				passkey: k,
				recovery
			});
		} catch {
			throw new h.HttpError(400, 'Không thêm được passkey. Hãy thử lại.');
		}
	}
	if (sub === '/passkey/delete') {
		const b = await h.readJson(request);
		if (!(await reauth(b))) {
			throw new h.HttpError(400, 'Cần nhập đúng mật khẩu hoặc mã xác thực để xoá.');
		}
		await env.DB.prepare('DELETE FROM mfa_passkeys WHERE id = ?1 AND kind = ?2 AND uid = ?3').bind(String(b.id || ''), kind, uid).run();
		const s = await mfaState(env, kind, uid);
		if (!s.totp && !s.passkeys.length) {
			await env.DB.prepare('DELETE FROM mfa_recovery WHERE kind = ?1 AND uid = ?2').bind(kind, uid).run();
		}
		return h.json({ ok: true });
	}
	return null;
}
