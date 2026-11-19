# Việt Du Ký – Vietnam Travel Website
- **Việt Du Ký** is a Vietnam travel website designed to showcase beautiful destinations, introduce travel tours, and make booking trips easier.
- The website features a modern, responsive interface with beautiful destination imagery, tour information, customer reviews, and an easy-to-use booking system.

## Main Features

- **Explore Destinations**: Discover popular destinations across Vietnam, including Ha Long Bay, Sa Pa, Hoi An, Hue, Da Lat, and Phu Quoc.
- **Travel Tours**: Browse available tours, view prices, durations, and detailed information.
- **Online Booking**: Submit tour booking requests directly through the website.
- **Customer Reviews**: Display feedback and experiences from travelers.
- **Admin Dashboard**: Manage bookings, tours, prices, customer messages, and business reports.
- **Email Notifications**: Receive booking notifications via email.
- Responsive Design: Optimized for desktop, tablet, and mobile devices.
- **Granular admin permissions**: per-feature read/write access plus special permissions (delete, CSV export, view full phone/email, bulk price change, virtual reviews). Without the contact permission, phone numbers and emails are masked on the server.
- **Admin quality of life**: quick search palette (Ctrl/⌘ + K or `/`), custom confirm dialogs, custom checkboxes and toggle switches, force sign-out of an admin on every device.

- **Website settings (admin)**: edit contact info, brand colors, font size, corner radius, top announcement banner, homepage text, feature switches (booking / sign-up / chat / reviews), maintenance mode, SEO and custom CSS — each part guarded by its own permission (`site`, `css`, `maint`).
- **Destinations & page content (admin)**: add / hide / reorder destinations with images, and edit homepage headings, About page text, values block and FAQ list without touching code.
- **Menu & home page layout (admin, 9.3a)**: rename / add / remove / reorder navigation links (header and footer separately, optional new tab), and show / hide / reorder each homepage block. Guarded by its own permission group `layout`.
- **Custom blocks & pages (admin, 9.3b)**: create text / image+text / icon-card blocks for the homepage and standalone pages at `/p/your-slug` (add them to the menu). Plain text only, no raw HTML. Permission group `content`.
- **Custom roles & sub-permissions (admin, 9.4a)**: create named roles (e.g. "Accountant") with their own permission set and assign them to any number of admins; fine-grained per-action switches (create / edit / lock / bulk…) inside each feature group. Existing accounts keep their behaviour.
- **Access limits (admin, 9.4b)**: restrict the admin panel by IP (allow-list or block-list, single IPs or CIDR, IPv4/IPv6) and by weekday + time window (Vietnam time, overnight shifts supported), site-wide and per account. Checked at login and on every request. Safety: you can't save a rule that locks yourself out, owners can be exempt from time limits, and setting the Worker variable `ACCESS_BYPASS=1` temporarily disables everything. Permission group `security`.
- **Editable email templates (admin, 9.5a)**: 9 automatic emails (verify, password reset, booking received / confirmed, chat reply, and admin alerts for new bookings, cancellations, messages and reviews) can have their subject, headings, intro, button text and footer edited, with `{ten}`, `{diem_den}`... variables, live preview and a test send. Only changed fields are stored; empty = default text. Layout stays fixed and all text is escaped (no raw HTML). Uses the `email` permission group.

## Admin Dashboard
- The website includes a dedicated administration panel where administrators can manage bookings, update tour information and pricing, track revenue, view reports, and communicate with customers.

### Live Website
- Visit: https://vietduky.indevs.in

## Technology
- Built with HTML, CSS, and JavaScript, powered by Cloudflare Workers, Cloudflare D1 for backend processing and database storage and ImageKit for storing medias.

## Credits
- Made by [Wind1767](https://github.com/Wind1767) using [Claude](https://claude.ai).
### License
- Licensed under MIT license. See `LICENSE` for more details.
