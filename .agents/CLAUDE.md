# Việt Du Ký – hướng dẫn cho Claude

Website đặt tour du lịch tiếng Việt chạy trên Cloudflare Workers + D1 (SQLite). Giao diện tĩnh nằm trong `public/`, API chạy trong Worker `src/`.

## Lệnh thường dùng
- `npm test` – unit test (`node --test "tests/unit/*.test.mjs"`), không cần mạng. Chạy sau mỗi thay đổi.
- `npm run test:e2e` – e2e bằng trình duyệt (chạy tuần tự).
- `npm run format` / `npm run format:check` – định dạng CSS/JS (`tools/format.mjs`).
- `npm run dev` – `wrangler dev`; `npm run deploy` – triển khai.

## Cấu trúc
- **Chỉ sửa giao diện trong `public/`.** `wrangler.toml` chỉ triển khai `./public`; không tạo bản sao `index.html`, `css/`, `js/`, `admin/` ở thư mục gốc (file ở đó sẽ không lên web).
- `src/worker.js` – điểm vào, định tuyến `/api/*` và `/p/*`, phiên admin (cookie `vdk_session`).
- `src/customer-auth.js` – tài khoản khách: đăng ký, xác minh email, đăng nhập, phiên (cookie `vdk_user`, dạng `s1.<43 ký tự>`; chỉ lưu bản băm SHA-256 trong bảng `user_sessions`).
- `src/session-device.js` – ràng phiên với thiết bị/quốc gia. Cookie chép sang máy khác bị thu hồi.
- `src/tours.js`, `reviews.js`, `coupons.js`, `chat.js`, `email*.js`, `privacy.js`, `site-settings.js` – từng mảng nghiệp vụ.
- `migrations/` – SQL D1 đánh số `00NN_*.sql`; thêm file mới, không sửa file cũ. Có test kiểm tra migration.
- `public/*.html` – các trang; `public/js/main.js` dùng chung (menu, footer, toast, tải `/api/tours`); `public/js/extras.js` (lọc/so sánh tour, thanh tiến độ cuộn); `public/admin/` – trang quản trị.
- `public/css/`: `style.css`, `components.css`, `form-controls.css`, `extras.css`, `chat.css`.
- `src/rules.js` – quy tắc dùng chung server + giao diện (độ dài mật khẩu).
- `tests/unit`, `tests/e2e`, `tests/helpers`.

## Quy ước
- Giao diện và thông báo lỗi bằng tiếng Việt; giữ giọng văn và dấu đầy đủ.
- CSS/JS: mỗi khai báo / câu lệnh một dòng (test `static.test.mjs` kiểm tra). Không viết dính một dòng dài.
- Trang HTML nạp `js/site.js` trước CSS; trang mới nên sao chép phần `<head>` từ trang có sẵn (ví dụ `reviews.html`) và thêm `extras.css`/`extras.js` nếu cần lọc/so sánh tour.
- Mọi `<script src>` và `<link href>` nội bộ phải trỏ tới file có thật (có test).
- URL không đuôi `.html` (`/tours`, `/contact`, `/account`).
- Nút "Tất cả tour" ở trang chủ là link tới `/tours`; trang `/tours` là lưới `.tours.all[data-all]` do `main.js` đổ dữ liệu từ `/api/tours`.
- **Một nguồn duy nhất cho quy tắc dùng chung**: `src/rules.js` (`MIN_PASS`, `MAX_PASS`, `RULES`). Server import từ đây; giao diện đọc qua `/api/site` (`rules`) và `/api/admin/me` (`rules`). Không viết cứng "8"/"10"/"128" ở bất kỳ đâu. Form khách dùng `data-pass-new` (+ `data-minpass` cho chữ) để `site.js` tự gán `minlength`; trang admin dùng `minPass()`/`passErr()`/`passLabel()` trong `admin.js`. Khi thêm form mật khẩu mới phải dùng đúng cơ chế này, và thêm kiểm tra vào `tests/unit/password.test.mjs`.
- PBKDF2 100000 vòng (giới hạn của Workers).
- Không đưa khoá bí mật vào `wrangler.toml`; chỉ khoá công khai (ImageKit public key, Turnstile hostnames).

