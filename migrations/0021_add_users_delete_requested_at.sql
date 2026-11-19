-- Worker tự thêm cột khi chạy; file này chỉ để tham khảo.
ALTER TABLE users ADD COLUMN delete_requested_at INTEGER;
