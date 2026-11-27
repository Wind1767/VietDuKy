/* Dựng khối nội dung tự tạo (trang chủ) và trang mới (/p/ten-trang).
Chỉ dùng textContent / thuộc tính đã escape: nội dung do quản trị nhập không bao giờ thành HTML. */
(function () {
	'use strict';
	function esc(s) {
		return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
			return {
				'&': '&amp;',
				'<': '&lt;',
				'>': '&gt;',
				'"': '&quot;',
				"'": '&#39;'
			}[c];
		});
	}
	function img(u) {
		return /^https:\/\//i.test(u) ? u : '/' + String(u).replace(/^\/+/, '');
	}
	function url(u) {
		return /^(https:\/\/|\/(?!\/)|tel:|mailto:)/i.test(u) ? u : '/';
	}
	function paras(t) {
		return String(t || '').split(/\n+/).filter(function (x) {
			return x.trim();
		}).map(function (x) {
			return '<p>' + esc(x) + '</p>';
		}).join('');
	}

	/* Trả về HTML của một khối; id (nếu có) gắn data-block để site.js bật/tắt và sắp xếp */
	function html(b, id) {
		var bg = ['plain', 'tint', 'brand'].indexOf(b.bg) > -1 ? b.bg : 'plain';
		var head = (b.title ? '<h2>' + esc(b.title) + '</h2>' : '') +
			(b.sub ? '<p class="cb-sub">' + esc(b.sub) +
				'</p>' : '');
		var btn = b.btn_text && b.btn_url ? '<p class="cb-btn"><a class="btn ' + (bg === 'brand' ? 'gold' : '') +
			'" href="' + esc(url(b.btn_url)) + '">' + esc(b.btn_text) + '</a></p>' : '';
		var inner;
		if (b.kind === 'image' && b.image) {
			inner = '<div class="cb-two ' + (b.side === 'left' ? 'left' : 'right') + '"><img src="' +
				esc(img(b.image)) + '" alt="' + esc(b.title || '') + '" loading="lazy" decoding="async"><div>' +
				head + '<div class="cb-text">' + paras(b.text) + '</div>' + btn + '</div></div>';
		} else if (b.kind === 'cards') {
			inner = (head ? '<div class="cb-head">' + head + '</div>' : '') + (b.text ? '<div class="cb-text cb-intro">' +
				paras(b.text) + '</div>' : '') +
				'<div class="cb-cards">' + (b.items || []).map(function (it) {
				return '<div class="cb-card"><span class="ms">' + esc(it.icon) + '</span>' +
					(it.title ? '<h3>' +
						esc(it.title) + '</h3>' : '') +
					(it.text ? '<p>' +
						esc(it.text) + '</p>' : '') + '</div>';
			}).join('') + '</div>' + (btn ? '<div class="cb-center">' + btn + '</div>' : '');
		} else {
			inner = (head ? '<div class="cb-head">' + head + '</div>' : '') + '<div class="cb-text">' +
				paras(b.text) + '</div>' + (btn ? '<div class="cb-center">' +
				btn + '</div>' : '');
		}
		return '<section class="cb cb-' + bg + '"' + (id ? ' data-block="' + esc(id) + '"' : '') +
			'><div class="wrap">' + inner + '</div></section>';
	}
	window.vdkBlockHTML = html;

	/* Trang chủ: thêm các khối tự tạo trước mốc #blkEnd rồi để site.js sắp xếp theo cài đặt */
	var end = document.getElementById('blkEnd');
	if (end && window.fetch) {
		fetch('/api/blocks').then(function (r) {
			return r.ok ? r.json() : null;
		}).then(function (d) {
			if (!d || !d.items) {
				return;
			}
			d.items.forEach(function (it) {
				if (document.querySelector('[data-block="' + it.id + '"]')) {
					return;
				}
				end.insertAdjacentHTML('beforebegin', html(it.data || {}, it.id));
			});
			if (window.vdkSiteApply) {
				window.vdkSiteApply();
			}
		}).catch(function () {});
	}

	/* Trang mới: /p/ten-trang */
	var root = document.getElementById('pgRoot');
	if (root) {
		var slug = location.pathname.replace(/\/+$/, '').split('/').pop();
		var brand = function () {
			return (window.VDK_SITE && window.VDK_SITE.site_name) || 'Việt Du Ký';
		};
		fetch('/api/pages/' + encodeURIComponent(slug)).then(function (r) {
			return r.json().then(function (d) {
				return { ok: r.ok, d: d };
			});
		}).then(function (x) {
			if (!x.ok || !x.d.page) {
				throw new Error('404');
			}
			var p = x.d.page;
			document.title = p.title + ' – ' + brand();
			var md = document.querySelector('meta[name="description"]');
			if (md && p.desc) {
				md.setAttribute('content', p.desc);
			}
			root.innerHTML = '<header class="pg-h"><div class="wrap"><h1>' + esc(p.title) + '</h1>' + (p.desc ? '<p>' +
				esc(p.desc) + '</p>' : '') + '</div></header>' + p.blocks.map(function (b) {
				return html(b);
			}).join('');
		}).catch(function () {
			document.title = 'Không tìm thấy trang – ' + brand();
			root.innerHTML = '<header class="pg-h"><div class="wrap"><h1>Không tìm thấy trang</h1><p>Trang này không tồn tại hoặc đã được ẩn.</p></div></header><section class="cb"><div class="wrap cb-center"><a class="btn" href="/">Về trang chủ</a></div></section>';
		});
	}
})();
