-- Worker tự thêm cột này khi chạy lần đầu; file này chỉ để tham khảo / chạy tay nếu muốn.
-- Thời điểm (mili giây) Chủ bấm "Đăng xuất mọi thiết bị" hoặc đổi mật khẩu quản trị viên.
-- Các phiên đăng nhập cấp trước mốc này không còn hiệu lực. NULL = chưa thu hồi lần nào.
ALTER TABLE admins ADD COLUMN sess_at INTEGER;

-- Quyền riêng của từng quản trị viên (cột perms, JSON) có thêm khoá "_v": 2 để phân biệt bản mới và bản cũ.
-- Bản cũ (không có _v) được Worker tự nâng cấp khi đọc: "system" -> "backup" + "email",
-- và giữ nguyên những gì người đó đang làm được (xuất CSV, xem SĐT/email, đổi giá, đánh giá ảo). Không cần sửa dữ liệu.