## Lưu ý cookie đăng nhập
Trình duyệt có thể gửi nhiều cookie `vdk_user` (bản cũ ở Path/Domain khác). `readToken` phải duyệt tất cả và lấy cái đúng định dạng, không lấy cái đầu tiên. Đăng nhập/đăng xuất phải gửi thêm lệnh xoá cookie cũ (`withCookies`). Khi đổi tên hoặc thuộc tính cookie, giữ lại việc dọn bản cũ.

## Mobile
Kiểm tra ở rộng ~360px: bảng so sánh tour (`.x-table`), thanh `.x-tray`, `.toast`, `.x-toast`, danh sách `.acct`. Tránh `min-width` cố định lớn và `width` theo `left:50%` mà không có `max-width`.

## Hướng dẫn viết UI
**Phong cách:** du lịch Việt Nam, ấm và sạch. Màu ngọc bích làm chủ đạo, vàng/đỏ làm điểm nhấn (gợi cờ Việt Nam), bo góc lớn, ảnh thật.
- Font: *Be Vietnam Pro* (chữ thường, hỗ trợ dấu tiếng Việt), *Fraunces* (tiêu đề). Icon: Material Symbols Rounded, dùng `<span class="ms">tên_icon</span>`. Icon mới phải thêm vào danh sách `icon_names` trong URL font ở `<head>` của các trang cần dùng, nếu không sẽ không hiện.
- Biến màu (`:root` trong `style.css`): `--jade #0c3b36`, `--jade2`, `--red #da251d`, `--gold #ffcd00`, `--lotus`, `--mist`, `--ink`, `--mut`, bán kính `--r: 22px`. Luôn dùng biến, không viết cứng mã màu. Trang quản trị có thể đổi màu qua `site.js`, nên màu cứng sẽ lệch.
- Dark mode: `:root[data-theme="dark"]` (và `prefers-color-scheme`). Thành phần mới có nền/viền riêng phải có biến cho cả hai chế độ (xem `--x-card`, `--x-line` trong `extras.css`).
- Nút: `.btn` + biến thể `.gold`, `.line`, `.ghost`, `.danger`, cỡ `.sm`, `.block`. Không tự chế kiểu nút mới.
- Nhóm nút phân đoạn (7/30/90 ngày, Số đơn/Doanh thu): `.seg` chứa `.seg-b`, khung và nút đều bo `99px`, cùng chiều cao 32px. Luật cho nút trạng thái cũ phải viết là `.seg button:not(.seg-b)` để không đè lên `.seg-b` (lỗi bo góc không đều trước đây). Lựa chọn được nhớ trong `localStorage` (`vdk-admin-ov`). Có test ở `tests/unit/segmented.test.mjs`.
- Khi viết selector chung như `.x button`, luôn kiểm tra nó có vô tình đè lên các class nút khác (`.seg-b`, `.chip`, `.btn`) không; cùng một thứ chỉ có một nơi định nghĩa bo góc.
- Thẻ lồng thẻ phải bo góc đồng tâm (góc trong nhỏ hơn góc ngoài).
- Thông báo ngắn dùng `toast(msg, isError)` trong `main.js`; lỗi biểu mẫu dùng `.auth-err`; ghi chú dùng `.auth-note`.
- Hiệu ứng xuất hiện khi cuộn dùng class `.rv`. Mọi animation phải có nhánh `@media (prefers-reduced-motion: reduce)`.
- Thành phần đặt `position: fixed` hoặc tâm `left: 50%` luôn kèm `max-width` theo viewport; z-index theo thang: nav 50–99, nút nổi 90–95, modal/toast ≥ 9998.

**Responsive:** thiết kế mobile trước, breakpoint đang dùng: 900px (chính), 760, 640, 520. Cuộn ngang chỉ cho bảng dữ liệu thật sự cần, và vẫn phải đọc được ở 360px.

**Nội dung chữ:** tiếng Việt có dấu, xưng "bạn", giọng thân thiện nhưng ngắn gọn; giá viết `4.250.000đ` (dùng `toLocaleString('vi-VN')`); ngày theo `vi-VN`.

