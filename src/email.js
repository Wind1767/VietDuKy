/* Việt Du Ký – gửi email qua SMTP của Gmail (cổng 465, TLS), dùng cloudflare:sockets.
Cần: GMAIL_USER (địa chỉ Gmail) và secret GMAIL_APP_PASSWORD (mật khẩu ứng dụng 16 ký tự). */
import { TEMPLATES, fill } from './email-templates.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
}[c]));

const te = new TextEncoder();
const td = new TextDecoder();
const SMTP_HOST = 'smtp.gmail.com';
const SMTP_PORT = 465;
const SMTP_TIMEOUT_MS = 20000;

const oneLine = v => String(v == null ? '' : v).replace(/[\r\n]+/g, ' ').trim(); // chặn chèn thêm dòng tiêu đề
const b64 = bytes => {
	let s = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
	}
	return btoa(s);
};
const b64Lines = str => b64(te.encode(str)).replace(/.{1,76}/g, '$&\r\n').trimEnd();
const encWord = str => /^[\x20-\x7E]*$/.test(str) ? str : '=?UTF-8?B?' + b64(te.encode(str)) + '?=';
const quoteName = name => encWord(oneLine(name)).replace(/(["\\])/g, '\\$1');
const addrOnly = v => {
	const m = String(v).match(/<([^<>\s]+)>\s*$/);
	return (m ? m[1] : String(v)).trim();
};

/* Email liên hệ hiện ở chân thư: lấy từ biến EMAIL_FROM hoặc GMAIL_USER (worker.js gọi setContactEmail mỗi yêu cầu) */
let contactEmail = '';
export function setContactEmail(v) {
	contactEmail = String(v || '').replace(/[\s<>"]/g, '');
}

export function mailConfig(env) {
	const user = oneLine(env.GMAIL_USER);
	const pass = String(env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, ''); // mật khẩu ứng dụng hay được dán kèm dấu cách
	return {
		user,
		pass,
		name: oneLine(env.EMAIL_NAME) || 'Việt Du Ký',
		from: oneLine(env.EMAIL_FROM) || user,
		replyTo: oneLine(env.EMAIL_REPLY_TO) || oneLine(env.EMAIL_FROM) || user,
		ready: !!(user && pass)
	};
}

/* Dựng thư MIME: multipart/alternative (chữ thường + HTML), mọi phần mã hoá base64 UTF-8 */
export function buildMessage({ from, fromName, to, replyTo, subject, html, text, host }) {
	const boundary = '=_vdk_' + crypto.randomUUID().replace(/-/g, '');
	const domain = (from.split('@')[1] || host || 'vietduky.local');
	const head = [
		'From: ' + '"' + quoteName(fromName) + '" <' + from + '>',
		'To: <' + oneLine(to) + '>',
		replyTo ? 'Reply-To: <' + oneLine(replyTo) + '>' : null,
		'Subject: ' + encWord(oneLine(subject)),
		'Date: ' + new Date().toUTCString().replace('GMT', '+0000'),
		'Message-ID: <' + crypto.randomUUID() + '@' + domain + '>',
		'MIME-Version: 1.0',
		'Auto-Submitted: auto-generated',
		'Content-Type: multipart/alternative; boundary="' + boundary + '"'
	].filter(Boolean).join('\r\n');
	const part = (type, body) => '--' + boundary + '\r\nContent-Type: ' + type +
		'; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n' + b64Lines(body) + '\r\n';
	return head + '\r\n\r\n' + part('text/plain', text || '') + part('text/html', html || '') + '--' + boundary +
		'--\r\n';
}

/* Đọc phản hồi SMTP (có thể nhiều dòng "250-..." rồi "250 ...") */
function makeReader(readable) {
	const reader = readable.getReader();
	let buf = '';
	const fill = async () => {
		const { value, done } = await reader.read();
		if (done) {
			throw new Error('Máy chủ SMTP đóng kết nối đột ngột.');
		}
		buf += td.decode(value, { stream: true });
	};
	return async function reply() {
		const lines = [];
		for (;;) {
			let i;
			while ((i = buf.indexOf('\n')) < 0) {
				await fill();
			}
			const line = buf.slice(0, i).replace(/\r$/, '');
			buf = buf.slice(i + 1);
			lines.push(line);
			if (/^\d{3} /.test(line) || !/^\d{3}-/.test(line)) {
				return { code: Number(line.slice(0, 3)), text: lines.join('\n') };
			}
		}
	};
}

async function openSocket(env) {
	if (env.__connect) {
		return env.__connect(SMTP_HOST, SMTP_PORT);
	}
	const { connect } = await import('cloudflare:sockets');
	return connect({ hostname: SMTP_HOST, port: SMTP_PORT }, { secureTransport: 'on', allowHalfOpen: false });
}

async function smtpSend(env, cfg, to, message) {
	const socket = await openSocket(env);
	const writer = socket.writable.getWriter();
	const read = makeReader(socket.readable);
	const send = line => writer.write(te.encode(line + '\r\n'));
	const expect = async (codes, what) => {
		const r = await read();
		if (!codes.includes(r.code)) {
			throw new Error(`SMTP ${what}: ${r.text.replace(/\s+/g, ' ').slice(0, 200)}`);
		}
		return r;
	};
	try {
		await expect([220], 'kết nối');
		await send('EHLO vietduky.local');
		await expect([250], 'EHLO');
		await send('AUTH PLAIN ' + b64(te.encode('\0' + cfg.user + '\0' + cfg.pass)));
		const auth = await read();
		if (auth.code !== 235) {
			throw new Error(auth.code === 534 || auth.code === 535
				? 'Gmail từ chối đăng nhập (' + auth.code +
					'). Kiểm tra GMAIL_USER và GMAIL_APP_PASSWORD (phải là mật khẩu ứng dụng, không phải mật khẩu Gmail).'
				: 'SMTP đăng nhập: ' + auth.text.slice(0, 200));
		}
		await send('MAIL FROM:<' + cfg.user + '>');
		await expect([250], 'MAIL FROM');
		await send('RCPT TO:<' + to + '>');
		await expect([250, 251], 'RCPT TO');
		await send('DATA');
		await expect([354], 'DATA');
		// dot-stuffing: dòng bắt đầu bằng "." phải thêm một dấu "." nữa
		await writer.write(te.encode(message.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..') + '.\r\n'));
		await expect([250], 'gửi thư');
		try {
			await send('QUIT');
		} catch { /* đã gửi xong, bỏ qua */
		}
	} finally {
		try {
			writer.releaseLock();
		} catch { /* bỏ qua */
		}
		try {
			await socket.close();
		} catch { /* bỏ qua */
		}
	}
}

export async function sendEmail(env, { to, subject, html, text }) {
	const cfg = mailConfig(env);
	if (!cfg.ready) {
		throw new Error('Chưa cấu hình Gmail: cần GMAIL_USER và secret GMAIL_APP_PASSWORD.');
	}
	const rcpt = addrOnly(oneLine(to));
	if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(rcpt)) {
		throw new Error('Địa chỉ người nhận không hợp lệ.');
	}
	const message = buildMessage({
		from: cfg.from,
		fromName: cfg.name,
		to: rcpt,
		replyTo: cfg.replyTo,
		subject,
		html,
		text
	});
	let timer;
	const timeout = new Promise((_, rej) => {
		timer = setTimeout(() => rej(new Error('Gửi email quá thời gian chờ.')), SMTP_TIMEOUT_MS);
	});
	try {
		await Promise.race([smtpSend(env, cfg, rcpt, message), timeout]);
	} finally {
		clearTimeout(timer);
	}
}

const DESTS = ['Vịnh Hạ Long', 'Sa Pa', 'Hội An', 'Huế', 'Đà Lạt', 'Phú Quốc'];
const SERIF = "Georgia,'Times New Roman',serif";
const DEFAULT_SITE = 'https://vietduky.indevs.in';
/* Logo trong thư: cùng logo /icon-192.png (bản 192px, nhẹ mà vẫn nét khi hiện 40px) với header website (nón lá), lấy theo địa chỉ website */
const siteOf = link => {
	try {
		return new URL(link).origin;
	} catch {
		return DEFAULT_SITE;
	}
};
const logoSrc = site => esc((site && /^https?:/.test(site) ? site : DEFAULT_SITE) + '/icon-192.png');
const SANS = "'Be Vietnam Pro','Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/* Email xác minh địa chỉ: bố cục bảng + CSS nội tuyến để hiển thị đúng ở Gmail, Outlook, Apple Mail */
export function verifyEmail({ name, email, link, site }, tpl, vars) {
	const first = String(name).trim().split(/\s+/).pop(); // tên gọi là từ cuối: "Nguyễn Văn An" → "An"
	const year = new Date().getFullYear();
	// Chữ có thể sửa trong trang quản trị; không truyền thì dùng chữ mặc định
	const v = {
		ten: first,
		ho_ten: String(name).trim(),
		email,
		hotline: '1900 1234',
		ten_web: 'Việt Du Ký',
		...(vars || {})
	};
	const T = Object.fromEntries(Object.entries({ ...TEMPLATES.verify.def, ...(tpl || {}) }).map(([k, s]) => [k, fill(s, v)]));
	const subject = T.subject;
	const introHtml = esc(T.intro).replace(esc(email), `<b style="color:#0c3b36;">${esc(email)}</b>`);

	const pills = DESTS.map(d => `<span style="display:inline-block;margin:0 6px 8px 0;padding:6px 14px;border-radius:999px;background:#eef4f1;border:1px solid #d3e0db;color:#145a50;font-family:${SANS};font-size:13px;font-weight:600;">${esc(d)}</span>`).join('');

	const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#eef4f1;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#eef4f1;font-size:1px;line-height:1px;">${esc(T.note)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef4f1;">
<tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">

    <tr><td style="background:#0c3b36;border-radius:22px 22px 0 0;padding:22px 32px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="40" valign="middle" style="width:40px;"><img src="${logoSrc(site)}" width="40" height="40" alt="" style="display:block;width:40px;height:40px;border-radius:10px;border:0;"></td>
        <td style="padding-left:12px;font-family:${SERIF};font-size:24px;font-weight:bold;color:#ffffff;">Việt Du Ký</td>
      </tr></table>
    </td></tr>

    <tr><td style="background:#0c3b36;font-size:0;line-height:0;">
      <img src="${esc(site)}/images/hero.jpg" width="600" alt="Việt Du Ký – khám phá Việt Nam" style="display:block;width:100%;max-width:600px;height:auto;max-height:210px;object-fit:cover;border:0;">
    </td></tr>
    <tr><td style="font-size:0;line-height:0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="70%" height="5" style="background:#da251d;font-size:0;line-height:0;">&nbsp;</td>
        <td width="30%" height="5" style="background:#ffcd00;font-size:0;line-height:0;">&nbsp;</td>
      </tr></table>
    </td></tr>

    <tr><td style="background:#ffffff;padding:38px 36px 10px;">
      <div style="font-family:${SANS};font-size:12px;font-weight:bold;letter-spacing:2px;color:#da251d;text-transform:uppercase;">${esc(T.eyebrow)}</div>
      <h1 style="margin:10px 0 14px;font-family:${SERIF};font-size:30px;line-height:1.2;color:#0c3b36;">${esc(T.heading)}</h1>
      <p style="margin:0 0 26px;font-family:${SANS};font-size:16px;line-height:1.7;color:#3d524c;">${introHtml}</p>

      <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
        <tr><td align="center" bgcolor="#ffcd00" style="background:#ffcd00;border-radius:999px;">
          <a href="${esc(link)}" target="_blank" style="display:inline-block;padding:16px 44px;font-family:${SANS};font-size:16px;font-weight:bold;color:#0c3b36;text-decoration:none;border-radius:999px;">${esc(T.button)}</a>
        </td></tr>
      </table>
      <p style="margin:14px 0 0;text-align:center;font-family:${SANS};font-size:13px;color:#6b7d77;">${esc(T.note)}</p>

      <div style="height:1px;background:#e3ece8;margin:30px 0 22px;font-size:0;line-height:0;">&nbsp;</div>

      <p style="margin:0 0 6px;font-family:${SANS};font-size:13px;line-height:1.6;color:#6b7d77;">Nút không bấm được? Sao chép liên kết dưới đây, dán vào trình duyệt:</p>
      <p style="margin:0 0 28px;font-family:${SANS};font-size:12px;line-height:1.6;word-break:break-all;"><a href="${esc(link)}" target="_blank" style="color:#145a50;text-decoration:underline;">${esc(link)}</a></p>

      <p style="margin:0 0 10px;font-family:${SANS};font-size:13px;font-weight:bold;color:#0c3b36;">Những điểm đến đang chờ bạn</p>
      <div style="margin:0 0 20px;">${pills}</div>
    </td></tr>

    <tr><td style="background:#0c3b36;border-radius:0 0 22px 22px;padding:26px 36px;">
      <p style="margin:0 0 12px;font-family:${SANS};font-size:13px;line-height:1.65;color:#b9d3cc;">${esc(T.footer)}</p>
      <p style="margin:0 0 4px;font-family:${SANS};font-size:13px;line-height:1.65;color:#ffffff;">Hotline <b>1900 1234</b> &nbsp;·&nbsp; ${contactEmail}</p>
      <p style="margin:0;font-family:${SANS};font-size:12px;line-height:1.65;color:#8fb0a7;">Phan Thiết, Lâm Đồng &nbsp;·&nbsp; &copy; ${year} Việt Du Ký</p>
    </td></tr>

  </table>
</td></tr>
</table>
</body>
</html>`;

	const text = [T.heading, '', T.intro, '', link, '', T.note, T.footer, '', 'Việt Du Ký · Hotline 1900 1234 · ' +
			contactEmail].join('\n');

	return {
		subject,
		html,
		text
	};
}

/* Email thông báo ngắn gọn (tin nhắn mới, đơn mới, đánh giá mới, admin trả lời): cùng phong cách với email xác minh.
rows: [[nhãn, giá trị], ...] hiện dạng bảng; quote: đoạn trích có vạch vàng bên trái. */
export function noticeEmail({ subject, eyebrow, heading, intro, rows, quote, button, link, footer }) {
	const year = new Date().getFullYear();
	const rowHtml = (rows || []).filter(r => r[1]).map(r => `<tr><td style="padding:6px 14px 6px 0;font-family:${SANS};font-size:13px;color:#6b7d77;white-space:nowrap;vertical-align:top;">${esc(r[0])}</td>` +
		`<td style="padding:6px 0;font-family:${SANS};font-size:15px;color:#14231f;font-weight:600;">${esc(r[1])}</td></tr>`).join('');
	const html = `<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#eef4f1;-webkit-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef4f1;"><tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
    <tr><td style="background:#0c3b36;border-radius:22px 22px 0 0;padding:20px 32px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="40" valign="middle" style="width:40px;"><img src="${logoSrc(siteOf(link))}" width="40" height="40" alt="" style="display:block;width:40px;height:40px;border-radius:10px;border:0;"></td>
        <td style="padding-left:12px;font-family:${SERIF};font-size:24px;font-weight:bold;color:#ffffff;">Việt Du Ký</td>
      </tr></table>
    </td></tr>
    <tr><td style="font-size:0;line-height:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="70%" height="5" style="background:#da251d;font-size:0;line-height:0;">&nbsp;</td><td width="30%" height="5" style="background:#ffcd00;font-size:0;line-height:0;">&nbsp;</td>
    </tr></table></td></tr>
    <tr><td style="background:#ffffff;padding:34px 36px 30px;">
      <div style="font-family:${SANS};font-size:12px;font-weight:bold;letter-spacing:2px;color:#da251d;text-transform:uppercase;">${esc(eyebrow)}</div>
      <h1 style="margin:10px 0 14px;font-family:${SERIF};font-size:26px;line-height:1.25;color:#0c3b36;">${esc(heading)}</h1>
      ${intro ? `<p style="margin:0 0 18px;font-family:${SANS};font-size:16px;line-height:1.7;color:#3d524c;">${esc(intro)}</p>` : ''}
      ${rowHtml ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">${rowHtml}</table>` : ''}
      ${quote ? `<div style="margin:0 0 22px;padding:12px 16px;border-left:4px solid #ffcd00;background:#f6faf8;border-radius:0 12px 12px 0;font-family:${SANS};font-size:15px;line-height:1.65;color:#14231f;white-space:pre-wrap;">${esc(quote)}</div>` : ''}
      ${link ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 4px;"><tr><td align="center" bgcolor="#ffcd00" style="background:#ffcd00;border-radius:999px;">
        <a href="${esc(link)}" target="_blank" style="display:inline-block;padding:14px 36px;font-family:${SANS};font-size:15px;font-weight:bold;color:#0c3b36;text-decoration:none;border-radius:999px;">${esc(button || 'Mở')}</a></td></tr></table>` : ''}
    </td></tr>
    <tr><td style="background:#0c3b36;border-radius:0 0 22px 22px;padding:22px 36px;">
      ${footer ? `<p style="margin:0 0 10px;font-family:${SANS};font-size:12px;line-height:1.65;color:#b9d3cc;">${esc(footer)}</p>` : ''}
      <p style="margin:0;font-family:${SANS};font-size:12px;line-height:1.65;color:#8fb0a7;">Hotline 1900 1234 &nbsp;·&nbsp; ${contactEmail} &nbsp;·&nbsp; &copy; ${year} Việt Du Ký</p>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
	const text = [heading, '', intro || '', ...(rows || []).filter(r => r[1]).map(r => r[0] + ': ' + r[1]), quote ? '\n' +
			quote : '', link ? '\n' +
			(button || 'Mở') + ': ' + link : '', footer ? '\n' +
			footer : '']
		.filter(x => x !== undefined).join('\n');
	return {
		subject,
		html,
		text
	};
}
