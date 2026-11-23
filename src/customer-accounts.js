/* Việt Du Ký – quản lý tài khoản khách trong trang quản trị:
danh sách, tìm kiếm, khoá / mở khoá, xác minh thủ công, gửi lại email xác minh, xoá, xuất CSV. */
import { issueVerification, hashPassword, revokeUserSessions } from './customer-auth.js';
import { MIN_PASS, MAX_PASS } from './rules.js';
import { mfaWipe } from './mfa.js';
import { xlsxResponse } from './xlsx.js';
import { ikUrlOk } from './imagekit.js';
import { isMasked } from './admin-accounts.js';

const TZ_OFFSET_S = 7 * 3600;
const FILTERS = ['verified', 'unverified', 'blocked', 'real', 'virtual'];

function filterClause(url, h) {
  const p = url.searchParams, where = [], args = [];
  const q = h.clean(p.get('q'), 80);
  if (q) {
    const like = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
    if (url.noPii) {
      where.push("u.name LIKE ? ESCAPE '\\'");
      args.push(like);
    } else {
      where.push("(u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\' OR u.phone LIKE ? ESCAPE '\\')");
      args.push(like, like, like);
    }
  }
  const s = p.get('status');
  if (s === 'verified') {
    where.push('u.verified_at IS NOT NULL AND u.blocked_at IS NULL');
  } else if (s === 'unverified') {
    where.push('u.verified_at IS NULL');
  } else if (s === 'blocked') {
    where.push('u.blocked_at IS NOT NULL');
  } else if (s === 'real') {
    where.push("u.email NOT LIKE '%@virtual.invalid'"); // chỉ tài khoản thật
  } else if (s === 'virtual') {
    where.push("u.email LIKE '%@virtual.invalid'");
  }
  return { clause: where.length ? 'WHERE ' + where.join(' AND ') : '', args };
}

const SELECT = 'SELECT u.id, u.created_at, u.email, (u.email LIKE \'%@virtual.invalid\') AS is_virtual, u.name, u.phone, u.avatar, u.verified_at, u.last_login, u.blocked_at, ' +
  '(SELECT COUNT(*) FROM bookings b WHERE b.user_id = u.id) AS bookings, ' +
  '(SELECT COUNT(*) FROM reviews r WHERE r.user_id = u.id) AS reviews, ' +
  '(SELECT COUNT(*) FROM messages m WHERE m.user_id = u.id) AS messages FROM users u ';

