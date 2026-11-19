/* Slider, chọn màu và tải file tuỳ biến dùng chung (trang khách + quản trị).
Giữ nguyên <input type="range|color|file"> gốc (ẩn/đè kiểu) nên form vẫn gửi đúng giá trị,
sự kiện input/change vẫn bắn như cũ, và gán input.value = ... bằng code cũng tự cập nhật giao diện.
Muốn bỏ qua một ô: thêm thuộc tính data-native. */
(function () {
  'use strict';

  var VALUE = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  var PRESETS = ['#da251d', '#ffcd00', '#0c3b36', '#145a50', '#f4a6b8', '#ffffff', '#14231f', '#eef4f1',
    '#b42318', '#9a5b00', '#0b6b45', '#2563eb', '#7c3aed', '#db2777', '#64748b', '#000000'];

  function el(tag, cls, attrs) {
    var e = document.createElement(tag);
    if (cls) {
      e.className = cls;
    }
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') {
        e.textContent = attrs[k];
      } else {
        e.setAttribute(k, attrs[k]);
      }
    });
    return e;
  }
  function icon(name) {
    return el('span', 'ms', { 'aria-hidden': 'true', text: name });
  }
  function fire(input, type) {
    input.dispatchEvent(new Event(type, { bubbles: true }));
  }
  /* Khi code gán input.value = ..., vẽ lại giao diện ngay (không cần quét định kỳ) */
  function hook(input, fn) {
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: function () {
        return VALUE.get.call(this);
      },
      set: function (v) {
        VALUE.set.call(this, v);
        fn();
      }
    });
  }
  function watchAttrs(input, fn) {
    new MutationObserver(fn).observe(input, { attributes: true, attributeFilter: ['disabled', 'min', 'max', 'step'] });
  }
  function skip(input) {
    return input.hasAttribute('data-native') || input.hidden || input._vcp || input.closest('[hidden]') ||
      getComputedStyle(input).display === 'none';
  }

  /* ================= SLIDER ================= */
  function enhanceRange(input) {
    var wrap = el('span', 'vr');
    var bubble = el('output', 'vr-bubble', { 'aria-hidden': 'true' });
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    wrap.appendChild(bubble);
    input.classList.add('vr-in');
    var unit = input.dataset.unit;
    if (unit == null) {
      var out = input.parentNode.parentNode && input.parentNode.parentNode.querySelector('b[data-out]');
      unit = out && /%\s*$/.test(out.textContent) ? '%' : '';
    }
    function sync() {
      var min = Number(input.min || 0), max = Number(input.max || 100), v = Number(input.value);
      var p = max > min ? Math.min(1, Math.max(0, (v - min) / (max - min))) : 0;
      input.style.setProperty('--pn', p);
      input.style.setProperty('--p', (p * 100) + '%');
      bubble.textContent = v + unit;
      wrap.classList.toggle('dis', input.disabled);
    }
    input.addEventListener('input', sync);
    input.addEventListener('change', sync);
    ['pointerdown', 'focus'].forEach(function (t) {
      input.addEventListener(t, function () {
        wrap.classList.add('act');
      });
    });
    ['pointerup', 'pointercancel', 'blur'].forEach(function (t) {
      input.addEventListener(t, function () {
        wrap.classList.remove('act');
      });
    });
    hook(input, sync);
    watchAttrs(input, sync);
    input._vcp = true;
    sync();
  }

  /* ================= BẢNG CHỌN MÀU ================= */
  function clamp(n, a, b) {
    return Math.min(b, Math.max(a, n));
  }
  function normHex(s) {
    s = String(s || '').trim().replace(/^#?/, '#').toLowerCase();
    if (/^#[0-9a-f]{3}$/.test(s)) {
      s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
    }
    return /^#[0-9a-f]{6}$/.test(s) ? s : '';
  }
  function hexToHsv(hex) {
    var r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
    if (d) {
      h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
    }
    return {
      h: h,
      s: mx ? d / mx : 0,
      v: mx
    };
  }
  function hsvToHex(h, s, v) {
    var c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c, r = 0, g = 0, b = 0;
    if (h < 60) {
      r = c;
      g = x;
    } else if (h < 120) {
      r = x;
      g = c;
    } else if (h < 180) {
      g = c;
      b = x;
    } else if (h < 240) {
      g = x;
      b = c;
    } else if (h < 300) {
      r = x;
      b = c;
    } else {
      r = c;
      b = x;
    }
    return '#' + [r, g, b].map(function (n) {
      var t = Math.round((n + m) * 255).toString(16);
      return t.length < 2 ? '0' + t : t;
    }).join('');
  }

  var pop = null, popOwner = null, popOnClose = null;
  function closePicker() {
    if (pop) {
      pop.remove();
      pop = null;
    }
    if (popOwner) {
      popOwner.setAttribute('aria-expanded', 'false');
      popOwner = null;
    }
    if (popOnClose) {
      var f = popOnClose;
      popOnClose = null;
      f();
    }
  }
  document.addEventListener('pointerdown', function (e) {
    if (pop && !pop.contains(e.target) && !(popOwner && popOwner.contains(e.target))) {
      closePicker();
    }
  }, true);
  document.addEventListener('keydown', function (e) {
    if (pop && e.key === 'Escape') {
      var o = popOwner;
      closePicker();
      if (o) {
        o.focus();
      }
    }
  });
  window.addEventListener('resize', closePicker);

  function openPicker(native, btn) {
    closePicker();
    var hex = normHex(native.value) || '#000000', hsv = hexToHsv(hex), startHex = hex;
    var h = hsv.h, s = hsv.s, v = hsv.v;
    pop = el('div', 'vcp', { role: 'dialog', 'aria-label': 'Chọn màu' });
    popOwner = btn;
    btn.setAttribute('aria-expanded', 'true');

    var sv = el('div', 'vcp-sv', { 'aria-hidden': 'true' }), svT = el('i', 'vcp-thumb');
    sv.appendChild(svT);
    var hue = el('input', 'vcp-hue', {
      type: 'range',
      min: '0',
      max: '360',
      step: '1',
      'aria-label': 'Sắc độ'
    });
    hue.setAttribute('data-native', '');
    var prev = el('span', 'vcp-prev');
    var hexIn = el('input', 'vcp-hex', {
      maxlength: '7',
      spellcheck: 'false',
      autocomplete: 'off',
      'aria-label': 'Mã màu'
    });
    hexIn.setAttribute('data-native', '');
    var row = el('div', 'vcp-row');
    row.appendChild(prev);
    row.appendChild(hexIn);
    var eye = null;
    if (window.EyeDropper) {
      eye = el('button', 'vcp-eye', {
        type: 'button',
        'aria-label': 'Lấy màu trên màn hình',
        title: 'Lấy màu trên màn hình'
      });
      eye.appendChild(icon('colorize'));
      eye.onclick = function () {
        new window.EyeDropper().open().then(function (r) {
          var n = normHex(r.sRGBHex);
          if (n) {
            var o = hexToHsv(n);
            h = o.h;
            s = o.s;
            v = o.v;
            paint(true);
            commit(false);
          }
        }).catch(function () {});
      };
      row.appendChild(eye);
    }
    var sws = el('div', 'vcp-sws', { role: 'group', 'aria-label': 'Màu gợi ý' });
    PRESETS.forEach(function (c) {
      var b = el('button', 'vcp-sw', {
        type: 'button',
        'aria-label': c,
        title: c
      });
      b.style.background = c;
      b.onclick = function () {
        var o = hexToHsv(c);
        h = o.h;
        s = o.s;
        v = o.v;
        paint(true);
        commit(false);
      };
      sws.appendChild(b);
    });
    var done = el('button', 'vcp-done', { type: 'button', text: 'Xong' });
    done.onclick = function () {
      var o = popOwner;
      closePicker();
      if (o) {
        o.focus();
      }
    };
    pop.appendChild(sv);
    pop.appendChild(hue);
    pop.appendChild(row);
    pop.appendChild(sws);
    pop.appendChild(done);
    document.body.appendChild(pop);

    function paint(setHex) {
      var cur = hsvToHex(h, s, v);
      sv.style.setProperty('--h', Math.round(h));
      svT.style.left = (s * 100) + '%';
      svT.style.top = ((1 - v) * 100) + '%';
      svT.style.background = cur;
      hue.value = Math.round(h);
      hue.style.setProperty('--hc', 'hsl(' + Math.round(h) + ',100%,50%)');
      prev.style.background = cur;
      if (setHex) {
        hexIn.value = cur;
      }
    }
    function commit(live) {
      var cur = hsvToHex(h, s, v);
      if (normHex(native.value) !== cur) {
        native.value = cur;
        fire(native, 'input');
      }
      if (!live) {
        fire(native, 'change');
        startHex = cur;
      }
    }
    function drag(e) {
      var r = sv.getBoundingClientRect();
      s = clamp((e.clientX - r.left) / r.width, 0, 1);
      v = 1 - clamp((e.clientY - r.top) / r.height, 0, 1);
      paint(true);
      commit(true);
    }
    sv.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      sv.setPointerCapture(e.pointerId);
      sv.classList.add('act');
      drag(e);
    });
    sv.addEventListener('pointermove', function (e) {
      if (sv.hasPointerCapture(e.pointerId)) {
        drag(e);
      }
    });
    function end(e) {
      if (sv.hasPointerCapture(e.pointerId)) {
        sv.releasePointerCapture(e.pointerId);
        sv.classList.remove('act');
        commit(false);
      }
    }
    sv.addEventListener('pointerup', end);
    sv.addEventListener('pointercancel', end);
    hue.addEventListener('input', function () {
      h = Number(hue.value);
      paint(true);
      commit(true);
    });
    hue.addEventListener('change', function () {
      commit(false);
    });
    hexIn.addEventListener('input', function () {
      var n = normHex(hexIn.value);
      hexIn.classList.toggle('bad', !!hexIn.value && !n);
      if (n) {
        var o = hexToHsv(n);
        h = o.s || o.v ? o.h : h;
        s = o.s;
        v = o.v;
        paint(false);
        commit(true);
      }
    });
    hexIn.addEventListener('change', function () {
      var n = normHex(hexIn.value);
      if (n) {
        commit(false);
      }
      hexIn.value = hsvToHex(h, s, v);
      hexIn.classList.remove('bad');
    });
    hexIn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        hexIn.dispatchEvent(new Event('change'));
        done.click();
      }
    });
    paint(true);
    popOnClose = function () {
      if (normHex(native.value) !== startHex) {
        fire(native, 'change');
      }
    };

    /* Vị trí: dưới ô chọn màu, lật lên nếu hết chỗ; màn hình hẹp thì nằm sát đáy */
    var r = btn.getBoundingClientRect(), w = pop.offsetWidth, ph = pop.offsetHeight;
    if (window.innerWidth <= 520) {
      pop.classList.add('sheet');
    } else {
      pop.style.left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8) + 'px';
      var below = window.innerHeight - r.bottom;
      if (below < ph + 12 && r.top > below) {
        pop.style.top = Math.max(8, r.top - ph - 6) + 'px';
      } else {
        pop.style.top = (r.bottom + 6) + 'px';
      }
    }
    /* Bàn phím: mũi tên di chuyển điểm chọn (giữ Shift để nhảy lớn) */
    sv.setAttribute('tabindex', '0');
    sv.setAttribute('role', 'application');
    sv.setAttribute('aria-label', 'Độ đậm và độ sáng. Dùng phím mũi tên để chỉnh');
    sv.removeAttribute('aria-hidden');
    sv.addEventListener('keydown', function (e) {
      var d = e.shiftKey ? .1 : .02, used = true;
      if (e.key === 'ArrowLeft') {
        s = clamp(s - d, 0, 1);
      } else if (e.key === 'ArrowRight') {
        s = clamp(s + d, 0, 1);
      } else if (e.key === 'ArrowUp') {
        v = clamp(v + d, 0, 1);
      } else if (e.key === 'ArrowDown') {
        v = clamp(v - d, 0, 1);
      } else {
        used = false;
      }
      if (used) {
        e.preventDefault();
        paint(true);
        commit(true);
      }
    });
    sv.addEventListener('keyup', function (e) {
      if (/^Arrow/.test(e.key)) {
        commit(false);
      }
    });
    /* Máy có chuột: đưa con trỏ vào ô mã màu; điện thoại thì không (tránh bật bàn phím) */
    if (window.matchMedia && matchMedia('(pointer: fine)').matches) {
      hexIn.focus({ preventScroll: true });
      hexIn.select();
    }
  }

  function enhanceColor(input) {
    var btn = el('button', 'vc-btn', {
      type: 'button',
      'aria-haspopup': 'dialog',
      'aria-expanded': 'false',
      'aria-label': 'Chọn màu'
    });
    var chip = el('i', 'vc-chip');
    btn.appendChild(chip);
    input.parentNode.insertBefore(btn, input);
    input.classList.add('vc-native');
    input.tabIndex = -1;
    input.setAttribute('aria-hidden', 'true');
    function sync() {
      chip.style.background = normHex(input.value) || '#000000';
      btn.disabled = input.disabled;
      btn.title = normHex(input.value) || '';
    }
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (popOwner === btn) {
        closePicker();
      } else {
        openPicker(input, btn);
      }
    });
    input.addEventListener('input', sync);
    input.addEventListener('change', sync);
    hook(input, sync);
    watchAttrs(input, sync);
    input._vcp = true;
    sync();
  }

  /* ================= TẢI FILE ================= */
  function fmtSize(n) {
    return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(n < 10240 ? 1 : 0).replace('.', ',') + ' KB' : (n / 1048576).toFixed(1).replace('.', ',') +
      ' MB';
  }
  function accepts(input, file) {
    var acc = (input.getAttribute('accept') || '').split(',').map(function (x) {
      return x.trim().toLowerCase();
    }).filter(Boolean);
    if (!acc.length) {
      return true;
    }
    var name = file.name.toLowerCase(), type = (file.type || '').toLowerCase();
    return acc.some(function (a) {
      return a[0] === '.' ? name.slice(-a.length) === a : a.slice(-2) === '/*' ? type.indexOf(a.slice(0, -1)) === 0 : type === a;
    });
  }
  function fileIcon(f) {
    var n = f.name.toLowerCase();
    return /^image\//.test(f.type) ? 'image' : /\.(csv|xlsx?|json)$/.test(n) ? 'description' : /\.pdf$/.test(n) ? 'description' : 'upload';
  }
  function setFiles(input, list) {
    try {
      var dt = new DataTransfer();
      list.forEach(function (f) {
        dt.items.add(f);
      });
      input.files = dt.files;
      fire(input, 'change');
    } catch (e) { /* trình duyệt cũ */
    }
  }

  function enhanceFile(input) {
    var wrap = el('div', 'vf'), zone = el('div', 'vf-zone', { role: 'button', tabindex: '0' });
    var title = el('b', 'vf-t'), hint = el('small', 'vf-h');
    var tx = el('span', 'vf-tx');
    tx.appendChild(title);
    tx.appendChild(hint);
    zone.appendChild(el('span', 'vf-ic')).appendChild(icon('upload'));
    zone.appendChild(tx);
    var list = el('ul', 'vf-list');
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(zone);
    wrap.appendChild(list);
    wrap.appendChild(input);
    input.classList.add('vf-native');
    input.tabIndex = -1;
    input.setAttribute('aria-hidden', 'true');
    var urls = [];
    function accText() {
      var a = (input.getAttribute('accept') || '').trim();
      return a ? 'Chấp nhận: ' + a.split(',').map(function (x) {
        return x.trim();
      }).join(', ') : 'Mọi loại file';
    }
    function sync() {
      urls.forEach(function (u) {
        URL.revokeObjectURL(u);
      });
      urls = [];
      var files = Array.prototype.slice.call(input.files || []);
      title.textContent = input.dataset.title || (input.multiple ? 'Chọn file hoặc kéo thả vào đây' : files.length ? 'Chọn file khác' : 'Chọn file hoặc kéo thả vào đây');
      hint.textContent = accText();
      zone.classList.toggle('has', files.length > 0);
      zone.classList.toggle('dis', input.disabled);
      zone.setAttribute('aria-disabled', input.disabled);
      zone.setAttribute('aria-label', title.textContent);
      list.textContent = '';
      files.forEach(function (f, i) {
        var li = el('li', 'vf-item');
        var th = el('span', 'vf-th');
        if (/^image\//.test(f.type)) {
          var u = URL.createObjectURL(f);
          urls.push(u);
          var im = el('img', '', { alt: '', src: u });
          th.appendChild(im);
        } else {
          th.appendChild(icon(fileIcon(f)));
        }
        var info = el('span', 'vf-in');
        info.appendChild(el('b', '', { text: f.name, title: f.name }));
        info.appendChild(el('small', '', { text: fmtSize(f.size) }));
        var rm = el('button', 'vf-rm', {
          type: 'button',
          'aria-label': 'Bỏ ' + f.name,
          title: 'Bỏ file này'
        });
        rm.appendChild(icon('close'));
        rm.onclick = function (e) {
          e.preventDefault();
          e.stopPropagation();
          setFiles(input, files.filter(function (_, j) {
            return j !== i;
          }));
        };
        li.appendChild(th);
        li.appendChild(info);
        li.appendChild(rm);
        list.appendChild(li);
      });
    }
    function open() {
      if (!input.disabled) {
        input.click();
      }
    }
    zone.addEventListener('click', function (e) {
      e.preventDefault();
      open();
    });
    zone.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
    /* Kéo thả: tự xử lý trong khung này, chặn dropzone.js xử lý trùng */
    function hasFiles(e) {
      return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') > -1;
    }
    ['dragenter', 'dragover'].forEach(function (t) {
      wrap.addEventListener(t, function (e) {
        if (!hasFiles(e)) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = input.disabled ? 'none' : 'copy';
        zone.classList.add('drag');
      });
    });
    wrap.addEventListener('dragleave', function (e) {
      if (!wrap.contains(e.relatedTarget)) {
        zone.classList.remove('drag');
      }
    });
    wrap.addEventListener('drop', function (e) {
      if (!hasFiles(e)) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      zone.classList.remove('drag');
      if (input.disabled) {
        return;
      }
      var got = Array.prototype.filter.call(e.dataTransfer.files, function (f) {
        return accepts(input, f);
      });
      if (!got.length) {
        zone.classList.add('bad');
        setTimeout(function () {
          zone.classList.remove('bad');
        }, 700);
        return;
      }
      setFiles(input, input.multiple ? got : got.slice(0, 1));
    });
    input.addEventListener('change', sync);
    hook(input, sync);
    watchAttrs(input, sync);
    input._vcp = true;
    sync();
  }

  /* ================= Quét ================= */
  function scan(root) {
    if (!root.querySelectorAll) {
      return;
    }
    root.querySelectorAll('input[type="range"], input[type="color"], input[type="file"]').forEach(function (i) {
      if (skip(i)) {
        return;
      }
      if (i.type === 'range') {
        enhanceRange(i);
      } else if (i.type === 'color') {
        enhanceColor(i);
      } else {
        enhanceFile(i);
      }
    });
  }
  function init() {
    scan(document);
    new MutationObserver(function (ms) {
      ms.forEach(function (m) {
        m.addedNodes.forEach(function (n) {
          if (n.nodeType === 1) {
            if (n.matches && n.matches('input[type="range"], input[type="color"], input[type="file"]')) {
              if (!skip(n)) {
                scan({ querySelectorAll: function () {
                    return [n];
                  } });
              }
            } else {
              scan(n);
            }
          }
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  }
  window.vdkControls = { scan: scan, closePicker: closePicker };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
