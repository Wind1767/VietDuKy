/* Quy tắc dùng chung cho cả server lẫn giao diện (đăng ký, đặt lại, đổi mật khẩu, admin tạo tài khoản).
Sửa ở đây là mọi nơi đổi theo: server kiểm tra bằng các hằng này, giao diện đọc qua /api/site và /api/admin/me. */
export const MIN_PASS = 10;
export const MAX_PASS = 128;
export const RULES = Object.freeze({ minPass: MIN_PASS, maxPass: MAX_PASS });
