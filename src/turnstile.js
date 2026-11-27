/* Cloudflare Turnstile: browser -> Worker -> siteverify. Secret nằm ở env.TURNSTILE_SECRET (wrangler secret), không ghi vào mã. */
import { getSite } from './site-settings.js';
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/* Quản trị có thể tắt xác minh (Cài đặt → Bật / tắt tính năng): tắt thì bỏ qua luôn, không chặn.
Form khách theo feat_turnstile, đăng nhập quản trị theo feat_turnstile_admin. */
export async function turnstileDisabled(env, action) {
	const s = await getSite(env);
	return (action === 'admin_login' ? s.feat_turnstile_admin : s.feat_turnstile) === false;
}

export async function verifyTurnstile(request, env, body, action, HttpError) {
	if (await turnstileDisabled(env, action)) {
		if (body) {
			delete body['cf-turnstile-response'];
		}
		return;
	}
	const hostnames = new Set(String(env.TURNSTILE_HOSTNAMES || '').split(',').map(s => s.trim()).filter(Boolean));
	if (!env.TURNSTILE_SECRET || !hostnames.size) {
		console.error('Turnstile chưa cấu hình: thiếu secret TURNSTILE_SECRET hoặc biến TURNSTILE_HOSTNAMES.');
		throw new HttpError(503, 'Hệ thống xác minh chống spam chưa sẵn sàng. Vui lòng thử lại sau.', undefined, 'turnstile_config');
	}
	const fail = () => new HttpError(403, 'Xác minh chống spam không thành công. Vui lòng thử lại.', undefined, 'turnstile');
	const token = body && body['cf-turnstile-response'];
	if (typeof token !== 'string' || !token || token.length > 2048) {
		throw fail();
	}
	let result;
	try {
		const r = await fetch(VERIFY_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			signal: AbortSignal.timeout(10000),
			body: new URLSearchParams({
				secret: env.TURNSTILE_SECRET,
				response: token,
				remoteip: request.headers.get('CF-Connecting-IP') || ''
			})
		});
		if (!r.ok) {
			throw new Error('siteverify ' + r.status);
		}
		result = await r.json();
	} catch (e) {
		console.error('Turnstile siteverify lỗi:', e && e.message || e);
		throw fail();
	}
	if (!result.success || result.action !== action || !hostnames.has(result.hostname)) {
		throw fail();
	}
	delete body['cf-turnstile-response'];
}
