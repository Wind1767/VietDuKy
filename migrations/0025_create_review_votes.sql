-- Bình chọn "đánh giá này có hữu ích không": mỗi khách một phiếu cho mỗi đánh giá (bấm lại để bỏ phiếu).
-- Worker cũng tự tạo bảng này khi chạy; file này để chạy tay / tham khảo.
CREATE TABLE IF NOT EXISTS review_votes (
  review_id  INTEGER NOT NULL,
  user_id    INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (review_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_review_votes_user ON review_votes(user_id);
