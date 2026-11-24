#!/usr/bin/env node
/* Tạo mã băm mật khẩu đúng định dạng của hệ thống (pbkdf2$vòng$muối$băm), dùng chung hàm hashPassword.
   Cách dùng:  node scripts/hash-password.mjs            (nhập mật khẩu, không hiện trên màn hình)
               node scripts/hash-password.mjs --sql ADMIN_EMAIL   (in luôn câu UPDATE cho bảng admins)
   Mã băm không giải ngược được; chỉ dùng để dán vào cột pass_hash. */
import { hashPassword } from '../src/customer-auth.js';
import readline from 'node:readline';

const args = process.argv.slice(2), si = args.indexOf('--sql'), email = si >= 0 ? args[si + 1] : null;

function ask(q) {
  return new Promise(res => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = s => { if (s.includes(q)) rl.output.write(s); };
    rl.question(q, a => { rl.close(); process.stdout.write('\n'); res(a); });
  });
}

const pw = await ask('Mật khẩu: ');
if (pw.length < 8) {
  console.error('Mật khẩu cần ít nhất 8 ký tự.');
  process.exit(1);
}
const hash = await hashPassword(pw);
console.log(hash);
if (email) {
  const sql = `UPDATE admins SET pass_hash = '${hash}', sess_at = ${Date.now()} WHERE email = '${email.replace(/'/g, "''")}'`;
  console.log(`\nwrangler d1 execute <TÊN_DB> --remote --command '${sql.replace(/'/g, "'\\''")}'`);
}