export async function adminAccounts(request, env, url, h) {
  const { pathname } = url, method = request.method;

  if (pathname === '/api/admin/accounts' && method === 'GET') {
    const { clause, args } = filterClause(url, h);
    const pageSize = 20;
    const page = Math.max(parseInt(url.searchParams.get('page')) || 1, 1);
    const total = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM users u ${clause}`).bind(...args).first()).n;
    const { results } = await env.DB.prepare(`${SELECT}${clause} ORDER BY u.created_at DESC, u.id DESC LIMIT ? OFFSET ?`).bind(...args, pageSize, (page - 1) * pageSize).all();
    const c = await env.DB.prepare('SELECT COUNT(*) AS total, (SELECT COUNT(*) FROM users) AS all_users, (SELECT COUNT(*) FROM users WHERE email LIKE \'%@virtual.invalid\') AS virtual, COALESCE(SUM(verified_at IS NOT NULL), 0) AS verified, COALESCE(SUM(verified_at IS NULL), 0) AS unverified, COALESCE(SUM(blocked_at IS NOT NULL), 0) AS blocked FROM users WHERE email NOT LIKE \'%@virtual.invalid\'').first();
    return h.json({
      items: results,
      total,
      page,
      pageSize,
      counts: c
    });
  }

  if ((pathname === '/api/admin/accounts.csv' || pathname === '/api/admin/accounts.xlsx') && method === 'GET') {
    const { clause, args } = filterClause(url, h);
    const { results } = await env.DB.prepare(`${SELECT}${clause} ORDER BY u.created_at DESC LIMIT 5000`).bind(...args).all();
    const cell = v => {
      let s = String(v ?? '');
      if (/^[=+\-@\t\r]/.test(s)) {
        s = "'" + s;
      }
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const fmt = ms => ms ? new Date(ms + TZ_OFFSET_S * 1000).toISOString().replace('T', ' ').slice(0, 16) : '';
    const head = ['Mã', 'Ngày đăng ký', 'Họ tên', 'Email', 'SĐT', 'Xác minh email', 'Đăng nhập gần nhất', 'Trạng thái', 'Số đơn', 'Đánh giá', 'Tin nhắn'];
    const lines = [head.map(cell).join(',')].concat(results.map(u => [
      u.id, fmt(u.created_at), u.name, u.email, u.phone, u.verified_at ? 'Đã xác minh' : 'Chưa', fmt(u.last_login), u.blocked_at ? 'Đã khoá' : 'Hoạt động', u.bookings, u.reviews, u.messages
    ].map(cell).join(',')));
    await h.logAct(env, 'Xuất danh sách tài khoản', results.length + ' tài khoản');
    if (pathname.endsWith('.xlsx')) {
      return xlsxResponse([{ name: 'Tài khoản khách', rows: [head].concat(results.map(u => [u.id, fmt(u.created_at), u.name, u.email, u.phone, u.verified_at ? 'Đã xác minh' : 'Chưa', fmt(u.last_login), u.blocked_at ? 'Đã khoá' : 'Hoạt động', u.bookings, u.reviews, u.message])) }], 'tai-khoan-khach');
    }
    return new Response('﻿' + lines.join('\r\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="tai-khoan-khach.csv"',
        'Cache-Control': 'no-store'
      }
    });
  }

  const bad = msg => {
    throw new h.HttpError(400, msg);
  };
  const vEmail = v => {
    const e = h.clean(v, 254).toLowerCase();
    if (!/^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(e)) {
      bad('Email chưa đúng. Ví dụ: ten@gmail.com.');
    }
    if (e.endsWith('@virtual.invalid')) {
      bad('Email này không được dùng.');
    }
    return e;
  };
  const vPass = v => {
    const p = String(v ?? '');
    if (p.length < MIN_PASS || p.length > MAX_PASS) {
      bad(`Mật khẩu từ ${MIN_PASS} đến ${MAX_PASS} ký tự.`);
    }
    return p;
  };
  const vAvatar = (env, v) => {
    if (v === '' || v == null) {
      return null;
    }
    if (!ikUrlOk(env, v)) {
      bad('Ảnh đại diện phải là ảnh đã tải lên hệ thống.');
    }
    return v;
  };

  if (pathname === '/api/admin/accounts' && method === 'POST') { // admin tự tạo tài khoản khách (không cần email xác minh)
    const b = await h.readJson(request);
    const name = h.vName(b.name), email = vEmail(b.email), phone = b.phone ? h.vPhone(b.phone) : null, pass = vPass(b.password);
    if (await env.DB.prepare('SELECT 1 FROM users WHERE email = ?1').bind(email).first()) {
      throw new h.HttpError(409, 'Email này đã có tài khoản.');
    }
    const now = Date.now(), verified = b.verified === false ? null : now;
    const row = await env.DB.prepare('INSERT INTO users (created_at, email, name, phone, pass_hash, verified_at, avatar) VALUES (?1,?2,?3,?4,?5,?6,?7) RETURNING id, email, name')
      .bind(now, email, name, phone, await hashPassword(pass), verified, vAvatar(env, b.avatar)).first();
    await h.logAct(env, 'Tạo tài khoản khách #' + row.id, email);
    return h.json({ item: row }, 201);
  }

  const m = pathname.match(/^\/api\/admin\/accounts\/(\d+)(?:\/(block|unblock|verify|resend))?$/);
  if (!m) {
    throw new h.HttpError(404, 'Không tìm thấy.');
  }
  const id = Number(m[1]), act = m[2];
  const u = await env.DB.prepare('SELECT id, email, name, verified_at, blocked_at FROM users WHERE id = ?1').bind(id).first();
  if (!u) {
    throw new h.HttpError(404, 'Không tìm thấy tài khoản này.');
  }

  if (method === 'POST' && act === 'block') {
    await env.DB.prepare('UPDATE users SET blocked_at = ?1 WHERE id = ?2').bind(Date.now(), id).run();
    await revokeUserSessions(env, id); // khoá tài khoản: mọi thiết bị bị đăng xuất ngay
    await h.logAct(env, 'Khoá tài khoản #' + id, u.email);
    return h.json({ ok: true });
  }
  if (method === 'POST' && act === 'unblock') {
    await env.DB.prepare('UPDATE users SET blocked_at = NULL WHERE id = ?1').bind(id).run();
    await h.logAct(env, 'Mở khoá tài khoản #' + id, u.email);
    return h.json({ ok: true });
  }
  if (method === 'POST' && act === 'verify') {
    await env.DB.prepare('UPDATE users SET verified_at = COALESCE(verified_at, ?1), verify_hash = NULL, verify_exp = NULL WHERE id = ?2').bind(Date.now(), id).run();
    await h.logAct(env, 'Xác minh thủ công tài khoản #' + id, u.email);
    return h.json({ ok: true });
  }
  if (method === 'POST' && act === 'resend') {
    if (u.verified_at) {
      throw new h.HttpError(400, 'Tài khoản này đã xác minh email rồi.');
    }
    try {
      await issueVerification(env, url, u);
    } catch (err) {
      console.error('Gửi lại email xác minh (admin) lỗi:', err && err.message || err);
      throw new h.HttpError(502, 'Chưa gửi được email. Kiểm tra GMAIL_USER và GMAIL_APP_PASSWORD (bấm "Gửi email thử" ở mục Nhật ký).');
    }
    await h.logAct(env, 'Gửi lại email xác minh #' + id, u.email);
    return h.json({ ok: true });
  }
  if (method === 'PATCH' && !act) { // sửa mọi thông tin của tài khoản
    const b = await h.readJson(request), sets = [], args = [];
    /* Đổi email hoặc mật khẩu của khách = chiếm được tài khoản đó (thấy đủ SĐT, email, đơn, tin nhắn): chỉ người có quyền "pii" */
    if (url.noPii && (b.password || ('email' in b && !isMasked(b.email)))) {
      throw new h.HttpError(403, 'Bạn cần quyền xem đầy đủ thông tin khách để đổi email hoặc mật khẩu của khách.');
    }
    if ('name' in b) {
      sets.push('name = ?');
      args.push(h.vName(b.name));
    }
    if ('email' in b && !isMasked(b.email)) { // email đã bị che (không có quyền xem đầy đủ) thì giữ nguyên
      const e = vEmail(b.email);
      if (e !== u.email) {
        if (await env.DB.prepare('SELECT 1 FROM users WHERE email = ?1 AND id <> ?2').bind(e, id).first()) {
          throw new h.HttpError(409, 'Email này đã có tài khoản khác.');
        }
        sets.push('email = ?');
        args.push(e);
      }
    }
    if ('phone' in b && !isMasked(b.phone)) {
      sets.push('phone = ?');
      args.push(b.phone ? h.vPhone(b.phone) : null);
    }
    if ('avatar' in b) {
      sets.push('avatar = ?');
      args.push(vAvatar(env, b.avatar));
    }
    if (b.password) {
      sets.push('pass_hash = ?');
      args.push(await hashPassword(vPass(b.password)));
    }
    if ('verified' in b) {
      if (b.verified) {
        sets.push('verified_at = COALESCE(verified_at, ?)');
        args.push(Date.now());
      } else {
        sets.push('verified_at = NULL');
      }
    }
    if ('blocked' in b) {
      if (b.blocked) {
        sets.push('blocked_at = ?');
        args.push(Date.now());
      } else {
        sets.push('blocked_at = NULL');
      }
    }
    if (!sets.length) {
      bad('Không có gì để cập nhật.');
    }
    await env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...args, id).run();
    if (b.password || b.blocked || b.verified === false) {
      await revokeUserSessions(env, id); // đổi mật khẩu / khoá / bỏ xác minh: đăng xuất mọi thiết bị
    }
    await h.logAct(env, 'Sửa tài khoản khách #' + id, u.email);
    return h.json({ ok: true });
  }
  if (method === 'DELETE' && !act) {
    // Xoá tài khoản cùng tin nhắn và đánh giá; các đơn đặt tour được giữ lại nhưng không còn gắn với tài khoản
    await env.DB.batch([
      env.DB.prepare('DELETE FROM messages WHERE user_id = ?1').bind(id),
      env.DB.prepare('DELETE FROM chat_sessions WHERE user_id = ?1').bind(id),
      env.DB.prepare('DELETE FROM review_votes WHERE user_id = ?1 OR review_id IN (SELECT id FROM reviews WHERE user_id = ?1)').bind(id),
      env.DB.prepare('DELETE FROM reviews WHERE user_id = ?1').bind(id),
      env.DB.prepare('DELETE FROM favorites WHERE user_id = ?1').bind(id),
      env.DB.prepare('DELETE FROM user_sessions WHERE user_id = ?1').bind(id),
      ...mfaWipe(env, 'user', id),
      env.DB.prepare('UPDATE bookings SET user_id = NULL WHERE user_id = ?1').bind(id),
      env.DB.prepare('DELETE FROM users WHERE id = ?1').bind(id)
    ]);
    await h.logAct(env, 'Xoá tài khoản #' + id, u.email);
    return h.json({ ok: true });
  }
  throw new h.HttpError(404, 'Không tìm thấy.');
}