**Khả năng truy cập:** nút chỉ có icon phải có `aria-label`; vùng cập nhật động dùng `aria-live`; modal có `role="dialog"`, đóng được bằng Esc; không dùng màu làm tín hiệu duy nhất.

**Dựng giao diện từ dữ liệu:** luôn escape chuỗi từ API trước khi chèn `innerHTML` (xem `esc`/`esc2` trong `main.js`, `auth.js`).

## Phiên admin
- Cookie `vdk_session` sống 7 ngày và **tự gia hạn khi đang dùng** (phiên trượt: `requireAdmin` đặt `RENEW`, `fetch` gắn `Set-Cookie` mới khi đã dùng quá 1/10 thời hạn). Trước đây cố định 8 giờ nên hết hạn nhanh. Đổi thời hạn bằng biến `ADMIN_SESSION_HOURS` (1–720) trong `wrangler.toml`, không viết cứng giờ trong code.
- Phiên gắn với trình duyệt + hệ điều hành (`session-device.js`); đổi mật khẩu hoặc "đăng xuất mọi thiết bị" (`sess_at`) vẫn cắt phiên cũ. `admin-plus.js` kiểm tra lại phiên khi quay lại tab và giữ phiên khi để tab mở.

## Trang chủ: nút cuộn
- Chỉ `main.js` tạo nút `.top` và thanh tiến độ `.bar`. Không thêm lần nữa ở `extras.js` (trước đây trùng thành 2 nút). Có test ở `tests/unit/admin-plus.test.mjs`.

## Admin: giao diện
- Icon ở giao diện tối dùng biến `--icon` (sáng hơn `--mut`); dùng `var(--icon)` cho icon phụ, không dùng `--mut` trực tiếp. Dark mode có hai cơ chế (`[data-theme="dark"]` và `prefers-color-scheme`), sửa cả hai.
- Khoảng cách: khối cuối `admin.css` đặt line-height 1.65–1.75, thẻ `22px 24px`, bảng `14px 16px`. Người dùng đổi được "Mật độ: Thoải mái/Gọn" và cỡ chữ bằng nút ở thanh bên (`html[data-density]`, `html[data-fs]`, lưu `localStorage`).
- `public/admin/admin-plus.js` (nạp sau `admin.js`, chỉ dùng DOM): mật độ + cỡ chữ, phím tắt chuyển trang (`g` rồi `o/b/m/r/c/d/t/p/l`), bảng phím tắt `?`, kiểm tra phiên khi quay lại tab. Icon mới phải thêm vào `icon_names` trong `admin/index.html`.

## Logo & icon
- Bản gốc là vector `public/logo.svg` (nón lá + sóng trên nền xanh, bo góc). **Mọi PNG đều xuất từ SVG này**, không phóng to ảnh nhỏ (sẽ mờ): `logo.png` 512, `logo-1024.png` (bản lớn cho in/mạng xã hội), `favicon.png` 256, `favicon.svg`, `favicon.ico`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` và `apple-touch-icon.png` 180 (nền vuông đặc, không trong suốt) cùng `manifest.webmanifest`. Muốn đổi logo: sửa SVG rồi xuất lại đủ các cỡ (Chromium/Playwright chụp từng cỡ), không sửa tay từng PNG.
- Chỗ hiển thị nhỏ (header web, chat, email, nền thương hiệu admin) dùng `/icon-192.png` cho nhẹ mà vẫn nét trên màn hình retina; chỗ lớn dùng `/logo.png`. Mọi trang HTML (kể cả `admin/index.html`) phải có đủ các thẻ `<link>` favicon/svg/ico/apple-touch-icon/manifest (có test).

## Avatar quản trị viên
- Bảng `admins` có cột `avatar` (migration `ALTER` trong `worker.js`). Chỉ nhận ảnh đã tải lên ImageKit của website (`ikUrlOk`). `/api/admin/me` trả `avatar`; `PATCH /api/admin/me {avatar}` cho quản trị viên tự đổi ảnh (tài khoản chủ gốc dùng mật khẩu chung không có hàng trong bảng nên dùng logo web).
- Giao diện: `#whoAv` ở thanh bên (bấm để đổi ảnh), cột Tên trong danh sách quản trị viên, và ô ảnh trong form thêm/sửa. Chưa có ảnh thì hiện chữ cái đầu của tên. Dùng chung `avatarField`/`bindAvatarField`/`avInner`.

