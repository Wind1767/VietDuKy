/* Trang hòm thư của khách */
(function () {
	'use strict';
	var box = document.getElementById('inbox');
	if (!box) {
		return;
	}
	var ICON = { post: 'description', booking: 'luggage', bug: 'warning', review: 'star', admin: 'campaign', system: 'mail' };
	function esc(v) {
		return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
		});
	}
	function hm(ms) {
		return new Date(ms).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
	}
	function dayKey(ms) {
		var d = new Date(ms);
		return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
	}
	/* Chữ ngày: "Hôm nay, 21/11/2026", "Hôm qua, 20/11/2026", còn lại chỉ ghi ngày "19/11/2026" */
	function dayText(ms) {
		var now = Date.now(), date = new Date(ms).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
		if (dayKey(ms) === dayKey(now)) {
			return 'Hôm nay, ' + date;
		}
		if (dayKey(ms) === dayKey(now - 86400000)) {
			return 'Hôm qua, ' + date;
		}
		return date;
	}
	function when(ms) {
		return dayText(ms) + ' lúc ' + hm(ms);
	}
	function safe(u) {
		return /^(\/(?!\/)|https:\/\/)/.test(u || '') ? u : '';
	}
	function post(body) {
		return fetch('/api/inbox/read', {
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		}).catch(function () {});
	}
	function setBell(n) {
		var b = document.getElementById('bellN');
		if (b) {
			b.hidden = !n;
			b.textContent = n > 99 ? '99+' : n;
		}
	}
	function send(method, url) {
		return fetch(url, { method: method, credentials: 'same-origin' }).catch(function () {});
	}
	function draw(d) {
		if (!d.items.length) {
			box.innerHTML = '<p class="inbox-empty"><span class="ms">mail</span>Hòm thư trống. Thông báo mới sẽ hiện ở đây.</p>';
			return;
		}
		var last = '';
		box.innerHTML = '<div class="inbox-top"><span class="inbox-count">' + d.items.length + ' thông báo</span>' +
			(d.unread ? '<button class="btn line sm" id="readAll" type="button"><span class="ms">done_all</span>Đánh dấu đã đọc tất cả</button>' : '') +
			'<button class="btn line sm" id="delAll" type="button"><span class="ms">delete</span>Xoá tất cả</button></div>' +
			d.items.map(function (n, i) {
				var l = safe(n.link), head = '', isPost = n.kind === 'post', k = dayKey(n.created_at);
				if (k !== last) {
					last = k;
					head = '<h2 class="inbox-day">' + esc(dayText(n.created_at)) + '</h2>';
				}
				return head + '<article class="inbox-item' + (n.read ? '' : ' unread') + (isPost ? ' post' : '') + '" data-id="' + n.id + '" style="animation-delay:' + Math.min(i, 8) * 0.06 + 's">' +
					'<span class="ms inbox-ic">' + (ICON[n.kind] || 'mail') + '</span><div class="inbox-bd"><h3>' + (isPost ? '<a href="/inbox?id=' + n.id + '">' + esc(n.title) + '</a>' : esc(n.title)) + '</h3>' +
					'<time datetime="' + new Date(n.created_at).toISOString() + '" title="' + esc(when(n.created_at)) + '">' + esc(dayText(n.created_at)) + ' · ' + hm(n.created_at) + '</time>' +
					(!isPost && n.body ? '<p>' + esc(n.body) + '</p>' : '') +
					(!isPost && n.image && /^https:\/\//.test(n.image) ? '<img src="' + esc(n.image) + '" alt="" loading="lazy">' : '') +
					(!isPost && l ? '<a class="btn line sm" href="' + esc(l) + '">Xem chi tiết</a>' : '') + '</div>' +
					'<button class="inbox-del" type="button" aria-label="Xoá thông báo" title="Xoá"><span class="ms">delete</span></button></article>';
			}).join('');
		var all = document.getElementById('readAll');
		if (all) {
			all.onclick = function () {
				post({ all: true }).then(load);
			};
		}
		document.getElementById('delAll').onclick = function () {
			if (confirm('Xoá tất cả thông báo trong hòm thư?')) {
				send('DELETE', '/api/inbox').then(load);
			}
		};
		box.querySelectorAll('.inbox-del').forEach(function (b) {
			b.addEventListener('click', function (e) {
				e.stopPropagation();
				var el = b.closest('.inbox-item');
				send('DELETE', '/api/inbox/' + el.dataset.id).then(load);
			});
		});
		/* Bài viết: bấm vào bất kỳ đâu trên thẻ là mở trang đọc */
		box.querySelectorAll('.inbox-item.post').forEach(function (el) {
			el.addEventListener('click', function (e) {
				if (!e.target.closest('.inbox-del, a')) {
					location.href = '/inbox?id=' + el.dataset.id;
				}
			});
		});
		box.querySelectorAll('.inbox-item.unread').forEach(function (el) {
			el.addEventListener('click', function () {
				el.classList.remove('unread');
				post({ id: Number(el.dataset.id) });
				var left = box.querySelectorAll('.inbox-item.unread').length;
				setBell(left);
			});
		});
	}
	/* Trang đọc một bài viết đầy đủ: /inbox?id=123 */
	function reader(id) {
		fetch('/api/inbox/' + id, { credentials: 'same-origin' }).then(function (r) {
			if (r.status === 401) {
				location.href = '/login?next=' + encodeURIComponent('/inbox?id=' + id);
				return null;
			}
			return r.ok ? r.json() : { missing: true };
		}).then(function (d) {
			if (!d) {
				return;
			}
			var back = '<a class="btn line sm" href="/inbox"><span class="ms">arrow_back</span>Về hòm thư</a>';
			if (d.missing) {
				box.innerHTML = '<div class="inbox-top">' + back + '</div><p class="inbox-empty">Không tìm thấy thông báo này (có thể đã bị xoá).</p>';
				return;
			}
			var n = d.item, l = safe(n.link);
			box.innerHTML = '<div class="inbox-top">' + back + '<button class="btn line sm" id="delOne" type="button"><span class="ms">delete</span>Xoá</button></div>' +
				'<article class="inbox-full"><h2>' + esc(n.title) + '</h2><time datetime="' + new Date(n.created_at).toISOString() + '">' + esc(when(n.created_at)) + '</time>' +
				(n.image && /^https:\/\//.test(n.image) ? '<img src="' + esc(n.image) + '" alt="" loading="lazy">' : '') +
				'<div class="md">' + (window.vdkMd ? window.vdkMd.render(n.body) : '<p>' + esc(n.body) + '</p>') + '</div>' +
				(l ? '<a class="btn line sm" href="' + esc(l) + '">Xem chi tiết</a>' : '') + '</article>';
			document.getElementById('delOne').onclick = function () {
				if (confirm('Xoá thông báo này?')) {
					send('DELETE', '/api/inbox/' + n.id).then(function () {
						location.href = '/inbox';
					});
				}
			};
			fetch('/api/inbox/count', { credentials: 'same-origin' }).then(function (r) {
				return r.json();
			}).then(function (c) {
				setBell(c.unread);
			}).catch(function () {});
		}).catch(function () {
			box.innerHTML = '<p class="inbox-empty">Không tải được bài viết. Vui lòng thử lại.</p>';
		});
	}
	function load() {
		fetch('/api/inbox', { credentials: 'same-origin' }).then(function (r) {
			if (r.status === 401) {
				location.href = '/login?next=' + encodeURIComponent('/inbox');
				return null;
			}
			return r.json();
		}).then(function (d) {
			if (d) {
				draw(d);
				setBell(d.unread);
			}
		}).catch(function () {
			box.innerHTML = '<p class="inbox-empty">Không tải được hòm thư. Vui lòng thử lại.</p>';
		});
	}
	var qid = Number(new URLSearchParams(location.search).get('id'));
	function start() {
		if (qid > 0) {
			reader(qid);
		} else {
			load();
		}
	}
	/* md.js nạp defer nên có thể chưa sẵn sàng khi script này chạy */
	if (qid > 0 && !window.vdkMd) {
		window.addEventListener('load', start);
	} else {
		start();
	}
})();
