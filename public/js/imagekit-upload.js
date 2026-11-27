/* Tải ảnh lên ImageKit trực tiếp từ trình duyệt. Khoá bí mật không bao giờ có ở đây: Worker chỉ ký token tạm. */
(function () {
	/* ---------- Hộp cắt ảnh: kéo tay (di chuyển / kéo góc, cạnh) hoặc nhập số px ---------- */
	var CSS = '.ikc{position:fixed;inset:0;z-index:5000;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(5,15,12,.72);font-family:"Be Vietnam Pro",system-ui,sans-serif;--c-bg:#fff;--c-ink:#14231f;--c-mut:#5b6e68;--c-line:#d3e0db;--c-acc:#145a50;--c-acc-ink:#fff;--c-field:#f4f7f5}' +
		':root[data-theme="dark"] .ikc{--c-bg:#162b26;--c-ink:#e8f1ee;--c-mut:#9db3ac;--c-line:rgba(255,255,255,.18);--c-acc:#8fd8c7;--c-acc-ink:#0b1916;--c-field:#0f1f1b}' +
		'.ikc *{box-sizing:border-box}.ikc-box{width:min(560px,100%);max-height:100%;display:flex;flex-direction:column;background:var(--c-bg);color:var(--c-ink);border-radius:20px;overflow:hidden;box-shadow:0 24px 60px -12px rgba(0,0,0,.6)}' +
		'.ikc-h{padding:14px 18px;font-weight:700;font-size:1.05rem;border-bottom:1px solid var(--c-line)}.ikc-h small{display:block;font-weight:400;font-size:.8rem;color:var(--c-mut);margin-top:2px}' +
		'.ikc-stage{position:relative;flex:1;min-height:160px;display:grid;place-items:center;padding:12px;background:var(--c-field);overflow:hidden}' +
		'.ikc-wrap{position:relative;line-height:0;touch-action:none;user-select:none;-webkit-user-select:none}.ikc-wrap img{display:block;max-width:100%;pointer-events:none;-webkit-user-drag:none}' +
		'.ikc-crop{position:absolute;border:2px solid #fff;box-shadow:0 0 0 9999px rgba(0,0,0,.55);cursor:move;touch-action:none}' +
		'.ikc-crop:before,.ikc-crop:after{content:"";position:absolute;pointer-events:none;border:0 solid rgba(255,255,255,.45)}' +
		'.ikc-crop:before{left:33.3%;right:33.3%;top:0;bottom:0;border-width:0 1px}.ikc-crop:after{top:33.3%;bottom:33.3%;left:0;right:0;border-width:1px 0}' +
		'.ikc-hd{position:absolute;width:26px;height:26px;margin:-13px 0 0 -13px;display:grid;place-items:center;touch-action:none}.ikc-hd:after{content:"";width:12px;height:12px;border-radius:3px;background:#fff;box-shadow:0 0 0 1.5px rgba(0,0,0,.45)}' +
		'.ikc-ctl{padding:12px 18px 4px;display:grid;gap:10px}.ikc-nums{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.ikc-nums label{display:grid;gap:3px;font-size:.72rem;font-weight:600;color:var(--c-mut)}' +
		'.ikc-nums input{width:100%;min-height:40px;padding:6px 8px;border:1px solid var(--c-line);border-radius:10px;background:var(--c-field);color:var(--c-ink);font:600 .95rem inherit;font-family:inherit;outline:0}.ikc-nums input:focus{border-color:var(--c-acc)}' +
		'.ikc-rt{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:.8rem;color:var(--c-mut)}.ikc-rt button{border:1px solid var(--c-line);background:none;color:var(--c-ink);border-radius:99px;padding:5px 12px;font:600 .8rem inherit;font-family:inherit;cursor:pointer}.ikc-rt button.on{background:var(--c-acc);border-color:var(--c-acc);color:var(--c-acc-ink)}' +
		'.ikc-out{font-size:.78rem;color:var(--c-mut)}.ikc-f{display:flex;gap:10px;justify-content:flex-end;padding:12px 18px 16px}.ikc-f button{min-height:44px;padding:0 22px;border-radius:12px;border:1px solid var(--c-line);background:none;color:var(--c-ink);font:600 .95rem inherit;font-family:inherit;cursor:pointer}' +
		'.ikc-f button.ok{background:var(--c-acc);border-color:var(--c-acc);color:var(--c-acc-ink)}.ikc button{-webkit-tap-highlight-color:transparent;outline:0}' +
		'@media(max-width:520px){.ikc{padding:0;align-items:flex-end}.ikc-box{border-radius:20px 20px 0 0;max-height:100%}.ikc-f button{flex:1}}';

	function cropDialog(file, max, square) {
		return new Promise(function (resolve, reject) {
			var url = URL.createObjectURL(file), img = new Image();
			img.onerror = function () {
				URL.revokeObjectURL(url);
				reject(new Error('Tệp không phải ảnh hợp lệ.'));
			};
			img.onload = function () {
				var NW = img.naturalWidth, NH = img.naturalHeight, MIN = Math.min(32, NW, NH);
				if (!document.getElementById('ikc-css')) {
					var st = document.createElement('style');
					st.id = 'ikc-css';
					st.textContent = CSS;
					document.head.appendChild(st);
				}
				var ratio = square ? 1 : null; // w/h, null = tự do
				var r = {
					x: 0,
					y: 0,
					w: NW,
					h: NH
				};
				function fitRatio() {
					if (!ratio) {
						r = {
							x: 0,
							y: 0,
							w: NW,
							h: NH
						};
						return;
					}
					var w = Math.min(NW, NH * ratio), h = w / ratio;
					r = {
						x: Math.round((NW - w) / 2),
						y: Math.round((NH - h) / 2),
						w: Math.round(w),
						h: Math.round(h)
					};
				}
				fitRatio();
				var ov = document.createElement('div');
				ov.className = 'ikc';
				ov.setAttribute('role', 'dialog');
				ov.setAttribute('aria-modal', 'true');
				ov.innerHTML = '<div class="ikc-box"><div class="ikc-h">Cắt ảnh<small>Kéo khung để di chuyển, kéo các điểm trắng để đổi kích thước, hoặc nhập số px.</small></div>' +
					'<div class="ikc-stage"><div class="ikc-wrap"><div class="ikc-crop"></div></div></div>' +
					'<div class="ikc-ctl">' + (square ? '' : '<div class="ikc-rt"><span>Tỉ lệ:</span><button type="button" data-r="">Tự do</button><button type="button" data-r="1">1:1</button><button type="button" data-r="1.3333">4:3</button><button type="button" data-r="1.7778">16:9</button></div>') +
					'<div class="ikc-nums"><label>X (px)<input type="number" data-k="x" inputmode="numeric"></label><label>Y (px)<input type="number" data-k="y" inputmode="numeric"></label><label>Rộng (px)<input type="number" data-k="w" inputmode="numeric"></label><label>Cao (px)<input type="number" data-k="h" inputmode="numeric"></label></div>' +
					'<div class="ikc-out"></div></div><div class="ikc-f"><button type="button" class="no">Huỷ</button><button type="button" class="ok">Dùng ảnh này</button></div></div>';
				var wrap = ov.querySelector('.ikc-wrap'), box = ov.querySelector('.ikc-crop'), out = ov.querySelector('.ikc-out');
				wrap.insertBefore(img, box);
				img.alt = '';
				var inputs = {};
				ov.querySelectorAll('input[data-k]').forEach(function (i) {
					inputs[i.dataset.k] = i;
				});
				var dirs = ratio ? ['nw', 'ne', 'sw', 'se'] : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
				var hpos = {
					nw: [0, 0],
					n: [50, 0],
					ne: [100, 0],
					e: [100, 50],
					se: [100, 100],
					s: [50, 100],
					sw: [0, 100],
					w: [0, 50]
				};
				var hcur = {
					nw: 'nwse-resize',
					se: 'nwse-resize',
					ne: 'nesw-resize',
					sw: 'nesw-resize',
					n: 'ns-resize',
					s: 'ns-resize',
					e: 'ew-resize',
					w: 'ew-resize'
				};
				var handles = {};
				function buildHandles() {
					Object.keys(handles).forEach(function (k) {
						handles[k].remove();
					});
					handles = {};
					dirs = ratio ? ['nw', 'ne', 'sw', 'se'] : Object.keys(hpos);
					dirs.forEach(function (d) {
						var h = document.createElement('div');
						h.className = 'ikc-hd';
						h.dataset.d = d;
						h.style.left = hpos[d][0] + '%';
						h.style.top = hpos[d][1] + '%';
						h.style.cursor = hcur[d];
						box.appendChild(h);
						handles[d] = h;
					});
				}
				function sc() {
					return img.clientWidth / NW;
				}
				function paint() {
					var k = sc();
					box.style.left = r.x * k + 'px';
					box.style.top = r.y * k + 'px';
					box.style.width = r.w * k + 'px';
					box.style.height = r.h * k + 'px';
					['x', 'y', 'w', 'h'].forEach(function (n) {
						if (document.activeElement !== inputs[n]) {
							inputs[n].value = Math.round(r[n]);
						}
					});
					var m = Math.min(1, (max || 1200) / Math.max(r.w, r.h));
					out.textContent = 'Ảnh gốc ' + NW + '×' + NH + ' px · vùng cắt ' + Math.round(r.w) + '×' +
						Math.round(r.h) + ' px · ảnh lưu ' + Math.round(r.w * m) + '×' + Math.round(r.h * m) + ' px';
					ov.querySelectorAll('.ikc-rt button').forEach(function (b) {
						b.classList.toggle('on', (b.dataset.r ? Number(b.dataset.r) : null) === ratio || (ratio && b.dataset.r && Math.abs(Number(b.dataset.r) - ratio) < 0.001));
					});
				}
				function clampMove() {
					r.x = Math.max(0, Math.min(NW - r.w, r.x));
					r.y = Math.max(0, Math.min(NH - r.h, r.y));
				}
				function pt(e) {
					var b = wrap.getBoundingClientRect(), k = sc();
					return { x: (e.clientX - b.left) / k, y: (e.clientY - b.top) / k };
				}

				var drag = null;
				box.addEventListener('pointerdown', function (e) {
					var d = e.target.dataset && e.target.dataset.d;
					e.preventDefault();
					drag = {
						d: d || 'move',
						p: pt(e),
						r: {
							x: r.x,
							y: r.y,
							w: r.w,
							h: r.h
						}
					};
					box.setPointerCapture(e.pointerId);
				});
				box.addEventListener('pointermove', function (e) {
					if (!drag) {
						return;
					}
					var p = pt(e), o = drag.r, dx = p.x - drag.p.x, dy = p.y - drag.p.y;
					if (drag.d === 'move') {
						r.x = o.x + dx;
						r.y = o.y + dy;
						clampMove();
					} else {
						resize(drag.d, o, p);
					}
					paint();
				});
				function end() {
					drag = null;
				}
				box.addEventListener('pointerup', end);
				box.addEventListener('pointercancel', end);

				function resize(d, o, p) {
					var x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
					if (!ratio) {
						if (d.indexOf('w') >= 0) {
							x1 = Math.max(0, Math.min(p.x, x2 - MIN));
						}
						if (d.indexOf('e') >= 0) {
							x2 = Math.min(NW, Math.max(p.x, x1 + MIN));
						}
						if (d.indexOf('n') >= 0) {
							y1 = Math.max(0, Math.min(p.y, y2 - MIN));
						}
						if (d.indexOf('s') >= 0) {
							y2 = Math.min(NH, Math.max(p.y, y1 + MIN));
						}
						r = {
							x: x1,
							y: y1,
							w: x2 - x1,
							h: y2 - y1
						};
						return;
					}
					var ax = d.indexOf('w') >= 0 ? x2 : x1, ay = d.indexOf('n') >= 0 ? y2 : y1; // góc đối diện đứng yên
					var sx = d.indexOf('w') >= 0 ? -1 : 1, sy = d.indexOf('n') >= 0 ? -1 : 1;
					var w = Math.max(sx * (p.x - ax), sy * (p.y - ay) * ratio);
					var roomX = sx > 0 ? NW - ax : ax, roomY = sy > 0 ? NH - ay : ay;
					w = Math.max(MIN, Math.min(w, roomX, roomY * ratio));
					var h = w / ratio;
					r = {
						x: sx > 0 ? ax : ax - w,
						y: sy > 0 ? ay : ay - h,
						w: w,
						h: h
					};
				}
				function onNum() {
					var k = this.dataset.k, v = Math.round(Number(this.value));
					if (!isFinite(v)) {
						return;
					}
					if (k === 'x') {
						r.x = v;
					} else if (k === 'y') {
						r.y = v;
					} else if (k === 'w') {
						r.w = Math.max(MIN, Math.min(NW, v));
						if (ratio) {
							r.h = r.w / ratio;
						}
					} else {
						r.h = Math.max(MIN, Math.min(NH, v));
						if (ratio) {
							r.w = r.h * ratio;
						}
					}
					if (ratio && (r.w > NW || r.h > NH)) {
						r.w = Math.min(NW, NH * ratio);
						r.h = r.w / ratio;
					}
					r.w = Math.min(r.w, NW);
					r.h = Math.min(r.h, NH);
					clampMove();
					paint();
				}
				Object.keys(inputs).forEach(function (k) {
					inputs[k].addEventListener('input', onNum);
					inputs[k].addEventListener('blur', paint);
				});
				ov.querySelectorAll('.ikc-rt button').forEach(function (b) {
					b.onclick = function () {
						ratio = b.dataset.r ? Number(b.dataset.r) : null;
						fitRatio();
						buildHandles();
						paint();
					};
				});

				function done(res, err) {
					document.removeEventListener('keydown', onKey);
					window.removeEventListener('resize', paint);
					ov.remove();
					document.documentElement.style.overflow = prevOv;
					if (err) {
						URL.revokeObjectURL(url);
						reject(err);
					} else {
						resolve(res);
					}
				}
				function onKey(e) {
					if (e.key === 'Escape') {
						done(null, new Error('Đã huỷ chọn ảnh.'));
					}
				}
				ov.querySelector('.no').onclick = function () {
					done(null, new Error('Đã huỷ chọn ảnh.'));
				};
				ov.querySelector('.ok').onclick = function () {
					done({
						img: img,
						url: url,
						rect: {
							x: r.x,
							y: r.y,
							w: r.w,
							h: r.h
						}
					});
				};
				document.addEventListener('keydown', onKey);
				window.addEventListener('resize', paint);
				var prevOv = document.documentElement.style.overflow;
				document.documentElement.style.overflow = 'hidden';
				document.body.appendChild(ov);
				// ảnh cao: giới hạn chiều cao để không tràn màn hình
				img.style.maxHeight = Math.max(160, Math.min(window.innerHeight * 0.5, 460)) + 'px';
				buildHandles();
				paint();
			};
			img.src = url;
		});
	}

	function shrink(c, max) {
		return new Promise(function (resolve, reject) {
			var r = c.rect, k = Math.min(1, max / Math.max(r.w, r.h)), cw = Math.max(1, Math.round(r.w * k)), ch = Math.max(1, Math.round(r.h * k));
			var cv = document.createElement('canvas');
			cv.width = cw;
			cv.height = ch;
			cv.getContext('2d').drawImage(c.img, Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h), 0, 0, cw, ch);
			URL.revokeObjectURL(c.url);
			cv.toBlob(function (b) {
				b ? resolve(b) : reject(new Error('Không xử lý được ảnh.'));
			}, 'image/jpeg', 0.86);
		});
	}
	window.ikUpload = function (file, authPath, max, square) {
		if (!file || !/^image\//.test(file.type)) {
			return Promise.reject(new Error('Vui lòng chọn một tệp ảnh.'));
		}
		if (file.size > 15 * 1024 * 1024) {
			return Promise.reject(new Error('Ảnh quá lớn (tối đa 15 MB).'));
		}
		return cropDialog(file, max || 1200, !!square).then(function (c) {
			return Promise.all([
				fetch(authPath, { credentials: 'same-origin' }).then(function (r) {
					return r.json().then(function (d) {
						if (!r.ok) {
							throw new Error(d.error || 'Không lấy được quyền tải ảnh.');
						}
						return d;
					});
				}),
				shrink(c, max || 1200)
			]);
		}).then(function (v) {
			var a = v[0], fd = new FormData();
			fd.append('file', v[1], 'img.jpg');
			fd.append('fileName', 'vdk-' + Date.now() + '.jpg');
			fd.append('publicKey', a.publicKey);
			fd.append('signature', a.signature);
			fd.append('expire', a.expire);
			fd.append('token', a.token);
			fd.append('folder', a.folder);
			fd.append('useUniqueFileName', 'true');
			return fetch(a.uploadUrl, { method: 'POST', body: fd }).then(function (r) {
				return r.json().then(function (d) {
					if (!r.ok) {
						throw new Error(d.message || 'Tải ảnh lên thất bại.');
					}
					return { url: d.url, fileId: d.fileId };
				});
			});
		});
	};
})();