## Hồ sơ khách (account)
- Danh sách thông tin cá nhân: nhãn nhỏ (Họ và tên, Email, Số điện thoại) ở TRÊN, giá trị đậm ở dưới (`<small>nhãn</small><b>giá trị</b>`). Khi cập nhật bằng JS gán `textContent` cho `<b id="aName">`/`#aPhone`, không dùng `firstChild`. Ô trong form "Sửa thông tin" có nhãn hiện sẵn (`label.pf`).
- Test e2e chọn nút gửi của form có ô mật khẩu bằng `button:not(.pw-eye)` vì mỗi ô mật khẩu có thêm nút hiện/ẩn.

## Xuất Excel (.xlsx)
- `src/xlsx.js` (`buildXlsx`, `xlsxResponse`) tự tạo file .xlsx thuần JS, không cần thư viện (chạy được trên Workers). Dòng đầu là tiêu đề (đậm, cố định khi cuộn, có bộ lọc); số giữ là số; chữ luôn lưu dạng chuỗi nên không bao giờ chạy công thức (chống chèn công thức). Muốn thêm file Excel mới: dựng `rows` rồi `return xlsxResponse([{ name, rows }], 'ten-file')`.
- Đường dẫn: `/api/admin/export.xlsx` (đơn, theo bộ lọc), `accounts.xlsx`, `customers.xlsx`, `activity.xlsx`, `report.xlsx`, `/api/admin/data/export?kind=<bookings|tours|coupons|all>&format=xlsx` (`all` = nhiều sheet; sheet đơn đặt chỉ có khi có quyền pii).
- Phân quyền: mỗi đường dẫn `.xlsx` phải có trong `groupOf` và `NEEDS` (`admin-accounts.js`) giống bản `.csv` (cần `export`, và `pii` nếu có SĐT/email). Thêm đường dẫn mới mà quên hai chỗ này thì bị chặn (`_none`). Test ở `tests/unit/xlsx.test.mjs`.
- Icon nút Excel là `table_view` (đã có trong `icon_names`).

## Tiện ích (QoL)
- Admin: nhấp đúp vào ô bảng để sao chép nội dung.
- Admin (`admin-plus.js`): Ctrl+Enter / Ctrl+S lưu trong ngăn chi tiết; cảnh báo khi đóng tab lúc đang sửa dở; số việc mới hiện trên tiêu đề tab (đọc từ `#navNew/#navMsg/#navRev`); nhớ trang đang xem (`vdk-last-view`); nút lên đầu `.adm-top`; hiện/ẩn mật khẩu ở form đăng nhập.
- Trang khách (`site.js` → `enhancePass`): mọi `input[type=password]` được bọc `.pw-wrap` kèm nút `.pw-eye`; ô có `data-pass-new` hiện gợi ý còn thiếu bao nhiêu ký tự theo `window.VDK_RULES`. Form mật khẩu mới chỉ cần giữ `type="password"`, không tự làm nút hiện/ẩn riêng.

## Tính năng gần đây
- Admin: nút "Tạo mật khẩu ngẫu nhiên" (theo `minPass()`) khi tạo/sửa tài khoản quản trị và tài khoản khách; kiểm tra độ dài ở trình duyệt trước khi gửi (cùng luật với server).
- Admin Tổng quan nhớ khoảng thời gian và chỉ số đã chọn.

## Công tắc tính năng (Cài đặt → Bật / tắt tính năng)
- Cờ `feat_*` nằm trong `DEFS` (`src/site-settings.js`), mặc định bật. Có hai loại:
  - **Tính năng** (đặt tour, đăng ký, đăng nhập, chat, đánh giá, hòm thư, báo lỗi, tải ảnh, yêu thích, so sánh, mã giảm giá, quên mật khẩu, huỷ đơn, bình chọn hữu ích, trang Về chúng tôi / Tour / trang tự tạo, chia sẻ, lọc tour): tắt thì ẩn giao diện, máy chủ chặn (503), và trang của nó trả 404.
  - **Lớp bảo vệ** (`feat_turnstile`, `feat_turnstile_admin`, `feat_email_verify`): tắt thì bỏ qua bước đó, không chặn khách. Cả ba thuộc nhóm quyền `maint` (`RESTRICTED`) và có hộp xác nhận khi tắt.
