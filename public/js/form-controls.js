/* Nếu máy chủ/Cloudflare gửi CSP "trusted-types … default", mọi innerHTML sẽ bị chặn và dropdown tuỳ biến rơi về <select> mặc định.
Tạo policy "default" cho phép chuỗi đi qua (nội dung đã được escape ở nơi dùng). */
(function () {
	if (window.trustedTypes && trustedTypes.createPolicy && !trustedTypes.defaultPolicy) {
		try {
			trustedTypes.createPolicy('default', {
				createHTML: function (s) {
					return s;
				},
				createScriptURL: function (s) {
					return s;
				}
			});
		} catch (e) { /* policy đã có hoặc không được phép */ }
	}
})();
/* Dropdown và chọn ngày tuỳ biến dùng chung (trang khách + quản trị).
Giữ nguyên <select>/<input> gốc (ẩn) để form vẫn gửi đúng giá trị; tự nhận các control được vẽ thêm sau (admin render động). */
(function () {
	'use strict';
	var MONTHS = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];
	var DOW = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
	var pop = null, owner = null, syncs = [];
	function pad(n) {
		return (n < 10 ? '0' : '') + n;
	}
	function iso(d) {
		return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
	}
	function today() {
		var d = new Date();
		return new Date(d.getFullYear(), d.getMonth(), d.getDate());
	}
	function vn(s) {
		return s ? s.split('-').reverse().join('/') : '';
	}
	function esc(s) {
		return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
	}
	function el(tag, cls, html) {
		var e = document.createElement(tag);
		if (cls) {
			e.className = cls;
		}
		if (html != null) {
			e.innerHTML = html;
		}
		return e;
	}
	function allowPast() {
		return document.body.hasAttribute('data-vui-past');
	}
	function close() {
		if (pop) {
			pop.remove();
			pop = null;
		}
		if (owner) {
			owner.setAttribute('aria-expanded', 'false');
			owner.classList.remove('open');
			owner = null;
		}
	}
	function place(btn) {
		var r = btn.getBoundingClientRect(), cal = pop.classList.contains('vui-cal');
		var w = cal ? 288 : Math.max(r.width, 160);
		var list = pop.querySelector('.vui-list');
		pop.style.width = w + 'px';
		pop.style.maxWidth = 'calc(100vw - 16px)';
		pop.style.left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - pop.offsetWidth - 8)) +
			'px';
		var below = window.innerHeight - r.bottom - 14, above = r.top - 14;
		var up = pop.offsetHeight > below && above > below;
		var room = Math.max(120, up ? above : below);
		if (list) {
			list.style.maxHeight = Math.min(320, room - 16) + 'px';
		}
		var h = pop.offsetHeight;
		if (up) {
			pop.style.top = Math.max(8, r.top - h - 6) + 'px';
			pop.classList.add('up');
		} else {
			pop.style.top = (r.bottom + 6) + 'px';
			pop.classList.remove('up');
		}
	}
	function open(btn, build) {
		if (owner === btn) {
			close();
			return;
		}
		close();
		owner = btn;
		btn.setAttribute('aria-expanded', 'true');
		btn.classList.add('open');
		pop = el('div', 'vui-pop');
		build(pop);
		document.body.appendChild(pop);
		place(btn);
	}
	document.addEventListener('pointerdown', function (e) {
		if (pop && !pop.contains(e.target) && !(owner && owner.contains(e.target))) {
			close();
		}
	});
	document.addEventListener('keydown', function (e) {
		if (e.key === 'Escape' && pop) {
			var b = owner;
			close();
			if (b) {
				b.focus();
			}
		}
	});
	window.addEventListener('resize', close);
	window.addEventListener('scroll', function (e) {
		if (pop && !pop.contains(e.target)) {
			close();
		}
	}, true);

	function fire(n) {
		n.dispatchEvent(new Event('input', { bubbles: true }));
		n.dispatchEvent(new Event('change', { bubbles: true }));
	}

	function enhanceSelect(sel) {
		if (sel.dataset.vui) {
			return;
		}
		sel.dataset.vui = '1';
		var btn = el('button', 'vui-btn');
		btn.type = 'button';
		btn.setAttribute('aria-haspopup', 'listbox');
		btn.setAttribute('aria-expanded', 'false');
		btn.setAttribute('aria-label', sel.getAttribute('aria-label') || '');
		sel.classList.add('vui-native');
		sel.tabIndex = -1;
		sel.setAttribute('aria-hidden', 'true');
		sel.parentNode.insertBefore(btn, sel.nextSibling);
		var last = null;
		function sync() {
			var o = sel.options[sel.selectedIndex], t = o ? o.textContent.trim() : '', key = t + '|' + sel.value +
				'|' + sel.disabled;
			if (key === last) {
				return;
			}
			last = key;
			btn.disabled = sel.disabled;
			btn.innerHTML = '<span class="vui-t' + (sel.value ? '' : ' vui-ph') + '">' + esc(t) +
				'</span><span class="ms">expand_more</span>';
		}
		sel._vsync = sync;
		syncs.push(sel);
		sync();
		sel.addEventListener('change', sync);
		if (sel.form) {
			sel.form.addEventListener('reset', function () {
				setTimeout(sync, 0);
			});
		}
		btn.addEventListener('click', function (e) {
			e.preventDefault();
			open(btn, function (p) {
				p.classList.add('vui-list');
				p.setAttribute('role', 'listbox');
				var lastGrp = null;
				Array.prototype.forEach.call(sel.options, function (o, i) {
					var g = o.parentNode && o.parentNode.tagName === 'OPTGROUP' ? o.parentNode : null;
					if (g !== lastGrp) {
						lastGrp = g;
						if (g) {
							p.appendChild(el('div', 'vui-grp', esc(g.label)));
						}
					}
					var on = i === sel.selectedIndex;
					var it = el('button', 'vui-opt' + (on ? ' on' : ''), '<span>' + esc(o.textContent.trim()) +
						'</span>' + (on ? '<span class="ms">check</span>' : ''));
					it.type = 'button';
					it.setAttribute('role', 'option');
					it.disabled = o.disabled;
					if (g) {
						it.classList.add('in-grp');
					}
					it.onclick = function () {
						sel.selectedIndex = i;
						fire(sel);
						close();
						btn.focus();
					};
					p.appendChild(it);
				});
				var cur = p.querySelector('.on');
				if (cur) {
					setTimeout(function () {
						cur.scrollIntoView({ block: 'nearest' });
					}, 0);
				}
			});
		});
		btn.addEventListener('keydown', function (e) {
			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				e.preventDefault();
				var n = sel.selectedIndex + (e.key === 'ArrowDown' ? 1 : -1);
				if (n >= 0 && n < sel.options.length) {
					sel.selectedIndex = n;
					fire(sel);
				}
			}
		});
	}

	function enhanceDate(inp) {
		if (inp.dataset.vui) {
			return;
		}
		inp.dataset.vui = '1';
		var past = allowPast(), tIso = iso(today());
		if (!past) {
			inp.min = tIso;
			if (inp.value && inp.value < tIso) {
				inp.value = '';
			}
		}
		var btn = el('button', 'vui-btn');
		btn.type = 'button';
		btn.setAttribute('aria-haspopup', 'dialog');
		btn.setAttribute('aria-expanded', 'false');
		btn.setAttribute('aria-label', inp.getAttribute('aria-label') || 'Chọn ngày');
		inp.classList.add('vui-native');
		inp.tabIndex = -1;
		inp.setAttribute('aria-hidden', 'true');
		inp.parentNode.insertBefore(btn, inp.nextSibling);
		var last = null;
		function sync() {
			var key = inp.value + '|' + inp.disabled;
			if (key === last) {
				return;
			}
			last = key;
			btn.disabled = inp.disabled;
			btn.innerHTML = '<span class="vui-t' + (inp.value ? '' : ' vui-ph') + '">' +
				(inp.value ? vn(inp.value) : 'Chọn ngày') + '</span><span class="ms">calendar_month</span>';
		}
		inp._vsync = sync;
		syncs.push(inp);
		sync();
		inp.addEventListener('change', sync);
		if (inp.form) {
			inp.form.addEventListener('reset', function () {
				setTimeout(sync, 0);
			});
		}
		btn.addEventListener('click', function (e) {
			e.preventDefault();
			open(btn, function (p) {
				p.classList.add('vui-cal');
				var min = inp.min || '', max = inp.max || '';
				var base = inp.value ? new Date(inp.value + 'T00:00:00') : (max && max < tIso ? new Date(max +
					'T00:00:00') : today()), y = base.getFullYear(), m = base.getMonth();
				function draw() {
					p.innerHTML = '';
					var head = el('div', 'vui-h'), prev = el('button', 'vui-nav', '<span class="ms">chevron_left</span>'), next = el('button', 'vui-nav', '<span class="ms">chevron_right</span>');
					prev.type = next.type = 'button';
					var firstOfMonth = iso(new Date(y, m, 1)), lastOfMonth = iso(new Date(y, m + 1, 0));
					prev.disabled = !!min && min > firstOfMonth;
					next.disabled = !!max && max < iso(new Date(y, m + 1, 1));
					prev.onclick = function () {
						if (--m < 0) {
							m = 11;
							y--;
						}
						draw();
					};
					next.onclick = function () {
						if (++m > 11) {
							m = 0;
							y++;
						}
						draw();
					};
					head.appendChild(prev);
					head.appendChild(el('b', '', MONTHS[m] + ' ' + y));
					head.appendChild(next);
					p.appendChild(head);
					var g = el('div', 'vui-g');
					DOW.forEach(function (d) {
						g.appendChild(el('span', 'vui-w', d));
					});
					var first = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
					for (var i = 0; i < first; i++) {
						g.appendChild(el('span'));
					}
					for (var d = 1; d <= days; d++) {
						(function (d) {
							var s = iso(new Date(y, m, d)), c = el('button', 'vui-d' + (s === inp.value ? ' on' : '') +
								(s === tIso ? ' td' : ''), d);
							c.type = 'button';
							if ((min && s < min) || (max && s > max)) {
								c.disabled = true;
							}
							c.onclick = function () {
								inp.value = s;
								fire(inp);
								close();
								btn.focus();
							};
							g.appendChild(c);
						})(d);
					}
					p.appendChild(g);
					var foot = el('div', 'vui-f'), clr = el('button', 'vui-link', 'Xoá'), tdy = el('button', 'vui-link', 'Hôm nay');
					clr.type = tdy.type = 'button';
					clr.onclick = function () {
						inp.value = '';
						fire(inp);
						close();
					};
					tdy.disabled = (min && tIso < min) || (max && tIso > max);
					tdy.onclick = function () {
						inp.value = tIso;
						fire(inp);
						close();
					};
					foot.appendChild(clr);
					foot.appendChild(tdy);
					p.appendChild(foot);
					if (owner) {
						place(owner);
					}
				}
				draw();
			});
		});
	}

	function scan(root) {
		if (!root.querySelectorAll) {
			return;
		}
		var list = [];
		if (root.matches && root.matches('select:not([data-native]), input[type="date"]')) {
			list.push(root);
		}
		Array.prototype.push.apply(list, root.querySelectorAll('select:not([data-native]), input[type="date"]'));
		list.forEach(function (n) {
			if (n.tagName === 'SELECT') {
				enhanceSelect(n);
			} else {
				enhanceDate(n);
			}
		});
	}
	function resync() {
		syncs = syncs.filter(function (n) {
			return document.contains(n);
		});
		syncs.forEach(function (n) {
			n._vsync();
		});
	}
	function init() {
		scan(document);
		new MutationObserver(function (ms) {
			ms.forEach(function (m) {
				m.addedNodes.forEach(function (n) {
					if (n.nodeType === 1) {
						scan(n);
					}
				});
				if (m.target && m.target._vsync) {
					m.target._vsync();
				}
			});
		}).observe(document.body, { childList: true, subtree: true });
		/* Đổi giá trị bằng code (sel.value = ...) không bắn sự kiện nên phải quét lại định kỳ.
    Chỉ quét khi tab đang hiển thị và thưa hơn trước để không làm nặng trang (cảnh báo [Violation] setTimeout). */
		setInterval(function () {
			if (!document.hidden) {
				resync();
			}
		}, 1500);
		document.addEventListener('visibilitychange', function () {
			if (!document.hidden) {
				resync();
			}
		});
	}
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
