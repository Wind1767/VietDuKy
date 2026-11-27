/* Cloudflare Turnstile (widget đã tạo sẵn). Site key công khai; secret chỉ ở Worker. */
(function () {
	'use strict';
	var KEY = '0x4AAAAAAGBeoGyZaT3JewGo', loading = null, ids = new WeakMap(), acts = new WeakMap(), adminCfg = null;
	/* Cài đặt website (công khai, không có bí mật): site.js nạp sẵn cho trang khách; trang quản trị tự đọc /api/site. */
	function flags() {
		return window.VDK_SITE && window.VDK_SITE.site_name ? window.VDK_SITE : adminCfg;
	}
	/* Quản trị tắt xác minh thì bỏ qua luôn: feat_turnstile cho form khách, feat_turnstile_admin cho đăng nhập quản trị */
	function off(action) {
		var f = flags();
		return !!f && (action === 'admin_login' ? f.feat_turnstile_admin : f.feat_turnstile) === false;
	}
	/* Chờ cài đặt (tối đa 2,5 giây) để không dựng khung xác minh rồi mới ẩn. Không đọc được thì coi như đang bật. */
	function whenFlags(action, cb) {
		if (flags()) {
			cb();
			return;
		}
		var done = false, fin = function () {
			if (!done) {
				done = true;
				document.removeEventListener('vdk:site', fin);
				cb();
			}
		};
		setTimeout(fin, 2500);
		if (action === 'admin_login' && window.fetch) {
			fetch('/api/site').then(function (r) {
				return r.ok ? r.json() : null;
			}).then(function (d) {
				adminCfg = d && d.site || null;
				fin();
			}).catch(fin);
		} else {
			document.addEventListener('vdk:site', fin);
		}
	}
	function load() {
		if (window.turnstile) {
			return Promise.resolve();
		}
		if (!loading) {
			loading = new Promise(function (ok) {
				var s = document.createElement('script');
				s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
				s.async = true;
				s.defer = true;
				s.onload = ok;
				s.onerror = ok;
				document.head.appendChild(s);
			});
		}
		return loading;
	}
	function boxOf(el) {
		return !el ? null : el.classList.contains('ts-box') ? el : el.querySelector('.ts-box');
	}
	var api = window.vdkTS = {
		mount: function (el, action) {
			var box = boxOf(el);
			if (!box || ids.has(box) || acts.has(box)) {
				return;
			}
			acts.set(box, action || box.dataset.action || '');
			whenFlags(acts.get(box), function () {
				if (off(acts.get(box))) {
					box.hidden = true;
					return;
				}
				box.hidden = false;
				ids.set(box, null);
				load().then(function () {
					if (!window.turnstile) {
						box.textContent = 'Không tải được khung xác minh. Hãy kiểm tra mạng rồi tải lại trang.';
						return;
					}
					ids.set(box, window.turnstile.render(box, {
						sitekey: KEY,
						action: acts.get(box),
						theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
						callback: function () {
							box.dataset.ok = '1';
						},
						'expired-callback': function () {
							box.dataset.ok = '';
						},
						'error-callback': function () {
							box.dataset.ok = '';
						}
					}));
				});
			});
		},
		token: function (el) {
			var b = boxOf(el), id = b && ids.get(b);
			return id != null && window.turnstile ? (window.turnstile.getResponse(id) || '') : '';
		},
		ready: function (el) {
			var b = boxOf(el);
			return (!!b && off(acts.get(b) || b.dataset.action || '')) || !!api.token(el);
		},
		/* gọi lại khi cài đặt website tải xong: ẩn khung nếu xác minh đang tắt, dựng lại nếu vừa được bật */
		refresh: function () {
			document.querySelectorAll('.ts-box').forEach(function (b) {
				var act = acts.get(b) || b.dataset.action || '';
				if (off(act)) {
					b.hidden = true;
				} else if (b.hidden && !ids.has(b)) {
					b.hidden = false;
					acts.delete(b);
					api.mount(b, act);
				}
			});
		},
		reset: function (el) {
			var b = boxOf(el), id = b && ids.get(b);
			if (id != null && window.turnstile) {
				b.dataset.ok = '';
				window.turnstile.reset(id);
			}
		}
	};
	function auto() {
		document.querySelectorAll('form[data-auth="login"], form[data-auth="register"], form[data-auth="forgot"], form[data-api="booking"]').forEach(function (f) {
			var action = f.dataset.auth || f.dataset.api, btn = f.querySelector('button.btn') || f.querySelector('button');
			var box = document.createElement('div');
			box.className = 'ts-box';
			box.dataset.action = action;
			if (btn) {
				btn.parentNode.insertBefore(box, btn);
			} else {
				f.appendChild(box);
			}
			api.mount(box, action);
		});
	}
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', auto);
	} else {
		auto();
	}
})();