- Máy chủ: `requireFeature` (bị bảo trì chặn theo) cho đặt tour/đăng ký/chat/đánh giá; `requireFlag` chỉ xét đúng cờ, dùng cho các cờ còn lại (khối `requireFlag` trong `worker.js`, `imagekit.js`).
- **Tắt đăng nhập (`feat_login`)**: `currentUser` luôn trả null (không nhận phiên nào, `/api/auth/me` báo `why: 'login_off'`), nên chat, yêu thích, hòm thư, viết đánh giá, huỷ đơn đều không dùng được và bị ẩn theo. Riêng đặt tour vẫn mở nếu `feat_booking` bật: `createBooking` nhận đơn không gắn tài khoản (`user_id` NULL), bắt buộc tên + SĐT, email tuỳ chọn (ô `.guest-only` trong `contact.html`).
- Trang 404: `PAGE_FLAG` (`site-settings.js`, giá trị là một cờ hoặc mảng cờ) ánh xạ trang → cờ; `worker.js` chạy trước các trang đó (`run_worker_first` trong `wrangler.toml`) và hỏi một đường dẫn không có thật để nền tảng trả `public/404.html` (`not_found_handling = "404-page"`). Trang 404 dùng đường dẫn tuyệt đối vì hiện ở mọi URL. Thêm trang có công tắc: thêm vào `PAGE_FLAG` **và** `run_worker_first` (có test canh).
- Giao diện khách: `site.js` (`features`, danh sách `FEATS`) bật class `no-<tên>` trên `<html>`; luật ẩn nằm trong `components.css` (dùng `!important` để thắng luật hiển thị sẵn có). `turnstile.js` đọc `window.VDK_SITE` (đăng nhập quản trị tự đọc `/api/site`).
- Thêm công tắc mới: `DEFS`, mục `feat` trong `admin.js`, chặn ở máy chủ, luật `.no-<tên>` + `FEATS`, và test ở `tests/unit/feature-toggles.test.mjs` / `guest-booking.test.mjs`.

## Khi giao việc
Chỉ đóng gói các file đã sửa/thêm (giữ nguyên đường dẫn) nếu người dùng yêu cầu, không zip cả dự án.

## Markdown & tô màu mã
- `public/js/md.js` dựng Markdown (escape mọi HTML); `public/js/md-highlight.js` (`window.vdkHl`) tô màu khối ```ngôn-ngữ. Trang nào nạp md.js phải nạp md-highlight.js trước nó và có `content_copy`, `check` trong `icon_names`.
- Thêm ngôn ngữ: `def('tên bí-danh', 'Nhãn', {...})` trong md-highlight.js (tên đầu tiên là khoá; ngôn ngữ cần bộ quét riêng thì thêm vào `CUSTOM[khoá]`). Lớp token `tk-*` có màu trong md.css.
- Nút sao chép chỉ chép `textContent` của `<code>` (không dùng innerText vì dính tên icon). Test: tests/unit/markdown.test.mjs.

## Hòm thư khách
- `/api/inbox` trả TẤT CẢ thông báo (không LIMIT); bài viết (`kind=post`) chỉ có tiêu đề, nội dung đầy đủ ở `GET /api/inbox/:id` (trang đọc `/inbox?id=N`, tự đánh dấu đã đọc).
- Khách xoá = ghi `notif_hidden` (DELETE `/api/inbox/:id` hoặc `/api/inbox`), không xoá thật; admin xoá thật thì dọn cả `notif_hidden`.
- Công thức `$..$` / `$$..$$` dựng bằng `public/js/md-math.js` (`window.vdkTex`, tự viết, không KaTeX vì CSP); nạp trước md.js. Lệnh lạ hiện đỏ `.tx-unk`.
- Xoá thông báo: khách xoá thông báo riêng (không phải bài viết) = xoá hẳn khỏi DB + notif_reads/notif_hidden (`purge`); bài viết và thông báo chung chỉ ẩn. Admin xoá = purge. Bài viết trong hòm thư bấm cả thẻ để mở.
