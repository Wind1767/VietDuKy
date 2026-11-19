-- Chạy MỘT LẦN nếu bạn đã dùng `wrangler d1 migrations apply` trước khi đổi tên file migration:
--   npx wrangler d1 execute vietduky --remote --file scripts/sync-renamed-migrations.sql
-- Việc này đổi tên trong bảng theo dõi d1_migrations để wrangler không chạy lại các migration đã áp dụng.
-- Nếu chưa từng chạy `migrations apply` (database do Worker tự tạo) thì bỏ qua file này.

UPDATE d1_migrations SET name = '0001_create_bookings_and_rate_limits.sql' WHERE name = '0001_init.sql';
UPDATE d1_migrations SET name = '0002_create_admin_log.sql' WHERE name = '0002_admin_log.sql';
UPDATE d1_migrations SET name = '0003_create_users.sql' WHERE name = '0003_users.sql';
UPDATE d1_migrations SET name = '0004_add_bookings_user_id.sql' WHERE name = '0004_booking_user.sql';
UPDATE d1_migrations SET name = '0005_create_messages.sql' WHERE name = '0005_messages.sql';
UPDATE d1_migrations SET name = '0006_create_reviews.sql' WHERE name = '0006_reviews.sql';
UPDATE d1_migrations SET name = '0007_add_users_blocked_at.sql' WHERE name = '0007_users_blocked.sql';
UPDATE d1_migrations SET name = '0008_create_tours_templates_settings.sql' WHERE name = '0008_part5.sql';
UPDATE d1_migrations SET name = '0009_add_admins_perms_messages_bot_create_chat_faq.sql' WHERE name = '0009_part6.sql';
UPDATE d1_migrations SET name = '0010_add_admins_sess_at.sql' WHERE name = '0010_part8.sql';
UPDATE d1_migrations SET name = '0011_create_site_settings.sql' WHERE name = '0011_part9_1.sql';
UPDATE d1_migrations SET name = '0012_create_destinations.sql' WHERE name = '0012_part9_2.sql';
UPDATE d1_migrations SET name = '0013_note_nav_and_home_blocks_in_site_settings.sql' WHERE name = '0013_part9_3a.sql';
UPDATE d1_migrations SET name = '0014_create_content_blocks_and_pages.sql' WHERE name = '0014_part9_3b.sql';
UPDATE d1_migrations SET name = '0015_create_custom_roles.sql' WHERE name = '0015_part9_4a.sql';
UPDATE d1_migrations SET name = '0016_create_access_settings_add_admins_access.sql' WHERE name = '0016_part9_4b.sql';
UPDATE d1_migrations SET name = '0017_create_email_templates.sql' WHERE name = '0017_part9_5a.sql';
UPDATE d1_migrations SET name = '0018_create_coupons_add_bookings_coupon.sql' WHERE name = '0018_part9_5b.sql';
UPDATE d1_migrations SET name = '0019_note_import_export_uses_existing_tables.sql' WHERE name = '0019_part9_5c.sql';
UPDATE d1_migrations SET name = '0020_create_chat_sessions_add_messages_session_id.sql' WHERE name = '0020_chat_sessions.sql';
UPDATE d1_migrations SET name = '0021_add_users_delete_requested_at.sql' WHERE name = '0021_account_delete.sql';
