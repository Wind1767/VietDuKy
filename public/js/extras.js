/* Tính năng bổ sung cho trang chủ: lọc/sắp xếp tour, so sánh tour, chia sẻ tour,
(thanh tiến độ cuộn và nút lên đầu trang do main.js đảm nhiệm, không thêm lần nữa ở đây). Chạy độc lập, không sửa main.js. */
(function () {
	'use strict';

	function h(tag, attrs, kids) {
		var el = document.createElement(tag);
		Object.keys(attrs || {}).forEach(function (k) {
			if (k === 'text') {
				el.textContent = attrs[k];
			} else if (k === 'class') {
				el.className = attrs[k];
			} else {
				el.setAttribute(k, attrs[k]);
			}
		});
		(kids || []).forEach(function (c) {
			el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
		});
		return el;
	}
	function icon(name, filled) {
		return h('span', {
			class: 'ms' + (filled ? ' fill' : ''),
			'aria-hidden': 'true',
			text: name
		});
	}
	function money(n) {
		return Number(n).toLocaleString('vi-VN') + 'đ';
	}
	function store(key, val) {
		try {
			if (val === undefined) {
				return JSON.parse(sessionStorage.getItem(key) || 'null');
			}
			sessionStorage.setItem(key, JSON.stringify(val));
		} catch (e) {}
		return null;
	}
	var toastTimer = null, toastEl = null;
	function toast(msg) {
		if (!toastEl) {
			toastEl = h('div', {
				class: 'x-toast',
				role: 'status',
				'aria-live': 'polite'
			});
			document.body.appendChild(toastEl);
		}
		toastEl.textContent = msg;
		toastEl.classList.add('on');
		clearTimeout(toastTimer);
		toastTimer = setTimeout(function () {
			toastEl.classList.remove('on');
		}, 2200);
	}

	/* ---------- Dữ liệu tour đọc từ thẻ trên trang ---------- */
	function readCard(c) {
		var pr = c.querySelector('.pr b'), meta = c.querySelectorAll('.meta > span'), rate = c.querySelector('.rate');
		var digits = pr ? pr.textContent.replace(/\D/g, '') : '';
		var rm = rate ? rate.textContent.match(/(\d+(?:[.,]\d+)?)\s*\((\d+)/) : null;
		var im = c.querySelector('.im img'), bdg = c.querySelector('.bdg'), go = c.querySelector('.pr a');
		return {
			slug: c.dataset.fav,
			name: (c.querySelector('h3') || {}).textContent || c.dataset.fav,
			price: digits ? Number(digits) : null,
			duration: meta[0] ? meta[0].textContent.replace('schedule', '').trim() : '',
			group: meta[1] ? meta[1].textContent.replace('group', '').trim() : '',
			rating: rm ? Number(rm[1].replace(',', '.')) : null,
			ratingCount: rm ? Number(rm[2]) : 0,
			badge: bdg && !bdg.hidden ? bdg.textContent.trim() : '',
			sale: !!c.querySelector('.old') || /giảm/i.test(bdg ? bdg.textContent : ''),
			img: im ? im.currentSrc || im.src : '',
			href: go ? go.getAttribute('href') : '/contact'
		};
	}

	/* ---------- Lọc, tìm kiếm, sắp xếp tour ---------- */
	function initTours() {
		var grid = document.querySelector('.tours');
		if (!grid) {
			return;
		}
		var state = {
			q: '',
			sort: 'def',
			sale: false
		}, wasAll = null, order = 0, obs;
		var count = h('span', { class: 'x-count', 'aria-live': 'polite' });
		var input = h('input', {
			type: 'search',
			placeholder: 'Tìm tour theo tên…',
			'aria-label': 'Tìm tour',
			autocomplete: 'off'
		});
		var sorts = [['def', 'Mặc định'], ['asc', 'Giá tăng dần'], ['desc', 'Giá giảm dần'], ['rate', 'Đánh giá cao']];
		var sortBtns = sorts.map(function (s) {
			var b = h('button', {
				type: 'button',
				'data-sort': s[0],
				text: s[1]
			});
			b.onclick = function () {
				state.sort = s[0];
				apply();
			};
			return b;
		});
		var saleBtn = h('button', { type: 'button', class: 'x-chip' }, [icon('sell'), ' Đang ưu đãi']);
		saleBtn.onclick = function () {
			state.sale = !state.sale;
			apply();
		};
		var clear = h('button', {
			type: 'button',
			class: 'x-clear',
			text: 'Xoá bộ lọc'
		});
		clear.onclick = function () {
			state = {
				q: '',
				sort: 'def',
				sale: false
			};
			input.value = '';
			apply();
		};
		var bar = h('div', { class: 'x-bar wrap' }, [
			h('label', { class: 'x-search' }, [icon('search'), input]),
			h('div', {
				class: 'x-sorts',
				role: 'group',
				'aria-label': 'Sắp xếp'
			}, sortBtns),
			saleBtn,
			h('div', { class: 'x-meta' }, [count, clear])
		]);
		var empty = h('p', { class: 'x-empty', hidden: '' }, ['Không có tour nào khớp bộ lọc. ']);
		grid.parentNode.insertBefore(bar, grid);
		grid.parentNode.insertBefore(empty, grid.nextSibling);
		input.oninput = function () {
			state.q = input.value;
			apply();
		};

		function plain(s) {
			return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
		}
		function apply() {
			if (obs) {
				obs.disconnect();
			}
			var cards = Array.prototype.slice.call(grid.querySelectorAll(':scope > .tour')).filter(function (c) {
				return !c.hidden;
			});
			cards.forEach(function (c) {
				if (!c.dataset.xi) {
					c.dataset.xi = String(order++);
				}
			});
			var q = plain(state.q.trim()), active = !!(q || state.sale || state.sort !== 'def');
			var infos = cards.map(function (c) {
				return {
					c: c,
					d: readCard(c),
					i: Number(c.dataset.xi)
				};
			});
			infos.sort(function (a, b) {
				if (state.sort === 'asc' || state.sort === 'desc') {
					var pa = a.d.price == null ? Infinity : a.d.price, pb = b.d.price == null ? Infinity : b.d.price;
					if (pa !== pb) {
						return state.sort === 'asc' ? pa - pb : (pb === Infinity ? -1 : pa === Infinity ? 1 : pb - pa);
					}
				} else if (state.sort === 'rate') {
					var ra = a.d.rating == null ? -1 : a.d.rating, rb = b.d.rating == null ? -1 : b.d.rating;
					if (ra !== rb) {
						return rb - ra;
					}
				}
				return a.i - b.i;
			});
			var shown = 0;
			infos.forEach(function (o) {
				grid.appendChild(o.c);
				var ok = (!q || plain(o.d.name).indexOf(q) >= 0) && (!state.sale || o.d.sale);
				o.c.classList.toggle('x-off', !ok);
				if (ok) {
					shown++;
					o.c.classList.add('in');
				}
			});
			/* Đang lọc thì mở hết tour (tạm) để không bị nút "Tất cả tour" che mất kết quả */
			if (active && wasAll === null) {
				wasAll = grid.classList.contains('all');
				grid.classList.add('all');
			} else if (!active && wasAll !== null) {
				grid.classList.toggle('all', wasAll);
				wasAll = null;
			}
			sortBtns.forEach(function (b) {
				b.classList.toggle('on', b.dataset.sort === state.sort);
				b.setAttribute('aria-pressed', b.dataset.sort === state.sort);
			});
			saleBtn.classList.toggle('on', state.sale);
			saleBtn.setAttribute('aria-pressed', state.sale);
			clear.hidden = !active;
			count.textContent = active ? shown + '/' + cards.length + ' tour' : cards.length + ' tour';
			empty.hidden = shown > 0;
			refreshCompare();
			watch();
		}
		var pending = 0;
		function watch() {
			if (!obs) {
				obs = new MutationObserver(function () {
					clearTimeout(pending);
					pending = setTimeout(function () {
						decorate();
						apply();
					}, 120);
				});
			}
			obs.observe(grid, {
				childList: true,
				subtree: true,
				characterData: true
			});
		}
		window.vdkToursApply = apply;
		decorate();
		apply();
	}

	/* ---------- Nút chia sẻ + nút so sánh trên mỗi thẻ tour ---------- */
	var picked = (store('vdk-compare') || []).slice(0, 3);
	function decorate() {
		document.querySelectorAll('.tours > .tour[data-fav]').forEach(function (c) {
			var im = c.querySelector('.im');
			if (!im || im.querySelector('.x-tools')) {
				return;
			}
			var slug = c.dataset.fav;
			var cmp = h('button', {
				type: 'button',
				class: 'x-cmp',
				'data-slug': slug,
				'aria-pressed': 'false',
				'aria-label': 'Chọn để so sánh'
			}, [icon('compare_arrows'), h('span', { text: 'So sánh' })]);
			var sh = h('button', {
				type: 'button',
				class: 'x-share',
				'aria-label': 'Chia sẻ tour'
			}, [icon('share')]);
			cmp.onclick = function (e) {
				e.preventDefault();
				e.stopPropagation();
				var i = picked.indexOf(slug);
				if (i >= 0) {
					picked.splice(i, 1);
				} else if (picked.length >= 3) {
					toast('Chỉ so sánh được tối đa 3 tour cùng lúc');
					return;
				} else {
					picked.push(slug);
				}
				store('vdk-compare', picked);
				refreshCompare();
			};
			sh.onclick = function (e) {
				e.preventDefault();
				e.stopPropagation();
				var d = readCard(c), url = location.origin + '/#tour';
				var text = d.name + (d.price ? ' – chỉ từ ' + money(d.price) : '') + ' | Việt Du Ký';
				if (navigator.share) {
					navigator.share({
						title: d.name,
						text: text,
						url: url
					}).catch(function () {});
				} else if (navigator.clipboard && navigator.clipboard.writeText) {
					navigator.clipboard.writeText(text + ' ' + url).then(function () {
						toast('Đã sao chép liên kết tour');
					}, function () {
						toast('Không sao chép được liên kết');
					});
				} else {
					toast('Trình duyệt chưa hỗ trợ chia sẻ');
				}
			};
			im.appendChild(h('div', { class: 'x-tools' }, [cmp, sh]));
		});
	}

	/* ---------- Thanh so sánh + hộp thoại so sánh ---------- */
	var tray, trayInfo, trayGo, modal, lastFocus;
	function cardOf(slug) {
		return document.querySelector('.tours > .tour[data-fav="' +
			(window.CSS && CSS.escape ? CSS.escape(slug) : slug) + '"]');
	}
	function refreshCompare() {
		picked = picked.filter(function (s) {
			return cardOf(s);
		});
		document.querySelectorAll('.x-cmp').forEach(function (b) {
			var on = picked.indexOf(b.dataset.slug) >= 0;
			b.classList.toggle('on', on);
			b.setAttribute('aria-pressed', on);
			b.firstChild.textContent = on ? 'check' : 'compare_arrows';
			b.lastChild.textContent = on ? 'Đã chọn' : 'So sánh';
		});
		if (!tray) {
			return;
		}
		tray.classList.toggle('on', picked.length > 0);
		trayInfo.textContent = 'Đã chọn ' + picked.length + '/3 tour';
		trayGo.disabled = picked.length < 2;
		trayGo.textContent = picked.length < 2 ? 'Chọn thêm 1 tour' : 'So sánh ngay';
	}
	function buildTray() {
		trayInfo = h('b');
		trayGo = h('button', { type: 'button', class: 'btn gold' });
		var reset = h('button', {
			type: 'button',
			class: 'x-clear',
			text: 'Bỏ chọn'
		});
		reset.onclick = function () {
			picked = [];
			store('vdk-compare', picked);
			refreshCompare();
		};
		trayGo.onclick = openModal;
		tray = h('div', {
			class: 'x-tray',
			role: 'region',
			'aria-label': 'So sánh tour'
		}, [trayInfo, h('div', { class: 'x-tray-r' }, [reset, trayGo])]);
		document.body.appendChild(tray);
	}
	function closeModal() {
		if (modal) {
			modal.remove();
			modal = null;
			document.documentElement.classList.remove('lock');
			if (lastFocus && lastFocus.focus) {
				lastFocus.focus();
			}
		}
	}
	function openModal() {
		var list = picked.map(function (s) {
			var c = cardOf(s);
			return c ? readCard(c) : null;
		}).filter(Boolean);
		if (list.length < 2) {
			return;
		}
		lastFocus = document.activeElement;
		var prices = list.map(function (t) {
			return t.price;
		}).filter(function (p) {
			return p != null;
		});
		var best = prices.length ? Math.min.apply(null, prices) : null;
		var tbl = h('table', { class: 'x-table' });
		function row(label, fn) {
			var tr = h('tr', {}, [h('th', { scope: 'row', text: label })]);
			list.forEach(function (t) {
				var td = h('td');
				var v = fn(t);
				if (v && v.nodeType) {
					td.appendChild(v);
				} else {
					td.textContent = v || '—';
				}
				tr.appendChild(td);
			});
			tbl.appendChild(tr);
		}
		var head = h('tr', {}, [h('td')]);
		list.forEach(function (t) {
			var th = h('th', { scope: 'col' }, [t.img ? h('img', {
					src: t.img,
					alt: '',
					loading: 'lazy'
				}) : '', h('span', { text: t.name })]);
			head.appendChild(th);
		});
		tbl.appendChild(h('thead', {}, [head]));
		row('Giá từ', function (t) {
			if (t.price == null) {
				return 'Liên hệ';
			}
			var s = h('b', { text: money(t.price) });
			if (t.price === best && prices.length > 1) {
				s.appendChild(h('em', { class: 'x-best', text: 'Rẻ nhất' }));
			}
			return s;
		});
		row('Thời gian', function (t) {
			return t.duration;
		});
		row('Số khách', function (t) {
			return t.group;
		});
		row('Đánh giá', function (t) {
			return t.rating == null ? 'Chưa có đánh giá' : String(t.rating).replace('.', ',') + '/5 (' +
				t.ratingCount + ' đánh giá)';
		});
		row('Ưu đãi', function (t) {
			return t.badge;
		});
		row('', function (t) {
			return h('a', {
				class: 'btn gold',
				href: t.href,
				text: 'Đặt tour'
			});
		});
		var close = h('button', {
			type: 'button',
			class: 'x-x',
			'aria-label': 'Đóng'
		}, [icon('close')]);
		close.onclick = closeModal;
		var box = h('div', {
			class: 'x-modal-box',
			role: 'dialog',
			'aria-modal': 'true',
			'aria-label': 'So sánh tour'
		}, [
			close, h('h3', { text: 'So sánh tour' }), h('div', { class: 'x-scroll' }, [tbl])
		]);
		modal = h('div', { class: 'x-modal' }, [box]);
		modal.addEventListener('mousedown', function (e) {
			if (e.target === modal) {
				closeModal();
			}
		});
		document.body.appendChild(modal);
		document.documentElement.classList.add('lock');
		close.focus();
	}
	document.addEventListener('keydown', function (e) {
		if (e.key === 'Escape') {
			closeModal();
		}
	});

	function init() {
		buildTray();
		initTours();
		refreshCompare();
	}
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
