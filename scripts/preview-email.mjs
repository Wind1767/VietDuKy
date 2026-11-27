// Xem thử email xác minh: node scripts/preview-email.mjs  →  mở email-preview.html bằng trình duyệt
import { writeFileSync } from 'node:fs';
import { verifyEmail } from '../src/email.js';
const { html } = verifyEmail({
	name: 'Nguyễn Văn An',
	email: 'an@example.com',
	link: 'https://vietduky.indevs.in/verify?token=abc123xyz',
	site: 'public'
});
writeFileSync('email-preview.html', html);
console.log('Đã tạo email-preview.html');

// Xem thử email thông báo (tin nhắn mới gửi admin / admin trả lời khách)
import { noticeEmail } from '../src/email.js';
const n = noticeEmail({
	subject: 'Tin nhắn mới từ Nguyễn Văn An',
	eyebrow: 'Tin nhắn mới',
	heading: 'Nguyễn Văn An vừa nhắn cho bạn',
	rows: [['Email', 'an@example.com'], ['SĐT', '0912345678']],
	quote: 'Cho mình hỏi tour Hội An – Huế 3 ngày 2 đêm còn chỗ ngày 20/12 không ạ?',
	button: 'Trả lời trong trang quản trị',
	link: 'https://vietduky.indevs.in/admin/#/messages/1',
	footer: 'Email tự động gửi tới quản trị viên.'
});
writeFileSync('email-notice-preview.html', n.html);
console.log('Đã tạo email-notice-preview.html');
