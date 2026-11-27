/* Quyền riêng tư của khách: tải dữ liệu cá nhân, yêu cầu xoá tài khoản (chờ 30 ngày mới xoá hẳn) */
import { reauthUser } from './customer-auth.js';
import { mfaWipe } from './mfa.js';

export const DELETE_GRACE_MS = 30 * 86400000;

export async function exportMyData(env, u, h) {
	const q = (sql) => env.DB.prepare(sql).bind(u.id).all().then(r => r.results).catch(() => []);
	const [bookings, favorites, reviews, messages, avatars] = await Promise.all([
		q('SELECT id, created_at, name, phone, destination, depart_date, people, message, status FROM bookings WHERE user_id = ?1 ORDER BY id'),
		q('SELECT item, created_at FROM favorites WHERE user_id = ?1'),
		q('SELECT rating, destination, body, status, reply, created_at FROM reviews WHERE user_id = ?1'),
		q('SELECT sender, body, created_at FROM messages WHERE user_id = ?1 ORDER BY id'),
		q('SELECT url, created_at FROM user_avatars WHERE user_id = ?1')
	]);
	const body = JSON.stringify({
		exported_at: new Date().toISOString(),
		account: {
			id: u.id,
			name: u.name,
			email: u.email,
			phone: u.phone || null,
			created_at: u.created_at,
			last_login: u.last_login || null,
			avatar: u.avatar || null
		},
		bookings,
		favorites,
		reviews,
		messages,
		avatars
	}, null, 2);
	return new Response(body, { status: 200, headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Content-Disposition': 'attachment; filename="du-lieu-viet-du-ky.json"',
			'Cache-Control': 'no-store'
		} });
}

export async function requestDelete(env, u, b, h) {
	if (!(await reauthUser(env, u, b.current))) {
		throw new h.HttpError(400, 'Mật khẩu chưa đúng.');
	}
	const at = u.delete_requested_at || Date.now();
	await env.DB.prepare('UPDATE users SET delete_requested_at = ?1 WHERE id = ?2').bind(at, u.id).run();
	return h.json({ ok: true, delete_at: at + DELETE_GRACE_MS });
}

export async function cancelDelete(env, u, h) {
	await env.DB.prepare('UPDATE users SET delete_requested_at = NULL WHERE id = ?1').bind(u.id).run();
	return h.json({ ok: true });
}

/* Xoá hẳn tài khoản đã quá 30 ngày kể từ lúc yêu cầu. Đơn đặt tour giữ lại nhưng ẩn danh (phục vụ sổ sách). */
export async function purgeDeletedUsers(env) {
	const { results } = await env.DB.prepare('SELECT id FROM users WHERE delete_requested_at IS NOT NULL AND delete_requested_at <= ?1 LIMIT 50').bind(Date.now() - DELETE_GRACE_MS).all();
	for (const { id } of results) {
		await env.DB.batch([
			env.DB.prepare("UPDATE bookings SET user_id = NULL, name = 'Tài khoản đã xoá', phone = '', message = NULL WHERE user_id = ?1").bind(id),
			env.DB.prepare('DELETE FROM favorites WHERE user_id = ?1').bind(id),
			env.DB.prepare('DELETE FROM reviews WHERE user_id = ?1').bind(id),
			env.DB.prepare('DELETE FROM messages WHERE user_id = ?1').bind(id),
			env.DB.prepare('DELETE FROM chat_sessions WHERE user_id = ?1').bind(id),
			env.DB.prepare('DELETE FROM user_avatars WHERE user_id = ?1').bind(id),
			env.DB.prepare('DELETE FROM user_sessions WHERE user_id = ?1').bind(id),
			...mfaWipe(env, 'user', id),
			env.DB.prepare('DELETE FROM users WHERE id = ?1').bind(id)
		]);
	}
	return results.length;
}
