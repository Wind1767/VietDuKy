(function () {
  'use strict';

  var STATUS = {
    new: 'Mới',
    called: 'Đã gọi',
    won: 'Đã chốt',
    cancelled: 'Huỷ'
  };
  var DESTS = ['Vịnh Hạ Long', 'Sa Pa', 'Hội An', 'Huế', 'Đà Lạt', 'Phú Quốc'];
  var TZ = 7 * 3600 * 1000;
  var $ = function (id) {
    return document.getElementById(id);
  };
  var main = $('main');

  /* ---------- Tiện ích ---------- */
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[c];
    });
  }
  function pad(n) {
    return n < 10 ? '0' + n : '' + n;
  }
  function vnDate(ms) {
    var d = new Date(ms + TZ);
    return pad(d.getUTCDate()) + '/' + pad(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();
  }
  function vnTime(ms) {
    var d = new Date(ms + TZ);
    return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
  }
  function isoToVn(s) {
    return s ? s.split('-').reverse().join('/') : '–';
  }
  function ago(ms) {
    var m = Math.floor((Date.now() - ms) / 60000);
    if (m < 1) {
      return 'vừa xong';
    }
    if (m < 60) {
      return m + ' phút trước';
    }
    var h = Math.floor(m / 60);
    if (h < 24) {
      return h + ' giờ trước';
    }
    return Math.floor(h / 24) + ' ngày trước';
  }
  function setBadge(n) {
    var nav = $('navNew');
    nav.hidden = !n;
    nav.textContent = n;
    document.title = (n ? '(' + n + ') ' : '') + 'Quản trị – Việt Du Ký';
  }
  function stBadge(s) {
    return '<span class="st ' + esc(s) + '">' + esc(STATUS[s] || s) + '</span>';
  }
  function fmt(n) {
    return Number(n).toLocaleString('vi-VN');
  }

  var toastT;
  function toast(msg, err) {
    var t = $('toast');
    t.innerHTML = '<span class="ms">' + (err ? 'error' : 'check_circle') + '</span><span>' + esc(msg) +
      '</span>';
    t.classList.toggle('err', !!err);
    t.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(function () {
      t.classList.remove('on');
    }, 3200);
  }

  function api(path, opts) {
    opts = opts || {};
    var init = {
      method: opts.method || 'GET',
      credentials: 'same-origin',
      headers: {}
    };
    if (opts.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    return fetch('/api/admin' + path, init).then(function (res) {
      if (res.status === 401 && path !== '/login') {
        showLogin();
        throw new Error('Phiên đăng nhập đã hết hạn.');
      }
      var ct = res.headers.get('Content-Type') || '';
      var p = ct.indexOf('json') > -1 ? res.json() : Promise.resolve({});
      return p.then(function (data) {
        if (res.status === 403 && data && data.code === 'access_denied' && path !== '/login') {
          showLogin(data.error);
          throw new Error(data.error);
        }
        if (!res.ok) {
          var e = new Error((data && data.error) || 'Có lỗi xảy ra.');
          e.status = res.status;
          throw e;
        }
        return data;
      });
    }, function () {
      throw new Error('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
    });
  }

  /* ---------- Giao diện sáng / tối ---------- */
  function isDark() {
    var t = document.documentElement.dataset.theme;
    return t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function syncTheme() {
    $('themeIcon').textContent = isDark() ? 'light_mode' : 'dark_mode';
    $('themeLabel').textContent = isDark() ? 'Giao diện sáng' : 'Giao diện tối';
  }
  $('themeBtn').onclick = function () {
    var next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('vdk-theme', next);
    } catch (e) {}
    syncTheme();
  };
  syncTheme();

  /* ---------- Hộp thoại xác nhận / nhập (thay confirm và prompt của trình duyệt) ---------- */
  function dialog(o) {
    return new Promise(function (resolve) {
      var prev = document.activeElement, wrap = document.createElement('div');
      wrap.className = 'dlg-scrim';
      wrap.innerHTML = '<div class="dlg" role="alertdialog" aria-modal="true" aria-labelledby="dlgT" aria-describedby="dlgM">' +
        '<span class="dlg-ic' + (o.danger ? ' danger' : '') + '"><span class="ms">' + (o.icon || (o.danger ? 'delete' : 'help')) + '</span></span>' +
        '<h2 id="dlgT">' + esc(o.title || 'Xác nhận') + '</h2><p id="dlgM">' + esc(o.msg || '') + '</p>' +
        (o.input ? '<label class="field"><span>' + esc(o.input.label || '') +
          '</span><input id="dlgIn" inputmode="' + (o.input.mode || 'text') + '" value="' +
          esc(o.input.value || '') + '" placeholder="' + esc(o.input.placeholder || '') +
          '" autocomplete="off"></label>' : '') +
        '<div class="dlg-acts"><button type="button" class="btn" id="dlgNo">' + esc(o.cancel || 'Huỷ') + '</button><button type="button" class="btn ' + (o.danger ? 'solid-danger' : 'primary') + '" id="dlgYes">' + esc(o.ok || 'Đồng ý') + '</button></div></div>';
      document.body.appendChild(wrap);
      var yes = wrap.querySelector('#dlgYes'), no = wrap.querySelector('#dlgNo'), inp = wrap.querySelector('#dlgIn');
      requestAnimationFrame(function () {
        wrap.classList.add('on');
      });
      (inp || (o.danger ? no : yes)).focus();
      if (inp) {
        inp.select();
      }
      function done(v) {
        document.removeEventListener('keydown', key, true);
        wrap.classList.remove('on');
        setTimeout(function () {
          wrap.remove();
        }, 160);
        try {
          if (prev && prev.focus) {
            prev.focus();
          }
        } catch (e) {}
        resolve(v);
      }
      function accept() {
        done(inp ? inp.value : true);
      }
      function key(e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          done(inp ? null : false);
        } else if (e.key === 'Enter' && !e.isComposing && e.target !== no) {
          e.preventDefault();
          e.stopPropagation();
          accept();
        } else if (e.key === 'Tab') {
          var f = Array.prototype.slice.call(wrap.querySelectorAll('input, button')), i = f.indexOf(document.activeElement);
          e.preventDefault();
          f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
        }
      }
      document.addEventListener('keydown', key, true);
      yes.onclick = accept;
      no.onclick = function () {
        done(inp ? null : false);
      };
      wrap.onclick = function (e) {
        if (e.target === wrap) {
          done(inp ? null : false);
        }
      };
    });
  }
  function confirmBox(msg, o) {
    return dialog(Object.assign({ msg: msg }, o || {}));
  }

  /* ---------- Tìm nhanh: Ctrl/⌘ + K hoặc phím / ---------- */
  function plain(t) {
    return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  }
  function openPalette() {
    if (document.querySelector('.pal-scrim') || $('app').hidden) {
      return;
    }
    var prev = document.activeElement, items = [], sel = 0, shown = [];
    document.querySelectorAll('.nav a[data-view]').forEach(function (a) {
      if (a.hidden) {
        return;
      }
      items.push({
        label: a.querySelector('.t').textContent,
        icon: a.querySelector('.ms').textContent,
        hint: 'Chuyển tới',
        run: function () {
          location.hash = a.getAttribute('href');
        }
      });
    });
    items.push({
      label: isDark() ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối',
      icon: isDark() ? 'light_mode' : 'dark_mode',
      hint: 'Giao diện',
      run: function () {
        $('themeBtn').click();
      }
    });
    items.push({
      label: 'Thu gọn / mở rộng thanh bên',
      icon: 'menu_open',
      hint: 'Giao diện',
      run: function () {
        $('sideToggle').click();
      }
    });
    items.push({
      label: 'Đăng xuất',
      icon: 'logout',
      hint: 'Tài khoản',
      run: function () {
        $('logoutBtn').click();
      }
    });
    var wrap = document.createElement('div');
    wrap.className = 'pal-scrim';
    wrap.innerHTML = '<div class="pal" role="dialog" aria-modal="true" aria-label="Tìm nhanh"><div class="pal-in"><span class="ms">search</span><input id="palQ" placeholder="Gõ để tìm: đơn đặt, tour, khách…" autocomplete="off" aria-controls="palList"><kbd>Esc</kbd></div><div class="pal-list" id="palList" role="listbox"></div></div>';
    document.body.appendChild(wrap);
    var q = wrap.querySelector('#palQ'), list = wrap.querySelector('#palList');
    requestAnimationFrame(function () {
      wrap.classList.add('on');
    });
    q.focus();
    function draw() {
      var k = plain(q.value.trim());
      shown = items.filter(function (it) {
        return !k || plain(it.label).indexOf(k) > -1;
      });
      if (sel >= shown.length) {
        sel = Math.max(0, shown.length - 1);
      }
      list.innerHTML = shown.length ? shown.map(function (it, i) {
        return '<button type="button" role="option" class="pal-it' + (i === sel ? ' on' : '') + '" data-i="' +
          i + '" aria-selected="' + (i === sel) + '"><span class="ms">' + esc(it.icon) +
          '</span><span class="t">' + esc(it.label) + '</span><small>' + esc(it.hint) + '</small></button>';
      }).join('') : '<p class="pal-empty">Không có mục nào khớp “' + esc(q.value) + '”.</p>';
      var on = list.querySelector('.on');
      if (on && on.scrollIntoView) {
        on.scrollIntoView({ block: 'nearest' });
      }
    }
    function close() {
      document.removeEventListener('keydown', key, true);
      wrap.classList.remove('on');
      setTimeout(function () {
        wrap.remove();
      }, 140);
      try {
        if (prev && prev.focus) {
          prev.focus();
        }
      } catch (e) {}
    }
    function go(i) {
      var it = shown[i];
      if (!it) {
        return;
      }
      close();
      it.run();
    }
    function key(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        sel = Math.min(shown.length - 1, sel + 1);
        draw();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        sel = Math.max(0, sel - 1);
        draw();
      } else if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        e.stopPropagation();
        go(sel);
      } else if (e.key === 'Tab') {
        e.preventDefault();
      }
    }
    document.addEventListener('keydown', key, true);
    q.oninput = function () {
      sel = 0;
      draw();
    };
    list.onclick = function (e) {
      var b = e.target.closest('.pal-it');
      if (b) {
        go(Number(b.dataset.i));
      }
    };
    list.onmousemove = function (e) {
      var b = e.target.closest('.pal-it');
      if (b && Number(b.dataset.i) !== sel) {
        sel = Number(b.dataset.i);
        list.querySelectorAll('.pal-it').forEach(function (x, i) {
          x.classList.toggle('on', i === sel);
          x.setAttribute('aria-selected', i === sel);
        });
      }
    };
    wrap.onclick = function (e) {
      if (e.target === wrap) {
        close();
      }
    };
    draw();
  }
  document.addEventListener('keydown', function (e) {
    if ($('app').hidden || document.querySelector('.dlg-scrim, .pal-scrim')) {
      return;
    }
    var t = e.target, typing = t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
    if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing && !$('fq') && !e.ctrlKey && !e.metaKey && !e.altKey)) {
      e.preventDefault();
      openPalette();
    }
  });
  $('palBtn').onclick = openPalette;

  /* ---------- Đăng nhập / đăng xuất ---------- */
  function showLogin(msg) {
    closeDrawer();
    $('app').hidden = true;
    $('login').hidden = false;
    $('loginMfa').hidden = true;
    $('loginForm').hidden = false;
    $('password').value = '';
    $('password').focus();
    window.vdkTS.mount($('adminTs'), 'admin_login');
    $('loginErr').textContent = typeof msg === 'string' ? msg : '';
    $('loginErr').hidden = typeof msg !== 'string';
    makeLanterns();
  }
  /* Đèn lồng bay như trang gốc: tạo một lần, chạy nền phía sau thẻ đăng nhập */
  function makeLanterns() {
    var host = $('login');
    if (host.querySelector('.lanterns')) {
      return;
    }
    var box = document.createElement('div');
    box.className = 'lanterns';
    box.setAttribute('aria-hidden', 'true');
    var mobile = window.innerWidth < 700, n = mobile ? 4 : 8;
    for (var i = 0; i < n; i++) {
      var l = document.createElement('i');
      l.className = 'lantern';
      l.innerHTML = '<i></i>';
      l.style.left = ((mobile ? 10 + i * 22 : 6 + i * 12) + Math.random() * 6) + '%';
      l.style.animationDuration = (14 + Math.random() * 10) + 's';
      l.style.animationDelay = (-Math.random() * 20) + 's';
      l.style.scale = String(0.6 + Math.random() * 0.8);
      box.appendChild(l);
    }
    host.insertBefore(box, host.firstChild);
  }
  function showApp() {
    $('login').hidden = true;
    $('app').hidden = false;
    route();
  }

  $('loginForm').onsubmit = function (e) {
    e.preventDefault();
    var btn = $('loginBtn'), err = $('loginErr');
    err.hidden = true;
    if (!window.vdkTS.ready($('adminTs'))) {
      err.textContent = 'Đang xác minh, vui lòng đợi vài giây rồi bấm lại.';
      err.hidden = false;
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Đang đăng nhập…';
    api('/login', { method: 'POST', body: {
        email: $('adminEmail').value,
        password: $('password').value,
        'cf-turnstile-response': window.vdkTS.token($('adminTs'))
      } })
      .then(function (d) {
      if (d && d.mfa) {
        return askSecondFactor(d); // đã bật Authenticator / passkey: cần thêm một bước
      }
      return enterApp();
    })
      .catch(function (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    })
      .then(function () {
      btn.disabled = false;
      btn.textContent = 'Đăng nhập';
      window.vdkTS.reset($('adminTs'));
    });
  };
  function enterApp() {
    return loadMe().then(showApp).then(pollMsgBadge);
  }
  var mfaApi = window.vdkMfa ? vdkMfa.create('/api/admin/mfa') : null;
  function askSecondFactor(d) {
    $('loginMfa').hidden = false;
    $('loginForm').hidden = true;
    mfaApi.challengeUI($('loginMfa'), d, function () {
      $('loginMfa').hidden = true;
      $('loginForm').hidden = false;
      enterApp().catch(function (ex) {
        showLogin(ex.message);
      });
    }, function () {
      $('loginMfa').hidden = true;
      $('loginForm').hidden = false;
    });
  }
  /* Đăng nhập Google / passkey (chỉ hiện khi máy chủ đã bật) */
  function setupQuickLogin() {
    if (!mfaApi || $('loginAlt').dataset.ready) {
      return;
    }
    $('loginAlt').dataset.ready = '1';
    var show = function () {
      $('loginAlt').hidden = false;
    };
    var fail = function (t) {
      $('loginErr').textContent = t;
      $('loginErr').hidden = false;
    };
    var done = function () {
      enterApp().catch(function (ex) {
        showLogin(ex.message);
      });
    };
    mfaApi.googleButton($('loginGoogle'), done, fail).then(function (ok) {
      if (ok) {
        show();
      } else {
        $('loginGoogle').remove();
      }
    });
    mfaApi.passkeyOn().then(function (on) { // trình duyệt hỗ trợ và chưa bị tắt trong Cài đặt
      if (!on) {
        return;
      }
      $('loginPasskey').hidden = false;
      show();
      $('loginPasskey').onclick = function () {
        $('loginErr').hidden = true;
        mfaApi.passkeyLogin().then(done, function (ex) {
          fail(mfaApi.describe(ex));
        });
      };
    });
  }
  setupQuickLogin();

  function renderMyMfa() {
    main.innerHTML = '<div class="page-h"><div><h1>Bảo mật tài khoản</h1><p>Google Authenticator và passkey bảo vệ tài khoản quản trị của bạn.</p></div></div><div class="card" style="padding:18px"><div id="mfaBox"></div></div>';
    if (mfaApi) {
      mfaApi.settingsUI($('mfaBox'));
    }
  }
  $('secBtn').onclick = function () {
    location.hash = '#/mymfa';
  };

  $('logoutBtn').onclick = function () {
    api('/logout', { method: 'POST' }).catch(function () {}).then(showLogin);
  };

  /* ---------- Trạng thái dùng chung ---------- */
  function errorState(msg, retry) {
    main.insertAdjacentHTML('beforeend', '<div class="card state err" role="alert"><span class="ms">wifi_off</span><h2>Không tải được dữ liệu</h2><p>' + esc(msg) +
      '</p><button class="btn" id="retry"><span class="ms">refresh</span>Thử lại</button></div>');
    $('retry').onclick = retry;
  }

  /* ---------- Điều hướng ---------- */
  var view = null;
  var VIEWS = ['bookings', 'messages', 'inbox', 'faq', 'reviews', 'bugs', 'accounts', 'customers', 'departures', 'tours', 'templates', 'reports', 'activity', 'admins', 'access', 'emails', 'site', 'layout', 'content', 'destinations', 'coupons', 'data', 'mymfa'];
  var PERM = {
    bookings: 'bookings',
    messages: 'chat',
    inbox: 'chat',
    faq: 'bot',
    reviews: 'reviews',
    bugs: 'bugs',
    accounts: 'accounts',
    customers: 'customers',
    departures: 'departures',
    tours: 'tours',
    templates: 'templates',
    reports: 'reports',
    activity: 'activity',
    admins: 'admins',
    access: 'security',
    emails: 'email',
    site: 'site',
    layout: 'layout',
    content: 'content',
    destinations: 'destinations',
    coupons: 'coupons',
    data: 'dataio',
    mymfa: null // việc của chính mình: ai cũng vào được
  };
  var ME = null;
  function can(g, write) {
    var p = ME && ME.perms && ME.perms[g];
    return write ? p === 'rw' : !!p;
  }
  /* Quyền: ẩn mục menu không được dùng; máy chủ vẫn kiểm tra lại mọi yêu cầu */
  function applyPerms() {
    if (!ME) {
      return;
    }
    document.body.dataset.role = ME.role;
    var D = document.body.dataset; // nút nhạy cảm hiện theo quyền thật, không theo tên vai trò
    D.bk = can('backup') ? '1' : '0';
    D.em = can('email', true) ? '1' : '0';
    D.exp = can('export', true) && can('pii', true) ? '1' : '0';
    D.pricing = can('pricing', true) && can('tours', true) ? '1' : '0';
    D.vr = can('vreview', true) && can('reviews', true) ? '1' : '0';
    D.pii = can('pii', true) ? '1' : '0';
    document.querySelectorAll('.nav a[data-view]').forEach(function (a) {
      var g = PERM[a.dataset.view];
      if (g) {
        a.hidden = !can(g);
      }
    });
    $('whoName').textContent = ME.name;
    /* Avatar kế bên tên: ảnh của tài khoản; chưa có thì chữ cái đầu; tài khoản chủ gốc dùng logo web */
    $('whoAv').innerHTML = ME.avatar ? '<img src="' + esc(ME.avatar) + '" alt="">' : ME.email ? initial(ME.name) : '<img src="/icon-192.png" alt="">';
    $('whoami').classList.toggle('can-edit', !!ME.email);
    $('whoami').title = ME.email ? 'Đổi ảnh đại diện' : '';
    $('whoami').onclick = openMyAvatar;
    $('whoami').onkeydown = function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMyAvatar();
      }
    };
    if (ME.email) {
      $('whoami').setAttribute('role', 'button');
      $('whoami').tabIndex = 0;
    }
    $('whoRole').textContent = ME.roleLabel + (can('pii', true) ? '' : ' · ẩn SĐT/email');
    $('whoami').hidden = false;
  }
  /* Nút Thêm/Lưu/Xoá hiện theo quyền thật của tài khoản ở mục đang xem (kể cả quyền tuỳ chỉnh) */
  var DEL_EXEMPT = ['templates', 'bot', 'admins'];
  function setWriteFlags(name) {
    var g = PERM[name], rw = name === 'overview' || !ME || !g || can(g, true);
    var del = rw && (!ME || !g || DEL_EXEMPT.indexOf(g) > -1 || can('delete', true));
    document.body.dataset.rw = rw ? '1' : '0';
    document.body.dataset.del = del ? '1' : '0';
  }
  /* Độ dài mật khẩu lấy từ máy chủ (/me → rules); 10 chỉ là giá trị dự phòng khi chưa tải xong */
  function minPass() {
    return (ME && ME.rules && ME.rules.minPass) || 10;
  }
  /* Kiểm tra trước khi gửi: cùng luật với máy chủ nên không bị báo lỗi lệch giữa hai nơi */
  function passErr(v) {
    var max = (ME && ME.rules && ME.rules.maxPass) || 128;
    return v.length < minPass() || v.length > max ? 'Mật khẩu từ ' + minPass() + ' đến ' + max + ' ký tự.' : '';
  }
  /* Mật khẩu ngẫu nhiên đủ dài theo luật hiện hành, bỏ ký tự dễ nhầm (0/O, 1/l/I) */
  function genPass() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789', n = Math.max(minPass() + 2, 12), out = '';
    var buf = crypto.getRandomValues(new Uint32Array(n));
    for (var i = 0; i < n; i++) {
      out += chars.charAt(buf[i] % chars.length);
    }
    return out;
  }
  function passGen(id) {
    return '<button type="button" class="btn line sm" data-gen="' + id + '">Tạo mật khẩu ngẫu nhiên</button>';
  }
  function bindGen() {
    document.querySelectorAll('[data-gen]').forEach(function (b) {
      b.onclick = function () {
        var i = $(b.dataset.gen);
        i.type = 'text';
        i.value = genPass();
        i.focus();
        i.select();
      };
    });
  }
  function passLabel(isNew) {
    return isNew ? 'Mật khẩu (' + minPass() + ' ký tự trở lên)' : 'Đặt mật khẩu mới (bỏ trống nếu giữ nguyên)';
  }
  /* Quản trị viên tự đổi ảnh đại diện (bấm vào tên ở thanh bên) */
  function openMyAvatar() {
    if (!ME || !ME.email) {
      return;
    }
    openPanel('Ảnh đại diện của tôi', ME.name, avatarField(ME.avatar), '<button class="btn primary" id="meSave">Lưu</button>', null);
    bindAvatarField();
    $('meSave').onclick = function () {
      var btn = this;
      btn.disabled = true;
      api('/me', { method: 'PATCH', body: { avatar: $('fvUrl').value } }).then(function (r) {
        ME.avatar = r.avatar;
        applyPerms();
        closeDrawer();
        toast('Đã lưu ảnh đại diện');
      }).catch(function (ex) {
        toast(ex.message, true);
        btn.disabled = false;
      });
    };
  }
  function loadMe() {
    return api('/me').then(function (r) {
      ME = r;
      applyPerms();
      loadDests();
      return r;
    });
  }
  /* Danh sách điểm đến dùng trong các ô chọn (lọc đơn, sửa đơn...) lấy từ máy chủ, không cố định 6 mục */
  function loadDests() {
    return fetch('/api/destinations').then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (d) {
      if (d && d.items && d.items.length) {
        DESTS.length = 0;
        d.items.forEach(function (x) {
          DESTS.push(x.name);
        });
      }
    }).catch(function () {});
  }
  function q2uid(h) {
    var m = /^messages\/(\d+)/.exec(h);
    return m ? Number(m[1]) : null;
  }
  function route() {
    var h = location.hash.replace(/^#\/?/, '');
    var key = h.split('?')[0].split('/')[0];
    var name = VIEWS.indexOf(key) > -1 ? key : 'overview';
    if (name !== 'overview' && ME && PERM[name] !== null && !can(PERM[name])) {
      name = 'overview';
    }
    setWriteFlags(name);
    // quyền có thể vừa được đổi: đọc lại để menu và nút khớp ngay, không cần tải lại trang
    if (ME) {
      api('/me').then(function (r) {
        ME = r;
        applyPerms();
        setWriteFlags(name);
      }).catch(function () {});
    }
    if (name === 'bookings') {
      var q = new URLSearchParams(h.split('?')[1] || '');
      listState.status = q.get('status') || '';
      listState.phone = q.get('phone') || '';
      listState.page = 1;
      selected.clear();
    }
    document.querySelectorAll('.nav a').forEach(function (a) {
      if (a.dataset.view === name) {
        a.setAttribute('aria-current', 'page');
      } else {
        a.removeAttribute('aria-current');
      }
    });
    closeSideMobile();
    stopChat();
    view = name;
    if (name === 'bookings') {
      renderBookings();
    } else if (name === 'messages') {
      renderMessages(q2uid(h));
    } else if (name === 'faq') {
      renderFaq();
    } else if (name === 'reviews') {
      renderReviews();
    } else if (name === 'inbox') {
      renderInbox();
    } else if (name === 'bugs') {
      renderBugs();
    } else if (name === 'accounts') {
      renderAccounts();
    } else if (name === 'customers') {
      renderCustomers();
    } else if (name === 'departures') {
      renderDepartures();
    } else if (name === 'tours') {
      renderTours();
    } else if (name === 'templates') {
      renderTemplates();
    } else if (name === 'site') {
      renderSite();
    } else if (name === 'layout') {
      renderLayout();
    } else if (name === 'content') {
      renderContent();
    } else if (name === 'destinations') {
      renderDestinations();
    } else if (name === 'reports') {
      renderReports();
    } else if (name === 'activity') {
      renderActivity();
    } else if (name === 'admins') {
      renderAdmins();
    } else if (name === 'access') {
      renderAccess();
    } else if (name === 'emails') {
      renderEmails();
    } else if (name === 'coupons') {
      renderCoupons();
    } else if (name === 'mymfa') {
      renderMyMfa();
    } else if (name === 'data') {
      renderData();
    } else {
      renderOverview();
    }
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', function () {
    if (!$('app').hidden) {
      route();
    }
  });

  /* ---------- Tổng quan ---------- */
  var ov = { days: 30, metric: 'count' };
  try {
    var savedOv = JSON.parse(localStorage.getItem('vdk-admin-ov') || 'null');
    if (savedOv && [7, 30, 90].indexOf(savedOv.days) > -1) {
      ov.days = savedOv.days;
    }
    if (savedOv && (savedOv.metric === 'count' || savedOv.metric === 'revenue')) {
      ov.metric = savedOv.metric;
    }
  } catch (e) {}
  function saveOv() {
    try {
      localStorage.setItem('vdk-admin-ov', JSON.stringify(ov));
    } catch (e) {}
  }
  var WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  function money(n) {
    n = Number(n) || 0;
    if (n >= 1e9) {
      return (n / 1e9).toFixed(1).replace('.', ',').replace(/,0$/, '') + ' tỷ';
    }
    if (n >= 1e6) {
      return (n / 1e6).toFixed(1).replace('.', ',').replace(/,0$/, '') + ' tr';
    }
    return fmt(n) + 'đ';
  }
  /* So sánh với kỳ trước: trả về chữ và màu (tăng = xanh, giảm = đỏ) */
  function vs(cur, prev, label) {
    if (!cur && !prev) {
      return { t: 'Chưa có dữ liệu', c: '' };
    }
    if (!prev) {
      return { t: 'Kỳ trước chưa có', c: 'up' };
    }
    var p = Math.round((cur - prev) / prev * 100);
    if (p === 0) {
      return { t: 'Bằng ' + label, c: '' };
    }
    return { t: '<span class="ms">' + (p > 0 ? 'trending_up' : 'trending_down') + '</span>' + Math.abs(p) +
        '% so với ' + label, c: p > 0 ? 'up' : 'down' };
  }
  function spark(vals) {
    if (!vals || vals.length < 2) {
      return '';
    }
    var max = Math.max.apply(null, vals) || 1, W = 100, H = 28, step = W / (vals.length - 1);
    var pts = vals.map(function (v, i) {
      return (i * step).toFixed(1) + ',' + (H - 2 - (H - 4) * v / max).toFixed(1);
    }).join(' ');
    return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H +
      '" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + pts + '"/></svg>';
  }
  function kpi(o) {
    var tag = o.href ? 'a' : 'div';
    return '<' + tag + ' class="card kpi' + (o.alert ? ' alert' : '') + '"' + (o.href ? ' href="' + o.href +
      '"' : '') + '><span class="lbl">' + o.lbl + '</span><span class="val">' + o.val + '</span>' +
      '<span class="cmp ' + (o.c || '') + '">' + o.cmp + '</span>' + (o.spark || '') + '</' + tag + '>';
  }

  function renderOverview(silent) {
    if (silent !== true) {
      main.innerHTML = '<div class="page-h"><div><h1>Tổng quan</h1><p>Đang tải số liệu…</p></div></div>' +
        '<div class="kpis">' + '<div class="skel kpi-s"></div>'.repeat(4) + '</div>' +
        '<div class="grid2"><div class="skel block"></div><div class="skel block"></div></div>';
    }
    var mine = 'overview';
    Promise.all([api('/stats?days=' + ov.days), api('/bookings?status=new&pageSize=5&sort=created_at&dir=desc'), can('activity') ? api('/activity').catch(function () {
        return null;
      }) : Promise.resolve(null)]).then(function (r) {
      if (view !== mine) {
        return;
      }
      drawOverview(r[0], r[1].items, r[2] && r[2].items);
    }).catch(function (ex) {
      if (view !== mine || silent === true) {
        return;
      }
      main.innerHTML = '<div class="page-h"><div><h1>Tổng quan</h1></div></div>';
      errorState(ex.message, function () {
        renderOverview();
      });
    });
    // tự làm mới mỗi phút khi đang xem tab này
    stopChat();
    chat.timer = setInterval(function () {
      if (view === 'overview' && !document.hidden && $('drawer').hidden) {
        renderOverview(true);
      }
    }, 60000);
  }

  function drawOverview(s, todo, acts) {
    setBadge(s.counts.new);
    var p = s.period, m = s.month, lbl = s.days + ' ngày trước';
    var wonRate = p.orders ? Math.round(p.won / p.orders * 100) : null, prevRate = p.prevOrders ? Math.round(p.prevWon / p.prevOrders * 100) : null;
    var avgOrder = p.won ? Math.round(p.revenue / p.won) : 0;
    var vRev = vs(p.revenue, p.prevRevenue, lbl), vOrd = vs(p.orders, p.prevOrders, lbl), vMon = vs(m.revenue, m.prevRevenue, 'tháng trước');
    var now = new Date(Date.now() + TZ), hour = now.getUTCHours();
    var hello = hour < 11 ? 'Chào buổi sáng' : hour < 14 ? 'Chào buổi trưa' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
    setMsgBadge(s.unreadMessages);
    setRevBadge(s.pendingReviews);

    var todos = [];
    if (s.counts.new) {
      todos.push(['inbox', s.counts.new + ' đơn chưa gọi lại', '#/bookings?status=new', 'new']);
    }
    if (s.unreadMessages) {
      todos.push(['forum', s.unreadMessages + ' tin nhắn chưa đọc (' + s.chat.unreadSessions + ' phiên)', '#/messages', 'new']);
    }
    if (s.pendingReviews) {
      todos.push(['star', s.pendingReviews + ' đánh giá chờ duyệt', '#/reviews', 'called']);
    }
    if (s.soon.count) {
      todos.push(['event', s.soon.count + ' đơn khởi hành trong 14 ngày' +
          (s.soon.people ? ' · ' +
            fmt(s.soon.people) + ' khách' : ''), '#/departures', 'won']);
    }

    var html = '<div class="page-h"><div><h1>' + hello + (ME && ME.name ? ', ' +
      esc(String(ME.name).replace(/\s*\(.*\)/, '').trim().split(/\s+/).pop()) : '') + '</h1><p>' + vnDate(Date.now()) + ' · Số liệu ' + s.days + ' ngày gần nhất · cập nhật ' + vnTime(Date.now()) + '</p></div>' +
      '<div class="h-acts"><div class="seg" role="group" aria-label="Khoảng thời gian">' + [7, 30, 90].map(function (d) {
      return '<button type="button" class="seg-b" data-days="' + d + '" aria-pressed="' + (d === s.days) +
        '">' + d + ' ngày</button>';
    }).join('') + '</div>' +
      '<button class="btn" id="refresh"><span class="ms">refresh</span>Làm mới</button></div></div>';

    html += '<section class="card todo-strip" aria-label="Việc cần xử lý">' + (todos.length ? '<h2>Cần xử lý ngay</h2><div class="ts-list">' + todos.map(function (t) {
      return '<a class="ts-item ' + t[3] + '" href="' + t[2] + '"><span class="ms">' + t[0] + '</span><span>' +
        esc(t[1]) + '</span><span class="ms go">chevron_right</span></a>';
    }).join('') + '</div>' : '<div class="ts-ok"><span class="ms">check_circle</span><div><h2>Mọi việc đã xử lý xong</h2><p class="muted">Không có đơn, tin nhắn hay đánh giá nào đang chờ.</p></div></div>') + '</section>';

    html += '<div class="kpis">' +
      kpi({
        lbl: 'Doanh thu ' + s.days + ' ngày',
        val: money(p.revenue),
        cmp: vRev.t,
        c: vRev.c,
        spark: spark(s.daily.map(function (d) {
          return d.revenue;
        }))
      }) +
      kpi({
        lbl: 'Đơn đặt ' + s.days + ' ngày',
        val: fmt(p.orders),
        cmp: vOrd.t,
        c: vOrd.c,
        spark: spark(s.daily.map(function (d) {
          return d.count;
        })),
        href: '#/bookings'
      }) +
      kpi({
        lbl: 'Tỉ lệ chốt',
        val: wonRate == null ? '–' : wonRate + '%',
        cmp: fmt(p.won) + ' chốt / ' + fmt(p.orders) + ' đơn' +
          (prevRate != null && wonRate != null ? ' · kỳ trước ' +
            prevRate + '%' : '')
      }) +
      kpi({
        lbl: 'Giá trị TB mỗi đơn chốt',
        val: p.won ? money(avgOrder) : '–',
        cmp: p.people ? fmt(p.people) + ' khách đã chốt trong kỳ' : 'Nhập số tiền khi chốt đơn'
      }) +
      '</div>';

    html += '<div class="kpis">' +
      kpi({
        lbl: 'Doanh thu tháng ' + m.key.slice(5) + '/' + m.key.slice(0, 4),
        val: money(m.revenue),
        cmp: vMon.t,
        c: vMon.c
      }) +
      kpi({
        lbl: 'Tài khoản khách',
        val: fmt(s.accounts.total),
        cmp: (s.accounts.last7 ? '+' + fmt(s.accounts.last7) + ' trong 7 ngày · ' : '') +
          fmt(s.accounts.verified) + ' đã xác minh',
        href: '#/accounts',
        spark: spark(s.accounts.daily)
      }) +
      kpi({
        lbl: 'Phiên chat đang mở',
        val: fmt(s.chat.open),
        alert: s.unreadMessages > 0,
        cmp: (s.chat.avgReplyMs != null ? 'Phản hồi đầu TB ' + durTxt(s.chat.avgReplyMs) + ' · ' : '') +
          fmt(s.chat.sessions) + ' phiên mới trong kỳ',
        href: '#/messages'
      }) +
      kpi({
        lbl: 'Điểm đánh giá',
        val: s.reviews.approved ? ratingTxt(s.reviews.avg) + ' <span class="ms fill">star</span>' : '–',
        cmp: fmt(s.reviews.approved) + ' đã duyệt' +
          (s.reviews.pending ? ' · ' + s.reviews.pending +
            ' chờ duyệt' : ''),
        href: '#/reviews'
      }) +
      '</div>';

    if (!s.total) {
      html += '<div class="card state"><span class="ms">inbox</span><h2>Chưa có yêu cầu nào</h2><p>Khi khách gửi form ở trang Liên hệ, đơn sẽ hiện ở đây. Bạn có thể gửi thử một đơn để kiểm tra.</p><a class="btn primary" href="/contact" target="_blank" rel="noopener">Mở trang Liên hệ</a></div>';
      main.innerHTML = html;
      bindOv();
      return;
    }

    html += '<div class="grid2"><section class="card" aria-labelledby="h-daily"><div class="card-top"><div><h2 id="h-daily">' + (ov.metric === 'revenue' ? 'Doanh thu mỗi ngày' : 'Đơn mỗi ngày') + '</h2><p class="sub">' + s.days + ' ngày gần nhất' + (ov.metric === 'revenue' ? ' · đơn đã chốt' : '') + '</p></div>' +
      '<div class="seg" role="group" aria-label="Chỉ số"><button type="button" class="seg-b" data-metric="count" aria-pressed="' + (ov.metric === 'count') + '">Số đơn</button><button type="button" class="seg-b" data-metric="revenue" aria-pressed="' + (ov.metric === 'revenue') + '">Doanh thu</button></div></div><div id="daily"></div></section>' +
      '<section class="card" aria-labelledby="h-dest"><h2 id="h-dest">Điểm đến</h2><p class="sub">Số đơn · doanh thu đã chốt</p><div id="dest"></div></section></div>';

    html += '<div class="grid2 even"><section class="card" aria-labelledby="h-fun"><h2 id="h-fun">Phễu xử lý đơn</h2><p class="sub">Toàn bộ đơn theo trạng thái</p><div id="funnel"></div></section>' +
      '<section class="card" aria-labelledby="h-rate"><h2 id="h-rate">Đánh giá của khách</h2><p class="sub">Phân bố theo số sao (4,5 tính vào mức 5)</p><div id="rate"></div></section></div>';

    html += '<div class="grid2 even"><section class="card" aria-labelledby="h-wd"><h2 id="h-wd">Khách đặt vào thứ mấy</h2><p class="sub">Số đơn theo ngày trong tuần</p><div id="wd"></div></section>' +
      '<section class="card" aria-labelledby="h-src"><h2 id="h-src">Khách đến từ đâu</h2><p class="sub">Số đơn theo nguồn</p><div id="srcs"></div></section></div>';

    html += '<div class="grid2 even"><section class="card" aria-labelledby="h-up"><h2 id="h-up">Sắp khởi hành</h2><p class="sub">5 chuyến gần nhất · <a href="#/departures">Xem lịch</a></p>' +
      (s.upcoming.length ? '<ul class="mini">' + s.upcoming.map(function (u) {
        return '<li><b>' + esc(u.name) + '</b><span>' + esc(u.destination || 'Chưa chọn điểm đến') +
          (u.people ? ' · ' +
            u.people + ' khách' : '') + '</span><time>' + isoToVn(u.depart_date) +
          '</time></li>';
      }).join('') + '</ul>' : '<p class="muted">Chưa có chuyến nào sắp khởi hành.</p>') + '</section>' +
      '<section class="card" aria-labelledby="h-act"><h2 id="h-act">Hoạt động gần đây</h2><p class="sub">' + (acts ? 'Thao tác của quản trị viên · <a href="#/activity">Xem tất cả</a>' : 'Bạn chưa có quyền xem nhật ký') + '</p>' +
      (acts && acts.length ? '<ul class="mini">' + acts.slice(0, 6).map(function (a) {
        return '<li><b>' + esc(a.action) + '</b><span>' + esc(a.detail || '') + '</span><time>' + ago(a.at) +
          '</time></li>';
      }).join('') + '</ul>' : '<p class="muted">' + (acts ? 'Chưa có hoạt động nào.' : '') + '</p>') + '</section></div>';

    html += '<section class="card" aria-labelledby="h-todo"><h2 id="h-todo">Cần gọi lại</h2><p class="sub">Yêu cầu mới nhất chưa xử lý</p>';
    if (!todo.length) {
      html += '<p class="muted">Không còn yêu cầu nào chờ gọi. </p>';
    } else {
      html += '<ul class="todo">' + todo.map(function (b) {
        return '<li><button class="open" data-id="' + b.id + '"><b>' + esc(b.name) + '</b><span>' + esc(b.destination || 'Chưa chọn điểm đến') + ' · ' + ago(b.created_at) + '</span></button>' +
          '<a class="icon-btn" href="tel:' + esc(b.phone) + '" aria-label="Gọi ' + esc(b.name) + '"><span class="ms">call</span></a></li>';
      }).join('') + '</ul>';
    }
    html += '</section>';
    main.innerHTML = html;
    bindOv();

    drawDaily($('daily'), s.daily, ov.metric);
    var rz;
    window.onresize = function () {
      clearTimeout(rz);
      rz = setTimeout(function () {
        var el = $('daily');
        if (el && view === 'overview') {
          drawDaily(el, s.daily, ov.metric);
        }
      }, 150);
    };
    drawBars($('dest'), s.destinations.map(function (d) {
      return {
        name: d.name,
        n: d.n,
        sub: d.revenue ? money(d.revenue) : ''
      };
    }), 'Chưa có khách nào chọn điểm đến.');
    drawBars($('funnel'), [{ name: 'Mới', n: s.counts.new }, { name: 'Đã gọi', n: s.counts.called }, {
        name: 'Đã chốt',
        n: s.counts.won,
        cls: 'ok'
      }, {
        name: 'Huỷ',
        n: s.counts.cancelled,
        cls: 'bad'
      }]);
    var tot = s.reviews.approved, dist = s.reviews.dist;
    $('rate').innerHTML = tot ? '<div class="rate-box"><div class="rate-big"><strong>' + ratingTxt(s.reviews.avg) + '</strong>' + starsHTML(s.reviews.avg) + '<small>' + tot + ' đánh giá</small></div><div class="rate-bars">' +
      [5, 4, 3, 2, 1].map(function (k) {
        return '<div class="rb"><span>' + k + ' <span class="ms fill">star</span></span><i><b style="width:' + Math.round(dist[k] / tot * 100) +
          '%"></b></i><em>' + dist[k] + '</em></div>';
      }).join('') + '</div></div>' : '<p class="muted">Chưa có đánh giá nào được duyệt.</p>';
    drawBars($('wd'), [1, 2, 3, 4, 5, 6, 0].map(function (i) {
      return { name: WD[i], n: s.weekday[i] };
    }));
    drawBars($('srcs'), s.sources.map(function (x) {
      return { name: SOURCE[x.source] || x.source, n: x.n };
    }).sort(function (a, b) {
      return b.n - a.n;
    }), 'Chưa có đơn nào trong kỳ.');
    main.querySelectorAll('.todo .open').forEach(function (b) {
      var item = todo.filter(function (x) {
        return x.id == b.dataset.id;
      })[0];
      b.onclick = function () {
        openDrawer(item, function () {
          renderOverview(true);
        });
      };
    });
  }
  function durTxt(ms) {
    var m = Math.round(ms / 60000);
    return m < 1 ? 'dưới 1 phút' : m < 60 ? m + ' phút' : m < 1440 ? Math.round(m / 6) / 10 + ' giờ' : Math.round(m / 144) / 10 +
      ' ngày';
  }
  function bindOv() {
    var b = $('refresh');
    if (b) {
      b.onclick = function () {
        renderOverview();
      };
    }
    main.querySelectorAll('[data-days]').forEach(function (x) {
      x.onclick = function () {
        ov.days = Number(x.dataset.days);
        saveOv();
        renderOverview();
      };
    });
    main.querySelectorAll('[data-metric]').forEach(function (x) {
      x.onclick = function () {
        ov.metric = x.dataset.metric;
        saveOv();
        renderOverview(true);
      };
    });
  }

  /* Biểu đồ cột theo số ngày đã chọn, trục Y bắt đầu từ 0; metric = 'count' (số đơn) hoặc 'revenue' (đồng) */
  function drawDaily(el, daily, metric) {
    var rev = metric === 'revenue', key = rev ? 'revenue' : 'count';
    var W = Math.max(300, Math.round(el.clientWidth || 640)), H = 220, L = rev ? 44 : 28, B = 24, T = 8;
    var every = daily.length <= 7 ? 1 : daily.length <= 30 ? (W < 480 ? 7 : 5) : (W < 480 ? 15 : 10);
    var max = Math.max.apply(null, daily.map(function (d) {
      return d[key];
    }));
    var step = rev ? Math.max(1, Math.pow(10, Math.floor(Math.log10(max || 1)))) : 1;
    var top = rev ? Math.max(step, Math.ceil(max / 4 / step) * step * 4) : Math.max(4, Math.ceil(max / 4) * 4);
    var bw = (W - L) / daily.length;
    var svg = '<svg class="chart" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H +
      '" role="img" aria-label="Biểu đồ cột ' + (rev ? 'doanh thu' : 'số đơn') + ' mỗi ngày trong ' +
      daily.length + ' ngày">';
    for (var i = 0; i <= 4; i++) {
      var v = top / 4 * i, y = H - B - (H - B - T) * v / top;
      svg += '<line class="grid" x1="' + L + '" x2="' + W + '" y1="' + y + '" y2="' + y + '"/><text x="' +
        (L - 6) + '" y="' + (y +
        4) + '" text-anchor="end">' + (rev ? money(v).replace('đ', '') : v) +
        '</text>';
    }
    daily.forEach(function (d, k) {
      var val = d[key], h = (H - B - T) * val / top, x = L + k * bw + bw * .18, w = Math.max(bw * .64, 1), y = H - B - h;
      var dd = d.date.split('-');
      var label = dd[2] + '/' + dd[1] + ': ' + (rev ? money(val) : val + ' đơn');
      svg += '<g tabindex="0" data-tip="' + esc(label) + '" aria-label="' + esc(label) + '">' +
        '<rect class="hit" x="' + (L + k * bw) + '" y="' + T + '" width="' + bw + '" height="' + (H - B - T) + '" fill="transparent"/>' +
        '<rect class="bar' + (val ? '' : ' zero') + '" x="' + x + '" y="' + (val ? y : H - B - 2) + '" width="' + w + '" height="' + (val ? h : 2) + '" rx="2"/></g>';
      if ((daily.length - 1 - k) % every === 0) {
        svg += '<text x="' + (x + w / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + dd[2] + '/' + dd[1] +
          '</text>';
      }
    });
    el.innerHTML = svg + '</svg>';
    bindTips(el);
  }

  function bindTips(el) {
    var tip = document.createElement('div');
    tip.className = 'tip';
    tip.hidden = true;
    document.body.appendChild(tip);
    function show(g, x, y) {
      tip.textContent = g.dataset.tip;
      tip.hidden = false;
      tip.style.left = Math.min(x + 12, innerWidth - 150) + 'px';
      tip.style.top = (y - 36) + 'px';
    }
    el.querySelectorAll('[data-tip]').forEach(function (g) {
      g.addEventListener('mousemove', function (e) {
        show(g, e.clientX, e.clientY);
      });
      g.addEventListener('mouseleave', function () {
        tip.hidden = true;
      });
      g.addEventListener('focus', function () {
        var r = g.getBoundingClientRect();
        show(g, r.left, r.top);
      });
      g.addEventListener('blur', function () {
        tip.hidden = true;
      });
    });
    var obs = new MutationObserver(function () {
      if (!document.body.contains(el)) {
        tip.remove();
        obs.disconnect();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  /* Thanh ngang: giá trị lớn nhất chiếm 100%; sub = chú thích phụ (ví dụ doanh thu) */
  function drawBars(el, list, emptyMsg) {
    var max = Math.max.apply(null, list.map(function (d) {
      return d.n;
    }).concat([0]));
    if (!list.length || !max) {
      el.innerHTML = '<p class="muted">' + esc(emptyMsg || 'Chưa có dữ liệu.') + '</p>';
      return;
    }
    el.innerHTML = '<div class="hbars">' + list.map(function (d) {
      return '<div class="hbar"><span>' + esc(d.name) + '</span><span class="track"><span class="fill ' +
        (d.cls || '') + '" style="width:' + (d.n / max * 100) + '%"></span></span><b>' + d.n +
        (d.sub ? '<small>' +
          esc(d.sub) + '</small>' : '') + '</b></div>';
    }).join('') + '</div>';
  }

  /* ---------- Danh sách đơn ---------- */
  var SOURCE = {
    contact: 'Trang Liên hệ',
    home: 'Ô tìm tour trang chủ',
    admin: 'Admin nhập tay'
  };
  var listState = {
    q: '',
    status: '',
    destination: '',
    from: '',
    to: '',
    phone: '',
    sort: 'created_at',
    dir: 'desc',
    page: 1
  };
  var selected = new Set();
  var pageItems = [];
  var qTimer, listSeq = 0;

  function listQuery(extra) {
    var p = new URLSearchParams();
    ['q', 'status', 'destination', 'from', 'to', 'phone', 'sort', 'dir', 'page'].forEach(function (k) {
      if (listState[k]) {
        p.set(k, listState[k]);
      }
    });
    for (var k in (extra || {})) {
      p.set(k, extra[k]);
    }
    return p.toString();
  }

  function opt(v, l, cur) {
    return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(l) + '</option>';
  }

  function renderBookings() {
    main.innerHTML = '<div class="page-h"><div><h1>Đơn đặt</h1><p id="count">&nbsp;</p></div>' +
      '<button class="btn primary" id="addBooking" type="button"><span class="ms">add</span>Thêm đơn</button></div>' +
      '<div class="chips" id="chips" role="group" aria-label="Lọc nhanh theo trạng thái"></div>' +
      '<div class="toolbar" role="search">' +
      '<label class="search-wrap"><span class="ms">search</span><input type="search" id="fq" placeholder="Tìm tên, SĐT, lời nhắn" aria-label="Tìm kiếm" value="' + esc(listState.q) + '"></label>' +
      '<select id="fs" aria-label="Trạng thái">' + opt('', 'Mọi trạng thái', listState.status) + Object.keys(STATUS).map(function (k) {
      return opt(k, STATUS[k], listState.status);
    }).join('') + '</select>' +
      '<select id="fd" aria-label="Điểm đến">' + opt('', 'Mọi điểm đến', listState.destination) + DESTS.map(function (d) {
      return opt(d, d, listState.destination);
    }).join('') + '</select>' +
      '<input type="date" id="ff" aria-label="Từ ngày" value="' + esc(listState.from) + '">' +
      '<input type="date" id="ft" aria-label="Đến ngày" value="' + esc(listState.to) + '">' +
      '<a class="btn" id="export" href="/api/admin/export.csv?' + esc(listQuery()) + '" download><span class="ms">download</span>Xuất CSV</a><a class="btn" id="exportX" href="/api/admin/export.xlsx?' + esc(listQuery()) + '" download><span class="ms">table_view</span>Xuất Excel</a></div>' +
      '<div class="bulk" id="bulk" hidden></div>' +
      '<div class="card table-card" id="list"></div>';

    var change = function () {
      listState.page = 1;
      selected.clear();
      syncChips();
      loadList();
    };
    loadChips();
    $('addBooking').onclick = function () {
      openDrawer(null, function () {
        loadChips();
        loadList(true);
      });
    };
    $('fq').oninput = function () {
      clearTimeout(qTimer);
      qTimer = setTimeout(function () {
        listState.q = $('fq').value.trim();
        change();
      }, 300);
    };
    $('fs').onchange = function () {
      listState.status = this.value;
      change();
    };
    $('fd').onchange = function () {
      listState.destination = this.value;
      change();
    };
    $('ff').onchange = function () {
      listState.from = this.value;
      change();
    };
    $('ft').onchange = function () {
      listState.to = this.value;
      change();
    };
    loadList();
  }

  var chipCounts = null;
  function loadChips() {
    api('/stats').then(function (st) {
      chipCounts = st;
      setBadge(st.counts.new);
      syncChips();
    }).catch(function () {});
    syncChips();
  }
  function syncChips() {
    var box = $('chips');
    if (!box) {
      return;
    }
    var items = [['', 'Tất cả', chipCounts ? chipCounts.total : null]].concat(Object.keys(STATUS).map(function (k) {
      return [k, STATUS[k], chipCounts ? chipCounts.counts[k] : null];
    }));
    box.innerHTML = items.map(function (it) {
      return '<button type="button" class="chip" data-s="' + it[0] + '" aria-pressed="' +
        (listState.status === it[0]) + '">' + esc(it[1]) +
        (it[2] == null ? '' : ' <b>' +
          fmt(it[2]) + '</b>') + '</button>';
    }).join('');
    box.querySelectorAll('.chip').forEach(function (c) {
      c.onclick = function () {
        listState.status = c.dataset.s;
        $('fs').value = listState.status;
        listState.page = 1;
        selected.clear();
        syncChips();
        loadList();
      };
    });
  }

  function loadList(silent) {
    var box = $('list');
    if (!box) {
      return;
    }
    var seq = ++listSeq;
    var ex = $('export');
    if (ex) {
      ex.href = '/api/admin/export.csv?' + listQuery();
    }
    var exX = $('exportX');
    if (exX) {
      exX.href = '/api/admin/export.xlsx?' + listQuery();
    }
    if (silent !== true) {
      box.innerHTML = '<div class="skel line"></div>'.repeat(6);
    }
    api('/bookings?' + listQuery({ pageSize: 15 })).then(function (r) {
      if (seq !== listSeq || view !== 'bookings') {
        return;
      }
      drawList(r);
    }).catch(function (ex) {
      if (seq !== listSeq || view !== 'bookings' || silent === true) {
        return;
      }
      box.innerHTML = '';
      errorStateIn(box, ex.message);
    });
  }
  function errorStateIn(box, msg) {
    box.innerHTML = '<div class="state err" role="alert"><span class="ms">wifi_off</span><h2>Không tải được dữ liệu</h2><p>' +
      esc(msg) + '</p><button class="btn" id="retry"><span class="ms">refresh</span>Thử lại</button></div>';
    $('retry').onclick = function () {
      loadList();
    };
  }

  /* Thanh thao tác hàng loạt */
  function syncBulk() {
    var bar = $('bulk');
    if (!bar) {
      return;
    }
    var n = selected.size;
    bar.hidden = !n;
    var all = $('selAll');
    if (all) {
      var onPage = pageItems.filter(function (x) {
        return selected.has(x.id);
      }).length;
      all.checked = pageItems.length > 0 && onPage === pageItems.length;
      all.indeterminate = onPage > 0 && onPage < pageItems.length;
    }
    if (!n) {
      bar.innerHTML = '';
      return;
    }
    bar.innerHTML = '<b>Đã chọn ' + n + ' đơn</b><span class="bulk-acts">' +
      Object.keys(STATUS).map(function (k) {
        return '<button type="button" class="chip" data-bs="' + k + '">Chuyển “' + STATUS[k] + '”</button>';
      }).join('') +
      '<button type="button" class="chip danger" id="bulkDel">Xoá</button><button type="button" class="chip" id="bulkClear">Bỏ chọn</button></span>';
    bar.querySelectorAll('[data-bs]').forEach(function (b) {
      b.onclick = function () {
        bulk({ action: 'status', status: b.dataset.bs }, 'Đã chuyển ' + n + ' đơn sang “' +
          STATUS[b.dataset.bs] + '”');
      };
    });
    $('bulkDel').onclick = function () {
      confirmBox('Xoá ' + n + ' đơn đã chọn? Không thể khôi phục.', {
        title: 'Xoá ' + n + ' đơn',
        ok: 'Xoá ' + n + ' đơn',
        danger: true
      }).then(function (ok) {
        if (ok) {
          bulk({ action: 'delete' }, 'Đã xoá ' + n + ' đơn');
        }
      });
    };
    $('bulkClear').onclick = function () {
      selected.clear();
      document.querySelectorAll('.rowsel').forEach(function (c) {
        c.checked = false;
      });
      syncBulk();
    };
  }
  function bulk(body, okMsg) {
    body.ids = Array.from(selected);
    api('/bookings/bulk', { method: 'POST', body: body }).then(function () {
      toast(okMsg);
      selected.clear();
      loadChips();
      loadList(true);
    }).catch(function (ex) {
      toast(ex.message, true);
    });
  }

  function hasFilter() {
    return !!(listState.q || listState.status || listState.destination || listState.from || listState.to || listState.phone);
  }

  function drawList(r) {
    var box = $('list');
    pageItems = r.items;
    var cnt = $('count');
    cnt.innerHTML = (r.total ? fmt(r.total) + ' đơn' + (hasFilter() ? ' phù hợp bộ lọc' : '') : (hasFilter() ? 'Không có đơn phù hợp' : 'Chưa có đơn nào')) +
      (listState.phone ? ' · số <b>' + esc(listState.phone) +
        '</b> <button type="button" class="linkbtn" id="clearPhone">Bỏ lọc số này</button>' : '');
    var cp = $('clearPhone');
    if (cp) {
      cp.onclick = function () {
        listState.phone = '';
        location.hash = '#/bookings';
      };
    }

    if (!r.items.length) {
      box.innerHTML = hasFilter()
        ? '<div class="state"><span class="ms">search</span><h2>Không có đơn phù hợp</h2><p>Thử bỏ bớt bộ lọc hoặc tìm bằng từ khác.</p><button class="btn" id="clear">Xoá bộ lọc</button></div>'
        : '<div class="state"><span class="ms">inbox</span><h2>Chưa có yêu cầu nào</h2><p>Khi khách gửi form ở trang Liên hệ, đơn sẽ hiện ở đây. Bạn cũng có thể tự thêm đơn khi khách gọi điện.</p><button class="btn primary" id="emptyAdd"><span class="ms">add</span>Thêm đơn</button></div>';
      var c = $('clear');
      if (c) {
        c.onclick = function () {
          listState.q = listState.status = listState.destination = listState.from = listState.to = listState.phone = '';
          selected.clear();
          renderBookings();
        };
      }
      var ea = $('emptyAdd');
      if (ea) {
        ea.onclick = function () {
          $('addBooking').click();
        };
      }
      syncBulk();
      return;
    }
    function th(key, label, cls) {
      var on = listState.sort === key;
      return '<th scope="col" class="' + (cls || '') + '"' +
        (on ? ' aria-sort="' +
          (listState.dir === 'asc' ? 'ascending' : 'descending') + '"' : '') +
        '><button type="button" data-sort="' + key + '">' + label + '<span class="ms">' +
        (on && listState.dir === 'asc' ? 'arrow_upward' : 'arrow_downward') + '</span></button></th>';
    }
    var pages = Math.ceil(r.total / r.pageSize);
    box.innerHTML = '<table class="tbl"><caption class="sr" style="position:absolute;left:-9999px">Danh sách đơn đặt tour</caption><thead><tr>' +
      '<th scope="col" class="sel"><input type="checkbox" id="selAll" aria-label="Chọn tất cả đơn trên trang"></th>' +
      th('created_at', 'Gửi lúc') + th('name', 'Khách') + th('destination', 'Điểm đến') + th('depart_date', 'Ngày đi') +
      '<th scope="col" class="num">Số người</th>' + th('status', 'Trạng thái') + '</tr></thead><tbody>' +
      r.items.map(function (b) {
        return '<tr class="' + (b.status === 'new' ? 'is-new' : '') + '" data-id="' + b.id + '">' +
          '<td class="sel"><input type="checkbox" class="rowsel" data-id="' + b.id + '" aria-label="Chọn đơn của ' + esc(b.name) + '"' + (selected.has(b.id) ? ' checked' : '') + '></td>' +
          '<td class="meta"><span>' + vnDate(b.created_at) + '</span> <span class="muted">' + vnTime(b.created_at) + '</span></td>' +
          '<td class="name"><button class="row-btn" type="button">' + esc(b.name) + '</button><span>' + esc(b.phone) + '</span></td>' +
          '<td class="meta">' + esc(b.destination || '–') + '</td>' +
          '<td class="meta" data-l="Ngày đi">' + isoToVn(b.depart_date) + '</td>' +
          '<td class="num meta hide-m">' + (b.people || '–') + '</td>' +
          '<td class="stc">' + stBadge(b.status) + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<div class="pager"><span>Trang ' + r.page + ' / ' + pages + '</span><div>' +
      '<button class="btn" id="prev"' + (r.page <= 1 ? ' disabled' : '') + '><span class="ms">chevron_left</span>Trước</button>' +
      '<button class="btn" id="next"' + (r.page >= pages ? ' disabled' : '') + '>Sau<span class="ms">chevron_right</span></button></div></div>';

    box.querySelectorAll('[data-sort]').forEach(function (b) {
      b.onclick = function () {
        var k = b.dataset.sort;
        if (listState.sort === k) {
          listState.dir = listState.dir === 'asc' ? 'desc' : 'asc';
        } else {
          listState.sort = k;
          listState.dir = k === 'created_at' ? 'desc' : 'asc';
        }
        listState.page = 1;
        loadList();
      };
    });
    box.querySelectorAll('tbody tr').forEach(function (tr) {
      var item = r.items.filter(function (x) {
        return x.id == tr.dataset.id;
      })[0];
      tr.onclick = function (e) {
        if (e.target.closest('.sel')) {
          return;
        }
        openDrawer(item, function () {
          loadChips();
          loadList(true);
        });
      };
    });
    box.querySelectorAll('.rowsel').forEach(function (c) {
      c.onchange = function () {
        var id = Number(c.dataset.id);
        if (c.checked) {
          selected.add(id);
        } else {
          selected.delete(id);
        }
        syncBulk();
      };
    });
    $('selAll').onchange = function () {
      var on = this.checked;
      pageItems.forEach(function (x) {
        if (on) {
          selected.add(x.id);
        } else {
          selected.delete(x.id);
        }
      });
      box.querySelectorAll('.rowsel').forEach(function (c) {
        c.checked = on;
      });
      syncBulk();
    };
    $('prev').onclick = function () {
      listState.page--;
      selected.clear();
      loadList();
    };
    $('next').onclick = function () {
      listState.page++;
      selected.clear();
      loadList();
    };
    syncBulk();
  }

  /* ---------- Khách hàng (gộp theo SĐT) ---------- */
  var custState = { q: '', page: 1 }, custSeq = 0, custTimer;
  function renderCustomers() {
    main.innerHTML = '<div class="page-h"><div><h1>Khách hàng</h1><p id="ccount">Gộp các đơn theo số điện thoại.</p></div>' +
      (can('export', true) && can('pii', true) ? '<div class="h-acts"><a class="btn" id="cX" href="/api/admin/customers.xlsx" download><span class="ms">table_view</span>Xuất Excel</a></div>' : '') + '</div>' +
      '<div class="toolbar one" role="search"><label class="search-wrap"><span class="ms">search</span><input type="search" id="cq" placeholder="Tìm tên hoặc SĐT" aria-label="Tìm khách" value="' + esc(custState.q) + '"></label></div>' +
      '<div class="card table-card" id="clist"></div>';
    $('cq').oninput = function () {
      clearTimeout(custTimer);
      custTimer = setTimeout(function () {
        custState.q = $('cq').value.trim();
        custState.page = 1;
        loadCustomers();
      }, 300);
    };
    loadCustomers();
  }
  function loadCustomers() {
    var box = $('clist');
    if (!box) {
      return;
    }
    var seq = ++custSeq;
    if ($('cX')) {
      $('cX').href = '/api/admin/customers.xlsx' +
        (custState.q ? '?q=' + encodeURIComponent(custState.q) : '');
    }
    box.innerHTML = '<div class="skel line"></div>'.repeat(6);
    var qs = new URLSearchParams();
    if (custState.q) {
      qs.set('q', custState.q);
    }
    qs.set('page', custState.page);
    api('/customers?' + qs.toString()).then(function (r) {
      if (seq !== custSeq || view !== 'customers') {
        return;
      }
      $('ccount').textContent = r.total ? fmt(r.total) + ' khách' : 'Chưa có khách nào';
      if (!r.items.length) {
        box.innerHTML = '<div class="state"><span class="ms">groups</span><h2>' +
          (custState.q ? 'Không tìm thấy khách' : 'Chưa có khách nào') +
          '</h2><p>Khách xuất hiện ở đây sau khi gửi đơn đầu tiên.</p></div>';
        return;
      }
      var pages = Math.ceil(r.total / r.pageSize);
      box.innerHTML = '<table class="tbl cust"><thead><tr><th scope="col">Khách</th><th scope="col" class="num">Số đơn</th><th scope="col" class="num">Đã chốt</th><th scope="col" class="hide-m">Điểm đến</th><th scope="col">Gần nhất</th></tr></thead><tbody>' +
        r.items.map(function (c) {
          return '<tr data-p="' + esc(c.phone) + '"><td class="name"><button class="row-btn" type="button">' + esc(c.name) + '</button><span>' + esc(c.phone) + '</span></td>' +
            '<td class="num meta" data-l="Số đơn">' + c.bookings + '</td><td class="num meta" data-l="Đã chốt">' + (c.won || 0) + '</td>' +
            '<td class="meta hide-m">' + esc((c.destinations || '–').split(',').join(', ')) + '</td><td class="meta">' + ago(c.last_at) + '</td></tr>';
        }).join('') + '</tbody></table>' +
        '<div class="pager"><span>Trang ' + r.page + ' / ' + pages + '</span><div><button class="btn" id="cprev"' + (r.page <= 1 ? ' disabled' : '') + '><span class="ms">chevron_left</span>Trước</button>' +
        '<button class="btn" id="cnext"' + (r.page >= pages ? ' disabled' : '') + '>Sau<span class="ms">chevron_right</span></button></div></div>';
      box.querySelectorAll('tbody tr').forEach(function (tr) {
        tr.onclick = function () {
          listState.q = listState.status = listState.destination = listState.from = listState.to = '';
          location.hash = '#/bookings?phone=' + encodeURIComponent(tr.dataset.p);
        };
      });
      $('cprev').onclick = function () {
        custState.page--;
        loadCustomers();
      };
      $('cnext').onclick = function () {
        custState.page++;
        loadCustomers();
      };
    }).catch(function (ex) {
      if (seq === custSeq && view === 'customers') {
        box.innerHTML = '';
        errorStateIn(box, ex.message);
        $('retry').onclick = loadCustomers;
      }
    });
  }

  /* ---------- Lịch khởi hành ---------- */
  var WEEKDAY = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
  function renderDepartures() {
    main.innerHTML = '<div class="page-h"><div><h1>Lịch khởi hành</h1><p id="dcount">Các đơn có ngày đi từ hôm nay trở đi (không tính đơn đã huỷ).</p></div><button class="btn" id="drefresh"><span class="ms">refresh</span>Làm mới</button></div><div id="dlist">' +
      '<div class="skel block" style="margin-bottom:14px"></div>'.repeat(2) + '</div>';
    $('drefresh').onclick = renderDepartures;
    api('/departures').then(function (r) {
      if (view !== 'departures') {
        return;
      }
      var box = $('dlist');
      if (!r.items.length) {
        box.innerHTML = '<div class="card state"><span class="ms">event</span><h2>Chưa có lịch khởi hành</h2><p>Đơn có điền ngày đi sẽ hiện ở đây, xếp theo ngày.</p></div>';
        return;
      }
      var groups = [], idx = {};
      r.items.forEach(function (b) {
        if (!(b.depart_date in idx)) {
          idx[b.depart_date] = groups.length;
          groups.push({ date: b.depart_date, items: [] });
        }
        groups[idx[b.depart_date]].items.push(b);
      });
      var people = r.items.reduce(function (s, b) {
        return s + (b.people || 0);
      }, 0);
      $('dcount').textContent = r.items.length + ' đơn · ' + fmt(people) + ' khách · ' + groups.length +
        ' ngày khởi hành';
      box.innerHTML = groups.map(function (g) {
        var d = new Date(g.date + 'T00:00:00Z'), away = Math.round((d - Date.parse(r.today + 'T00:00:00Z')) / 86400000);
        var when = away === 0 ? 'Hôm nay' : away === 1 ? 'Ngày mai' : 'Còn ' + away + ' ngày';
        var ppl = g.items.reduce(function (s, b) {
          return s + (b.people || 0);
        }, 0);
        return '<section class="card day' + (away <= 1 ? ' soon' : '') + '"><div class="day-h"><div><h2>' + WEEKDAY[d.getUTCDay()] + ', ' + isoToVn(g.date) + '</h2><p class="sub">' + g.items.length + ' đơn · ' + (ppl ? ppl +
          ' khách' : 'chưa rõ số khách') + '</p></div><span class="when">' + when + '</span></div>' +
          '<ul class="todo">' + g.items.map(function (b) {
          return '<li><button class="open" data-id="' + b.id + '"><b>' + esc(b.name) + '</b><span>' + esc(b.destination || 'Chưa chọn điểm đến') + (b.people ? ' · ' +
            b.people + ' người' : '') + '</span></button>' + stBadge(b.status) +
            '<a class="icon-btn" href="tel:' + esc(b.phone) + '" aria-label="Gọi ' + esc(b.name) + '"><span class="ms">call</span></a></li>';
        }).join('') + '</ul></section>';
      }).join('');
      box.querySelectorAll('.open').forEach(function (b) {
        var item = r.items.filter(function (x) {
          return x.id == b.dataset.id;
        })[0];
        b.onclick = function () {
          openDrawer(item, function () {
            renderDepartures();
          });
        };
      });
    }).catch(function (ex) {
      if (view !== 'departures') {
        return;
      }
      $('dlist').innerHTML = '';
      errorStateIn($('dlist'), ex.message);
      $('retry').onclick = renderDepartures;
    });
  }

  /* ================= Tour & giá · Mẫu trả lời · Báo cáo ================= */
  var VND = function (n) {
    return fmt(n || 0) + 'đ';
  };
  function openPanel(title, sub, body, foot, changed) {
    onChanged = changed || null;
    drawerOpener = document.activeElement;
    var d = $('drawer');
    d.innerHTML = '<header><div><h2>' + esc(title) + '</h2><span class="muted">' + esc(sub || '') + '</span></div><button class="icon-btn" id="dClose" aria-label="Đóng"><span class="ms">close</span></button></header>' +
      '<div class="body">' + body + '</div><footer>' + foot + '</footer>';
    $('scrim').hidden = false;
    d.hidden = false;
    $('dClose').onclick = function () {
      closeDrawer();
    };
    return d;
  }
  var toursCache = null, tplCache = null;
  function getTours(force) {
    if (toursCache && !force) {
      return Promise.resolve(toursCache);
    }
    return api('/tours').then(function (r) {
      toursCache = r.items;
      return toursCache;
    });
  }
  function getTemplates(force) {
    if (tplCache && !force) {
      return Promise.resolve(tplCache);
    }
    return api('/templates').then(function (r) {
      tplCache = r.items;
      return tplCache;
    });
  }
  /* Điền biến trong mẫu: {ten} tên khách, {tour} và {gia} theo điểm đến của đơn (nếu biết) */
  function fillTpl(body, ctx) {
    ctx = ctx || {};
    var first = String(ctx.name || '').trim().split(/\s+/).pop() || 'bạn';
    return body.replace(/\{ten\}/g, first)
      .replace(/\{tour\}/g, ctx.tour ? ctx.tour.name : '{tour}')
      .replace(/\{gia\}/g, ctx.tour ? VND(ctx.tour.price) : '{gia}');
  }
  function tourFor(dest) {
    var t = (toursCache || []).filter(function (x) {
      return x.destination === dest && x.active;
    })[0];
    return t || null;
  }

  /* ---------- Tour & giá ---------- */
  function renderTours() {
    main.innerHTML = '<div class="page-h"><div><h1>Tour &amp; giá</h1><p>Giá và thông tin sửa ở đây sẽ hiện ngay trên trang chủ (tối đa 1 phút).</p></div>' +
      '<div class="h-acts"><button class="btn" id="tAdjust"><span class="ms">sell</span>Đổi giá hàng loạt</button><button class="btn primary" id="tAdd"><span class="ms">add</span>Thêm tour</button></div></div>' +
      '<div class="card table-card" id="tList"><div class="skel line"></div>' + '<div class="skel line"></div>'.repeat(3) + '</div>';
    $('tAdd').onclick = function () {
      tourPanel(null);
    };
    $('tAdjust').onclick = function () {
      dialog({
        title: 'Đổi giá hàng loạt',
        icon: 'sell',
        msg: 'Tăng/giảm giá TẤT CẢ tour bao nhiêu %? Ví dụ: 10 để tăng 10%, -5 để giảm 5%. Giá được làm tròn tới 10.000đ.',
        input: {
          label: 'Phần trăm (%)',
          placeholder: '10 hoặc -5',
          mode: 'decimal'
        },
        ok: 'Tiếp tục'
      }).then(function (v) {
        if (v === null) {
          return;
        }
        var pct = Number(String(v).replace(',', '.'));
        if (!pct || !isFinite(pct)) {
          toast('Hãy nhập một số khác 0, ví dụ 10 hoặc -5', true);
          return;
        }
        return confirmBox((pct > 0 ? 'Tăng ' : 'Giảm ') + Math.abs(pct) + '% giá tất cả tour?', {
          title: 'Xác nhận đổi giá',
          icon: 'sell',
          ok: 'Đổi giá'
        }).then(function (ok) {
          if (!ok) {
            return;
          }
          return api('/tours/price-adjust', { method: 'POST', body: { percent: pct } }).then(function (r) {
            toast('Đã đổi giá ' + r.changed + ' tour');
            loadTours();
          });
        });
      }).catch(function (ex) {
        toast(ex.message, true);
      });
    };
    loadTours();
  }
  function loadTours() {
    getTours(true).then(function (items) {
      if (view !== 'tours') {
        return;
      }
      var box = $('tList');
      if (!items.length) {
        box.innerHTML = '<div class="state"><span class="ms">sell</span><h2>Chưa có tour nào</h2><p>Bấm “Thêm tour” để tạo tour đầu tiên.</p></div>';
        return;
      }
      box.innerHTML = '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Thứ tự</th><th>Tour</th><th class="num">Giá</th><th>Thời lượng</th><th>Điểm đến</th><th>Đang bán</th></tr></thead><tbody>' +
        items.map(function (t, i) {
          return '<tr data-id="' + t.id + '"><td class="ord"><button class="icon-btn" data-mv="up" aria-label="Lên"' + (i ? '' : ' disabled') + '><span class="ms">arrow_upward</span></button>' +
            '<button class="icon-btn" data-mv="down" aria-label="Xuống"' + (i < items.length - 1 ? '' : ' disabled') + '><span class="ms">arrow_downward</span></button></td>' +
            '<td class="name"><b>' + esc(t.name) + '</b><span>' + (t.badge ? esc(t.badge) + ' · ' : '') + esc(t.group_note || '') + '</span></td>' +
            '<td class="num"><b>' + VND(t.price) + '</b>' + (t.old_price ? '<br><s class="muted">' +
            VND(t.old_price) + '</s>' : '') + '</td>' +
            '<td>' + esc(t.duration || '–') + '</td><td>' + esc(t.destination || '–') + '</td>' +
            '<td><button class="sw" role="switch" aria-checked="' + !!t.active + '" data-sw aria-label="Đang bán"><i></i></button></td></tr>';
        }).join('') + '</tbody></table></div>';
      box.querySelectorAll('tbody tr').forEach(function (tr) {
        var t = items.filter(function (x) {
          return x.id == tr.dataset.id;
        })[0];
        tr.onclick = function (e) {
          var mv = e.target.closest('[data-mv]'), sw = e.target.closest('[data-sw]');
          if (mv) {
            if (mv.disabled) {
              return;
            }
            api('/tours/' + t.id, { method: 'PATCH', body: { move: mv.dataset.mv } }).then(loadTours).catch(function (ex) {
              toast(ex.message, true);
            });
            return;
          }
          if (sw) {
            api('/tours/' + t.id, { method: 'PATCH', body: { active: !t.active } }).then(function () {
              toast(t.active ? 'Đã ẩn tour khỏi trang chủ' : 'Tour đang được bán');
              loadTours();
            }).catch(function (ex) {
              toast(ex.message, true);
            });
            return;
          }
          tourPanel(t);
        };
      });
    }).catch(function (ex) {
      if (view !== 'tours') {
        return;
      }
      $('tList').innerHTML = '';
      errorStateIn($('tList'), ex.message);
      $('retry').onclick = loadTours;
    });
  }
  function tourPanel(t) {
    var isNew = !t;
    t = t || {
      name: '',
      price: '',
      old_price: '',
      duration: '',
      group_note: '',
      badge: '',
      destination: '',
      active: 1,
      image: '',
      summary: ''
    };
    openPanel(isNew ? 'Thêm tour' : t.name, isNew ? 'Tour mới sẽ hiện trong danh sách tour' : 'Sửa giá và thông tin tour', '<div class="form-grid">' +
      '<label class="field wide"><span>Tên tour</span><input id="tName" maxlength="80" value="' + esc(t.name) + '"></label>' +
      '<label class="field"><span>Giá / khách (đồng)</span><input id="tPrice" type="number" min="0" step="10000" inputmode="numeric" value="' + esc(t.price) + '"></label>' +
      '<label class="field"><span>Giá gốc (nếu giảm)</span><input id="tOld" type="number" min="0" step="10000" inputmode="numeric" value="' + esc(t.old_price == null ? '' : t.old_price) + '"></label>' +
      '<label class="field"><span>Thời lượng</span><input id="tDur" maxlength="40" placeholder="3 ngày 2 đêm" value="' + esc(t.duration) + '"></label>' +
      '<label class="field"><span>Số khách</span><input id="tGrp" maxlength="40" placeholder="Từ 2 khách" value="' + esc(t.group_note) + '"></label>' +
      '<label class="field"><span>Nhãn (Bán chạy, Mới…)</span><input id="tBadge" maxlength="20" value="' + esc(t.badge) + '"></label>' +
      '<label class="field"><span>Điểm đến (tính doanh thu)</span><select id="tDest">' + opt('', 'Không gắn', t.destination || '') + DESTS.map(function (x) {
      return opt(x, x, t.destination || '');
    }).join('') + '</select></label></div>' +
      '<div class="field wide"><span>Mô tả ngắn (hiện dưới tên tour)</span><input id="tSum" maxlength="160" value="' + esc(t.summary || '') + '"></div>' +
      '<div class="field wide"><span>Ảnh tour</span><div class="imgup"><img id="tImgPrev" alt="" ' + (t.image ? 'src="' +
      esc(t.image) + '"' : 'hidden') + '><div><input id="tImg" placeholder="https://ik.imagekit.io/…" value="' + esc(t.image || '') + '"><button class="btn" id="tUp" type="button"><span class="ms">upload</span>Tải ảnh lên</button><input type="file" id="tFile" accept="image/*" hidden></div></div></div>' +
      '<label class="chk tgl"><input type="checkbox" id="tActive"' + (t.active ? ' checked' : '') + '><span>Đang bán<small>Hiện trên trang chủ</small></span></label>', (isNew ? '<button class="btn" id="tCancel" type="button">Huỷ</button>' : '<button class="btn danger" id="tDel" type="button"><span class="ms">delete</span>Xoá</button>') +
      '<button class="btn primary" id="tSave">Lưu</button>', loadTours);
    $('tName').focus();
    $('tUp').onclick = function () {
      $('tFile').click();
    };
    $('tFile').onchange = function () {
      var file = this.files[0];
      if (!file) {
        return;
      }
      var b = $('tUp');
      b.disabled = true;
      toast('Đang tải ảnh lên…');
      window.ikUpload(file, '/api/admin/imagekit', 1600).then(function (r) {
        $('tImg').value = r.url;
        $('tImgPrev').src = r.url;
        $('tImgPrev').hidden = false;
        toast('Đã tải ảnh lên');
      })
        .catch(function (ex) {
        toast(ex.message || 'Tải ảnh lỗi', true);
      }).then(function () {
        b.disabled = false;
      });
    };
    if (isNew) {
      $('tCancel').onclick = function () {
        closeDrawer();
      };
    } else {
      $('tDel').onclick = function () {
        confirmBox('Xoá tour “' + t.name + '”? Đơn đã đặt không bị ảnh hưởng.', {
          title: 'Xoá tour',
          ok: 'Xoá tour',
          danger: true
        }).then(function (ok) {
          if (ok) {
            api('/tours/' + t.id, { method: 'DELETE' }).then(function () {
              toast('Đã xoá tour');
              closeDrawer(true);
            }).catch(function (ex) {
              toast(ex.message, true);
            });
          }
        });
      };
    }
    $('tSave').onclick = function () {
      var btn = this, body = {
        name: $('tName').value,
        price: $('tPrice').value,
        old_price: $('tOld').value,
        duration: $('tDur').value,
        group_note: $('tGrp').value,
        badge: $('tBadge').value,
        destination: $('tDest').value,
        active: $('tActive').checked,
        image: $('tImg').value,
        summary: $('tSum').value
      };
      btn.disabled = true;
      api(isNew ? '/tours' : '/tours/' + t.id, { method: isNew ? 'POST' : 'PATCH', body: body }).then(function () {
        toast(isNew ? 'Đã thêm tour' : 'Đã lưu tour');
        closeDrawer(true);
      })
        .catch(function (ex) {
        toast(ex.message, true);
        btn.disabled = false;
      });
    };
  }

  /* ---------- Mẫu trả lời nhanh ---------- */
  /* ---------- Điểm đến ---------- */
  function renderDestinations() {
    var rw = can('destinations', true), items = [];
    main.innerHTML = '<div class="page-h"><div><h1>Điểm đến</h1><p>Các thẻ điểm đến ở trang chủ và ô “Điểm đến” khi khách đặt tour. Ẩn một điểm đến thì khách không thấy, đơn cũ vẫn giữ nguyên.</p></div>' +
      (rw ? '<button class="btn primary" id="dAdd"><span class="ms">add</span>Thêm điểm đến</button>' : '') + '</div><div id="dList" class="card"><div class="skel block"></div></div>';
    if (rw) {
      $('dAdd').onclick = function () {
        destPanel(null);
      };
    }
    function imgSrc(u) {
      return !u ? '' : /^https:/.test(u) ? u : '/' + u.replace(/^\/+/, '');
    }
    function load() {
      api('/destinations').then(function (r) {
        if (view !== 'destinations') {
          return;
        }
        items = r.items;
        var box = $('dList');
        if (!items.length) {
          box.innerHTML = '<div class="state"><span class="ms">map</span><h2>Chưa có điểm đến</h2></div>';
          return;
        }
        box.innerHTML = '<ul class="dlist">' + items.map(function (d, i) {
          return '<li data-id="' + d.id + '" class="' + (d.active ? '' : 'off') + '"><img alt="" src="' + esc(imgSrc(d.image)) + '"><div class="dmeta"><b>' + esc(d.title || d.name) + '</b><small>' + esc(d.name) + (d.province ? ' · ' +
            esc(d.province) : '') + '</small></div>' +
            (rw ? '<div class="dacts"><button class="sw" role="switch" aria-checked="' + !!d.active +
              '" data-a="tg" aria-label="Hiển thị"><i></i></button><button class="btn" data-a="up"' +
              (i === 0 ? ' disabled' : '') +
              ' aria-label="Lên"><span class="ms">arrow_upward</span></button><button class="btn" data-a="dn"' +
              (i === items.length - 1 ? ' disabled' : '') +
              ' aria-label="Xuống"><span class="ms">arrow_downward</span></button><button class="btn" data-a="ed"><span class="ms">edit</span>Sửa</button></div>' : '') + '</li>';
        }).join('') + '</ul>';
        box.querySelectorAll('li').forEach(function (li) {
          var d = items.filter(function (x) {
            return x.id == li.dataset.id;
          })[0], i = items.indexOf(d);
          li.querySelectorAll('[data-a]').forEach(function (b) {
            b.onclick = function () {
              var a = b.dataset.a;
              if (a === 'ed') {
                return destPanel(d);
              }
              var p;
              if (a === 'tg') {
                p = api('/destinations/' + d.id, { method: 'PATCH', body: { active: !d.active } });
              } else {
                var ids = items.map(function (x) {
                  return x.id;
                }), j = a === 'up' ? i - 1 : i + 1;
                ids.splice(j, 0, ids.splice(i, 1)[0]);
                p = api('/destinations/reorder', { method: 'POST', body: { ids: ids } });
              }
              p.then(load).then(loadDests).catch(function (ex) {
                toast(ex.message, true);
              });
            };
          });
        });
      }).catch(function (ex) {
        if (view !== 'destinations') {
          return;
        }
        $('dList').innerHTML = '';
        errorStateIn($('dList'), ex.message);
        $('retry').onclick = renderDestinations;
      });
    }
    function destPanel(d) {
      var isNew = !d;
      d = d || {
        name: '',
        title: '',
        province: '',
        blurb: '',
        image: '',
        active: 1
      };
      openPanel(isNew ? 'Thêm điểm đến' : d.name, 'Hiện ở trang chủ và ô chọn điểm đến', '<label class="field"><span>Tên (dùng khi đặt tour, báo cáo)</span><input id="dName" maxlength="40" value="' + esc(d.name) + '"></label>' +
        '<label class="field"><span>Tiêu đề trên thẻ (để trống = như tên)</span><input id="dTitle" maxlength="60" value="' + esc(d.title) + '"></label>' +
        '<label class="field"><span>Tỉnh / thành</span><input id="dProv" maxlength="40" value="' + esc(d.province) + '"></label>' +
        '<label class="field"><span>Mô tả ngắn</span><textarea id="dBlurb" rows="3" maxlength="200">' + esc(d.blurb) + '</textarea></label>' +
        '<div class="field wide"><span>Ảnh</span><div class="imgup"><img id="dImgPrev" alt="" ' + (d.image ? 'src="' +
        esc(imgSrc(d.image)) + '"' : 'hidden') + '><div><input id="dImg" placeholder="https://ik.imagekit.io/… hoặc images/d-halong.jpg" value="' + esc(d.image) + '"><button class="btn" id="dUp" type="button"><span class="ms">upload</span>Tải ảnh lên</button><input type="file" id="dFile" accept="image/*" hidden></div></div></div>' +
        '<label class="row-sw field"><span>Hiển thị cho khách</span><button type="button" class="sw" id="dAct" role="switch" aria-checked="' + !!d.active + '"><i></i></button></label>', (isNew ? '<button class="btn" id="dCancel" type="button">Huỷ</button>' : '<button class="btn danger" id="dDel" type="button"><span class="ms">delete</span>Xoá</button>') +
        '<button class="btn primary" id="dSave">Lưu</button>', load);
      $('dName').focus();
      $('dAct').onclick = function () {
        this.setAttribute('aria-checked', this.getAttribute('aria-checked') !== 'true');
      };
      $('dImg').oninput = function () {
        var u = this.value.trim();
        $('dImgPrev').hidden = !u;
        if (u) {
          $('dImgPrev').src = imgSrc(u);
        }
      };
      $('dUp').onclick = function () {
        $('dFile').click();
      };
      $('dFile').onchange = function () {
        var f = this.files[0];
        if (!f) {
          return;
        }
        var b = $('dUp');
        b.disabled = true;
        window.ikUpload(f, '/api/admin/imagekit', 1600).then(function (r) {
          $('dImg').value = r.url;
          $('dImgPrev').src = r.url;
          $('dImgPrev').hidden = false;
          toast('Đã tải ảnh lên');
        })
          .catch(function (ex) {
          toast(ex.message, true);
        }).then(function () {
          b.disabled = false;
          $('dFile').value = '';
        });
      };
      if (isNew) {
        $('dCancel').onclick = function () {
          closeDrawer();
        };
      } else {
        $('dDel').onclick = function () {
          confirmBox('Xoá điểm đến “' + d.name +
            '”? Các đơn cũ vẫn giữ tên này. Nếu chỉ muốn tạm ngừng, hãy tắt hiển thị thay vì xoá.', {
            title: 'Xoá điểm đến',
            ok: 'Xoá',
            danger: true
          }).then(function (ok) {
            if (ok) {
              api('/destinations/' + d.id, { method: 'DELETE' }).then(function () {
                toast('Đã xoá');
                closeDrawer(true);
                loadDests();
              }).catch(function (ex) {
                toast(ex.message, true);
              });
            }
          });
        };
      }
      $('dSave').onclick = function () {
        var btn = this;
        btn.disabled = true;
        var body = {
          name: $('dName').value,
          title: $('dTitle').value,
          province: $('dProv').value,
          blurb: $('dBlurb').value,
          image: $('dImg').value,
          active: $('dAct').getAttribute('aria-checked') === 'true'
        };
        api(isNew ? '/destinations' : '/destinations/' + d.id, { method: isNew ? 'POST' : 'PATCH', body: body }).then(function () {
          toast('Đã lưu');
          closeDrawer(true);
          loadDests();
        }).catch(function (ex) {
          toast(ex.message, true);
          btn.disabled = false;
        });
      };
    }
    load();
  }

  /* ---------- Menu điều hướng & các khối trang chủ ---------- */
  var URL_HINTS = ['/', '/#diem-den', '/#tour', '/#danh-gia', '/about', '/reviews', '/contact', '/login', '/register'];
  function renderLayout() {
    var rw = can('layout', true);
    main.innerHTML = '<div class="page-h"><div><h1>Menu &amp; trang chủ</h1><p>Đổi tên, thêm, bớt, sắp xếp mục menu; bật/tắt và đổi thứ tự các khối ở trang chủ. Lưu xong, khách thấy ngay (trong ~30 giây).</p></div>' +
      '<div class="h-acts"><a class="btn" href="/" target="_blank" rel="noopener"><span class="ms">north_east</span>Xem trang khách</a>' + (rw && can('delete', true) ? '<button class="btn danger" id="lReset"><span class="ms">refresh</span>Khôi phục mặc định</button>' : '') + '</div></div>' +
      '<div id="lBody"><div class="skel block"></div><div class="skel block"></div></div>';
    api('/layout').then(function (r) {
      if (view !== 'layout') {
        return;
      }
      var nav = JSON.parse(JSON.stringify(r.nav_items || [])), blocks = JSON.parse(JSON.stringify(r.home_blocks || []));
      var base = { nav: JSON.stringify(nav), blocks: JSON.stringify(blocks) }, NAVMAX = 12, d = rw ? '' : ' disabled';
      var acts = function (i, n) {
        return rw ? '<div class="lst-acts"><button type="button" class="btn" data-lm="up" aria-label="Lên"' +
          (i ? '' : ' disabled') +
          '><span class="ms">arrow_upward</span></button><button type="button" class="btn" data-lm="dn" aria-label="Xuống"' +
          (i < n - 1 ? '' : ' disabled') + '><span class="ms">arrow_downward</span></button>' +
          '<button type="button" class="btn danger" data-lm="del" aria-label="Xoá"><span class="ms">delete</span></button></div>' : '';
      };
      var sw = function (f, on, label) {
        return '<div class="row-sw"><span>' + esc(label) +
          '</span><button type="button" class="sw" role="switch" aria-checked="' + !!on + '" data-f="' + f +
          '"' + d + '><i></i></button></div>';
      };
      $('lBody').innerHTML = (rw ? '' : '<div class="card state"><span class="ms">lock</span><h2>Chỉ được xem</h2><p>Bạn chưa có quyền sửa menu và trang chủ.</p></div>') +
        '<section class="card site-sec"><div class="card-pad"><h2><span class="ms">menu</span> Menu điều hướng</h2><p class="muted">Tối đa ' + NAVMAX + ' mục. Mỗi mục có thể hiện ở menu trên cùng, ở chân trang, hoặc cả hai. Đường dẫn: <code>/about</code>, <code>/#tour</code> (cuộn tới khối trên trang chủ), <code>https://…</code>, <code>tel:…</code>.</p></div>' +
        '<div class="card-pad nav-prev-wrap"><span class="muted">Xem trước menu trên cùng</span><div class="nav-prev" id="lPrev"></div></div>' +
        '<div class="card-pad"><div class="lst-edit" id="lNav"></div>' + (rw ? '<button type="button" class="btn" id="lAdd"><span class="ms">add</span>Thêm mục menu</button>' : '') + '</div>' +
        '<datalist id="navUrls">' + URL_HINTS.concat((r.pages || []).map(function (p) {
        return '/p/' + p.slug;
      })).map(function (u) {
        return '<option value="' + esc(u) + '">';
      }).join('') + '</datalist></section>' +
        '<section class="card site-sec"><div class="card-pad"><h2><span class="ms">dashboard</span> Các khối ở trang chủ</h2><p class="muted">Tắt để ẩn khỏi trang chủ (dữ liệu không mất), dùng mũi tên để đổi thứ tự. Banner lớn đầu trang luôn ở trên cùng.</p></div>' +
        '<div class="card-pad"><div class="blk-list" id="lBlocks"></div></div></section>' +
        (rw ? '<div class="savebar"><span id="lState" class="muted">Chưa có thay đổi</span><button class="btn primary" id="lSave" disabled><span class="ms">check</span>Lưu thay đổi</button></div>' : '');

      function mark() {
        if (!rw) {
          return;
        }
        var n = (JSON.stringify(nav) !== base.nav ? 1 : 0) + (JSON.stringify(blocks) !== base.blocks ? 1 : 0);
        $('lSave').disabled = !n;
        $('lState').textContent = n ? 'Có thay đổi chưa lưu' : 'Chưa có thay đổi';
      }
      function drawPrev() {
        var list = nav.filter(function (x) {
          return x.header && x.label;
        });
        $('lPrev').innerHTML = list.length ? list.map(function (x) {
          return '<span class="pill-s">' + esc(x.label) + '</span>';
        }).join('') + '<span class="pill-s dim">Đăng nhập</span><span class="pill-s gold">Đặt tour</span>' : '<span class="muted">Menu trên cùng đang trống (vẫn còn Đăng nhập và Đặt tour).</span>';
      }
      function drawNav() {
        $('lNav').innerHTML = nav.map(function (it, i) {
          return '<div class="lst-row nav-row" data-i="' + i + '"><div class="nav-fields">' +
            '<label class="field"><span>Tên hiển thị</span><input data-c="label" maxlength="40" value="' + esc(it.label) + '"' + d + '></label>' +
            '<label class="field"><span>Đường dẫn</span><input data-c="url" list="navUrls" maxlength="200" placeholder="/about hoặc https://…" value="' + esc(it.url) + '"' + d + '></label></div>' +
            '<div class="nav-flags">' + sw('header', it.header, 'Menu trên cùng') + sw('footer', it.footer, 'Chân trang') + sw('blank', it.blank, 'Mở tab mới') + '</div>' + acts(i, nav.length) + '</div>';
        }).join('') || '<p class="muted">Chưa có mục nào.</p>';
        var add = $('lAdd');
        if (add) {
          add.disabled = nav.length >= NAVMAX;
        }
        drawPrev();
        mark();
      }
      function drawBlocks() {
        $('lBlocks').innerHTML = '<div class="blk-row fixed"><span class="ms">lock</span><div class="t"><b>Banner lớn &amp; ô tìm tour</b><small>Luôn nằm đầu trang</small></div></div>' +
          blocks.map(function (b, i) {
            return '<div class="blk-row' + (b.on ? '' : ' off') + '" data-i="' + i + '"><div class="t"><b>' + esc(r.blocks[b.id] || (r.custom || {})[b.id] || 'Khối tự tạo') + '</b><small>' + (b.on ? 'Đang hiện' : 'Đang ẩn') + '</small></div>' +
              '<button type="button" class="sw" role="switch" aria-checked="' + !!b.on + '" data-f="on" aria-label="Hiện khối"' + d + '><i></i></button>' +
              (rw ? '<div class="lst-acts"><button type="button" class="btn" data-lm="up" aria-label="Lên"' +
                (i ? '' : ' disabled') +
                '><span class="ms">arrow_upward</span></button><button type="button" class="btn" data-lm="dn" aria-label="Xuống"' +
                (i < blocks.length - 1 ? '' : ' disabled') +
                '><span class="ms">arrow_downward</span></button></div>' : '') + '</div>';
          }).join('');
        mark();
      }
      function move(arr, i, m) {
        var j = m === 'up' ? i - 1 : i + 1;
        if (j < 0 || j >= arr.length) {
          return;
        }
        arr.splice(j, 0, arr.splice(i, 1)[0]);
      }

      if (rw) {
        $('lNav').addEventListener('input', function (e) {
          var inp = e.target.closest('[data-c]'), row = e.target.closest('.nav-row');
          if (!inp || !row) {
            return;
          }
          nav[Number(row.dataset.i)][inp.dataset.c] = inp.value;
          drawPrev();
          mark();
        });
        $('lNav').addEventListener('click', function (e) {
          var row = e.target.closest('.nav-row');
          if (!row) {
            return;
          }
          var i = Number(row.dataset.i), s = e.target.closest('.sw'), m = e.target.closest('[data-lm]');
          if (s) {
            nav[i][s.dataset.f] = !nav[i][s.dataset.f];
            s.setAttribute('aria-checked', nav[i][s.dataset.f]);
            drawPrev();
            mark();
          } else if (m && !m.disabled) {
            if (m.dataset.lm === 'del') {
              nav.splice(i, 1);
            } else {
              move(nav, i, m.dataset.lm);
            }
            drawNav();
          }
        });
        $('lAdd').onclick = function () {
          if (nav.length < NAVMAX) {
            nav.push({
              label: '',
              url: '',
              header: true,
              footer: true,
              blank: false
            });
            drawNav();
            var ins = $('lNav').querySelectorAll('input[data-c="label"]');
            if (ins.length) {
              ins[ins.length - 1].focus();
            }
          }
        };
        $('lBlocks').addEventListener('click', function (e) {
          var row = e.target.closest('.blk-row[data-i]');
          if (!row) {
            return;
          }
          var i = Number(row.dataset.i), s = e.target.closest('.sw'), m = e.target.closest('[data-lm]');
          if (s) {
            blocks[i].on = !blocks[i].on;
            drawBlocks();
          } else if (m && !m.disabled) {
            move(blocks, i, m.dataset.lm);
            drawBlocks();
          }
        });
        $('lSave').onclick = function () {
          var btn = this, body = {};
          for (var k = 0; k < nav.length; k++) {
            if (!nav[k].label.trim() || !nav[k].url.trim()) {
              if (nav[k].label.trim() || nav[k].url.trim()) {
                return toast('Mục menu thứ ' + (k + 1) + ' cần có cả tên và đường dẫn.', true);
              }
            }
          }
          if (JSON.stringify(nav) !== base.nav) {
            body.nav_items = nav;
          }
          if (JSON.stringify(blocks) !== base.blocks) {
            body.home_blocks = blocks;
          }
          btn.disabled = true;
          api('/layout', { method: 'PUT', body: body }).then(function (res) {
            toast(res.changed.length ? 'Đã lưu' : 'Không có gì thay đổi');
            try {
              localStorage.removeItem('vdk-site');
            } catch (e) {}
            renderLayout();
          })
            .catch(function (ex) {
            toast(ex.message, true);
            btn.disabled = false;
          });
        };
      }
      drawNav();
      drawBlocks();
    }).catch(function (ex) {
      if (view !== 'layout') {
        return;
      }
      $('lBody').innerHTML = '';
      errorStateIn($('lBody'), ex.message);
      $('retry').onclick = renderLayout;
    });
    var rs = $('lReset');
    if (rs) {
      rs.onclick = function () {
        confirmBox('Đưa menu và thứ tự các khối trang chủ về mặc định?', {
          title: 'Khôi phục mặc định',
          ok: 'Khôi phục',
          danger: true
        }).then(function (ok) {
          if (ok) {
            api('/layout', { method: 'DELETE' }).then(function () {
              toast('Đã khôi phục mặc định');
              try {
                localStorage.removeItem('vdk-site');
              } catch (e) {}
              renderLayout();
            }).catch(function (ex) {
              toast(ex.message, true);
            });
          }
        });
      };
    }
  }

  /* ---------- Khối nội dung tự tạo & trang mới ---------- */
  var BF_ICONS = ['eco', 'handshake', 'favorite', 'verified', 'support_agent', 'star', 'groups', 'mood', 'route', 'map', 'restaurant', 'luggage', 'explore', 'lock', 'schedule', 'sell'];
  var KIND_L = {
    text: 'Chữ',
    image: 'Ảnh + chữ',
    cards: 'Thẻ biểu tượng'
  }, BG_L = {
    plain: 'Nền thường',
    tint: 'Nền trắng',
    brand: 'Nền xanh đậm'
  };
  function bfImg(u) {
    return !u ? '' : /^https:/.test(u) ? u : '/' + u.replace(/^\/+/, '');
  }
  function bfOpts(map, cur) {
    return Object.keys(map).map(function (k) {
      return opt(k, map[k], cur);
    }).join('');
  }
  /* Biểu mẫu một khối nội dung (dùng cho khối trang chủ và từng khối trong trang mới) */
  function bfHTML(b) {
    b = Object.assign({
      kind: 'text',
      bg: 'plain',
      title: '',
      sub: '',
      text: '',
      image: '',
      side: 'right',
      btn_text: '',
      btn_url: '',
      items: []
    }, b || {});
    var items = (b.items || []).slice();
    while (items.length < 6) {
      items.push({
        icon: 'star',
        title: '',
        text: ''
      });
    }
    return '<div class="bf" data-kind="' + esc(b.kind) + '"><div class="bf-two"><label class="field"><span>Kiểu khối</span><select data-f="kind">' + bfOpts(KIND_L, b.kind) + '</select></label>' +
      '<label class="field"><span>Màu nền</span><select data-f="bg">' + bfOpts(BG_L, b.bg) + '</select></label></div>' +
      '<label class="field"><span>Tiêu đề</span><input data-f="title" maxlength="100" value="' + esc(b.title) + '"></label>' +
      '<label class="field"><span>Dòng phụ (tuỳ chọn)</span><input data-f="sub" maxlength="200" value="' + esc(b.sub) + '"></label>' +
      '<label class="field"><span>Nội dung (xuống dòng = đoạn mới, không dùng được HTML)</span><textarea data-f="text" rows="5" maxlength="3000">' + esc(b.text) + '</textarea></label>' +
      '<div data-only="image"><div class="field wide"><span>Ảnh</span><div class="imgup"><img class="bf-prev" alt="" ' + (b.image ? 'src="' +
      esc(bfImg(b.image)) + '"' : 'hidden') + '><div><input data-f="image" placeholder="https://ik.imagekit.io/… hoặc images/about.jpg" value="' + esc(b.image) + '"><button class="btn bf-up" type="button"><span class="ms">add_a_photo</span>Tải ảnh lên</button><input class="bf-file" type="file" accept="image/*" hidden></div></div></div>' +
      '<label class="field"><span>Vị trí ảnh</span><select data-f="side">' + bfOpts({ right: 'Ảnh bên phải', left: 'Ảnh bên trái' }, b.side) + '</select></label></div>' +
      '<div data-only="cards"><div class="field"><span>Các thẻ (tối đa 6, bỏ trống thẻ không dùng)</span></div>' + items.slice(0, 6).map(function (it) {
      return '<div class="bf-item"><select data-i="icon" aria-label="Biểu tượng">' + BF_ICONS.map(function (o) {
        return '<option' + (o === it.icon ? ' selected' : '') + '>' + o + '</option>';
      }).join('') + '</select><input data-i="title" maxlength="60" placeholder="Tiêu đề thẻ" value="' + esc(it.title) + '"><input data-i="text" maxlength="200" placeholder="Mô tả ngắn" value="' + esc(it.text) + '"></div>';
    }).join('') + '</div>' +
      '<div class="bf-two"><label class="field"><span>Chữ trên nút (tuỳ chọn)</span><input data-f="btn_text" maxlength="40" value="' + esc(b.btn_text) + '"></label>' +
      '<label class="field"><span>Đường dẫn của nút</span><input data-f="btn_url" maxlength="200" placeholder="/contact" value="' + esc(b.btn_url) + '"></label></div></div>';
  }
  function bfRead(el) {
    var o = { items: [] };
    el.querySelectorAll('[data-f]').forEach(function (i) {
      o[i.dataset.f] = i.value;
    });
    el.querySelectorAll('.bf-item').forEach(function (r) {
      var it = {};
      r.querySelectorAll('[data-i]').forEach(function (i) {
        it[i.dataset.i] = i.value;
      });
      o.items.push(it);
    });
    return o;
  }
  function bfBind(el) {
    function kind() {
      var k = el.querySelector('[data-f="kind"]').value;
      el.dataset.kind = k;
      el.querySelectorAll('[data-only]').forEach(function (e) {
        e.hidden = e.dataset.only !== k;
      });
    }
    el.querySelector('[data-f="kind"]').onchange = kind;
    kind();
    var img = el.querySelector('[data-f="image"]'), prev = el.querySelector('.bf-prev'), up = el.querySelector('.bf-up'), file = el.querySelector('.bf-file');
    img.oninput = function () {
      var u = img.value.trim();
      prev.hidden = !u;
      if (u) {
        prev.src = bfImg(u);
      }
    };
    up.onclick = function () {
      file.click();
    };
    file.onchange = function () {
      var f = file.files[0];
      if (!f) {
        return;
      }
      up.disabled = true;
      window.ikUpload(f, '/api/admin/imagekit', 1600).then(function (r) {
        img.value = r.url;
        prev.src = r.url;
        prev.hidden = false;
        toast('Đã tải ảnh lên');
      })
        .catch(function (ex) {
        toast(ex.message || 'Tải ảnh lỗi', true);
      }).then(function () {
        up.disabled = false;
        file.value = '';
      });
    };
  }

  var cTab = 'blocks';
  function renderContent() {
    var rw = can('content', true);
    main.innerHTML = '<div class="page-h"><div><h1>Khối &amp; trang mới</h1><p>Tạo khối nội dung để chèn vào trang chủ, hoặc tạo trang riêng (địa chỉ <code>/p/ten-trang</code>) rồi thêm vào menu. Chỉ dùng chữ, ảnh, nút và thẻ biểu tượng.</p></div>' +
      (rw ? '<button class="btn primary" id="cAdd"><span class="ms">add</span><span id="cAddT"></span></button>' : '') + '</div>' +
      '<div class="chips" id="cTabs"><button class="chip" data-t="blocks">Khối trang chủ</button><button class="chip" data-t="pages">Trang riêng</button></div><div id="cList" class="card"><div class="skel block"></div></div>';
    function tabs() {
      main.querySelectorAll('#cTabs .chip').forEach(function (c) {
        c.setAttribute('aria-pressed', c.dataset.t === cTab);
      });
      if ($('cAddT')) {
        $('cAddT').textContent = cTab === 'blocks' ? 'Thêm khối' : 'Thêm trang';
      }
    }
    $('cTabs').onclick = function (e) {
      var c = e.target.closest('.chip');
      if (c) {
        cTab = c.dataset.t;
        tabs();
        load();
      }
    };
    if (rw) {
      $('cAdd').onclick = function () {
        if (cTab === 'blocks') {
          blockPanel(null);
        } else {
          pagePanel(null);
        }
      };
    }
    tabs();
    function load() {
      var tab = cTab;
      api(tab === 'blocks' ? '/content-blocks' : '/pages').then(function (r) {
        if (view !== 'content' || tab !== cTab) {
          return;
        }
        var box = $('cList'), items = r.items;
        if (!items.length) {
          box.innerHTML = '<div class="state"><span class="ms">edit</span><h2>' +
            (tab === 'blocks' ? 'Chưa có khối tự tạo' : 'Chưa có trang riêng') + '</h2><p>' +
            (rw ? 'Bấm “' +
              (tab === 'blocks' ? 'Thêm khối' : 'Thêm trang') + '” để bắt đầu.' : '') +
            '</p></div>';
          return;
        }
        box.innerHTML = '<ul class="dlist">' + items.map(function (x) {
          var meta = tab === 'blocks' ? esc(KIND_L[x.data.kind] || 'Chữ') +
            (x.data.title ? ' · ' +
              esc(x.data.title) : '') : '/p/' +
            esc(x.slug) + ' · ' + x.blocks.length + ' khối';
          return '<li data-id="' + x.id + '" class="' + (tab === 'pages' && !x.active ? 'off' : '') + '" tabindex="0"><div class="dmeta"><b>' + esc(tab === 'blocks' ? x.name : x.title) + '</b><small>' + meta + '</small></div>' +
            (tab === 'pages' ? '<div class="dacts">' +
              (x.active ? '<a class="btn" href="/p/' + esc(x.slug) +
                '" target="_blank" rel="noopener" data-open><span class="ms">north_east</span>Xem</a>' : '<span class="st cancelled">Đang ẩn</span>') +
              '</div>' : '') + '</li>';
        }).join('') + '</ul>' + (tab === 'blocks' ? '<p class="muted" style="padding:6px 14px 12px">Vị trí và việc bật/tắt khối trên trang chủ chỉnh ở mục “Menu &amp; trang chủ”.</p>' : '');
        box.querySelectorAll('li').forEach(function (li) {
          var x = items.filter(function (i) {
            return i.id == li.dataset.id;
          })[0];
          var open = function (e) {
            if (e && e.target.closest('[data-open]')) {
              return;
            }
            if (tab === 'blocks') {
              blockPanel(x);
            } else {
              pagePanel(x);
            }
          };
          li.onclick = open;
          li.onkeydown = function (e) {
            if (e.key === 'Enter') {
              open(e);
            }
          };
        });
      }).catch(function (ex) {
        if (view !== 'content') {
          return;
        }
        $('cList').innerHTML = '';
        errorStateIn($('cList'), ex.message);
        $('retry').onclick = renderContent;
      });
    }
    function blockPanel(x) {
      var isNew = !x;
      var d = openPanel(isNew ? 'Thêm khối trang chủ' : x.name, 'Khối mới tự hiện cuối trang chủ; đổi vị trí ở “Menu & trang chủ”', '<label class="field"><span>Tên khối (chỉ để bạn nhận ra, khách không thấy)</span><input id="cbName" maxlength="60" value="' +
        esc(isNew ? '' : x.name) + '"></label>' + bfHTML(isNew ? null : x.data), (isNew ? '<button class="btn" id="cbCancel" type="button">Huỷ</button>' : '<button class="btn danger" id="cbDel" type="button"><span class="ms">delete</span>Xoá</button>') +
        '<button class="btn primary" id="cbSave">Lưu</button>', load);
      bfBind(d.querySelector('.bf'));
      $('cbName').focus();
      if (isNew) {
        $('cbCancel').onclick = function () {
          closeDrawer();
        };
      } else {
        $('cbDel').onclick = function () {
          confirmBox('Xoá khối “' + x.name +
            '” khỏi trang chủ? Nếu chỉ muốn tạm ẩn, hãy tắt ở “Menu & trang chủ”.', {
            title: 'Xoá khối',
            ok: 'Xoá',
            danger: true
          }).then(function (ok) {
            if (ok) {
              api('/content-blocks/' + x.id, { method: 'DELETE' }).then(function () {
                toast('Đã xoá');
                closeDrawer(true);
              }).catch(function (ex) {
                toast(ex.message, true);
              });
            }
          });
        };
      }
      $('cbSave').onclick = function () {
        var btn = this;
        btn.disabled = true;
        api(isNew ? '/content-blocks' : '/content-blocks/' + x.id, { method: isNew ? 'POST' : 'PATCH', body: { name: $('cbName').value, data: bfRead(d.querySelector('.bf')) } })
          .then(function () {
          toast('Đã lưu');
          try {
            localStorage.removeItem('vdk-site');
          } catch (e) {}
          closeDrawer(true);
        }).catch(function (ex) {
          toast(ex.message, true);
          btn.disabled = false;
        });
      };
    }
    function pagePanel(x) {
      var isNew = !x, arr = isNew ? [] : x.blocks.slice();
      var d = openPanel(isNew ? 'Thêm trang' : x.title, 'Trang riêng nằm ở /p/đường-dẫn', '<label class="field"><span>Đường dẫn (chữ thường không dấu, số, gạch ngang)</span><span class="slugrow"><b>/p/</b><input id="pgSlug" maxlength="50" placeholder="tin-tuc" value="' + esc(isNew ? '' : x.slug) + '"></span></label>' +
        '<label class="field"><span>Tiêu đề trang</span><input id="pgTitle" maxlength="80" value="' + esc(isNew ? '' : x.title) + '"></label>' +
        '<label class="field"><span>Mô tả ngắn (hiện dưới tiêu đề, dùng cho SEO)</span><input id="pgDesc" maxlength="200" value="' + esc(isNew ? '' : x.desc) + '"></label>' +
        '<label class="row-sw field"><span>Hiển thị cho khách</span><button type="button" class="sw" id="pgAct" role="switch" aria-checked="' + (isNew ? true : !!x.active) + '"><i></i></button></label>' +
        '<h4 class="perm-h">Các khối trong trang</h4><div id="pgBlocks"></div><button class="btn" id="pgAddB" type="button"><span class="ms">add</span>Thêm khối</button>', (isNew ? '<button class="btn" id="pgCancel" type="button">Huỷ</button>' : '<button class="btn danger" id="pgDel" type="button"><span class="ms">delete</span>Xoá</button>') +
        '<button class="btn primary" id="pgSave">Lưu</button>', load);
      function capture() {
        arr = Array.prototype.map.call(d.querySelectorAll('.pg-blk .bf'), bfRead);
      }
      function draw(openIdx) {
        $('pgBlocks').innerHTML = arr.map(function (b, i) {
          return '<details class="pg-blk" data-i="' + i + '"' + (i === openIdx || (openIdx == null && arr.length === 1) ? ' open' : '') + '><summary><span>' + (i +
            1) + '. ' + esc(KIND_L[b.kind] || 'Chữ') + (b.title ? ' · ' +
            esc(b.title) : '') + '</span><span class="pg-acts">' +
            '<button type="button" class="btn" data-m="up"' + (i ? '' : ' disabled') + ' aria-label="Lên"><span class="ms">arrow_upward</span></button><button type="button" class="btn" data-m="dn"' + (i < arr.length - 1 ? '' : ' disabled') + ' aria-label="Xuống"><span class="ms">arrow_downward</span></button><button type="button" class="btn danger" data-m="del" aria-label="Xoá khối"><span class="ms">delete</span></button></span></summary>' + bfHTML(b) + '</details>';
        }).join('') || '<p class="muted">Chưa có khối nào. Bấm “Thêm khối”.</p>';
        d.querySelectorAll('.pg-blk .bf').forEach(bfBind);
        $('pgAddB').disabled = arr.length >= 20;
      }
      draw();
      $('pgAct').onclick = function () {
        this.setAttribute('aria-checked', this.getAttribute('aria-checked') !== 'true');
      };
      $('pgAddB').onclick = function () {
        capture();
        arr.push({ kind: 'text' });
        draw(arr.length - 1);
      };
      $('pgBlocks').addEventListener('click', function (e) {
        var m = e.target.closest('[data-m]');
        if (!m || m.disabled) {
          return;
        }
        e.preventDefault();
        var i = Number(m.closest('.pg-blk').dataset.i);
        capture();
        if (m.dataset.m === 'del') {
          arr.splice(i, 1);
        } else {
          var j = m.dataset.m === 'up' ? i - 1 : i + 1;
          arr.splice(j, 0, arr.splice(i, 1)[0]);
        }
        draw();
      });
      if (isNew) {
        $('pgCancel').onclick = function () {
          closeDrawer();
        };
      } else {
        $('pgDel').onclick = function () {
          confirmBox('Xoá trang “' + x.title + '”? Địa chỉ /p/' + x.slug +
            ' sẽ không còn truy cập được. Nhớ gỡ khỏi menu nếu có.', {
            title: 'Xoá trang',
            ok: 'Xoá',
            danger: true
          }).then(function (ok) {
            if (ok) {
              api('/pages/' + x.id, { method: 'DELETE' }).then(function () {
                toast('Đã xoá');
                closeDrawer(true);
              }).catch(function (ex) {
                toast(ex.message, true);
              });
            }
          });
        };
      }
      $('pgSave').onclick = function () {
        var btn = this;
        btn.disabled = true;
        capture();
        api(isNew ? '/pages' : '/pages/' + x.id, { method: isNew ? 'POST' : 'PATCH', body: {
            slug: $('pgSlug').value,
            title: $('pgTitle').value,
            desc: $('pgDesc').value,
            active: $('pgAct').getAttribute('aria-checked') === 'true',
            blocks: arr
          } })
          .then(function () {
          toast('Đã lưu');
          closeDrawer(true);
        }).catch(function (ex) {
          toast(ex.message, true);
          btn.disabled = false;
        });
      };
    }
    load();
  }

  /* ---------- Cài đặt website ---------- */
  var SITE_SECTIONS = [
    {
      id: 'info',
      icon: 'call',
      title: 'Thông tin liên hệ',
      desc: 'Hiện ở chân trang, trang Liên hệ và cửa sổ bảo trì.',
      f: [
        ['site_name', 'Tên thương hiệu', 't'], ['tagline', 'Khẩu hiệu', 't'], ['hotline', 'Hotline', 't'], ['contact_email', 'Email liên hệ', 't'],
        ['address', 'Địa chỉ', 't'], ['work_hours', 'Giờ làm việc', 't'], ['footer_about', 'Giới thiệu ở chân trang', 'a'], ['copyright', 'Dòng bản quyền', 't']
      ]
    },
    {
      id: 'social',
      icon: 'forum',
      title: 'Mạng xã hội',
      desc: 'Để trống nếu không dùng. Phải bắt đầu bằng https://',
      f: [
        ['zalo', 'Zalo', 't'], ['facebook', 'Facebook', 't'], ['instagram', 'Instagram', 't'], ['youtube', 'YouTube', 't'], ['tiktok', 'TikTok', 't']
      ]
    },
    {
      id: 'look',
      icon: 'eco',
      title: 'Giao diện & màu sắc',
      desc: 'Đổi màu chủ đạo, cỡ chữ, độ bo góc cho toàn bộ trang khách.',
      f: [
        ['color_brand', 'Màu chủ đạo (xanh đậm)', 'c'], ['color_brand2', 'Màu chủ đạo phụ', 'c'], ['color_accent', 'Màu nhấn (vàng)', 'c'], ['color_red', 'Màu đỏ (giá, nút)', 'c'], ['color_mist', 'Màu nền trang (giao diện sáng)', 'c'],
        ['default_theme', 'Giao diện mặc định cho khách mới', 'e', { light: 'Sáng', dark: 'Tối' }], ['show_theme_toggle', 'Cho khách tự đổi sáng/tối', 'b'],
        ['font_scale', 'Cỡ chữ toàn trang (%)', 'n', [85, 125]], ['radius_scale', 'Độ bo góc (%)', 'n', [0, 160]]
      ]
    },
    {
      id: 'banner',
      icon: 'send',
      title: 'Thông báo đầu trang',
      desc: 'Dải thông báo khuyến mãi / lưu ý hiện trên mọi trang khách.',
      f: [
        ['banner_on', 'Bật thông báo', 'b'], ['banner_text', 'Nội dung', 't'], ['banner_link', 'Đường dẫn (tuỳ chọn)', 't'], ['banner_link_text', 'Chữ của đường dẫn', 't'],
        ['banner_style', 'Kiểu', 'e', {
            promo: 'Khuyến mãi (đỏ)',
            info: 'Thông tin (xanh)',
            warn: 'Lưu ý (vàng)'
          }], ['banner_closable', 'Cho khách đóng thông báo', 'b']
      ]
    },
    {
      id: 'home',
      icon: 'explore',
      title: 'Nội dung trang chủ',
      desc: 'Chữ ở banner lớn và khối kêu gọi cuối trang.',
      f: [
        ['hero_lead', 'Câu giới thiệu dưới tiêu đề', 'a'], ['typed_words', 'Các địa danh chạy chữ (cách nhau bằng dấu phẩy)', 't'], ['hero_trust', 'Dòng đánh giá', 't'],
        ['cta_title', 'Tiêu đề khối cuối trang', 't'], ['cta_text', 'Mô tả khối cuối trang', 't'], ['cta_btn', 'Chữ nút', 't']
      ]
    },
    {
      id: 'pages',
      icon: 'map',
      title: 'Chữ ở trang chủ & trang Về chúng tôi',
      desc: 'Tiêu đề các khối và nội dung giới thiệu.',
      f: [
        ['dest_title', 'Tiêu đề khối Điểm đến (trang chủ)', 't'], ['dest_sub', 'Mô tả khối Điểm đến', 't'],
        ['about_hero_title', 'Trang Về chúng tôi: tiêu đề lớn', 't'], ['about_hero_sub', 'Trang Về chúng tôi: dòng phụ', 't'],
        ['about_title', 'Tiêu đề phần giới thiệu', 't'], ['about_p1', 'Đoạn giới thiệu 1', 'a'], ['about_p2', 'Đoạn giới thiệu 2', 'a'], ['about_btn', 'Chữ nút', 't'], ['values_title', 'Tiêu đề khối giá trị', 't']
      ]
    },
    {
      id: 'values',
      icon: 'favorite',
      title: 'Khối “Giá trị chúng tôi giữ”',
      desc: 'Tối đa 6 mục, hiện ở trang Về chúng tôi.',
      f: [
        ['values_items', 'Các giá trị', 'l', {
            cols: [['icon', 'Biểu tượng', 'i'], ['title', 'Tiêu đề', 't'], ['text', 'Nội dung', 'a']],
            max: 6,
            add: 'Thêm giá trị'
          }]
      ]
    },
    {
      id: 'faq',
      icon: 'help',
      title: 'Câu hỏi thường gặp (trang chủ)',
      desc: 'Tối đa 20 câu. Kéo thứ tự bằng nút mũi tên.',
      f: [
        ['faq_items', 'Danh sách câu hỏi', 'l', {
            cols: [['q', 'Câu hỏi', 't'], ['a', 'Trả lời', 'a']],
            max: 20,
            add: 'Thêm câu hỏi'
          }]
      ]
    },
    {
      id: 'feat',
      icon: 'lock_open',
      title: 'Bật / tắt tính năng',
      desc: 'Tắt tạm một tính năng mà không cần sửa code. Tắt là ẩn mọi thứ liên quan trên website, máy chủ chặn thật, và trang của tính năng đó chỉ hiện 404. Riêng Turnstile, xác minh email và passkey làm lớp hai: tắt nghĩa là bỏ qua bước đó, không chặn người dùng.',
      f: [
        ['feat_booking', 'Nhận đặt tour', 'b'], ['feat_register', 'Cho đăng ký tài khoản mới', 'b'], ['feat_chat', 'Khách nhắn tin (chat)', 'b'], ['feat_reviews', 'Khách gửi đánh giá', 'b'],
        ['feat_login', 'Đăng nhập + tài khoản của khách (tắt thì khách đặt tour không cần tài khoản; chat, yêu thích, hòm thư cũng tắt theo)', 'b'],
        ['feat_email_verify', 'Bắt khách xác minh email khi đăng ký', 'b'],
        ['feat_bugreport', 'Báo lỗi website', 'b'],
        ['feat_upload', 'Khách tải ảnh đại diện lên (ImageKit)', 'b'],
        ['feat_favorites', 'Yêu thích tour / điểm đến', 'b'],
        ['feat_compare', 'So sánh tour', 'b'],
        ['feat_coupons', 'Mã giảm giá', 'b'],
        ['feat_inbox', 'Hòm thư thông báo của khách', 'b'],
        ['feat_forgot', 'Quên mật khẩu / đặt lại mật khẩu', 'b'],
        ['feat_cancel', 'Khách tự huỷ đơn đặt tour', 'b'],
        ['feat_votes', 'Bình chọn "hữu ích" cho đánh giá', 'b'],
        ['feat_about', 'Trang Về chúng tôi', 'b'],
        ['feat_tours', 'Trang danh sách Tour', 'b'],
        ['feat_pages', 'Các trang tự tạo (/p/…)', 'b'],
        ['feat_share', 'Nút chia sẻ tour', 'b'],
        ['feat_filter', 'Thanh tìm kiếm / lọc / sắp xếp tour', 'b'],
        ['feat_google', 'Đăng nhập / liên kết bằng Google (khách)', 'b'],
        ['feat_google_admin', 'Đăng nhập / liên kết bằng Google (quản trị)', 'b'],
        ['feat_passkey', 'Passkey (khách): đăng nhập, thêm mới, làm lớp hai', 'b'],
        ['feat_passkey_admin', 'Passkey (quản trị): đăng nhập, thêm mới, làm lớp hai', 'b'],
        ['feat_turnstile', 'Xác minh chống spam Cloudflare Turnstile ở form khách', 'b'],
        ['feat_turnstile_admin', 'Xác minh Turnstile ở đăng nhập quản trị', 'b'],
        ['maint_on', 'CHẾ ĐỘ BẢO TRÌ (phủ kín trang khách, chặn đặt tour/đăng ký/chat/đánh giá)', 'b'], ['maint_text', 'Lời nhắn khi bảo trì', 'a']
      ]
    },
    {
      id: 'seo',
      icon: 'search',
      title: 'SEO & mã tuỳ chỉnh',
      desc: 'Tiêu đề / mô tả cho công cụ tìm kiếm; CSS riêng cho người rành kỹ thuật.',
      f: [
        ['meta_title', 'Tiêu đề trang chủ (≤ 70 ký tự)', 't'], ['meta_desc', 'Mô tả (≤ 200 ký tự)', 't'], ['custom_css', 'CSS tuỳ chỉnh', 'code']
      ]
    }
  ];
  function renderSite() {
    main.innerHTML = '<div class="page-h"><div><h1>Cài đặt website</h1><p>Chỉnh chữ, màu, thông báo và bật/tắt tính năng của trang khách. Lưu xong, khách thấy ngay (trong ~30 giây).</p></div>' +
      '<div class="h-acts"><a class="btn" href="/" target="_blank" rel="noopener"><span class="ms">north_east</span>Xem trang khách</a>' + (can('site', true) && can('delete', true) ? '<button class="btn danger" id="sReset"><span class="ms">refresh</span>Khôi phục mặc định</button>' : '') + '</div></div><div id="sBody"><div class="skel block"></div><div class="skel block"></div></div>';
    api('/site').then(function (r) {
      if (view !== 'site') {
        return;
      }
      var rw = can('site', true), cur = Object.assign({}, r.site), restricted = r.restricted || {};
      var lock = function (k) {
        return !rw || (restricted[k] && !can(restricted[k], true));
      };
      function field(f) {
        var k = f[0], v = cur[k], dis = lock(k) ? ' disabled' : '', lab = '<span>' + esc(f[1]) +
          (lock(k) && rw ? ' <small class="muted">(cần quyền riêng)</small>' : '') + '</span>';
        if (f[2] === 'b') {
          return '<div class="field row-sw"><span>' + esc(f[1]) +
            (lock(k) && rw ? ' <small class="muted">(cần quyền riêng)</small>' : '') +
            '</span><button type="button" class="sw" role="switch" aria-checked="' + !!v + '" data-k="' + k +
            '"' + dis + '><i></i></button></div>';
        }
        if (f[2] === 'c') {
          return '<label class="field">' + lab + '<span class="colorrow"><input type="color" data-k="' + k +
            '" value="' + esc(v) + '"' + dis + '><input data-kt="' + k + '" value="' + esc(v) +
            '" maxlength="7"' + dis + '><button type="button" class="btn" data-def="' + k + '"' + dis +
            '>Mặc định</button></span></label>';
        }
        if (f[2] === 'e') {
          return '<label class="field">' + lab + '<select data-k="' + k + '"' + dis + '>' + Object.keys(f[3]).map(function (o) {
            return '<option value="' + o + '"' + (o === v ? ' selected' : '') + '>' + esc(f[3][o]) +
              '</option>';
          }).join('') + '</select></label>';
        }
        if (f[2] === 'n') {
          return '<label class="field">' + lab + '<span class="colorrow"><input type="range" data-k="' + k +
            '" min="' + f[3][0] + '" max="' + f[3][1] + '" value="' + v + '"' + dis + '><b data-out="' + k +
            '">' + v + '%</b></span></label>';
        }
        if (f[2] === 'a') {
          return '<label class="field">' + lab + '<textarea data-k="' + k + '" rows="3" maxlength="300"' + dis +
            '>' + esc(v) + '</textarea></label>';
        }
        if (f[2] === 'l') {
          return '<div class="field" style="grid-column:1/-1" data-list="' + k + '"><span>' + lab +
            '</span><div class="lst-edit"></div>' +
            (lock(k) ? '' : '<button type="button" class="btn" data-ladd="' +
              k + '"><span class="ms">add</span>' + esc(f[3].add) + '</button>') +
            '</div>';
        }
        if (f[2] === 'code') {
          return '<label class="field">' + lab + '<textarea data-k="' + k +
            '" rows="8" spellcheck="false" style="font-family:ui-monospace,Consolas,monospace;font-size:13px" placeholder=".tour { border-radius: 12px; }"' +
            dis + '>' + esc(v) + '</textarea></label>';
        }
        return '<label class="field">' + lab + '<input data-k="' + k + '" value="' + esc(v) +
          '" maxlength="240"' + dis + '></label>';
      }
      $('sBody').innerHTML = (rw ? '' : '<div class="card state"><span class="ms">lock</span><h2>Chỉ được xem</h2><p>Bạn chưa có quyền sửa cài đặt website.</p></div>') +
        SITE_SECTIONS.map(function (sec) {
          return '<section class="card site-sec" id="sec-' + sec.id +
            '"><div class="card-pad"><h2><span class="ms">' + sec.icon + '</span> ' + esc(sec.title) +
            '</h2><p class="muted">' + esc(sec.desc) + '</p></div><div class="site-grid">' +
            sec.f.map(field).join('') + '</div></section>';
        }).join('') + (rw ? '<div class="savebar"><span id="sState" class="muted">Chưa có thay đổi</span><button class="btn primary" id="sSave" disabled><span class="ms">check</span>Lưu thay đổi</button></div>' : '');
      if (!rw) {
        return;
      }
      var dirty = {};
      function mark(k, v) {
        cur[k] = v;
        if (JSON.stringify(v) === JSON.stringify(r.site[k])) {
          delete dirty[k];
        } else {
          dirty[k] = v;
        }
        var n = Object.keys(dirty).length;
        $('sSave').disabled = !n;
        $('sState').textContent = n ? n + ' mục chưa lưu' : 'Chưa có thay đổi';
      }
      var body = $('sBody');
      var ICON_OPTS = ['eco', 'handshake', 'favorite', 'verified', 'support_agent', 'star', 'groups', 'mood', 'route', 'map', 'restaurant', 'luggage', 'explore', 'lock', 'schedule', 'sell'];
      var LDEF = {};
      SITE_SECTIONS.forEach(function (sc) {
        sc.f.forEach(function (f) {
          if (f[2] === 'l') {
            LDEF[f[0]] = f[3];
          }
        });
      });
      function drawList(k) {
        var box = body.querySelector('[data-list="' + k + '"] .lst-edit'), def = LDEF[k], arr = cur[k] || [], dis = lock(k);
        box.innerHTML = arr.map(function (it, i) {
          return '<div class="lst-row" data-i="' + i + '">' + def.cols.map(function (c) {
            var v = it[c[0]] || '', d = dis ? ' disabled' : '';
            if (c[2] === 'i') {
              return '<label class="field"><span>' + c[1] + '</span><select data-c="' + c[0] + '"' + d + '>' + ICON_OPTS.map(function (o) {
                return '<option' + (o === v ? ' selected' : '') + '>' + o + '</option>';
              }).join('') + '</select></label>';
            }
            if (c[2] === 'a') {
              return '<label class="field"><span>' + c[1] + '</span><textarea data-c="' + c[0] + '" rows="2"' +
                d + '>' + esc(v) + '</textarea></label>';
            }
            return '<label class="field"><span>' + c[1] + '</span><input data-c="' + c[0] + '" value="' +
              esc(v) + '"' + d + '></label>';
          }).join('') + (dis ? '' : '<div class="lst-acts"><button type="button" class="btn" data-lm="up"' +
            (i ? '' : ' disabled') +
            '><span class="ms">arrow_upward</span></button><button type="button" class="btn" data-lm="dn"' +
            (i < arr.length - 1 ? '' : ' disabled') +
            '><span class="ms">arrow_downward</span></button><button type="button" class="btn danger" data-lm="del"><span class="ms">delete</span></button></div>') + '</div>';
        }).join('') || '<p class="muted">Chưa có mục nào.</p>';
        box.querySelectorAll('.lst-row').forEach(function (row) {
          var i = Number(row.dataset.i);
          row.querySelectorAll('[data-c]').forEach(function (inp) {
            inp.oninput = inp.onchange = function () {
              var a = cur[k].map(function (x) {
                return Object.assign({}, x);
              });
              a[i][inp.dataset.c] = inp.value;
              mark(k, a);
            };
          });
          row.querySelectorAll('[data-lm]').forEach(function (b) {
            b.onclick = function () {
              var a = cur[k].map(function (x) {
                return Object.assign({}, x);
              }), m = b.dataset.lm;
              if (m === 'del') {
                a.splice(i, 1);
              } else {
                var j = m === 'up' ? i - 1 : i + 1;
                a.splice(j, 0, a.splice(i, 1)[0]);
              }
              mark(k, a);
              drawList(k);
            };
          });
        });
        var add = body.querySelector('[data-ladd="' + k + '"]');
        if (add) {
          add.disabled = arr.length >= def.max;
        }
      }
      Object.keys(LDEF).forEach(function (k) {
        drawList(k);
        var add = body.querySelector('[data-ladd="' + k + '"]');
        if (add) {
          add.onclick = function () {
            var a = (cur[k] || []).slice(), o = {};
            LDEF[k].cols.forEach(function (c) {
              o[c[0]] = c[2] === 'i' ? 'star' : '';
            });
            a.push(o);
            mark(k, a);
            drawList(k);
          };
        }
      });
      body.querySelectorAll('.sw:not([disabled])').forEach(function (b) {
        b.onclick = function () {
          var on = b.getAttribute('aria-checked') !== 'true';
          b.setAttribute('aria-checked', on);
          mark(b.dataset.k, on);
        };
      });
      body.querySelectorAll('input[type=color]').forEach(function (i) {
        i.oninput = function () {
          body.querySelector('[data-kt="' + i.dataset.k + '"]').value = i.value;
          mark(i.dataset.k, i.value);
        };
      });
      body.querySelectorAll('[data-kt]').forEach(function (i) {
        i.oninput = function () {
          if (/^#[0-9a-fA-F]{6}$/.test(i.value)) {
            body.querySelector('input[type=color][data-k="' + i.dataset.kt + '"]').value = i.value;
            mark(i.dataset.kt, i.value.toLowerCase());
          }
        };
      });
      body.querySelectorAll('[data-def]').forEach(function (b) {
        b.onclick = function () {
          var k = b.dataset.def, d = r.defaults[k];
          body.querySelector('input[type=color][data-k="' + k + '"]').value = d;
          body.querySelector('[data-kt="' + k + '"]').value = d;
          mark(k, d);
        };
      });
      body.querySelectorAll('input[type=range]').forEach(function (i) {
        i.oninput = function () {
          body.querySelector('[data-out="' + i.dataset.k + '"]').textContent = i.value + '%';
          mark(i.dataset.k, Number(i.value));
        };
      });
      body.querySelectorAll('select[data-k]:not([disabled]), input[data-k]:not([type=color]):not([type=range]):not([disabled]), textarea[data-k]:not([disabled])').forEach(function (i) {
        i.oninput = i.onchange = function () {
          mark(i.dataset.k, i.value);
        };
      });
      $('sSave').onclick = function () {
        var btn = this;
        btn.disabled = true;
        var go = function () {
          api('/site', { method: 'PUT', body: { site: dirty } }).then(function (res) {
            toast(res.changed.length ? 'Đã lưu ' + res.changed.length + ' mục' : 'Không có gì thay đổi');
            try {
              localStorage.removeItem('vdk-site');
            } catch (e) {}
            renderSite();
          })
            .catch(function (ex) {
            toast(ex.message, true);
            btn.disabled = false;
          });
        };
        var warn = dirty.maint_on === true ? {
          msg: 'Bật chế độ bảo trì sẽ phủ kín trang khách và chặn đặt tour, đăng ký, chat, đánh giá. Tiếp tục?',
          title: 'Bật bảo trì',
          ok: 'Bật bảo trì'
        } : (dirty.feat_turnstile === false || dirty.feat_turnstile_admin === false || dirty.feat_email_verify === false || dirty.feat_passkey === false || dirty.feat_passkey_admin === false) ? {
          msg: 'Bạn đang tắt một lớp bảo vệ (xác minh Turnstile, xác minh email hoặc passkey làm lớp hai). Khi tắt, bước đó được bỏ qua nên bot và tài khoản email giả sẽ dễ lọt vào hơn' +
            (dirty.feat_turnstile_admin === false ? ', kể cả ở đăng nhập quản trị' : '') + '. Chỉ nên tắt khi dịch vụ đó đang lỗi. Tiếp tục?',
          title: 'Tắt lớp bảo vệ',
          ok: 'Tắt'
        } : null;
        if (warn) {
          confirmBox(warn.msg, {
            title: warn.title,
            ok: warn.ok,
            danger: true
          }).then(function (ok) {
            if (ok) {
              go();
            } else {
              btn.disabled = false;
            }
          });
        } else {
          go();
        }
      };
    }).catch(function (ex) {
      if (view !== 'site') {
        return;
      }
      $('sBody').innerHTML = '';
      errorStateIn($('sBody'), ex.message);
      $('retry').onclick = renderSite;
    });
    var rs = $('sReset');
    if (rs) {
      rs.onclick = function () {
        confirmBox('Đưa mọi cài đặt website về mặc định ban đầu?', {
          title: 'Khôi phục mặc định',
          ok: 'Khôi phục',
          danger: true
        }).then(function (ok) {
          if (ok) {
            api('/site', { method: 'DELETE' }).then(function () {
              toast('Đã khôi phục mặc định');
              renderSite();
            }).catch(function (ex) {
              toast(ex.message, true);
            });
          }
        });
      };
    }
  }

  function renderTemplates() {
    main.innerHTML = '<div class="page-h"><div><h1>Mẫu trả lời nhanh</h1><p>Dùng trong mục Tin nhắn và chi tiết đơn. Biến tự điền: <code>{ten}</code> tên khách, <code>{tour}</code> tên tour, <code>{gia}</code> giá tour.</p></div>' +
      '<button class="btn primary" id="pAdd"><span class="ms">add</span>Thêm mẫu</button></div><div id="pList" class="tpl-grid"><div class="skel block"></div><div class="skel block"></div></div>';
    $('pAdd').onclick = function () {
      tplPanel(null);
    };
    loadTplList();
  }
  function loadTplList() {
    getTemplates(true).then(function (items) {
      if (view !== 'templates') {
        return;
      }
      var box = $('pList');
      if (!items.length) {
        box.innerHTML = '<div class="card state" style="grid-column:1/-1"><span class="ms">quickreply</span><h2>Chưa có mẫu nào</h2><p>Tạo mẫu cho những câu bạn hay trả lời: báo giá, xin số điện thoại, nhắc cọc…</p></div>';
        return;
      }
      box.innerHTML = items.map(function (t) {
        return '<article class="card tpl" data-id="' + t.id + '" tabindex="0"><h2>' + esc(t.title) +
          '</h2><p>' + esc(t.body) + '</p></article>';
      }).join('');
      box.querySelectorAll('.tpl').forEach(function (c) {
        var t = items.filter(function (x) {
          return x.id == c.dataset.id;
        })[0];
        c.onclick = function () {
          tplPanel(t);
        };
        c.onkeydown = function (e) {
          if (e.key === 'Enter') {
            tplPanel(t);
          }
        };
      });
    }).catch(function (ex) {
      if (view !== 'templates') {
        return;
      }
      $('pList').innerHTML = '';
      errorStateIn($('pList'), ex.message);
      $('retry').onclick = loadTplList;
    });
  }
  function tplPanel(t) {
    var isNew = !t;
    t = t || { title: '', body: '' };
    openPanel(isNew ? 'Thêm mẫu trả lời' : t.title, 'Có thể dùng {ten}, {tour}, {gia}', '<label class="field"><span>Tên mẫu</span><input id="pTitle" maxlength="60" value="' + esc(t.title) + '"></label>' +
      '<label class="field"><span>Nội dung</span><textarea id="pBody" rows="9" maxlength="1000">' + esc(t.body) + '</textarea></label>', (isNew ? '<button class="btn" id="pCancel" type="button">Huỷ</button>' : '<button class="btn danger" id="pDel" type="button"><span class="ms">delete</span>Xoá</button>') +
      '<button class="btn primary" id="pSave">Lưu</button>', loadTplList);
    $('pTitle').focus();
    if (isNew) {
      $('pCancel').onclick = function () {
        closeDrawer();
      };
    } else {
      $('pDel').onclick = function () {
        confirmBox('Xoá mẫu “' + t.title + '”?', {
          title: 'Xoá mẫu trả lời',
          ok: 'Xoá mẫu',
          danger: true
        }).then(function (ok) {
          if (ok) {
            api('/templates/' + t.id, { method: 'DELETE' }).then(function () {
              toast('Đã xoá mẫu');
              closeDrawer(true);
            }).catch(function (ex) {
              toast(ex.message, true);
            });
          }
        });
      };
    }
    $('pSave').onclick = function () {
      var btn = this;
      btn.disabled = true;
      api(isNew ? '/templates' : '/templates/' + t.id, { method: isNew ? 'POST' : 'PATCH', body: { title: $('pTitle').value, body: $('pBody').value } })
        .then(function () {
        toast('Đã lưu mẫu');
        closeDrawer(true);
      }).catch(function (ex) {
        toast(ex.message, true);
        btn.disabled = false;
      });
    };
  }
  /* Thanh mẫu trong khung chat: bấm để chèn vào ô soạn tin (chưa gửi, bạn xem lại rồi mới gửi) */
  function bindTplBar(ta, ctx) {
    var bar = $('tplBar');
    if (!bar) {
      return;
    }
    Promise.all([getTemplates(), getTours()]).then(function (r) {
      var items = r[0];
      if (!$('tplBar')) {
        return;
      }
      bar.innerHTML = items.length ? items.map(function (t) {
        return '<button type="button" class="tpl-chip" data-id="' + t.id + '" title="' + esc(t.body) + '">' +
          esc(t.title) + '</button>';
      }).join('') : '<a class="tpl-chip" href="#/templates">+ Tạo mẫu trả lời</a>';
      bar.querySelectorAll('button').forEach(function (b) {
        b.onclick = function () {
          var t = items.filter(function (x) {
            return x.id == b.dataset.id;
          })[0];
          ta.value = fillTpl(t.body, ctx);
          ta.dispatchEvent(new Event('input'));
          ta.focus();
        };
      });
    }).catch(function () {
      bar.innerHTML = '';
    });
  }

  /* ---------- Báo cáo ---------- */
  var repState = {
    from: '',
    to: '',
    preset: '30'
  };
  function isoNow() {
    return new Date(Date.now() + TZ).toISOString().slice(0, 10);
  }
  function isoShift(iso, n) {
    return new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);
  }
  function presetRange(p) {
    var t = isoNow();
    if (p === 'year') {
      return { from: t.slice(0, 4) + '-01-01', to: t };
    }
    if (p === 'month') {
      return { from: t.slice(0, 7) + '-01', to: t };
    }
    return { from: isoShift(t, -(Number(p) - 1)), to: t };
  }
  function renderReports() {
    if (!repState.from) {
      var r0 = presetRange('30');
      repState.from = r0.from;
      repState.to = r0.to;
    }
    var P = [['7', '7 ngày'], ['30', '30 ngày'], ['90', '90 ngày'], ['month', 'Tháng này'], ['year', 'Năm nay'], ['365', '12 tháng']];
    main.innerHTML = '<div class="page-h"><div><h1>Báo cáo</h1><p id="rSub">Tổng hợp đơn, doanh thu và điểm đến.</p></div><div class="h-acts no-print"><a class="btn" id="rCsv" href="#"><span class="ms">download</span>Xuất CSV</a><a class="btn" id="rXlsx" href="#"><span class="ms">table_view</span>Xuất Excel</a><button class="btn" id="rPrint"><span class="ms">print</span>In</button></div></div>' +
      '<div class="rep-ctl no-print"><div class="chips" id="rChips">' + P.map(function (p) {
      return '<button class="chip" data-p="' + p[0] + '" aria-pressed="' + (repState.preset === p[0]) + '">' +
        p[1] + '</button>';
    }).join('') + '</div>' +
      '<label class="field"><span>Từ ngày</span><input type="date" id="rFrom" value="' + repState.from + '"></label><label class="field"><span>Đến ngày</span><input type="date" id="rTo" value="' + repState.to + '"></label></div><div id="rBody"><div class="skel block"></div><div class="skel block" style="margin-top:14px"></div></div>';
    $('rChips').onclick = function (e) {
      var b = e.target.closest('.chip');
      if (!b) {
        return;
      }
      var r = presetRange(b.dataset.p);
      repState = {
        from: r.from,
        to: r.to,
        preset: b.dataset.p
      };
      renderReports();
    };
    $('rFrom').onchange = $('rTo').onchange = function () {
      if ($('rFrom').value && $('rTo').value) {
        repState = {
          from: $('rFrom').value,
          to: $('rTo').value,
          preset: ''
        };
        renderReports();
      }
    };
    $('rPrint').onclick = function () {
      window.print();
    };
    $('rCsv').href = '/api/admin/report.csv?from=' + repState.from + '&to=' + repState.to;
    $('rXlsx').href = '/api/admin/report.xlsx?from=' + repState.from + '&to=' + repState.to;
    api('/report?from=' + repState.from + '&to=' + repState.to).then(function (r) {
      if (view === 'reports') {
        drawReport(r);
      }
    })
      .catch(function (ex) {
      if (view !== 'reports') {
        return;
      }
      $('rBody').innerHTML = '';
      errorStateIn($('rBody'), ex.message);
      $('retry').onclick = renderReports;
    });
  }
  function pctDelta(cur, prev) {
    if (!prev) {
      return cur ? 'Kỳ trước: 0' : 'Kỳ trước: 0';
    }
    var d = Math.round((cur - prev) / prev * 100);
    return (d > 0 ? '<span class="ms ico-s">arrow_upward</span>' : d < 0 ? '<span class="ms ico-s">arrow_downward</span>' : '') +
      Math.abs(d) + '% so với kỳ trước';
  }
  function drawReport(r) {
    var t = r.totals, p = r.previous, conv = t.bookings ? Math.round(t.won / t.bookings * 1000) / 10 : 0;
    $('rSub').textContent = isoToVn(r.range.from) + ' – ' + isoToVn(r.range.to) + ' (' + r.range.days +
      ' ngày)';
    var avg = t.won ? Math.round(t.revenue / t.won) : 0;
    $('rBody').innerHTML =
      (r.wonWithoutAmount ? '<div class="note-bar">Có ' + r.wonWithoutAmount +
        ' đơn đã chốt chưa có doanh thu (điểm đến chưa gắn với tour nào). Mở đơn và nhập “Doanh thu” để báo cáo chính xác.</div>' : '') +
        '<div class="kpis">' +
        '<div class="card kpi"><span class="lbl">Đơn nhận được</span><span class="val">' + fmt(t.bookings) + '</span><span class="cmp">' + pctDelta(t.bookings, p.bookings) + '</span></div>' +
        '<div class="card kpi"><span class="lbl">Đã chốt</span><span class="val">' + fmt(t.won) + '</span><span class="cmp">Tỷ lệ chốt ' + conv + '% · ' + fmt(t.people) + ' khách</span></div>' +
        '<div class="card kpi"><span class="lbl">Doanh thu</span><span class="val money">' + VND(t.revenue) + '</span><span class="cmp">' + pctDelta(t.revenue, p.revenue) + '</span></div>' +
        '<div class="card kpi"><span class="lbl">Giá trị TB / đơn chốt</span><span class="val money">' + VND(avg) + '</span><span class="cmp">' + r.newAccounts + ' tài khoản mới · ' + r.chatCustomers + ' khách nhắn tin</span></div></div>' +
        '<div class="grid2"><section class="card"><h2>Số đơn theo ' + (r.unit === 'month' ? 'tháng' : 'ngày') + '</h2><p class="sub">Cột đậm là đơn đã chốt</p><div id="rChart1"></div></section>' +
        '<section class="card"><h2>Doanh thu theo ' + (r.unit === 'month' ? 'tháng' : 'ngày') + '</h2><p class="sub">Chỉ tính đơn đã chốt</p><div id="rChart2"></div></section></div>' +
        '<div class="grid2"><section class="card table-card"><div class="card-pad"><h2>Theo điểm đến</h2></div>' + repTable(r.destinations, 'Điểm đến') + '</section>' +
        '<section class="card table-card"><div class="card-pad"><h2>Theo nguồn đơn</h2></div>' + repTable(r.sources.map(function (s) {
        return Object.assign({}, s, { name: SOURCE[s.name] || s.name });
      }), 'Nguồn') +
        '<div class="card-pad sub">Trạng thái: ' + t.fresh + ' mới · ' + t.called + ' đã gọi · ' + t.won + ' đã chốt · ' + t.cancelled + ' huỷ' + (r.reviews.count ? ' · ' +
        r.reviews.count + ' đánh giá mới (TB ' + String(r.reviews.avg).replace('.', ',') + ' sao)' : '') + '</div></section></div>';
    barChart($('rChart1'), r.series, r.unit, 'bookings', 'won', function (v) {
      return fmt(v) + ' đơn';
    });
    barChart($('rChart2'), r.series, r.unit, 'revenue', null, VND);
  }
  function repTable(rows, label) {
    if (!rows.length) {
      return '<div class="state" style="padding:26px"><p>Chưa có dữ liệu trong khoảng này.</p></div>';
    }
    return '<div class="tbl-wrap"><table class="tbl static"><thead><tr><th>' + label + '</th><th class="num">Đơn</th><th class="num">Chốt</th><th class="num">Doanh thu</th></tr></thead><tbody>' +
      rows.map(function (x) {
        return '<tr><td>' + esc(x.name) + '</td><td class="num">' + fmt(x.bookings) + '</td><td class="num">' +
          fmt(x.won) + '</td><td class="num">' + VND(x.revenue) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function barChart(el, series, unit, key, key2, label) {
    var W = 560, H = 190, L = 34, B = 24, n = series.length, max = 0;
    series.forEach(function (s) {
      if (s[key] > max) {
        max = s[key];
      }
    });
    if (!max) {
      el.innerHTML = '<div class="state" style="padding:26px"><p>Chưa có dữ liệu trong khoảng này.</p></div>';
      return;
    }
    var step = Math.pow(10, Math.floor(Math.log10(max)));
    max = Math.ceil(max / step) * step;
    var bw = (W - L) / n, g = '';
    [0, .5, 1].forEach(function (f) {
      var y = H - B - f * (H - B - 8);
      g += '<line x1="' + L + '" x2="' + W + '" y1="' + y + '" y2="' + y + '" class="gl"/><text x="' + (L - 6) +
        '" y="' + (y +
        4) + '" text-anchor="end" class="ax">' +
        (key === 'revenue' ? (max * f >= 1e6 ? Math.round(max * f / 1e5) / 10 +
          'tr' : fmt(max * f)) : fmt(Math.round(max * f))) +
        '</text>';
    });
    var every = Math.max(1, Math.ceil(n / 8));
    series.forEach(function (s, i) {
      var h = (H - B - 8) * s[key] / max, x = L + i * bw, w = Math.max(2, bw * .68);
      var tip = (unit === 'month' ? s.key.split('-').reverse().join('/') : isoToVn(s.key).slice(0, 5)) + ': ' +
        label(s[key]);
      g += '<g><title>' + esc(tip) + '</title><rect x="' + (x + (bw - w) / 2) + '" y="' + (H - B - h) +
        '" width="' + w + '" height="' + Math.max(h, s[key] ? 2 : 0) + '" rx="2" class="b1"/>';
      if (key2 && s[key2]) {
        var h2 = (H - B - 8) * s[key2] / max;
        g += '<rect x="' + (x + (bw - w) / 2) + '" y="' + (H - B - h2) + '" width="' + w + '" height="' + h2 +
          '" rx="2" class="b2"/>';
      }
      g += '</g>';
      if (i % every === 0) {
        g += '<text x="' + (x + bw / 2) + '" y="' + (H - 6) + '" text-anchor="middle" class="ax">' +
          (unit === 'month' ? s.key.slice(5) +
            '/' + s.key.slice(2, 4) : isoToVn(s.key).slice(0, 5)) +
          '</text>';
      }
    });
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="bchart" role="img" aria-label="Biểu đồ">' +
      g + '</svg>';
  }

  /* ---------- Trả lời tự động của khung chat ---------- */
  function renderFaq() {
    var rw = can('bot', true);
    main.innerHTML = '<div class="page-h"><div><h1>Trả lời tự động</h1><p>Khách chọn câu hỏi gợi ý là được trả lời ngay. Câu hỏi chưa có sẵn sẽ nhận lời nhắn chờ tư vấn viên.</p></div>' +
      (rw ? '<button class="btn primary" id="fqAdd"><span class="ms">add</span>Thêm câu hỏi</button>' : '') + '</div>' +
      '<div class="card card-pad" id="fqSet"></div><div class="card" id="fqList"><div class="skel block"></div></div>';
    if ($('fqAdd')) {
      $('fqAdd').onclick = function () {
        faqPanel(null);
      };
    }
    loadFaq();
  }
  function loadFaq() {
    api('/faq').then(function (r) {
      if (view !== 'faq') {
        return;
      }
      var rw = can('bot', true);
      $('fqSet').innerHTML = '<h2 style="font-size:16px;margin-bottom:8px">Lời chào và lời nhắn chờ</h2>' +
        '<label class="field"><span>Lời chào khi khách mở khung chat</span><textarea id="fqGreet" rows="2" maxlength="300"' + (rw ? '' : ' disabled') + '>' + esc(r.greeting) + '</textarea></label>' +
        '<label class="field"><span>Trả lời khi câu hỏi chưa có sẵn (báo chờ admin)</span><textarea id="fqWait" rows="3" maxlength="500"' + (rw ? '' : ' disabled') + '>' + esc(r.wait) + '</textarea></label>' +
        (rw ? '<div class="rv-acts"><button class="btn primary" id="fqSave">Lưu lời nhắn</button></div>' : '');
      if ($('fqSave')) {
        $('fqSave').onclick = function () {
          var b = this;
          b.disabled = true;
          api('/faq/settings', { method: 'PUT', body: { greeting: $('fqGreet').value, wait: $('fqWait').value } }).then(function () {
            toast('Đã lưu');
          }).catch(function (ex) {
            toast(ex.message, true);
          }).then(function () {
            b.disabled = false;
          });
        };
      }
      $('fqList').innerHTML = r.items.length ? r.items.map(function (f) {
        return '<div class="faq-row' + (f.active ? '' : ' faq-off') + '" data-id="' + f.id + '"><b>' + esc(f.question) + (f.active ? '' : ' (đang tắt)') + '</b><p>' + esc(f.answer) + '</p>' +
          (f.keywords ? '<small class="muted">Từ khoá tự nhận: ' + esc(f.keywords) + '</small>' : '') +
          (rw ? '<div class="rv-acts"><button class="btn" data-a="edit"><span class="ms">edit</span>Sửa</button><button class="btn" data-a="toggle"><span class="ms">' +
            (f.active ? "visibility_off" : "visibility") + '</span>' + (f.active ? 'Tắt' : 'Bật') +
            '</button><button class="btn" data-a="up"><span class="ms">arrow_upward</span></button><button class="btn" data-a="down"><span class="ms">arrow_downward</span></button><button class="btn danger" data-a="del"><span class="ms">delete</span>Xoá</button></div>' : '') + '</div>';
      }).join('') : '<div class="state"><span class="ms">quickreply</span><h2>Chưa có câu hỏi nào</h2><p>Thêm câu hỏi để khách chọn và được trả lời ngay.</p></div>';
      $('fqList').querySelectorAll('.faq-row').forEach(function (row, i) {
        var f = r.items[i];
        row.querySelectorAll('[data-a]').forEach(function (b) {
          b.onclick = function () {
            var a = b.dataset.a;
            if (a === 'edit') {
              return faqPanel(f);
            }
            if (a === 'del') {
              return confirmBox('Xoá câu hỏi này?', {
                title: 'Xoá câu hỏi',
                ok: 'Xoá',
                danger: true
              }).then(function (ok) {
                if (ok) {
                  return api('/faq/' + f.id, { method: 'DELETE' }).then(function () {
                    toast('Đã xoá');
                    loadFaq();
                  }).catch(function (ex) {
                    toast(ex.message, true);
                  });
                }
              });
            }
            var body = a === 'toggle' ? { active: !f.active } : null;
            if (a === 'up' || a === 'down') {
              var other = r.items[i + (a === 'up' ? -1 : 1)];
              if (!other) {
                return;
              }
              return Promise.all([api('/faq/' + f.id, { method: 'PATCH', body: { sort: other.sort } }), api('/faq/' +
                  other.id, { method: 'PATCH', body: { sort: f.sort === other.sort ? f.sort +
                      (a === 'up' ? 1 : -1) : f.sort } })]).then(loadFaq).catch(function (ex) {
                toast(ex.message, true);
              });
            }
            api('/faq/' + f.id, { method: 'PATCH', body: body }).then(loadFaq).catch(function (ex) {
              toast(ex.message, true);
            });
          };
        });
      });
    }).catch(function (ex) {
      if (view !== 'faq') {
        return;
      }
      $('fqList').innerHTML = '';
      errorStateIn($('fqList'), ex.message);
      $('retry').onclick = loadFaq;
    });
  }
  function faqPanel(f) {
    var isNew = !f;
    f = f || {
      question: '',
      answer: '',
      keywords: ''
    };
    openPanel(isNew ? 'Thêm câu hỏi' : 'Sửa câu hỏi', 'Khách bấm câu hỏi này sẽ nhận câu trả lời ngay', '<label class="field"><span>Câu hỏi hiện cho khách</span><input id="fQ" maxlength="120" value="' + esc(f.question) + '"></label>' +
      '<label class="field"><span>Câu trả lời</span><textarea id="fA" rows="6" maxlength="1000">' + esc(f.answer) + '</textarea></label>' +
      '<label class="field"><span>Từ khoá tự nhận (cách nhau bằng dấu phẩy, tuỳ chọn)</span><input id="fK" maxlength="300" value="' + esc(f.keywords) + '" placeholder="giá tour, hạ long, đặt cọc"></label>' +
      '<p class="perm-note">Khách gõ tin có chứa từ khoá (không phân biệt dấu) cũng được trả lời tự động bằng câu trả lời này.</p>', '<button class="btn" id="fCancel" type="button">Huỷ</button><button class="btn primary" id="fSave">Lưu</button>', loadFaq);
    $('fCancel').onclick = function () {
      closeDrawer();
    };
    $('fSave').onclick = function () {
      var btn = this;
      btn.disabled = true;
      api(isNew ? '/faq' : '/faq/' + f.id, { method: isNew ? 'POST' : 'PATCH', body: {
          question: $('fQ').value,
          answer: $('fA').value,
          keywords: $('fK').value
        } })
        .then(function () {
        toast('Đã lưu');
        closeDrawer(true);
      }).catch(function (ex) {
        toast(ex.message, true);
        btn.disabled = false;
      });
    };
  }

  /* ---------- Nhật ký thao tác ---------- */
  /* ---------- Quản trị viên & phân quyền (chỉ Chủ) ---------- */
  var PERM_OPTS = [['', 'Không'], ['r', 'Chỉ xem'], ['rw', 'Xem và sửa']];
  function renderAdmins() {
    main.innerHTML = '<div class="page-h"><div><h1>Quản trị viên</h1><p>Mỗi người một tài khoản, chọn vai trò hoặc tự chỉnh từng quyền.</p></div>' +
      '<button class="btn primary" id="adAdd"><span class="ms">person_add</span>Thêm quản trị viên</button></div>' +
      '<div class="card" id="adList"><div class="skel block"></div></div><div class="card" id="adRoles"></div><div class="card" id="adMatrix"></div>';
    $('adAdd').onclick = function () {
      adminPanel(null, adMeta);
    };
    loadAdmins();
  }
  var adMeta = {
    roles: {
      owner: 'Chủ',
      manager: 'Quản lý',
      staff: 'Nhân viên tư vấn',
      viewer: 'Chỉ xem'
    },
    groups: {},
    defaults: {}
  };
  function permIcon(p) {
    return p === 'rw' ? '<span class="ms ico-s">check</span>' : p === 'r' ? '<span class="ms ico-s">visibility</span>' : '<span class="ms ico-s">remove</span>';
  }
  function loadAdmins() {
    api('/admins').then(function (r) {
      if (view !== 'admins') {
        return;
      }
      adMeta = {
        items: r.items,
        roles: r.roles,
        groups: r.groups,
        flags: r.flags,
        subs: r.subs,
        customRoles: r.customRoles || [],
        defaults: r.defaults,
        me: r.me,
        actorRole: r.actorRole
      };
      var crs = adMeta.customRoles;
      $('adRoles').innerHTML = '<div class="card-h"><div><h2>Vai trò tuỳ chỉnh</h2><p class="sub">Tự đặt tên vai trò (ví dụ “Kế toán”, “Cộng tác viên”) và chọn quyền tới từng việc nhỏ, rồi gán cho nhiều tài khoản cùng lúc.</p></div><button class="btn" id="crAdd"><span class="ms">add</span>Thêm vai trò</button></div>' +
        (crs.length ? '<div class="tbl-wrap"><table><thead><tr><th>Tên vai trò</th><th>Số tài khoản</th></tr></thead><tbody>' + crs.map(function (c) {
          return '<tr class="clickable" data-cr="' + c.id + '" tabindex="0"><td class="name"><b>' +
            esc(c.name) + '</b></td><td>' + c.users + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="perm-note">Chưa có vai trò tuỳ chỉnh nào.</p>');
      $('crAdd').onclick = function () {
        rolePanel(null, adMeta);
      };
      $('adRoles').querySelectorAll('tr[data-cr]').forEach(function (tr) {
        var c = crs.filter(function (x) {
          return x.id == tr.dataset.cr;
        })[0];
        tr.onclick = function () {
          rolePanel(c, adMeta);
        };
        tr.onkeydown = function (e) {
          if (e.key === 'Enter') {
            rolePanel(c, adMeta);
          }
        };
      });
      var roleKeys = Object.keys(r.roles), gk = Object.keys(r.groups);
      $('adMatrix').innerHTML = '<h2>Quyền mặc định của từng vai trò</h2><p class="sub"><span class="ms ico-s">check</span> xem và sửa · <span class="ms ico-s">visibility</span> chỉ xem · <span class="ms ico-s">remove</span> không thấy. Mỗi tài khoản có thể được chỉnh quyền riêng khi bấm vào tên.</p><div class="tbl-wrap"><table><thead><tr><th>Chức năng</th>' +
        roleKeys.map(function (k) {
          return '<th>' + esc(r.roles[k]) + '</th>';
        }).join('') + '</tr></thead><tbody>' +
        gk.map(function (g) {
          return '<tr><td>' + esc(r.groups[g]) + '</td>' + roleKeys.map(function (k) {
            return '<td>' + permIcon(r.defaults[k][g]) + '</td>';
          }).join('') + '</tr>';
        }).join('') +
        '<tr class="sub"><td colspan="' + (roleKeys.length + 1) + '">Quyền đặc biệt</td></tr>' +
        Object.keys(r.flags || {}).map(function (f) {
          return '<tr><td>' + esc(r.flags[f]) + '</td>' + roleKeys.map(function (k) {
            return '<td>' + permIcon(r.defaults[k][f]) + '</td>';
          }).join('') + '</tr>';
        }).join('') +
        '<tr class="sub"><td colspan="' + (roleKeys.length + 1) + '">Quyền theo từng mục con</td></tr>' +
        Object.keys(r.subs || {}).map(function (sk) {
          var g = r.subs[sk].group;
          return '<tr><td>' + esc(r.subs[sk].label) + '</td>' + roleKeys.map(function (k) {
            var d = r.defaults[k] || {};
            return '<td>' + permIcon(d[g] === 'rw' && (d._deny || []).indexOf(sk) < 0 ? 'rw' : '') + '</td>';
          }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>';
      $('adList').innerHTML = r.items.length ? '<div class="tbl-wrap"><table><thead><tr><th>Tên</th><th>Email</th><th>Vai trò</th><th>Đăng nhập gần nhất</th><th>Trạng thái</th></tr></thead><tbody>' +
        r.items.map(function (a) {
          return '<tr class="clickable" data-id="' + a.id + '" tabindex="0"><td class="name"><span class="av sm">' + avInner(a.name, a.avatar) + '</span><b>' +
            esc(a.name) + '</b></td><td>' + esc(a.email) + '</td><td>' + esc(r.roles[a.role]) +
            (a.custom ? '<span class="vtag">Quyền riêng</span>' : '') + '</td><td>' +
            (a.last_login ? vnDate(a.last_login) +
              ' ' + vnTime(a.last_login) : '–') + '</td><td>' +
            (a.active ? 'Đang hoạt động' : 'Đã khoá') + '</td></tr>';
        }).join('') + '</tbody></table></div>' :
        '<div class="state"><span class="ms">admin_panel_settings</span><h2>Chưa có quản trị viên riêng</h2><p>Thêm nhân viên để mỗi người có tài khoản và quyền riêng.</p></div>';
      $('adList').querySelectorAll('tr[data-id]').forEach(function (tr) {
        var a = r.items.filter(function (x) {
          return x.id == tr.dataset.id;
        })[0];
        tr.onclick = function () {
          adminPanel(a, adMeta);
        };
        tr.onkeydown = function (e) {
          if (e.key === 'Enter') {
            adminPanel(a, adMeta);
          }
        };
      });
    }).catch(function (ex) {
      if (view !== 'admins') {
        return;
      }
      $('adList').innerHTML = '';
      errorStateIn($('adList'), ex.message);
      $('retry').onclick = loadAdmins;
    });
  }
  /* Quyền theo từng mục con: bật = được làm. Chỉ có tác dụng khi nhóm tương ứng ở mức “Xem và sửa”. */
  function subRows(perms, off) {
    var sk = Object.keys(adMeta.subs || {}), deny = perms._deny || [];
    if (!sk.length) {
      return '';
    }
    return '<h4 class="perm-h">Quyền theo từng mục con</h4><p class="perm-note">Tắt một việc để người này không làm được việc đó dù nhóm chức năng cho phép sửa.</p><div class="perm-flags">' + sk.map(function (k) {
      return '<label class="chk tgl"><input type="checkbox" data-s="' + k + '"' +
        (deny.indexOf(k) < 0 ? ' checked' : '') + (off ? ' disabled' : '') + '><span>' +
        esc(adMeta.subs[k].label) + '</span></label>';
    }).join('') + '</div>';
  }
  function readPermBox() {
    var o = {}, deny = [];
    document.querySelectorAll('#aPerms select').forEach(function (sel) {
      if (sel.value) {
        o[sel.dataset.g] = sel.value;
      }
    });
    document.querySelectorAll('#aPerms input[data-f]').forEach(function (c) {
      if (c.checked) {
        o[c.dataset.f] = 'rw';
      }
    });
    document.querySelectorAll('#aPerms input[data-s]').forEach(function (c) {
      if (!c.checked) {
        deny.push(c.dataset.s);
      }
    });
    if (deny.length) {
      o._deny = deny;
    }
    return o;
  }
  function permRows(perms, off) {
    var gk = Object.keys(adMeta.groups || {}), fk = Object.keys(adMeta.flags || {});
    return '<h4 class="perm-h">Chức năng</h4>' + gk.map(function (g) {
      return '<div class="perm-row"><span>' + esc(adMeta.groups[g]) + '</span><select data-g="' + g + '"' + (off ? ' disabled' : '') + '>' + PERM_OPTS.map(function (o) {
        return opt(o[0], o[1], perms[g] || '');
      }).join('') + '</select></div>';
    }).join('') + '<h4 class="perm-h">Quyền đặc biệt</h4><div class="perm-flags">' + fk.map(function (f) {
      return '<label class="chk tgl"><input type="checkbox" data-f="' + f + '"' +
        (perms[f] === 'rw' ? ' checked' : '') + (off ? ' disabled' : '') + '><span>' + esc(adMeta.flags[f]) +
        '</span></label>';
    }).join('') + '</div>' + subRows(perms, off);
  }
  /* ---------- Email mẫu chỉnh được ---------- */
  function renderEmails() {
    main.innerHTML = '<div class="page-h"><div><h1>Email mẫu</h1><p>Sửa chữ trong các email website tự gửi. Bố cục, logo và màu giữ nguyên.</p></div></div><div id="emBody"><div class="card"><div class="skel block"></div></div></div>';
    loadEmails();
  }
  function loadEmails() {
    api('/email-templates').then(function (r) {
      if (view !== 'emails') {
        return;
      }
      function group(to, title) {
        var items = r.items.filter(function (t) {
          return t.to === to;
        });
        return '<div class="card"><h2>' + title + '</h2><div class="tbl-wrap"><table><thead><tr><th>Loại email</th><th>Tiêu đề hiện tại</th></tr></thead><tbody>' + items.map(function (t) {
          return '<tr class="clickable" data-k="' + t.key + '" tabindex="0"><td class="name"><b>' +
            esc(t.label) + '</b>' + (t.custom ? '<span class="vtag">Đã sửa</span>' : '') + '</td><td>' +
            esc(t.values.subject) + '</td></tr>';
        }).join('') + '</tbody></table></div></div>';
      }
      $('emBody').innerHTML = group('Khách', 'Gửi cho khách') +
        group('Quản trị viên', 'Gửi cho quản trị viên');
      $('emBody').querySelectorAll('tr[data-k]').forEach(function (tr) {
        var t = r.items.filter(function (x) {
          return x.key === tr.dataset.k;
        })[0];
        tr.onclick = function () {
          emailPanel(t);
        };
        tr.onkeydown = function (e) {
          if (e.key === 'Enter') {
            emailPanel(t);
          }
        };
      });
    }).catch(function (ex) {
      if (view !== 'emails') {
        return;
      }
      $('emBody').innerHTML = '';
      errorStateIn($('emBody'), ex.message);
      $('retry').onclick = renderEmails;
    });
  }
  function emailPanel(t) {
    var last = null;
    openPanel(t.label, 'Gửi cho ' + t.to.toLowerCase(), t.fields.map(function (f) {
      var v = t.values[f.name] || '';
      return '<label class="field"><span>' + esc(f.label) + '</span>' +
        (f.multi ? '<textarea data-f="' +
          f.name + '" rows="3" maxlength="' + f.max + '">' + esc(v) + '</textarea>' : '<input data-f="' +
          f.name + '" maxlength="' + f.max + '" value="' + esc(v) + '">') +
        '</label>';
    }).join('') +
      '<h4 class="perm-h">Biến dùng được</h4><p class="perm-note">Bấm để chèn vào ô đang soạn. Khi gửi, biến được thay bằng thông tin thật.</p><div class="chips vars">' +
      t.vars.map(function (v) {
        return '<button type="button" class="chip" data-v="' + v.name + '" title="' + esc(v.desc) + '">{' +
          v.name + '}</button>';
      }).join('') + '</div>' +
      '<div class="em-acts"><button class="btn" type="button" id="emPrev"><span class="ms">visibility</span>Xem thử</button><button class="btn" type="button" id="emTest"><span class="ms">forward_to_inbox</span>Gửi thử cho tôi</button></div>' +
      '<div id="emPv" hidden><p class="perm-note" id="emSubj"></p><iframe id="emFrame" class="em-frame" sandbox="" title="Xem thử email"></iframe></div>', '<button class="btn" type="button" id="emReset"' +
      (t.custom ? '' : ' disabled') +
      '>Khôi phục mặc định</button><button class="btn primary" id="emSave">Lưu</button>', loadEmails);
    function read() {
      var o = {};
      document.querySelectorAll('#drawer [data-f]').forEach(function (el) {
        o[el.dataset.f] = el.value;
      });
      return o;
    }
    document.querySelectorAll('#drawer [data-f]').forEach(function (el) {
      el.onfocus = function () {
        last = el;
      };
    });
    document.querySelectorAll('#drawer .chip').forEach(function (b) {
      b.onclick = function () {
        var el = last || document.querySelector('#drawer [data-f]'), tok = '{' + b.dataset.v + '}', s = el.selectionStart == null ? el.value.length : el.selectionStart, e = el.selectionEnd == null ? s : el.selectionEnd;
        el.value = el.value.slice(0, s) + tok + el.value.slice(e);
        el.focus();
        el.setSelectionRange(s + tok.length, s + tok.length);
      };
    });
    $('emPrev').onclick = function () {
      var b = this;
      b.disabled = true;
      api('/email-templates/' + t.key + '/preview', { method: 'POST', body: { fields: read() } }).then(function (r) {
        $('emSubj').textContent = 'Tiêu đề thư: ' + r.subject;
        $('emFrame').srcdoc = r.html;
        $('emPv').hidden = false;
      }).catch(function (ex) {
        toast(ex.message, true);
      }).then(function () {
        b.disabled = false;
      });
    };
    $('emTest').onclick = function () {
      var b = this;
      b.disabled = true;
      api('/email-templates/' + t.key + '/test', { method: 'POST', body: { fields: read() } }).then(function (r) {
        toast('Đã gửi thử tới ' + r.to);
      })
        .catch(function (ex) {
        toast(ex.message, true);
      }).then(function () {
        b.disabled = false;
      });
    };
    $('emSave').onclick = function () {
      var b = this;
      b.disabled = true;
      api('/email-templates/' + t.key, { method: 'PUT', body: { fields: read() } }).then(function () {
        toast('Đã lưu');
        closeDrawer(true);
      }).catch(function (ex) {
        toast(ex.message, true);
        b.disabled = false;
      });
    };
    $('emReset').onclick = function () {
      confirmBox('Đưa email “' + t.label + '” về chữ mặc định? Phần bạn đã sửa sẽ mất.', {
        title: 'Khôi phục mặc định',
        ok: 'Khôi phục',
        danger: true
      }).then(function (ok) {
        if (ok) {
          api('/email-templates/' + t.key, { method: 'DELETE' }).then(function () {
            toast('Đã khôi phục');
            closeDrawer(true);
          }).catch(function (ex) {
            toast(ex.message, true);
          });
        }
      });
    };
  }
  /* ---------- Mã giảm giá ---------- */
  function cpLabel(c) {
    return c.kind === 'percent' ? 'Giảm ' + c.value + '%' : 'Giảm ' + fmt(c.value) + 'đ';
  }
  function cpState(c, today) {
    if (!c.active) {
      return 'Đang tắt';
    }
    if (c.end_date && today > c.end_date) {
      return 'Hết hạn';
    }
    if (c.start_date && today < c.start_date) {
      return 'Chưa bắt đầu';
    }
    if (c.max_uses != null && c.used >= c.max_uses) {
      return 'Hết lượt';
    }
    return 'Đang chạy';
  }
  function isoVn(s) {
    return s ? s.split('-').reverse().join('/') : '';
  }
  function renderCoupons() {
    main.innerHTML = '<div class="page-h"><div><h1>Mã giảm giá</h1><p>Khách nhập mã ở form đặt tour. Mã % tính trên giá tour × số người; mã tiền giảm cố định mỗi đơn.</p></div><div class="h-acts"><button class="btn primary" id="cpAdd"><span class="ms">add</span>Thêm mã</button></div></div><div id="cpBody"><div class="card"><div class="skel block"></div></div></div>';
    $('cpAdd').onclick = function () {
      couponPanel(null);
    };
    loadCoupons();
  }
  function loadCoupons() {
    api('/coupons').then(function (r) {
      if (view !== 'coupons') {
        return;
      }
      $('cpBody').innerHTML = r.items.length ? '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Mã</th><th>Mức giảm</th><th>Đã dùng</th><th>Hiệu lực</th><th>Trạng thái</th></tr></thead><tbody>' + r.items.map(function (c) {
        return '<tr class="clickable" data-id="' + c.id + '" tabindex="0"><td class="name"><b>' + esc(c.code) +
          '</b>' + (c.destination ? '<span class="vtag">' +
          esc(c.destination) + '</span>' : '') +
          '</td><td>' + cpLabel(c) + (c.min_people > 1 ? ' · từ ' +
          c.min_people + ' người' : '') +
          '</td><td>' + c.used + (c.max_uses != null ? ' / ' +
          c.max_uses : '') + '</td><td>' +
          (c.start_date || c.end_date ? esc(isoVn(c.start_date) || '…') +
            ' – ' + esc(isoVn(c.end_date) || '…') : 'Không giới hạn') +
          '</td><td>' + cpState(c, r.today) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>' : '<div class="card state"><span class="ms">sell</span><h2>Chưa có mã giảm giá</h2><p>Bấm “Thêm mã” để tạo mã đầu tiên.</p></div>';
      $('cpBody').querySelectorAll('tr[data-id]').forEach(function (tr) {
        var c = r.items.filter(function (x) {
          return String(x.id) === tr.dataset.id;
        })[0];
        tr.onclick = function () {
          couponPanel(c);
        };
        tr.onkeydown = function (e) {
          if (e.key === 'Enter') {
            couponPanel(c);
          }
        };
      });
    }).catch(function (ex) {
      if (view !== 'coupons') {
        return;
      }
      $('cpBody').innerHTML = '';
      errorStateIn($('cpBody'), ex.message);
      $('retry').onclick = renderCoupons;
    });
  }
  function couponPanel(c) {
    var isNew = !c;
    c = c || {
      kind: 'percent',
      active: 1,
      min_people: 1
    };
    var dests = DESTS.slice();
    if (c.destination && dests.indexOf(c.destination) < 0) {
      dests.push(c.destination);
    }
    openPanel(isNew ? 'Thêm mã giảm giá' : 'Mã ' + c.code, isNew ? '' : 'Đã dùng ' + c.used + ' lượt', '<label class="field"><span>Mã (chữ không dấu, số, gạch ngang)</span><input id="cpCode" maxlength="20" value="' + esc(c.code || '') + '" style="text-transform:uppercase"></label>' +
      '<div class="row2"><label class="field"><span>Loại</span><select id="cpKind">' + opt('percent', 'Giảm theo %', c.kind) + opt('amount', 'Giảm số tiền cố định', c.kind) + '</select></label>' +
      '<label class="field"><span id="cpValL">Giá trị</span><input id="cpVal" type="number" min="1" inputmode="numeric" value="' + esc(c.value == null ? '' : c.value) + '"></label></div>' +
      '<div class="row2"><label class="field"><span>Số người tối thiểu</span><input id="cpMin" type="number" min="1" max="200" value="' + esc(c.min_people || 1) + '"></label>' +
      '<label class="field"><span>Số lượt tối đa (trống = không giới hạn)</span><input id="cpMax" type="number" min="1" value="' + esc(c.max_uses == null ? '' : c.max_uses) + '"></label></div>' +
      '<div class="row2"><label class="field"><span>Từ ngày</span><input id="cpFrom" type="date" value="' + esc(c.start_date || '') + '"></label><label class="field"><span>Đến ngày</span><input id="cpTo" type="date" value="' + esc(c.end_date || '') + '"></label></div>' +
      '<label class="field"><span>Chỉ áp dụng cho điểm đến</span><select id="cpDest">' + opt('', 'Tất cả điểm đến', c.destination || '') + dests.map(function (d) {
      return opt(d, d, c.destination || '');
    }).join('') + '</select></label>' +
      '<label class="field"><span>Ghi chú nội bộ</span><input id="cpNote" maxlength="200" value="' + esc(c.note || '') + '"></label>' +
      '<label class="chk tgl"><input type="checkbox" id="cpOn"' + (c.active ? ' checked' : '') + '><span>Đang bật</span></label>', (isNew ? '<button class="btn" id="cpCancel" type="button">Huỷ</button>' : '<button class="btn danger" id="cpDel" type="button"><span class="ms">delete</span>Xoá</button>') +
      '<button class="btn primary" id="cpSave">Lưu</button>', loadCoupons);
    function kindUi() {
      var p = $('cpKind').value === 'percent';
      $('cpValL').textContent = p ? 'Phần trăm giảm (1–100)' : 'Số tiền giảm (đồng)';
      $('cpVal').max = p ? 100 : '';
      $('cpVal').step = p ? 1 : 1000;
    }
    $('cpKind').onchange = kindUi;
    kindUi();
    if ($('cpCancel')) {
      $('cpCancel').onclick = function () {
        closeDrawer();
      };
    }
    $('cpSave').onclick = function () {
      var b = this, body = {
        code: $('cpCode').value,
        kind: $('cpKind').value,
        value: $('cpVal').value,
        min_people: $('cpMin').value,
        max_uses: $('cpMax').value,
        start_date: $('cpFrom').value,
        end_date: $('cpTo').value,
        destination: $('cpDest').value,
        note: $('cpNote').value,
        active: $('cpOn').checked
      };
      b.disabled = true;
      api(isNew ? '/coupons' : '/coupons/' + c.id, { method: isNew ? 'POST' : 'PATCH', body: body }).then(function () {
        toast('Đã lưu');
        closeDrawer(true);
      }).catch(function (ex) {
        toast(ex.message, true);
        b.disabled = false;
      });
    };
    if ($('cpDel')) {
      $('cpDel').onclick = function () {
        confirmBox('Xoá mã ' + c.code + '? Đơn đã dùng mã này vẫn giữ nguyên số tiền đã giảm.', {
          title: 'Xoá mã giảm giá',
          ok: 'Xoá',
          danger: true
        }).then(function (ok) {
          if (ok) {
            api('/coupons/' + c.id, { method: 'DELETE' }).then(function () {
              toast('Đã xoá');
              closeDrawer(true);
            }).catch(function (ex) {
              toast(ex.message, true);
            });
          }
        });
      };
    }
  }

  /* ---------- Nhập / xuất dữ liệu ---------- */
  var DIO = [
    {
      k: 'bookings',
      t: 'Đơn đặt',
      d: 'Mỗi dòng một đơn. Đơn trùng (cùng SĐT, điểm đến, ngày đi, số người) tự bị bỏ qua. Dùng để nhập danh sách cũ hoặc khôi phục.',
      pii: true
    },
    {
      k: 'tours',
      t: 'Tour & giá',
      d: 'Trùng mã tour thì cập nhật giá và thông tin, chưa có thì thêm tour mới.'
    },
    {
      k: 'coupons',
      t: 'Mã giảm giá',
      d: 'Trùng mã thì cập nhật (giữ nguyên số lượt đã dùng), chưa có thì thêm mới.'
    }
  ];
  function parseCsv(text) {
    text = text.replace(/^\uFEFF/, '');
    var first = text.split(/\r?\n/)[0] || '', d = first.split(';').length > first.split(',').length ? ';' : ',';
    var rows = [], row = [], cell = '', q = false, i, ch;
    function endRow() {
      row.push(cell);
      cell = '';
      if (row.some(function (x) {
        return x !== '';
      })) {
        rows.push(row);
      }
      row = [];
    }
    for (i = 0; i < text.length; i++) {
      ch = text.charAt(i);
      if (q) {
        if (ch === '"') {
          if (text.charAt(i + 1) === '"') {
            cell += '"';
            i++;
          } else {
            q = false;
          }
        } else {
          cell += ch;
        }
      } else if (ch === '"') {
        q = true;
      } else if (ch === d) {
        row.push(cell);
        cell = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text.charAt(i + 1) === '\n') {
          i++;
        }
        endRow();
      } else {
        cell += ch;
      }
    }
    endRow();
    var head = (rows.shift() || []).map(function (h) {
      return h.trim();
    });
    return rows.map(function (r) {
      var o = {};
      head.forEach(function (h, j) {
        if (h) {
          o[h] = r[j] == null ? '' : r[j];
        }
      });
      return o;
    });
  }
  function readRows(file, kind) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onerror = function () {
        reject(new Error('Không đọc được file.'));
      };
      fr.onload = function () {
        try {
          var t = String(fr.result), rows;
          if (/\.json$/i.test(file.name) || /^\s*[\[{]/.test(t)) {
            var j = JSON.parse(t);
            rows = Array.isArray(j) ? j : (j && Array.isArray(j[kind]) ? j[kind] : []);
          } else {
            rows = parseCsv(t);
          }
          if (!rows.length) {
            throw new Error('File không có dòng dữ liệu nào.');
          }
          resolve(rows);
        } catch (e) {
          reject(e instanceof SyntaxError ? new Error('File không đúng định dạng CSV / JSON.') : e);
        }
      };
      fr.readAsText(file, 'utf-8');
    });
  }
  /* Gửi từng đợt 500 dòng, gộp kết quả */
  function sendRows(kind, rows, dry, onStep) {
    var tot = {
      total: 0,
      add: 0,
      update: 0,
      skip: 0,
      errorCount: 0,
      errors: [],
      unknown: []
    }, i = 0;
    function next() {
      if (i >= rows.length) {
        return Promise.resolve(tot);
      }
      var off = i;
      return api('/data/import', { method: 'POST', body: {
          kind: kind,
          rows: rows.slice(i, i + 500),
          dry: dry,
          offset: off
        } }).then(function (r) {
        ['total', 'add', 'update', 'skip', 'errorCount'].forEach(function (k) {
          tot[k] += r[k];
        });
        tot.errors = tot.errors.concat(r.errors).slice(0, 30);
        tot.unknown = r.unknown.length ? r.unknown : tot.unknown;
        i += 500;
        if (onStep) {
          onStep(Math.min(i, rows.length), rows.length);
        }
        return next();
      });
    }
    return next();
  }
  function renderData() {
    var canExp = can('export', true), canImp = can('import', true), base = '/api/admin/data/export?kind=';
    main.innerHTML = '<div class="page-h"><div><h1>Nhập / xuất dữ liệu</h1><p>Xuất ra Excel, CSV hoặc JSON, hoặc nhập hàng loạt từ file. Nhập luôn kiểm tra trước, chưa ghi gì cho đến khi bạn xác nhận.</p></div>' +
      (canExp ? '<div class="h-acts"><a class="btn primary" href="' + base +
        'all&format=xlsx" download><span class="ms">table_view</span>Xuất tất cả (Excel nhiều sheet)</a></div>' : '') + '</div>' +
      DIO.map(function (x) {
        var ex = canExp && (!x.pii || can('pii', true));
        return '<div class="card dio" data-k="' + x.k + '"><h2>' + x.t + '</h2><p class="muted">' + x.d + '</p>' +
          (ex ? '<div class="dio-row"><a class="btn" href="' + base + x.k +
            '&format=csv" download><span class="ms">download</span>Xuất CSV</a><a class="btn" href="' + base + x.k +
            '&format=xlsx" download><span class="ms">table_view</span>Xuất Excel</a><a class="btn" href="' + base +
            x.k +
            '&format=json" download><span class="ms">download</span>Xuất JSON</a><a class="btn" href="' +
            base + x.k +
            '&format=csv&template=1" download><span class="ms">description</span>Tải file mẫu</a></div>' : '<p class="perm-note">Bạn chưa có quyền xuất mục này.</p>') +
          (canImp ? '<div class="dio-row"><input type="file" accept=".csv,.json,.txt" class="dio-file"><button class="btn" type="button" data-a="check" disabled><span class="ms">search</span>Kiểm tra file</button><button class="btn primary" type="button" data-a="apply" hidden><span class="ms">upload</span>Nhập vào hệ thống</button></div><div class="dio-res" hidden></div>' : '') + '</div>';
      }).join('');
    document.querySelectorAll('.dio').forEach(function (card) {
      var kind = card.dataset.k, file = card.querySelector('.dio-file');
      if (!file) {
        return;
      }
      var chk = card.querySelector('[data-a=check]'), app = card.querySelector('[data-a=apply]'), res = card.querySelector('.dio-res'), rows = null;
      function show(r, done) {
        res.hidden = false;
        res.innerHTML = '<b>' + r.total + ' dòng</b> · ' + (done ? 'đã thêm ' : 'sẽ thêm ') + '<b>' + r.add + '</b> · ' + (done ? 'đã cập nhật ' : 'sẽ cập nhật ') + '<b>' + r.update + '</b> · bỏ qua <b>' + r.skip + '</b> · lỗi <b>' + r.errorCount + '</b>' +
          (r.unknown.length ? '<p class="perm-note">Cột không nhận ra (bỏ qua): ' +
            r.unknown.map(esc).join(', ') + '</p>' : '') +
          (r.errors.length ? '<ul class="dio-err">' + r.errors.map(function (e) {
            return '<li>Dòng ' + e.row + ': ' + esc(e.msg) + '</li>';
          }).join('') + (r.errorCount > r.errors.length ? '<li>… và ' + (r.errorCount - r.errors.length) +
            ' lỗi nữa</li>' : '') + '</ul>' : '');
      }
      file.onchange = function () {
        rows = null;
        app.hidden = true;
        res.hidden = true;
        chk.disabled = !file.files.length;
      };
      chk.onclick = function () {
        chk.disabled = true;
        app.hidden = true;
        readRows(file.files[0], kind).then(function (rs) {
          rows = rs;
          return sendRows(kind, rs, true);
        }).then(function (r) {
          show(r, false);
          app.hidden = !(r.add + r.update);
          app.textContent = '';
          app.innerHTML = '<span class="ms">upload</span>Nhập ' + (r.add + r.update) + ' dòng hợp lệ';
        })
          .catch(function (ex) {
          toast(ex.message, true);
        }).then(function () {
          chk.disabled = false;
        });
      };
      app.onclick = function () {
        confirmBox('Ghi dữ liệu từ file vào hệ thống? Các dòng lỗi sẽ bị bỏ qua. Nên tải bản sao lưu trước.', { title: 'Nhập dữ liệu', ok: 'Nhập' }).then(function (ok) {
          if (!ok) {
            return;
          }
          app.disabled = true;
          sendRows(kind, rows, false, function (n, t) {
            app.textContent = 'Đang nhập ' + n + '/' + t + '…';
          }).then(function (r) {
            show(r, true);
            app.hidden = true;
            toast('Đã nhập xong');
            file.value = '';
            chk.disabled = true;
          })
            .catch(function (ex) {
            toast(ex.message, true);
          }).then(function () {
            app.disabled = false;
          });
        });
      };
    });
  }
  /* ---------- Giới hạn truy cập theo IP và giờ ---------- */
  var DAY_ORDER = [[1, 'Thứ 2'], [2, 'Thứ 3'], [3, 'Thứ 4'], [4, 'Thứ 5'], [5, 'Thứ 6'], [6, 'Thứ 7'], [0, 'Chủ nhật']];
  /* Khối nhập khung giờ dùng chung cho trang chung và từng tài khoản; pre là tiền tố id */
  function timeFields(pre, t, off) {
    t = t || {
      on: false,
      days: [1, 2, 3, 4, 5, 6, 0],
      from: '08:00',
      to: '21:00'
    };
    return '<label class="chk tgl"><input type="checkbox" id="' + pre + 'On"' + (t.on ? ' checked' : '') + (off ? ' disabled' : '') + '><span>Chỉ cho vào trong khung giờ<small>Giờ Việt Nam. Hết giờ, phiên đang mở cũng bị đăng xuất.</small></span></label>' +
      '<div class="perm-flags" id="' + pre + 'Days">' + DAY_ORDER.map(function (d) {
      return '<label class="chk"><input type="checkbox" data-day="' + d[0] + '"' +
        ((t.days || []).indexOf(d[0]) > -1 ? ' checked' : '') + (off ? ' disabled' : '') + '><span>' + d[1] +
        '</span></label>';
    }).join('') + '</div>' +
      '<div class="time-pair"><label class="field"><span>Từ</span><input type="time" id="' + pre + 'From" value="' + esc(t.from || '08:00') + '"' + (off ? ' disabled' : '') + '></label><label class="field"><span>Đến</span><input type="time" id="' + pre + 'To" value="' + esc(t.to || '21:00') + '"' + (off ? ' disabled' : '') + '></label></div>' +
      '<p class="perm-note">Nếu “Từ” lớn hơn “Đến” (ví dụ 22:00 → 06:00) thì tính là ca đêm qua nửa đêm.</p>';
  }
  function readTime(pre) {
    var days = [];
    document.querySelectorAll('#' + pre + 'Days input[data-day]').forEach(function (c) {
      if (c.checked) {
        days.push(Number(c.dataset.day));
      }
    });
    return {
      on: $(pre + 'On').checked,
      days: days,
      from: $(pre + 'From').value,
      to: $(pre + 'To').value
    };
  }
  function ipLines(s) {
    return String(s || '').split(/[\n,;]+/).map(function (x) {
      return x.trim();
    }).filter(Boolean);
  }
  function renderAccess() {
    main.innerHTML = '<div class="page-h"><div><h1>Giới hạn truy cập</h1><p>Chỉ cho vào trang quản trị từ những IP và trong những khung giờ bạn chọn.</p></div><button class="btn primary" id="acSave"><span class="ms">save</span>Lưu</button></div><div id="acBody"><div class="card"><div class="skel block"></div></div></div>';
    api('/access').then(function (r) {
      if (view !== 'access') {
        return;
      }
      var s = r.settings, ip = s.ip, bl = r.blocked || [];
      $('acBody').innerHTML =
        (r.bypass ? '<div class="card state err"><span class="ms">warning</span><h2>Đang tạm tắt mọi giới hạn</h2><p>Biến ACCESS_BYPASS = 1 đang bật trong Worker. Xoá biến này để giới hạn có hiệu lực.</p></div>' : '') +
          '<div class="card"><h2>Theo địa chỉ IP</h2><p class="sub">IP của bạn lúc này: <b id="acMyIp">' + esc(r.myIp) + '</b>. Nhập mỗi dòng một IP hoặc một dải, ví dụ <code>203.0.113.5</code> hay <code>203.0.113.0/24</code>.</p>' +
          '<label class="field"><span>Chế độ</span><select id="acMode">' + opt('off', 'Tắt (ai cũng thử đăng nhập được)', ip.mode) + opt('allow', 'Chỉ cho phép các IP trong danh sách', ip.mode) + opt('deny', 'Chặn các IP trong danh sách', ip.mode) + '</select></label>' +
          '<label class="field" id="acListWrap"><span>Danh sách IP</span><textarea id="acList" rows="5" spellcheck="false">' + esc((ip.list || []).join('\n')) + '</textarea></label>' +
          '<button class="btn" id="acAddMe" type="button"><span class="ms">add_location</span>Thêm IP hiện tại của tôi</button></div>' +
          '<div class="card"><h2>Theo khung giờ</h2><p class="sub">Bây giờ là ' + esc(r.now) + ' (giờ Việt Nam).</p>' + timeFields('ac', s.time) +
          '<label class="chk tgl"><input type="checkbox" id="acOwner"' + (s.owner_exempt ? ' checked' : '') + '><span>Chủ không bị giới hạn giờ<small>Nên bật để luôn còn người vào được và chỉnh lại.</small></span></label></div>' +
          '<div class="card"><h2>Chặn gần đây</h2><p class="sub">Các lần đăng nhập bị từ chối vì IP hoặc giờ.</p>' + (bl.length ? '<ul class="log">' + bl.map(function (b) {
          return '<li><time>' + vnDate(b.at) + ' ' + vnTime(b.at) + '</time><span>' + esc(b.detail) +
            '</span></li>';
        }).join('') + '</ul>' : '<p class="perm-note">Chưa có lần nào.</p>') + '</div>' +
          '<p class="perm-note">Quên cấu hình và bị khoá ngoài? Đặt biến <code>ACCESS_BYPASS</code> = <code>1</code> trong cài đặt Worker để tạm tắt mọi giới hạn, vào sửa lại rồi xoá biến đó. Giới hạn riêng từng người đặt ở trang Quản trị viên.</p>';
      function sync() {
        $('acListWrap').hidden = $('acMode').value === 'off';
        $('acAddMe').hidden = $('acMode').value !== 'allow';
      }
      $('acMode').onchange = sync;
      sync();
      $('acAddMe').onclick = function () {
        var l = ipLines($('acList').value);
        if (l.indexOf(r.myIp) < 0) {
          l.push(r.myIp);
        }
        $('acList').value = l.join('\n');
      };
      $('acSave').onclick = function () {
        var btn = this;
        btn.disabled = true;
        api('/access', { method: 'PUT', body: { settings: {
              ip: { mode: $('acMode').value, list: ipLines($('acList').value) },
              time: readTime('ac'),
              owner_exempt: $('acOwner').checked
            } } })
          .then(function () {
          toast('Đã lưu giới hạn truy cập');
          renderAccess();
        }).catch(function (ex) {
          toast(ex.message, true);
          btn.disabled = false;
        });
      };
    }).catch(function (ex) {
      if (view !== 'access') {
        return;
      }
      $('acBody').innerHTML = '';
      errorStateIn($('acBody'), ex.message);
      $('retry').onclick = renderAccess;
    });
  }
  function rolePanel(role, meta) {
    var isNew = !role;
    role = role || {
      name: '',
      perms: {},
      users: 0
    };
    var base = isNew ? Object.assign({}, meta.defaults.staff || {}) : role.perms;
    openPanel(isNew ? 'Thêm vai trò' : role.name, isNew ? 'Đặt tên và chọn quyền cho vai trò mới' : role.users +
      ' tài khoản đang dùng vai trò này', '<label class="field"><span>Tên vai trò</span><input id="rName" maxlength="40" value="' + esc(role.name) + '" placeholder="Ví dụ: Kế toán"></label>' +
      '<p class="perm-note">Đổi quyền ở đây sẽ áp dụng ngay cho mọi tài khoản dùng vai trò này (trừ người đã được chỉnh quyền riêng). Bạn chỉ cấp được quyền không vượt quá quyền của chính mình.</p><div class="perm-grid" id="aPerms"></div>', (isNew ? '<button class="btn" id="rCancel" type="button">Huỷ</button>' : '<button class="btn danger" id="rDel" type="button"><span class="ms">delete</span>Xoá</button>') +
      '<button class="btn primary" id="rSave">Lưu</button>', loadAdmins);
    $('aPerms').innerHTML = permRows(base, false);
    $('rName').focus();
    if (isNew) {
      $('rCancel').onclick = function () {
        closeDrawer();
      };
    } else {
      $('rDel').onclick = function () {
        confirmBox('Xoá vai trò “' + role.name + '”? Chỉ xoá được khi không còn tài khoản nào dùng.', {
          title: 'Xoá vai trò',
          ok: 'Xoá vai trò',
          danger: true
        }).then(function (ok) {
          if (ok) {
            api('/roles/' + role.id, { method: 'DELETE' }).then(function () {
              toast('Đã xoá vai trò');
              closeDrawer(true);
            }).catch(function (ex) {
              toast(ex.message, true);
            });
          }
        });
      };
    }
    $('rSave').onclick = function () {
      var btn = this;
      btn.disabled = true;
      api(isNew ? '/roles' : '/roles/' + role.id, { method: isNew ? 'POST' : 'PATCH', body: { name: $('rName').value, perms: readPermBox() } })
        .then(function () {
        toast(isNew ? 'Đã thêm vai trò' : 'Đã lưu');
        closeDrawer(true);
      }).catch(function (ex) {
        toast(ex.message, true);
        btn.disabled = false;
      });
    };
  }
  function adminPanel(a, meta) {
    var isNew = !a, roles = meta.roles || {}, self = !isNew && a.id === meta.me;
    a = a || {
      name: '',
      email: '',
      role: 'staff',
      active: 1,
      custom: null
    };
    var isOwnerActor = meta.actorRole === 'owner';
    var roleKeys = Object.keys(roles).filter(function (k) {
      return k !== 'owner' || isOwnerActor || a.role === 'owner';
    });
    var others = (meta.items || []).filter(function (x) {
      return x.id !== a.id && x.id !== meta.me;
    });
    openPanel(isNew ? 'Thêm quản trị viên' : a.name, isNew ? 'Tạo tài khoản đăng nhập trang quản trị' : a.email, '<label class="field"><span>Họ và tên</span><input id="aName" maxlength="60" value="' + esc(a.name) + '"></label>' + avatarField(a.avatar) +
      (isNew ? '<label class="field"><span>Email đăng nhập</span><input id="aEmail" type="email" maxlength="254" autocomplete="off"></label>' : '') +
      '<label class="field"><span>Vai trò</span><select id="aRole"' + (self ? ' disabled' : '') + '>' + roleKeys.map(function (k) {
      return opt(k, roles[k], a.role);
    }).join('') + '</select></label>' +
      '<div id="aPermBox"><label class="chk"><input type="checkbox" id="aCustom"' + (a.custom ? ' checked' : '') + (self ? ' disabled' : '') + '><span><b>Chỉnh quyền riêng</b> cho tài khoản này</span></label><p class="perm-note" id="aPermHint"></p>' +
      (others.length && !self ? '<label class="field" id="aCopyWrap" hidden><span>Sao chép quyền từ tài khoản khác</span><select id="aCopy"><option value="">Chọn tài khoản…</option>' + others.map(function (x) {
        return '<option value="' + x.id + '">' + esc(x.name) + ' · ' + esc(roles[x.role] || x.role) +
          '</option>';
      }).join('') + '</select></label>' : '') +
      '<div class="perm-grid" id="aPerms"></div><p class="perm-note">Bạn chỉ cấp được quyền không vượt quá quyền của chính mình.</p></div>' +
      '<label class="field"><span>' + passLabel(isNew) + '</span><input id="aPass" type="password" autocomplete="new-password" maxlength="128"></label>' + passGen('aPass') +
      '<div class="perm-sess acc-box"><div><b>Giới hạn truy cập riêng</b><small>Áp dụng thêm vào giới hạn chung. Để trống và tắt giờ nếu không cần.</small></div></div>' +
      '<label class="field"><span>Chỉ cho đăng nhập từ các IP này (mỗi dòng một IP hoặc dải; trống = không giới hạn)</span><textarea id="aIps" rows="3" spellcheck="false"' + (self ? ' disabled' : '') + '>' + esc(((a.access && a.access.ip) || []).join('\n')) + '</textarea></label>' +
      timeFields('aT', a.access && a.access.time, self) +
      (isNew ? '' : '<label class="chk tgl"><input type="checkbox" id="aActive"' +
        (a.active ? ' checked' : '') + (self ? ' disabled' : '') +
        '><span>Đang hoạt động<small>Tắt để khoá đăng nhập</small></span></label>') +
      (isNew || self ? '' : '<div class="perm-sess"><span class="ms">logout</span><div><b>Phiên đăng nhập</b><small>Buộc tài khoản này đăng nhập lại trên mọi thiết bị. Đổi mật khẩu cũng làm việc này.</small></div><button type="button" class="btn" id="aOut">Đăng xuất mọi thiết bị</button></div>'), (isNew ? '<button class="btn" id="aCancel" type="button">Huỷ</button>' : '<button class="btn danger" id="aDel" type="button"' +
      (self ? ' disabled' : '') + '><span class="ms">delete</span>Xoá</button>') +
      '<button class="btn primary" id="aSave">Lưu</button>', loadAdmins);
    var readPerms = readPermBox;
    function hint() {
      $('aPermHint').textContent = self ? 'Bạn không thể tự đổi quyền của chính mình.' : $('aCustom').checked
        ? 'Đang chỉnh riêng: chọn từng mục rồi bấm Lưu. Bỏ ô này để quay về quyền mặc định của vai trò.'
        : 'Đang dùng quyền mặc định của vai trò (chỉ để xem). Bấm vào ô “Chỉnh quyền riêng” để sửa từng mục.';
      if ($('aCopyWrap')) {
        $('aCopyWrap').hidden = !$('aCustom').checked || self;
      }
    }
    function paint(perms, off) {
      $('aPerms').innerHTML = permRows(perms, off);
      hint();
      $('aPerms').querySelectorAll('select, input').forEach(function (el) {
        el.onchange = function () {
          $('aPerms').dataset.touched = '1';
        };
      });
    }
    function drawPerms() {
      var role = $('aRole').value, custom = $('aCustom').checked;
      $('aPermBox').hidden = role === 'owner';
      var base = custom ? (a.custom && !isNew && role === a.role && !$('aPerms').dataset.touched ? a.custom : (Object.keys(readPerms()).length ? readPerms() : meta.defaults[role] || {})) : (meta.defaults[role] || {});
      paint(base, !custom || self);
    }
    $('aRole').onchange = function () {
      $('aPerms').dataset.touched = '';
      if ($('aCustom').checked) {
        $('aCustom').checked = false;
      }
      drawPerms();
    };
    $('aCustom').onchange = function () {
      if ($('aCustom').checked) {
        $('aPerms').dataset.touched = '1';
        paint(readPerms(), false);
      } else {
        drawPerms();
      }
    };
    if ($('aCopy')) {
      $('aCopy').onchange = function () {
        var src = others.filter(function (x) {
          return String(x.id) === $('aCopy').value;
        })[0];
        if (!src) {
          return;
        }
        $('aPerms').dataset.touched = '1';
        paint(src.perms || {}, false);
        toast('Đã sao chép quyền của ' + src.name + '. Bấm Lưu để áp dụng.');
      };
    }
    drawPerms();
    $('aName').focus();
    if (isNew) {
      $('aCancel').onclick = function () {
        closeDrawer();
      };
    } else {
      $('aDel').onclick = function () {
        confirmBox('Xoá tài khoản quản trị “' + a.name + '”? Người này sẽ không đăng nhập được nữa.', {
          title: 'Xoá quản trị viên',
          ok: 'Xoá tài khoản',
          danger: true
        }).then(function (ok) {
          if (ok) {
            api('/admins/' + a.id, { method: 'DELETE' }).then(function () {
              toast('Đã xoá');
              closeDrawer(true);
            }).catch(function (ex) {
              toast(ex.message, true);
            });
          }
        });
      };
    }
    if ($('aOut')) {
      $('aOut').onclick = function () {
        var btn = this;
        confirmBox(a.name + ' sẽ bị đăng xuất khỏi mọi thiết bị và phải đăng nhập lại.', {
          title: 'Đăng xuất mọi thiết bị',
          ok: 'Đăng xuất',
          icon: 'logout'
        }).then(function (ok) {
          if (!ok) {
            return;
          }
          btn.disabled = true;
          api('/admins/' + a.id, { method: 'PATCH', body: { logout_all: true } }).then(function () {
            toast('Đã đăng xuất ' + a.name + ' khỏi mọi thiết bị');
            btn.disabled = false;
          }).catch(function (ex) {
            toast(ex.message, true);
            btn.disabled = false;
          });
        });
      };
    }
    bindGen();
    bindAvatarField();
    $('aSave').onclick = function () {
      var btn = this, body = { name: $('aName').value, avatar: $('fvUrl').value };
      if (!self) {
        body.role = $('aRole').value;
        body.perms = body.role !== 'owner' && $('aCustom').checked ? readPerms() : null;
      }
      if (!self) {
        body.access = (ipLines($('aIps').value).length || $('aTOn').checked) ? { ip: ipLines($('aIps').value), time: readTime('aT') } : null;
      }
      if ((isNew || $('aPass').value) && passErr($('aPass').value)) {
        toast(passErr($('aPass').value), true);
        return;
      }
      if (isNew) {
        body.email = $('aEmail').value;
        body.password = $('aPass').value;
      } else {
        if (!self) {
          body.active = $('aActive').checked;
        }
        if ($('aPass').value) {
          body.password = $('aPass').value;
        }
      }
      btn.disabled = true;
      api(isNew ? '/admins' : '/admins/' + a.id, { method: isNew ? 'POST' : 'PATCH', body: body })
        .then(function () {
        toast(isNew ? 'Đã thêm quản trị viên' : 'Đã lưu');
        closeDrawer(true);
      }).catch(function (ex) {
        toast(ex.message, true);
        btn.disabled = false;
      });
    };
  }

  function renderActivity() {
    main.innerHTML = '<div class="page-h"><div><h1>Nhật ký</h1><p>100 thao tác gần nhất của quản trị viên.</p></div><div class="h-acts"><a class="btn" href="/api/admin/backup.json" download><span class="ms">download</span>Tải bản sao lưu</a>' + (can('export', true) ? '<a class="btn" href="/api/admin/activity.xlsx" download><span class="ms">table_view</span>Xuất Excel</a>' : '') + '<button class="btn" id="etest"><span class="ms">forward_to_inbox</span>Gửi email thử</button><button class="btn" id="arefresh"><span class="ms">refresh</span>Làm mới</button></div></div><div class="card" id="alist"><div class="skel line"></div>' +
      '<div class="skel line"></div>'.repeat(4) + '</div>';
    $('arefresh').onclick = renderActivity;
    $('etest').onclick = function () {
      var b = this;
      b.disabled = true;
      api('/email-test', { method: 'POST', body: {} }).then(function (r) {
        toast('Đã gửi email thử tới ' + r.to);
      })
        .catch(function (ex) {
        toast(ex.message, true);
      }).then(function () {
        b.disabled = false;
      });
    };
    api('/activity').then(function (r) {
      if (view !== 'activity') {
        return;
      }
      $('alist').innerHTML = r.items.length ? '<ul class="log">' + r.items.map(function (a) {
        return '<li><time>' + vnDate(a.at) + ' ' + vnTime(a.at) + '</time><b>' + esc(a.action) + '</b><span>' +
          esc(a.detail) + '</span></li>';
      }).join('') + '</ul>' : '<div class="state"><span class="ms">history</span><h2>Chưa có thao tác nào</h2><p>Đăng nhập, đổi trạng thái, xoá đơn… sẽ được ghi lại ở đây.</p></div>';
    }).catch(function (ex) {
      if (view !== 'activity') {
        return;
      }
      $('alist').innerHTML = '';
      errorStateIn($('alist'), ex.message);
      $('retry').onclick = renderActivity;
    });
  }

  /* ---------- Tin nhắn (kiểu Messenger), chia theo PHIÊN ---------- */
  var TOPIC_L = {
    tour: 'Tư vấn tour',
    booking: 'Đơn đặt',
    payment: 'Thanh toán',
    other: 'Khác'
  };
  var chat = {
    sid: null,
    session: null,
    user: null,
    others: [],
    items: [],
    lastId: 0,
    seen: 0,
    convs: [],
    counts: { open: 0, closed: 0 },
    status: 'open',
    timer: null,
    busy: false,
    tmp: 0,
    q: ''
  };
  function stopChat() {
    clearInterval(chat.timer);
    chat.timer = null;
  }

  function setMsgBadge(n) {
    var b = $('navMsg');
    b.hidden = !n;
    b.textContent = n > 99 ? '99+' : n;
  }
  function pollMsgBadge() {
    if ($('app').hidden || document.hidden) {
      return;
    }
    api('/chat-unread').then(function (r) {
      setMsgBadge(r.unread);
    }).catch(function () {});
    api('/review-count').then(function (r) {
      setRevBadge(r.pending);
    }).catch(function () {});
    if (can('bugs')) {
      api('/bug-count').then(function (r) {
        setBugBadge(r.new);
      }).catch(function () {});
    }
  }
  setInterval(pollMsgBadge, 20000);

  function initial(name) {
    return esc((String(name || '?').trim().split(/\s+/).pop() || '?').charAt(0).toUpperCase());
  }
  /* Avatar của khách: ảnh nếu có, không thì chữ cái đầu */
  function avInner(name, avatar) {
    return avatar ? '<img src="' + esc(avatar) + '" alt="" loading="lazy">' : initial(name);
  }
  function hm(ms) {
    return vnTime(ms);
  }
  function sessName(s) {
    return s.title || (TOPIC_L[s.topic] || 'Phiên #' + s.id);
  }
  function sessPill(s) {
    return '<span class="sp ' + s.status + '">' + (s.status === 'open' ? 'Đang mở' : 'Đã kết thúc') +
      '</span>';
  }

  /* Mở phiên chat với một khách (tạo phiên mới nếu khách chưa có phiên đang mở) */
  function openChatWith(uid) {
    api('/conversations', { method: 'POST', body: { user_id: uid } }).then(function (r) {
      location.hash = '#/messages/' + r.session.id;
    })
      .catch(function (ex) {
      toast(ex.message, true);
    });
  }

  function renderMessages(sid) {
    chat.sid = sid;
    chat.session = null;
    chat.user = null;
    chat.items = [];
    chat.lastId = 0;
    chat.seen = 0;
    chat.others = [];
    main.innerHTML = '<div class="page-h"><div><h1>Tin nhắn</h1><p>Mỗi khách có thể có nhiều phiên trò chuyện. Tin mới tự cập nhật.</p></div>' +
      (can('chat', true) ? '<div class="h-acts"><button class="btn primary" id="cNew" type="button"><span class="ms">add</span>Tạo phiên mới</button></div>' : '') + '</div>' +
      '<div class="chat-wrap' + (sid ? ' in-thread' : '') + '" id="chatWrap">' +
      '<aside class="chat-list card"><div class="chat-search"><span class="ms">search</span><input id="cq" type="search" placeholder="Tìm khách…" aria-label="Tìm khách"></div>' +
      '<div class="chat-tabs" id="cTabs"></div><ul id="convs"><li class="chat-empty">Đang tải…</li></ul></aside>' +
      '<section class="chat-pane card" id="pane"></section></div>';
    $('cq').oninput = function () {
      chat.q = this.value.trim().toLowerCase();
      drawConvs();
    };
    if ($('cNew')) {
      $('cNew').onclick = newConversation;
    }
    drawPane();
    loadConvs();
    if (sid) {
      loadThread(true);
    }
    chat.timer = setInterval(function () {
      if (view !== 'messages' || document.hidden) {
        return;
      }
      loadConvs();
      if (chat.sid) {
        loadThread(false);
      }
    }, 4000);
  }

  function loadConvs() {
    api('/conversations?status=' + chat.status).then(function (r) {
      if (view !== 'messages') {
        return;
      }
      chat.convs = r.items;
      chat.counts = r.counts;
      setMsgBadge(r.items.reduce(function (n, c) {
        return n + c.unread;
      }, 0) || 0);
      drawConvs();
    }).catch(function (ex) {
      var ul = $('convs');
      if (ul && !chat.convs.length) {
        ul.innerHTML = '<li class="chat-empty">' + esc(ex.message) + '</li>';
      }
    });
  }

  function drawConvs() {
    var ul = $('convs');
    if (!ul) {
      return;
    }
    var tabs = $('cTabs');
    if (tabs) {
      tabs.innerHTML = [['open', 'Đang mở', chat.counts.open], ['closed', 'Đã kết thúc', chat.counts.closed], ['', 'Tất cả', chat.counts.open +
            chat.counts.closed]].map(function (t) {
        return '<button type="button" class="chip" aria-pressed="' + (t[0] === chat.status) + '" data-s="' +
          t[0] + '">' + t[1] + ' <b>' + t[2] + '</b></button>';
      }).join('');
      tabs.querySelectorAll('.chip').forEach(function (b) {
        b.onclick = function () {
          chat.status = b.dataset.s;
          chat.convs = [];
          ul.innerHTML = '<li class="chat-empty">Đang tải…</li>';
          loadConvs();
        };
      });
    }
    var list = chat.convs.filter(function (c) {
      return !chat.q || (c.name + ' ' + c.email + ' ' + (c.phone || '') + ' ' + (c.title || '')).toLowerCase().indexOf(chat.q) > -1;
    });
    if (!list.length) {
      ul.innerHTML = '<li class="chat-empty">' +
        (chat.convs.length ? 'Không tìm thấy khách nào.' : chat.status === 'closed' ? 'Chưa có phiên nào đã kết thúc.' : 'Chưa có phiên nào đang mở. Khi khách nhắn, phiên sẽ hiện ở đây.') +
        '</li>';
      return;
    }
    ul.innerHTML = list.map(function (c) {
      var last = c.last_body ? (c.last_sender === 'admin' ? (c.last_bot ? 'Tự động: ' : 'Bạn: ') : '') +
        c.last_body : 'Chưa có tin nhắn';
      return '<li><a href="#/messages/' + c.id + '" class="conv' + (c.id === chat.sid ? ' on' : '') + (c.unread ? ' unread' : '') + '">' +
        '<span class="av">' + avInner(c.name, c.avatar) + '</span><span class="cb"><b>' + esc(c.name) + '</b>' +
        '<small class="cs"><span class="tp">' + esc(TOPIC_L[c.topic] || 'Khác') + '</span>' + (c.status === 'closed' ? '<span class="tp off">Đã kết thúc</span>' : '') + '</small>' +
        '<small>' + esc(last) + '</small></span>' +
        '<span class="cm"><time>' + ago(c.last_at) + '</time>' + (c.unread ? '<i>' + c.unread + '</i>' : '') + '</span></a></li>';
    }).join('');
  }

  function loadThread(first) {
    if (!chat.sid || chat.busy) {
      return;
    }
    var sid = chat.sid;
    chat.busy = true;
    api('/conversations/' + sid + '?after=' + chat.lastId).then(function (r) {
      if (view !== 'messages' || chat.sid !== sid) {
        return;
      }
      var statusChanged = !chat.session || chat.session.status !== r.session.status || chat.session.title !== r.session.title || chat.others.length !== r.others.length;
      chat.user = r.user;
      chat.session = r.session;
      chat.others = r.others;
      var have = {};
      chat.items.forEach(function (m) {
        have[m.id] = true;
      });
      var added = 0;
      r.items.forEach(function (m) {
        if (!have[m.id]) {
          chat.items.push(m);
          added++;
        }
        if (m.id > chat.lastId) {
          chat.lastId = m.id;
        }
      });
      chat.items.sort(function (a, b) {
        var ta = typeof a.id !== 'number', tb = typeof b.id !== 'number';
        if (ta !== tb) {
          return ta ? 1 : -1;
        }
        return ta ? a.created_at - b.created_at : a.id - b.id;
      });
      var removed = dropDeleted(r.alive);
      var seenChanged = r.seen_upto !== chat.seen;
      chat.seen = r.seen_upto;
      if (first || added || removed || seenChanged || statusChanged) {
        drawPane(first || r.items.some(function (m) {
          return m.sender === 'user';
        }));
      }
      if (added || statusChanged) {
        loadConvs();
      }
    }).catch(function (ex) {
      if (view !== 'messages' || chat.sid !== sid) {
        return;
      }
      if (first) {
        $('pane').innerHTML = '<div class="state err"><span class="ms">wifi_off</span><h2>Không mở được phiên trò chuyện</h2><p>' +
          esc(ex.message) + '</p></div>';
      }
    }).then(function () {
      chat.busy = false;
    });
  }

  /* Bỏ khỏi màn hình các tin đã bị xoá (so với danh sách id còn lại trên máy chủ) */
  function dropDeleted(alive) {
    if (!alive) {
      return 0;
    }
    var min = alive.length ? alive[alive.length - 1] : Infinity, ok = {};
    alive.forEach(function (i) {
      ok[i] = true;
    });
    var before = chat.items.length;
    chat.items = chat.items.filter(function (m) {
      return typeof m.id !== 'number' || m.id < min || ok[m.id];
    });
    return before - chat.items.length;
  }

  function deleteMessage(id) {
    var sid = chat.sid;
    confirmBox('Tin nhắn này sẽ bị xoá ở cả phía khách và không khôi phục được.', {
      title: 'Xoá tin nhắn',
      ok: 'Xoá',
      danger: true
    }).then(function (yes) {
      if (!yes) {
        return;
      }
      api('/conversations/' + sid + '/messages/' + id, { method: 'DELETE' }).then(function () {
        if (chat.sid !== sid) {
          return;
        }
        chat.items = chat.items.filter(function (m) {
          return m.id !== id;
        });
        drawPane(false);
        loadConvs();
        toast('Đã xoá tin nhắn');
      }).catch(function (ex) {
        toast(ex.message, true);
      });
    });
  }

  /* Kết thúc / mở lại / đổi tên / xoá phiên */
  function sessionAct(act) {
    var sid = chat.sid, s = chat.session;
    if (!s) {
      return;
    }
    function patch(body, msg) {
      api('/conversations/' + sid, { method: 'PATCH', body: body }).then(function (r) {
        if (chat.sid !== sid) {
          return;
        }
        chat.session = r.session;
        drawPane(false);
        loadConvs();
        loadThread(false);
        toast(msg);
      }).catch(function (ex) {
        toast(ex.message, true);
      });
    }
    if (act === 'close') {
      confirmBox('Khách vẫn xem lại được lịch sử và có thể bắt đầu phiên mới. Bạn cũng mở lại được phiên này bất cứ lúc nào.', {
        title: 'Kết thúc phiên này?',
        ok: 'Kết thúc',
        icon: 'check_circle'
      }).then(function (y) {
        if (y) {
          patch({ status: 'closed' }, 'Đã kết thúc phiên');
        }
      });
    } else if (act === 'open') {
      patch({ status: 'open' }, 'Đã mở lại phiên');
    } else if (act === 'rename') {
      dialog({
        title: 'Đổi tên phiên',
        msg: 'Tên giúp bạn tìm lại phiên này trong danh sách.',
        icon: 'edit',
        ok: 'Lưu',
        input: {
          label: 'Tên phiên',
          value: s.title || '',
          placeholder: TOPIC_L[s.topic]
        }
      }).then(function (v) {
        if (v !== null && v !== false) {
          patch({ title: v }, 'Đã đổi tên phiên');
        }
      });
    } else if (act === 'delete') {
      confirmBox('Xoá hẳn phiên này cùng toàn bộ tin nhắn trong đó? Không khôi phục được.', {
        title: 'Xoá phiên',
        ok: 'Xoá phiên',
        danger: true
      }).then(function (y) {
        if (!y) {
          return;
        }
        api('/conversations/' + sid, { method: 'DELETE' }).then(function () {
          toast('Đã xoá phiên');
          location.hash = '#/messages';
          loadConvs();
        }).catch(function (ex) {
          toast(ex.message, true);
        });
      });
    }
  }

  /* Tạo phiên mới: chọn một khách thật rồi mở phiên (khách đang có phiên mở thì vào phiên đó) */
  function newConversation() {
    openPanel('Tạo phiên mới', 'Chọn khách để nhắn trước (không gồm tài khoản ảo)', '<label class="field"><span>Chủ đề phiên</span><select id="ncTopic">' + Object.keys(TOPIC_L).map(function (k) {
      return opt(k, TOPIC_L[k], 'other');
    }).join('') + '</select></label>' +
      '<label class="field"><span>Tìm khách</span><input id="ncQ" type="search" placeholder="Tên, email hoặc SĐT" autocomplete="off"></label><ul class="nc-list" id="ncList"><li class="chat-empty">Đang tải…</li></ul>', '', null);
    var seq = 0, tm;
    function load() {
      var my = ++seq;
      api('/conversations/customers?q=' + encodeURIComponent($('ncQ').value.trim())).then(function (r) {
        if (my !== seq || !$('ncList')) {
          return;
        }
        $('ncList').innerHTML = r.items.length ? r.items.map(function (u) {
          return '<li><button type="button" class="conv" data-nc="' + u.id + '"><span class="av">' + avInner(u.name, u.avatar) + '</span><span class="cb"><b>' + esc(u.name) + '</b><small>' + esc(u.email) + (u.phone ? ' · ' +
            esc(u.phone) : '') + '</small></span>' +
            (u.open_session ? '<span class="cm"><time>Đang có phiên mở</time></span>' : u.has_chat ? '<span class="cm"><time>Đã từng chat</time></span>' : '') + '</button></li>';
        }).join('') : '<li class="chat-empty">Không tìm thấy khách nào.</li>';
        $('ncList').querySelectorAll('[data-nc]').forEach(function (b) {
          b.onclick = function () {
            b.disabled = true;
            api('/conversations', { method: 'POST', body: { user_id: Number(b.dataset.nc), topic: $('ncTopic').value } }).then(function (r) {
              closeDrawer();
              location.hash = '#/messages/' + r.session.id;
            })
              .catch(function (ex) {
              b.disabled = false;
              toast(ex.message, true);
            });
          };
        });
      }).catch(function (ex) {
        if ($('ncList')) {
          $('ncList').innerHTML = '<li class="chat-empty">' + esc(ex.message) + '</li>';
        }
      });
    }
    $('ncQ').oninput = function () {
      clearTimeout(tm);
      tm = setTimeout(load, 250);
    };
    load();
    $('ncQ').focus();
  }

  function drawPane(stick) {
    var pane = $('pane');
    if (!pane) {
      return;
    }
    if (!chat.sid) {
      pane.innerHTML = '<div class="state"><span class="ms">forum</span><h2>Chọn một phiên trò chuyện</h2><p>Chọn phiên ở danh sách bên trái, hoặc bấm “Tạo phiên mới” để nhắn trước cho khách.</p></div>';
      return;
    }
    if (!chat.user || !chat.session) {
      pane.innerHTML = '<div class="skel line"></div>';
      return;
    }
    var u = chat.user, s = chat.session, canW = can('chat', true), closed = s.status === 'closed';
    var keep = $('cmsg') ? $('cmsg').value : '';
    var wasFocus = document.activeElement && document.activeElement.id === 'cmsg';
    var box = pane.querySelector('.chat-msgs');
    var near = !box || box.scrollHeight - box.scrollTop - box.clientHeight < 90;

    var lastMine = -1;
    chat.items.forEach(function (m, i) {
      if (m.sender === 'admin') {
        lastMine = i;
      }
    });
    var html = '', prev = null;
    chat.items.forEach(function (m, i) {
      var gap = !prev || m.created_at - prev.created_at > 3600000 || vnDate(m.created_at) !== vnDate(prev.created_at);
      if (gap) {
        html += '<div class="cm-time">' + hm(m.created_at) + ', ' + vnDate(m.created_at) + '</div>';
      }
      var mine = m.sender === 'admin', cont = prev && prev.sender === m.sender && !gap;
      var nx = chat.items[i + 1], last = !nx || nx.sender !== m.sender || nx.created_at - m.created_at > 3600000;
      html += '<div class="cm ' + (mine ? 'me' : 'them') + (cont ? ' cont' : '') + (last ? ' last' : '') + '">' + (!mine ? '<span class="av sm">' +
        (last ? avInner(u.name, u.avatar) : '') + '</span>' : '') +
        '<div class="bub' + (m.state === 'sending' ? ' wait' : '') + (m.state === 'fail' ? ' fail' : '') + '">' + esc(m.body) + '</div>' +
        (typeof m.id === 'number' && canW ? '<button type="button" class="cm-del" data-del="' + m.id +
          '" aria-label="Xoá tin nhắn" title="Xoá tin nhắn"><span class="ms">delete</span></button>' : '') + '</div>' + (m.bot && last ? '<div class="bub-auto">Trả lời tự động</div>' : '');
      if (mine && m.state === 'fail') {
        html += '<div class="cm-st bad">Chưa gửi được · <button type="button" class="link" data-retry="' +
          esc(m.id) + '">Thử lại</button></div>';
      } else if (i === lastMine) {
        html += '<div class="cm-st">' +
          (m.state === 'sending' ? 'Đang gửi…' : (typeof m.id === 'number' && m.id <= chat.seen ? 'Khách đã xem' : 'Đã gửi')) +
          '</div>';
      }
      prev = m;
    });
    if (!chat.items.length) {
      html = '<div class="chat-empty">Chưa có tin nhắn trong phiên này.</div>';
    }
    if (closed) {
      html += '<div class="cm-end"><span class="ms">check_circle</span>Phiên đã kết thúc' +
        (s.closed_by ? ' bởi ' +
          (s.closed_by === 'admin' ? 'nhân viên' : 'khách') : '') +
        (s.closed_at ? ' lúc ' +
          hm(s.closed_at) + ', ' + vnDate(s.closed_at) : '') +
        '. Gửi tin nhắn sẽ mở lại phiên.</div>';
    }

    var strip = chat.others.length > 1 ? '<div class="sess-strip" aria-label="Các phiên của khách này">' + chat.others.map(function (o) {
      return '<a href="#/messages/' + o.id + '" class="sess-chip' + (o.id === s.id ? ' on' : '') + '" title="' +
        esc(sessName(o)) + '"><i class="d ' + o.status + '"></i>' + esc(sessName(o)) + '<small>' +
        vnDate(o.updated_at).slice(0, 5) + '</small></a>';
    }).join('') + '</div>' : '';

    pane.innerHTML =
      '<header class="chat-head"><a class="icon-btn chat-back" href="#/messages" aria-label="Quay lại danh sách"><span class="ms">arrow_back</span></a>' +
        '<span class="av">' + avInner(u.name, u.avatar) + '</span><div class="who"><b>' + esc(u.name) + ' ' + sessPill(s) + '</b><small>' + esc(sessName(s)) + ' · ' + esc(u.email) + (u.phone ? ' · ' +
        esc(u.phone) : '') + '</small></div>' +
        (u.phone ? '<a class="btn" href="#/bookings?phone=' + encodeURIComponent(u.phone) +
          '" title="Xem đơn của khách"><span class="ms">inbox</span><span class="lbl">Xem đơn</span></a>' : '') +
        (canW ? '<button class="btn" type="button" data-sa="' + (closed ? 'open' : 'close') + '" title="' + (closed ? 'Mở lại phiên' : 'Kết thúc phiên') + '"><span class="ms">' + (closed ? 'lock_open' : 'check_circle') + '</span><span class="lbl">' + (closed ? 'Mở lại' : 'Kết thúc') + '</span></button>' +
          '<button class="icon-btn" type="button" data-sa="rename" aria-label="Đổi tên phiên" title="Đổi tên phiên"><span class="ms">edit</span></button>' +
          (can('delete', true) ? '<button class="icon-btn" type="button" data-sa="delete" aria-label="Xoá phiên" title="Xoá phiên"><span class="ms">delete</span></button>' : '') : '') + '</header>' + strip +
        '<div class="chat-msgs" id="cbox">' + html + '</div>' +
        '<div class="tpl-bar" id="tplBar" aria-label="Mẫu trả lời nhanh"></div>' +
        '<form class="chat-form" id="cform" autocomplete="off"><textarea id="cmsg" rows="1" maxlength="1000" placeholder="' + (closed ? 'Phiên đã kết thúc – gửi tin để mở lại…' : 'Nhập tin nhắn trả lời… (Enter để gửi)') + '" aria-label="Tin nhắn"></textarea>' +
        '<button class="btn primary" id="csend" type="submit" aria-label="Gửi"><span class="ms">send</span></button></form>';

    var cbox = $('cbox'), ta = $('cmsg');
    if (stick || near) {
      cbox.scrollTop = cbox.scrollHeight;
    } else {
      cbox.scrollTop = box ? box.scrollTop : 0;
    }
    bindTplBar(ta, { name: u.name });
    ta.value = keep;
    fitTa(ta);
    $('csend').disabled = !keep.trim();
    if (wasFocus || stick) {
      ta.focus();
    }
    ta.oninput = function () {
      $('csend').disabled = !ta.value.trim();
      fitTa(ta);
    };
    ta.onkeydown = function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        $('cform').requestSubmit();
      }
    };
    $('cform').onsubmit = function (e) {
      e.preventDefault();
      var t = ta.value.trim();
      if (!t) {
        return;
      }
      ta.value = '';
      sendAdmin(t);
    };
    pane.querySelectorAll('[data-del]').forEach(function (b) {
      b.onclick = function () {
        deleteMessage(Number(b.dataset.del));
      };
    });
    pane.querySelectorAll('[data-sa]').forEach(function (b) {
      b.onclick = function () {
        sessionAct(b.dataset.sa);
      };
    });
    pane.querySelectorAll('[data-retry]').forEach(function (b) {
      b.onclick = function () {
        var m = chat.items.filter(function (x) {
          return x.id === b.dataset.retry;
        })[0];
        if (m) {
          postAdmin(m);
        }
      };
    });
  }
  function fitTa(ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }

  function sendAdmin(text) {
    var m = {
      id: 'tmp' + (++chat.tmp),
      sender: 'admin',
      body: text,
      created_at: Date.now(),
      state: 'sending'
    };
    chat.items.push(m);
    drawPane(true);
    postAdmin(m);
  }
  function postAdmin(m) {
    var sid = chat.sid;
    m.state = 'sending';
    api('/conversations/' + sid, { method: 'POST', body: { body: m.body } }).then(function (r) {
      chat.items = chat.items.filter(function (x) {
        return x !== m;
      });
      if (chat.sid === sid) {
        if (r.session) {
          chat.session = r.session;
        }
        if (!chat.items.some(function (x) {
          return x.id === r.item.id;
        })) {
          chat.items.push(r.item);
        }
        if (r.item.id > chat.lastId) {
          chat.lastId = r.item.id;
        }
        chat.items.sort(function (a, b) {
          var ta = typeof a.id !== 'number', tb = typeof b.id !== 'number';
          if (ta !== tb) {
            return ta ? 1 : -1;
          }
          return ta ? a.created_at - b.created_at : a.id - b.id;
        });
        drawPane(true);
        loadConvs();
      }
    }).catch(function (ex) {
      m.state = 'fail';
      if (chat.sid === sid) {
        drawPane(true);
      }
      toast(ex.message, true);
    });
  }

  /* Ô tải ảnh đại diện dùng chung (tài khoản khách, đánh giá ảo) */
  function avatarField(url) {
    return '<div class="field"><span>Ảnh đại diện (tuỳ chọn)</span><div class="tpl-row"><span class="av" id="fvPrev">' + (url ? '<img src="' +
      esc(url) + '" alt="">' : '<span class="ms">person</span>') + '</span>' +
      '<button type="button" class="btn" id="fvBtn"><span class="ms">add_a_photo</span>Chọn ảnh</button><button type="button" class="btn" id="fvClr"><span class="ms">close</span>Bỏ ảnh</button></div>' +
      '<input type="file" id="fvFile" accept="image/*" hidden><input type="hidden" id="fvUrl" value="' + esc(url || '') + '"></div>';
  }
  function bindAvatarField() {
    function show(u) {
      $('fvUrl').value = u || '';
      $('fvPrev').innerHTML = u ? '<img src="' + esc(u) + '" alt="">' : '<span class="ms">person</span>';
    }
    $('fvBtn').onclick = function () {
      $('fvFile').click();
    };
    $('fvClr').onclick = function () {
      show('');
    };
    $('fvFile').onchange = function () {
      var f = this.files[0];
      if (!f) {
        return;
      }
      var b = $('fvBtn');
      b.disabled = true;
      window.ikUpload(f, '/api/admin/imagekit', 512, true).then(function (r) {
        show(r.url);
        toast('Đã tải ảnh lên');
      }).catch(function (ex) {
        toast(ex.message, true);
      }).then(function () {
        b.disabled = false;
        $('fvFile').value = '';
      });
    };
  }

  /* ---------- Đánh giá: duyệt, từ chối, phản hồi, xoá ---------- */
  var REV = {
    pending: 'Chờ duyệt',
    approved: 'Đã duyệt',
    rejected: 'Không duyệt'
  };
  var REV_ST = {
    pending: 'called',
    approved: 'won',
    rejected: 'cancelled'
  };
  var rvState = { status: 'pending', page: 1 };
  var STAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.6l-6.1 3.5 1.4-6.8-5.1-4.7 6.9-.8z"/></svg>';
  function setRevBadge(n) {
    var b = $('navRev');
    b.hidden = !n;
    b.textContent = n > 99 ? '99+' : n;
  }
  function ratingTxt(n) {
    return String(n).replace('.', ',');
  }
  /* Sao hỗ trợ nửa điểm: mỗi sao có lớp màu cắt theo 0 / 50 / 100% */
  function starsHTML(n) {
    var v = Math.round(Number(n) * 2) / 2, h = '<span class="rv-stars" role="img" aria-label="' + ratingTxt(v) +
      ' sao">';
    for (var i = 1; i <= 5; i++) {
      var w = v >= i ? 100 : v >= i - 0.5 ? 50 : 0;
      h += '<span class="s">' + STAR_SVG + (w ? '<i style="width:' + w + '%">' + STAR_SVG + '</i>' : '') +
        '</span>';
    }
    return h + '</span>';
  }


  /* ---------- Gửi thông báo tới hòm thư của khách ---------- */
  function renderInbox() {
    var write = can('chat', true);
    main.innerHTML = '<div class="page-h"><div><h1>Gửi thông báo</h1><p>Thông báo hiện trong hòm thư của khách (kèm ảnh nếu muốn). Thông báo đổi trạng thái đơn, báo lỗi và đánh giá được gửi tự động.</p></div></div>' +
      (write ? '<form class="card card-pad" id="inForm" style="display:grid;gap:12px;max-width:640px">' +
      '<label class="field"><span>Gửi tới</span><select id="inTo"><option value="all">Tất cả khách</option><option value="one">Một khách (theo email)</option></select></label>' +
      '<label class="field" id="inMailW" hidden><span>Email khách</span><input id="inMail" type="email" maxlength="120" placeholder="khach@gmail.com"></label>' +
      '<label class="field"><span>Dạng</span><select id="inFmt"><option value="text">Thông báo ngắn</option><option value="post">Bài viết (Markdown)</option></select></label>' +
      '<label class="field"><span>Tiêu đề</span><input id="inTitle" maxlength="120" required></label>' +
      '<div class="field"><span>Nội dung</span><div class="md-bar" id="inBar" hidden></div><textarea id="inBody" rows="4" maxlength="2000"></textarea><div class="md md-prev" id="inMd" hidden></div></div>' +
      '<div class="field"><span>Ảnh đính kèm (tuỳ chọn)</span><img id="inPrev" alt="" hidden style="max-width:240px;border-radius:12px;margin-bottom:8px">' +
      '<div><input id="inImg" placeholder="https://ik.imagekit.io/…"> <button class="btn" id="inUp" type="button"><span class="ms">add_a_photo</span>Tải ảnh lên</button><input type="file" id="inFile" accept="image/*" hidden></div></div>' +
      '<div><button class="btn primary" id="inSend"><span class="ms">send</span>Gửi thông báo</button></div></form>' : '') +
      '<h2 style="margin:24px 0 10px">Đã gửi gần đây</h2><div id="inList"><div class="card"><div class="skel line"></div></div></div>';
    if (write) {
      setupMdEditor();
      $('inTo').onchange = function () {
        $('inMailW').hidden = this.value !== 'one';
      };
      $('inUp').onclick = function () {
        $('inFile').click();
      };
      $('inFile').onchange = function () {
        var f = this.files[0], b = $('inUp');
        if (!f) {
          return;
        }
        b.disabled = true;
        window.ikUpload(f, '/api/admin/imagekit', 1600).then(function (r) {
          $('inImg').value = r.url;
          $('inPrev').src = r.url;
          $('inPrev').hidden = false;
        }).catch(function (ex) {
          toast(ex.message, true);
        }).then(function () {
          b.disabled = false;
        });
      };
      $('inForm').onsubmit = function (e) {
        e.preventDefault();
        var btn = $('inSend');
        btn.disabled = true;
        api('/inbox', { method: 'POST', body: { to: $('inTo').value === 'one' ? $('inMail').value : 'all', title: $('inTitle').value, format: $('inFmt').value, body: $('inBody').value, image: $('inImg').value.trim() } }).then(function () {
          toast('Đã gửi thông báo');
          $('inForm').reset();
          $('inFmt').onchange();
          $('inMailW').hidden = true;
          $('inPrev').hidden = true;
          loadInbox();
        }).catch(function (ex) {
          toast(ex.message, true);
        }).then(function () {
          btn.disabled = false;
        });
      };
    }
    loadInbox();
  }
  /* Soạn bài viết Markdown: thanh định dạng + nút Soạn / Xem trước */
  function setupMdEditor() {
    var ta = $('inBody'), bar = $('inBar'), pv = $('inMd'), preview = false;
    var wrap = function (a, b, ph) {
      return function () {
        var s = ta.selectionStart, e = ta.selectionEnd, v = ta.value, sel = v.slice(s, e) || ph;
        ta.value = v.slice(0, s) + a + sel + b + v.slice(e);
        ta.focus();
        ta.setSelectionRange(s + a.length, s + a.length + sel.length);
      };
    };
    var line = function (p) {
      return function () {
        var s = ta.selectionStart, v = ta.value, st = v.lastIndexOf('\n', s - 1) + 1;
        ta.value = v.slice(0, st) + p + v.slice(st);
        ta.focus();
        ta.setSelectionRange(s + p.length, s + p.length);
      };
    };
    var block = function (t) {
      return function () {
        var s = ta.selectionStart, v = ta.value;
        ta.value = v.slice(0, s) + (s && v[s - 1] !== '\n' ? '\n' : '') + t + v.slice(ta.selectionEnd);
        ta.focus();
      };
    };
    var tools = [
      ['title', 'Tiêu đề', line('## ')],
      ['format_bold', 'Đậm', wrap('**', '**', 'đậm')],
      ['format_italic', 'Nghiêng', wrap('*', '*', 'nghiêng')],
      ['format_strikethrough', 'Gạch ngang', wrap('~~', '~~', 'gạch')],
      ['ink_highlighter', 'Tô sáng', wrap('==', '==', 'nổi bật')],
      ['superscript', 'Chỉ số trên', wrap('^', '^', '2')],
      ['subscript', 'Chỉ số dưới', wrap('~', '~', '2')],
      ['format_quote', 'Trích dẫn', line('> ')],
      ['format_list_bulleted', 'Danh sách', line('- ')],
      ['format_list_numbered', 'Danh sách số', line('1. ')],
      ['checklist', 'Việc cần làm', line('- [ ] ')],
      ['code', 'Code', wrap('`', '`', 'code')],
      ['data_object', 'Khối code', block('```\ncode\n```\n')],
      ['link', 'Liên kết', wrap('[', '](https://)', 'văn bản')],
      ['table', 'Bảng', block('| Cột 1 | Cột 2 |\n|:--|--:|\n| A | B |\n')],
      ['horizontal_rule', 'Đường kẻ', block('\n---\n')],
      ['notes', 'Chú thích', function () {
        wrap('[^1]', '', '')();
        ta.value += '\n\n[^1]: Nội dung chú thích';
      }]
    ];
    bar.innerHTML = tools.map(function (t, i) {
      return '<button type="button" data-t="' + i + '" title="' + t[1] + '" aria-label="' + t[1] + '"><span class="ms">' + t[0] + '</span></button>';
    }).join('') + '<button type="button" data-t="img" title="Chèn ảnh" aria-label="Chèn ảnh"><span class="ms">image</span></button><span class="md-sp"></span><button type="button" id="inPv" aria-pressed="false"><span class="ms">visibility</span> Xem trước</button><input type="file" id="inMdFile" accept="image/*" hidden>';
    bar.onclick = function (e) {
      var b = e.target.closest('button');
      if (!b || preview) {
        return;
      }
      if (b.dataset.t === 'img') {
        $('inMdFile').click();
      } else if (b.dataset.t) {
        tools[+b.dataset.t][2]();
      }
    };
    $('inMdFile').onchange = function () {
      var f = this.files[0];
      if (f) {
        window.ikUpload(f, '/api/admin/imagekit', 1600).then(function (r) {
          block('![mô tả ảnh](' + r.url + ')\n')();
        }).catch(function (ex) {
          toast(ex.message, true);
        });
      }
      this.value = '';
    };
    $('inPv').onclick = function () {
      preview = !preview;
      this.setAttribute('aria-pressed', preview);
      this.lastChild.textContent = preview ? ' Soạn' : ' Xem trước';
      ta.hidden = preview;
      pv.hidden = !preview;
      if (preview) {
        pv.innerHTML = ta.value.trim() ? window.vdkMd.render(ta.value) : '<p class="muted">Chưa có nội dung.</p>';
      }
    };
    $('inFmt').onchange = function () {
      var post = this.value === 'post';
      bar.hidden = !post;
      ta.rows = post ? 14 : 4;
      ta.maxLength = post ? 20000 : 2000;
      if (!post && preview) {
        $('inPv').onclick();
      }
    };
  }
  function loadInbox() {
    api('/inbox').then(function (r) {
      if (view !== 'inbox') {
        return;
      }
      var box = $('inList');
      if (!r.items.length) {
        box.innerHTML = '<div class="card state"><span class="ms">campaign</span><h2>Chưa gửi thông báo nào</h2></div>';
        return;
      }
      box.innerHTML = r.items.map(function (x) {
        return '<article class="card rv-card" data-id="' + x.id + '"><header><div class="who"><b>' + esc(x.title) + (x.kind === 'post' ? ' <span class="st won">Bài viết</span>' : '') + '</b><small>' + vnDate(x.created_at) + ' ' + vnTime(x.created_at) +
          ' · Gửi tới: ' + (x.user_id ? esc(x.user_name || '') + ' (' + esc(x.user_email || '') + ')' : 'tất cả khách') + '</small></div></header>' +
          (x.body ? (x.kind === 'post' ? '<div class="md">' + window.vdkMd.render(x.body) + '</div>' : '<p class="rv-body">' + esc(x.body) + '</p>') : '') + (x.image ? '<img src="' + esc(x.image) + '" alt="" style="max-width:240px;border-radius:12px">' : '') +
          (can('chat', true) ? '<div class="rv-acts"><button class="btn danger" data-del="' + x.id + '"><span class="ms">delete</span>Xoá</button></div>' : '') + '</article>';
      }).join('');
      box.querySelectorAll('[data-del]').forEach(function (b) {
        b.onclick = function () {
          confirmBox('Xoá thông báo này khỏi hòm thư của khách?', { title: 'Xoá thông báo', ok: 'Xoá', danger: true }).then(function (ok) {
            if (ok) {
              api('/inbox/' + b.dataset.del, { method: 'DELETE' }).then(loadInbox).catch(function (ex) {
                toast(ex.message, true);
              });
            }
          });
        };
      });
    }).catch(function (ex) {
      toast(ex.message, true);
    });
  }

  /* ---------- Báo lỗi từ khách ---------- */
  var BUG = { new: 'Mới', doing: 'Đang xử lý', done: 'Đã xong' };
  var BUG_ST = { new: 'new', doing: 'called', done: 'won' };
  var bugState = { status: 'new', page: 1 };
  function setBugBadge(n) {
    var b = $('navBug');
    if (b) {
      b.hidden = !n;
      b.textContent = n > 99 ? '99+' : n;
    }
  }
  function renderBugs() {
    main.innerHTML = '<div class="page-h"><div><h1>Báo lỗi</h1><p>Lỗi website do khách gửi từ nút “Báo lỗi” ở cuối trang.</p></div>' +
      '<div class="h-acts"><button class="btn" id="bgRefresh"><span class="ms">refresh</span>Làm mới</button></div></div>' +
      '<div class="chips" id="bgChips"></div><div id="bgItems"><div class="card"><div class="skel line"></div>' + '<div class="skel line"></div>'.repeat(3) + '</div></div><div id="bgPager"></div>';
    $('bgRefresh').onclick = loadBugs;
    loadBugs();
  }
  function loadBugs() {
    api('/bugs?status=' + bugState.status + '&page=' + bugState.page).then(function (r) {
      if (view !== 'bugs') {
        return;
      }
      setBugBadge(r.counts.new);
      var write = can('bugs', true);
      var total = r.counts.new + r.counts.doing + r.counts.done;
      var chips = [['new', BUG.new, r.counts.new], ['doing', BUG.doing, r.counts.doing], ['done', BUG.done, r.counts.done], ['', 'Tất cả', total]];
      $('bgChips').innerHTML = chips.map(function (c) {
        return '<button type="button" class="chip" aria-pressed="' + (c[0] === bugState.status) + '" data-s="' + c[0] + '">' + c[1] + ' <b>' + c[2] + '</b></button>';
      }).join('');
      $('bgChips').querySelectorAll('.chip').forEach(function (b) {
        b.onclick = function () {
          bugState.status = b.dataset.s;
          bugState.page = 1;
          loadBugs();
        };
      });
      var box = $('bgItems');
      if (!r.items.length) {
        box.innerHTML = '<div class="card state"><span class="ms">check_circle</span><h2>Không có báo lỗi nào</h2><p>Chưa có báo lỗi trong mục này.</p></div>';
        $('bgPager').innerHTML = '';
        return;
      }
      box.innerHTML = r.items.map(function (x) {
        return '<article class="card rv-card" data-id="' + x.id + '"><header><div class="who"><b>' + esc(x.title) + '</b><small>' +
          vnDate(x.created_at) + ' ' + vnTime(x.created_at) + ' · ' + (x.user_name ? esc(x.user_name) : 'Khách chưa đăng nhập') +
          (x.contact ? ' · ' + esc(x.contact) : '') + '</small></div><span class="st ' + BUG_ST[x.status] + '">' + BUG[x.status] + '</span></header>' +
          '<p class="rv-body">' + esc(x.body) + '</p>' +
          '<div class="rv-meta"><span>' + (x.page ? 'Trang: ' + esc(x.page) : '') + (x.ua ? '<br>Thiết bị: ' + esc(x.ua) : '') + '</span></div>' +
          (write ? '<label class="field"><span>Ghi chú nội bộ</span><textarea class="bg-note" rows="2" maxlength="1000">' + esc(x.note || '') + '</textarea></label>' +
          '<div class="rv-acts">' +
          (x.status !== 'doing' ? '<button class="btn" data-act="doing"><span class="ms">schedule</span>Đang xử lý</button>' : '') +
          (x.status !== 'done' ? '<button class="btn primary" data-act="done"><span class="ms">check</span>Đã xong</button>' : '') +
          (x.status !== 'new' ? '<button class="btn" data-act="new"><span class="ms">refresh</span>Mở lại</button>' : '') +
          '<button class="btn" data-act="note"><span class="ms">save</span>Lưu ghi chú</button>' +
          '<button class="btn danger" data-act="delete"><span class="ms">delete</span>Xoá</button></div>' : (x.note ? '<p class="muted">Ghi chú: ' + esc(x.note) + '</p>' : '')) + '</article>';
      }).join('');
      box.querySelectorAll('.rv-card').forEach(function (card) {
        var id = card.dataset.id;
        card.querySelectorAll('[data-act]').forEach(function (b) {
          b.onclick = function () {
            var act = b.dataset.act;
            function send(body) {
              b.disabled = true;
              api('/bugs/' + id, { method: 'PATCH', body: body }).then(function () {
                toast('Đã cập nhật');
                loadBugs();
              }).catch(function (ex) {
                b.disabled = false;
                toast(ex.message, true);
              });
            }
            if (act === 'delete') {
              confirmBox('Xoá báo lỗi này? Không khôi phục được.', { title: 'Xoá báo lỗi', ok: 'Xoá', danger: true }).then(function (ok) {
                if (!ok) {
                  return;
                }
                api('/bugs/' + id, { method: 'DELETE' }).then(function () {
                  toast('Đã xoá báo lỗi');
                  loadBugs();
                }).catch(function (ex) {
                  toast(ex.message, true);
                });
              });
            } else if (act === 'note') {
              send({ note: card.querySelector('.bg-note').value });
            } else {
              send({ status: act, note: card.querySelector('.bg-note').value });
            }
          };
        });
      });
      var pages = Math.max(Math.ceil(r.total / r.pageSize), 1);
      $('bgPager').innerHTML = pages > 1 ? '<div class="rv-pager"><button class="icon-btn" id="bgPrev" aria-label="Trang trước"' + (r.page <= 1 ? ' disabled' : '') +
        '><span class="ms">chevron_left</span></button><span>Trang ' + r.page + '/' + pages + '</span><button class="icon-btn" id="bgNext" aria-label="Trang sau"' +
        (r.page >= pages ? ' disabled' : '') + '><span class="ms">chevron_right</span></button></div>' : '';
      if (pages > 1) {
        $('bgPrev').onclick = function () {
          bugState.page--;
          loadBugs();
        };
        $('bgNext').onclick = function () {
          bugState.page++;
          loadBugs();
        };
      }
    }).catch(function (ex) {
      if (view === 'bugs') {
        $('bgItems').innerHTML = '';
        errorState(ex.message, renderBugs);
      }
    });
  }

  function renderReviews() {
    main.innerHTML = '<div class="page-h"><div><h1>Đánh giá</h1><p>Đánh giá do khách đã đặt tour viết. Chỉ đánh giá được duyệt mới hiện trên website.</p></div>' +
      '<div class="h-acts">' + (can('reviews', true) && can('vreview', true) ? '<button class="btn primary" id="rvAdd"><span class="ms">add</span>Thêm đánh giá ảo</button>' : '') + '<button class="btn" id="rvRefresh"><span class="ms">refresh</span>Làm mới</button></div></div>' +
      '<div class="chips" id="rvChips"></div><div id="rvItems"><div class="card"><div class="skel line"></div>' + '<div class="skel line"></div>'.repeat(3) + '</div></div><div id="rvPager"></div>';
    $('rvRefresh').onclick = function () {
      loadReviews();
    };
    if ($('rvAdd')) {
      $('rvAdd').onclick = function () {
        virtualReviewPanel(null);
      };
    }
    loadReviews();
  }

  function loadReviews() {
    api('/reviews?status=' + rvState.status + '&page=' + rvState.page).then(function (r) {
      if (view !== 'reviews') {
        return;
      }
      setRevBadge(r.counts.pending);
      var total = r.counts.pending + r.counts.approved + r.counts.rejected;
      var chips = [['pending', REV.pending, r.counts.pending], ['approved', REV.approved, r.counts.approved], ['rejected', REV.rejected, r.counts.rejected], ['', 'Tất cả', total]];
      $('rvChips').innerHTML = chips.map(function (c) {
        return '<button type="button" class="chip" aria-pressed="' + (c[0] === rvState.status) + '" data-s="' +
          c[0] + '">' + c[1] + ' <b>' + c[2] + '</b></button>';
      }).join('');
      $('rvChips').querySelectorAll('.chip').forEach(function (b) {
        b.onclick = function () {
          rvState.status = b.dataset.s;
          rvState.page = 1;
          loadReviews();
        };
      });
      var box = $('rvItems');
      if (!r.items.length) {
        box.innerHTML = '<div class="card state"><span class="ms">star</span><h2>Không có đánh giá nào</h2><p>' +
          (rvState.status === 'pending' ? 'Không có đánh giá nào đang chờ duyệt.' : 'Chưa có đánh giá trong mục này.') +
          '</p></div>';
        $('rvPager').innerHTML = '';
        return;
      }
      box.innerHTML = r.items.map(function (x) {
        return '<article class="card rv-card" data-id="' + x.id + '"><header><span class="av">' + (x.avatar ? '<img src="' +
          esc(x.avatar) + '" alt="">' : initial(x.name)) + '</span><div class="who"><b>' + esc(x.name) + (x.virtual ? '<span class="vtag">Ảo</span>' : '') + '</b>' +
          '<small>' + (x.virtual ? 'Do admin tạo, chỉ hiện trong trang quản trị' : esc(x.email) +
          (x.phone ? ' · ' +
            esc(x.phone) : '')) + '</small></div><span class="st ' + REV_ST[x.status] + '">' + REV[x.status] + '</span></header>' +
          '<div class="rv-meta">' + starsHTML(x.rating) + '<span>' + (x.destination ? esc(x.destination) +
          ' · ' : '') + vnDate(x.created_at) + ' ' + vnTime(x.created_at) + '</span></div>' +
          '<p class="rv-body">' + esc(x.body) + '</p>' +
          '<label class="field"><span>Phản hồi công khai (tuỳ chọn)</span><textarea class="rv-reply" rows="2" maxlength="600" placeholder="Cảm ơn khách, hoặc giải đáp thắc mắc…">' + esc(x.reply || '') + '</textarea></label>' +
          '<div class="rv-acts">' +
          (x.status !== 'approved' ? '<button class="btn primary" data-act="approved"><span class="ms">check</span>Duyệt</button>' : '') +
          (x.status !== 'rejected' ? '<button class="btn" data-act="rejected"><span class="ms">close</span>Không duyệt</button>' : '') +
          '<button class="btn" data-act="reply"><span class="ms">send</span>Lưu phản hồi</button>' +
          (x.virtual ? '<button class="btn" data-act="edit"><span class="ms">edit</span>Sửa nội dung</button>' : '<button class="btn" data-act="chat"><span class="ms">forum</span>Nhắn khách</button>') +
          '<button class="btn danger" data-act="delete"><span class="ms">delete</span>Xoá</button></div></article>';
      }).join('');
      box.querySelectorAll('.rv-card').forEach(function (card) {
        var id = card.dataset.id;
        card.querySelectorAll('[data-act]').forEach(function (b) {
          b.onclick = function () {
            if (b.dataset.act === 'chat') {
              var it = r.items.filter(function (x) {
                return String(x.id) === id;
              })[0];
              openChatWith(it.user_id);
              return;
            }
            if (b.dataset.act === 'edit') {
              virtualReviewPanel(r.items.filter(function (x) {
                return String(x.id) === id;
              })[0]);
              return;
            }
            reviewAct(id, b.dataset.act, card, b);
          };
        });
      });
      var pages = Math.max(Math.ceil(r.total / r.pageSize), 1);
      $('rvPager').innerHTML = pages > 1 ? '<div class="rv-pager"><button class="icon-btn" id="rvPrev" aria-label="Trang trước"' +
        (r.page <= 1 ? ' disabled' : '') + '><span class="ms">chevron_left</span></button><span>Trang ' +
        r.page + '/' + pages + '</span><button class="icon-btn" id="rvNext" aria-label="Trang sau"' +
        (r.page >= pages ? ' disabled' : '') + '><span class="ms">chevron_right</span></button></div>' : '';
      if (pages > 1) {
        $('rvPrev').onclick = function () {
          rvState.page--;
          loadReviews();
        };
        $('rvNext').onclick = function () {
          rvState.page++;
          loadReviews();
        };
      }
    }).catch(function (ex) {
      if (view !== 'reviews') {
        return;
      }
      $('rvItems').innerHTML = '';
      errorStateIn($('rvItems'), ex.message);
      $('retry').onclick = loadReviews;
    });
  }

  function virtualReviewPanel(x) {
    var isNew = !x;
    x = x || {
      name: '',
      rating: 5,
      destination: '',
      body: '',
      reply: '',
      avatar: '',
      created_at: Date.now()
    };
    var day = new Date(x.created_at + 7 * 3600000).toISOString().slice(0, 10);
    openPanel(isNew ? 'Thêm đánh giá ảo' : 'Sửa đánh giá ảo', 'Hiện công khai ngay như một đánh giá đã duyệt', '<label class="field"><span>Tên người đánh giá</span><input id="vName" maxlength="60" value="' + esc(x.name) + '"></label>' +
      '<label class="field"><span>Số sao</span><select id="vRate">' + [5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5].map(function (n) {
      return opt(String(n), ratingTxt(n) + ' sao', String(x.rating));
    }).join('') + '</select></label>' +
      '<label class="field"><span>Điểm đến</span><select id="vDest">' + opt('', 'Không chọn', x.destination || '') + DESTS.map(function (d) {
      return opt(d, d, x.destination || '');
    }).join('') + '</select></label>' +
      '<label class="field"><span>Ngày đánh giá</span><input type="date" id="vDate" value="' + day + '" max="' + new Date().toISOString().slice(0, 10) + '"></label>' +
      '<label class="field"><span>Nội dung (ít nhất 10 ký tự)</span><textarea id="vBody" maxlength="600" rows="5">' + esc(x.body) + '</textarea></label>' +
      '<label class="field"><span>Phản hồi công khai (tuỳ chọn)</span><textarea id="vReply" maxlength="600" rows="2">' + esc(x.reply || '') + '</textarea></label>' +
      (isNew ? avatarField('') : ''), '<button class="btn" id="vCancel" type="button">Huỷ</button><button class="btn primary" id="vSave">' +
      (isNew ? 'Thêm đánh giá' : 'Lưu') + '</button>', loadReviews);
    if (isNew) {
      bindAvatarField();
    }
    $('vCancel').onclick = function () {
      closeDrawer();
    };
    $('vSave').onclick = function () {
      var btn = this, at = new Date($('vDate').value + 'T12:00:00+07:00').getTime();
      var body = {
        name: $('vName').value,
        rating: Number($('vRate').value),
        destination: $('vDest').value,
        body: $('vBody').value,
        reply: $('vReply').value,
        created_at: Math.min(at || Date.now(), Date.now())
      };
      if (isNew && $('fvUrl').value) {
        body.avatar = $('fvUrl').value;
      }
      btn.disabled = true;
      api(isNew ? '/reviews/virtual' : '/reviews/' + x.id, { method: isNew ? 'POST' : 'PATCH', body: body })
        .then(function () {
        toast(isNew ? 'Đã thêm đánh giá' : 'Đã lưu');
        rvState.status = 'approved';
        closeDrawer(true);
      }).catch(function (ex) {
        toast(ex.message, true);
        btn.disabled = false;
      });
    };
  }

  function reviewAct(id, act, card, btn) {
    if (act === 'delete') {
      confirmBox('Xoá hẳn đánh giá này? Khách sẽ có thể viết lại.', {
        title: 'Xoá đánh giá',
        ok: 'Xoá đánh giá',
        danger: true
      }).then(function (ok) {
        if (!ok) {
          return;
        }
        btn.disabled = true;
        api('/reviews/' + id, { method: 'DELETE' }).then(function () {
          toast('Đã xoá đánh giá');
          loadReviews();
        }).catch(function (ex) {
          btn.disabled = false;
          toast(ex.message, true);
        });
      });
      return;
    }
    var body = { reply: card.querySelector('.rv-reply').value };
    if (act !== 'reply') {
      body.status = act;
    }
    btn.disabled = true;
    api('/reviews/' + id, { method: 'PATCH', body: body }).then(function () {
      toast(act === 'approved' ? 'Đã duyệt, đánh giá đã hiện trên website' : act === 'rejected' ? 'Đã chuyển sang không duyệt' : 'Đã lưu phản hồi');
      loadReviews();
    }).catch(function (ex) {
      btn.disabled = false;
      toast(ex.message, true);
    });
  }

  /* ---------- Tài khoản khách: tìm, khoá, xác minh, gửi lại email, xoá, xuất CSV ---------- */
  var accState = {
    q: '',
    status: '',
    page: 1
  }, accTimer, accSeq = 0;
  function accQuery(extra) {
    var p = new URLSearchParams();
    if (accState.q) {
      p.set('q', accState.q);
    }
    if (accState.status) {
      p.set('status', accState.status);
    }
    Object.keys(extra || {}).forEach(function (k) {
      p.set(k, extra[k]);
    });
    return p.toString();
  }
  function accBadge(u) {
    if (u.blocked_at) {
      return '<span class="st new">Đã khoá</span>';
    }
    if (!u.verified_at) {
      return '<span class="st called">Chưa xác minh</span>';
    }
    return '<span class="st won">Hoạt động</span>';
  }

  function renderAccounts() {
    main.innerHTML = '<div class="page-h"><div><h1>Tài khoản</h1><p id="acount">Khách đã đăng ký trên website.</p></div>' +
      '<div class="h-acts">' + (can('accounts', true) ? '<button class="btn primary" id="aAdd"><span class="ms">person_add</span>Tạo tài khoản</button>' : '') + '<a class="btn" id="aCsv" href="#"><span class="ms">download</span>Xuất CSV</a><a class="btn" id="aXlsx" href="#"><span class="ms">table_view</span>Xuất Excel</a></div></div>' +
      '<div class="chips" id="aChips"></div>' +
      '<div class="toolbar one" role="search"><label class="search-wrap"><span class="ms">search</span><input type="search" id="aq" placeholder="Tìm tên, email hoặc SĐT" aria-label="Tìm tài khoản" value="' + esc(accState.q) + '"></label></div>' +
      '<div class="card table-card" id="alist2"></div>';
    $('aq').oninput = function () {
      clearTimeout(accTimer);
      accTimer = setTimeout(function () {
        accState.q = $('aq').value.trim();
        accState.page = 1;
        loadAccounts();
      }, 300);
    };
    if ($('aAdd')) {
      $('aAdd').onclick = function () {
        accountPanel(null);
      };
    }
    loadAccounts();
  }

  function loadAccounts() {
    var box = $('alist2');
    if (!box) {
      return;
    }
    var seq = ++accSeq;
    box.innerHTML = '<div class="skel line"></div>'.repeat(6);
    $('aCsv').href = '/api/admin/accounts.csv?' + accQuery();
    $('aXlsx').href = '/api/admin/accounts.xlsx?' + accQuery();
    api('/accounts?' + accQuery({ page: accState.page })).then(function (r) {
      if (seq !== accSeq || view !== 'accounts') {
        return;
      }
      var c = r.counts;
      $('acount').textContent = c.total ? fmt(c.total) + ' tài khoản' : 'Chưa có tài khoản nào';
      $('aChips').innerHTML = [['', 'Tất cả', c.all_users], ['real', 'Không phải acc ảo', c.all_users - c.virtual], ['virtual', 'Acc ảo', c.virtual], ['verified', 'Đã xác minh', c.verified], ['unverified', 'Chưa xác minh', c.unverified], ['blocked', 'Đã khoá', c.blocked]].map(function (x) {
        return '<button type="button" class="chip" data-s="' + x[0] + '" aria-pressed="' +
          (x[0] === accState.status) + '">' + x[1] + ' <b>' + x[2] + '</b></button>';
      }).join('');
      $('aChips').querySelectorAll('.chip').forEach(function (b) {
        b.onclick = function () {
          accState.status = b.dataset.s;
          accState.page = 1;
          loadAccounts();
        };
      });
      if (!r.items.length) {
        box.innerHTML = '<div class="state"><span class="ms">manage_accounts</span><h2>' +
          (accState.q || accState.status ? 'Không tìm thấy tài khoản' : 'Chưa có tài khoản nào') +
          '</h2><p>Khách xuất hiện ở đây sau khi đăng ký.</p></div>';
        return;
      }
      var pages = Math.max(Math.ceil(r.total / r.pageSize), 1);
      box.innerHTML = '<table class="tbl acct"><thead><tr><th scope="col">Khách</th><th scope="col" class="hide-m">SĐT</th><th scope="col">Đăng ký</th><th scope="col" class="hide-m">Đăng nhập gần nhất</th><th scope="col">Trạng thái</th></tr></thead><tbody>' +
        r.items.map(function (u) {
          return '<tr class="arow" data-id="' + u.id + '"><td class="name"><button class="row-btn" type="button" aria-expanded="false">' + esc(u.name) + '</button>' + (u.is_virtual ? '<span class="vtag">Ảo</span>' : '') + '<span>' + esc(u.email) + '</span></td>' +
            '<td class="meta hide-m">' + esc(u.phone || '–') + '</td><td class="meta" data-l="Đăng ký">' + vnDate(u.created_at) + '</td>' +
            '<td class="meta hide-m">' + (u.last_login ? ago(u.last_login) : 'Chưa từng') + '</td><td>' + accBadge(u) + '</td></tr>' +
            '<tr class="aacts" hidden><td colspan="5"><div class="aa"><p class="muted">' + u.bookings + ' đơn · ' + u.reviews + ' đánh giá · ' + u.messages + ' tin nhắn</p><div class="rv-acts">' +
            (u.is_virtual ? '' : '<button class="btn" type="button" data-chat="' + u.id +
              '"><span class="ms">forum</span>Nhắn tin</button>') +
            (can('accounts', true) ? '<button class="btn" data-a="edit"><span class="ms">edit</span>Sửa thông tin</button>' : '') +
            (u.phone ? '<a class="btn" href="#/bookings?phone=' + encodeURIComponent(u.phone) +
              '"><span class="ms">inbox</span>Xem đơn</a>' : '') +
            (!u.verified_at ? '<button class="btn" data-a="resend"><span class="ms">forward_to_inbox</span>Gửi lại email xác minh</button><button class="btn" data-a="verify"><span class="ms">verified</span>Xác minh thủ công</button>' : '') +
            (u.blocked_at ? '<button class="btn" data-a="unblock"><span class="ms">lock_open</span>Mở khoá</button>' : '<button class="btn" data-a="block"><span class="ms">block</span>Khoá</button>') +
            '<button class="btn danger" data-a="delete"><span class="ms">delete</span>Xoá</button></div></div></td></tr>';
        }).join('') + '</tbody></table>' +
        '<div class="pager"><span>Trang ' + r.page + ' / ' + pages + '</span><div><button class="btn" id="aprev"' + (r.page <= 1 ? ' disabled' : '') + '><span class="ms">chevron_left</span>Trước</button>' +
        '<button class="btn" id="anext"' + (r.page >= pages ? ' disabled' : '') + '>Sau<span class="ms">chevron_right</span></button></div></div>';
      box.querySelectorAll('[data-chat]').forEach(function (b) {
        b.onclick = function () {
          openChatWith(Number(b.dataset.chat));
        };
      });
      box.querySelectorAll('tr.arow').forEach(function (tr) {
        tr.onclick = function () {
          var panel = tr.nextElementSibling, open = panel.hidden;
          box.querySelectorAll('tr.aacts').forEach(function (p) {
            p.hidden = true;
            p.previousElementSibling.querySelector('.row-btn').setAttribute('aria-expanded', 'false');
          });
          panel.hidden = !open;
          tr.querySelector('.row-btn').setAttribute('aria-expanded', String(open));
        };
        var panel = tr.nextElementSibling, name = tr.querySelector('.row-btn').textContent;
        panel.querySelectorAll('[data-a]').forEach(function (b) {
          b.onclick = function () {
            if (b.dataset.a === 'edit') {
              accountPanel(r.items.filter(function (x) {
                return String(x.id) === tr.dataset.id;
              })[0]);
            } else {
              accountAct(tr.dataset.id, b.dataset.a, name, b);
            }
          };
        });
      });
      $('aprev').onclick = function () {
        accState.page--;
        loadAccounts();
      };
      $('anext').onclick = function () {
        accState.page++;
        loadAccounts();
      };
    }).catch(function (ex) {
      if (seq === accSeq && view === 'accounts') {
        box.innerHTML = '';
        errorStateIn(box, ex.message);
        $('retry').onclick = loadAccounts;
      }
    });
  }

  function accountPanel(u) {
    var isNew = !u, mk = !isNew && !can('pii', true);
    u = u || {
      name: '',
      email: '',
      phone: '',
      avatar: '',
      verified_at: Date.now(),
      blocked_at: null
    };
    openPanel(isNew ? 'Tạo tài khoản khách' : 'Sửa tài khoản', isNew ? 'Tài khoản được tạo sẵn, không cần xác minh email' : u.email, '<label class="field"><span>Họ và tên</span><input id="cName" maxlength="80" value="' + esc(u.name) + '"></label>' +
      '<label class="field"><span>Email đăng nhập</span><input id="cEmail" type="email" maxlength="254" autocomplete="off" value="' + esc(u.email) + '"' + (mk ? ' readonly' : '') + '></label>' +
      '<label class="field"><span>Số điện thoại</span><input id="cPhone" inputmode="tel" maxlength="20" value="' + esc(u.phone || '') + '"' + (mk ? ' readonly' : '') + '></label>' +
      '<label class="field"><span>' + passLabel(isNew) + '</span><input id="cPass" type="text" autocomplete="off" maxlength="128"></label>' + passGen('cPass') +
      avatarField(u.avatar) +
      '<label class="chk tgl"><input type="checkbox" id="cVer"' + (u.verified_at ? ' checked' : '') + '><span>Đã xác minh email</span></label>' +
      (isNew ? '' : '<label class="chk tgl"><input type="checkbox" id="cBlock"' +
        (u.blocked_at ? ' checked' : '') +
        '><span>Khoá tài khoản<small>Không đăng nhập, đặt tour, nhắn tin được</small></span></label>'), '<button class="btn" id="cCancel" type="button">Huỷ</button><button class="btn primary" id="cSave">' +
      (isNew ? 'Tạo tài khoản' : 'Lưu thay đổi') + '</button>', loadAccounts);
    bindAvatarField();
    $('cCancel').onclick = function () {
      closeDrawer();
    };
    bindGen();
    $('cSave').onclick = function () {
      var btn = this, body = {
        name: $('cName').value,
        email: mk ? undefined : $('cEmail').value,
        phone: mk ? undefined : $('cPhone').value,
        avatar: $('fvUrl').value,
        verified: $('cVer').checked
      };
      if (($('cPass').value || isNew) && passErr($('cPass').value)) {
        toast(passErr($('cPass').value), true);
        return;
      }
      if ($('cPass').value || isNew) {
        body.password = $('cPass').value;
      }
      if (!isNew) {
        body.blocked = $('cBlock').checked;
      }
      btn.disabled = true;
      api(isNew ? '/accounts' : '/accounts/' + u.id, { method: isNew ? 'POST' : 'PATCH', body: body })
        .then(function () {
        toast(isNew ? 'Đã tạo tài khoản' : 'Đã lưu');
        closeDrawer(true);
      }).catch(function (ex) {
        toast(ex.message, true);
        btn.disabled = false;
      });
    };
  }

  function accountAct(id, act, name, btn) {
    var ask = {
      block: 'Khoá tài khoản của ' + name +
        '? Khách sẽ bị đăng xuất và không đăng nhập, đặt tour, nhắn tin được nữa.',
      delete: 'Xoá hẳn tài khoản của ' + name +
        '? Tin nhắn và đánh giá của khách sẽ bị xoá. Các đơn đặt tour vẫn được giữ lại. Không hoàn tác được.'
    };
    function go() {
      btn.disabled = true;
      api('/accounts/' + id + (act === 'delete' ? '' : '/' + act), { method: act === 'delete' ? 'DELETE' : 'POST' }).then(function () {
        toast({
          block: 'Đã khoá tài khoản',
          unblock: 'Đã mở khoá',
          verify: 'Đã xác minh thủ công',
          resend: 'Đã gửi lại email xác minh',
          delete: 'Đã xoá tài khoản'
        }[act]);
        loadAccounts();
      }).catch(function (ex) {
        btn.disabled = false;
        toast(ex.message, true);
      });
    }
    if (ask[act]) {
      confirmBox(ask[act], {
        title: act === 'delete' ? 'Xoá tài khoản khách' : 'Khoá tài khoản',
        ok: act === 'delete' ? 'Xoá hẳn' : 'Khoá tài khoản',
        danger: true,
        icon: act === 'delete' ? 'delete' : 'lock'
      }).then(function (ok) {
        if (ok) {
          go();
        }
      });
    } else {
      go();
    }
  }

  /* ---------- Ngăn chi tiết: xem, sửa, tạo đơn ---------- */
  var drawerOpener = null, onChanged = null;
  function openDrawer(b, changed) {
    var isNew = !b;
    if (isNew) {
      b = {
        name: '',
        phone: '',
        destination: '',
        depart_date: '',
        people: '',
        message: '',
        note: '',
        status: 'new',
        source: 'admin'
      };
    }
    var newStatus = 'new', masked = !isNew && !can('pii', true); // không có quyền xem đầy đủ: SĐT bị che, chỉ sửa được phần còn lại
    onChanged = changed;
    drawerOpener = document.activeElement;
    var d = $('drawer');
    d.innerHTML = '<header><div><h2 id="drawerTitle">' + (isNew ? 'Thêm đơn mới' : esc(b.name)) + '</h2><span class="muted">' +
      (isNew ? 'Nhập tay khi khách gọi điện hoặc nhắn tin' : 'Gửi ' + vnDate(b.created_at) + ' lúc ' +
        vnTime(b.created_at) + ' · ' + esc(SOURCE[b.source] || b.source)) + '</span></div>' +
      '<button class="icon-btn" id="dClose" aria-label="Đóng"><span class="ms">close</span></button></header>' +
      '<div class="body">' +
      (isNew ? '' : masked ? '<div class="facts"><div><span class="ms">lock</span><span><b>' + esc(b.phone) +
        '</b><small>SĐT được che theo quyền của bạn</small></span></div></div>' : '<div class="facts"><div><span class="ms">call</span><span><a href="tel:' + esc(b.phone) + '"><b>' + esc(b.phone) + '</b></a><small>Bấm để gọi</small>' +
        '<span class="acts"><a class="chip" href="https://zalo.me/' + esc(b.phone.replace(/^\+?84/, '0')) + '" target="_blank" rel="noopener">Nhắn Zalo</a><button type="button" class="chip" id="copyPhone">Sao chép SĐT</button>' +
        '<a class="chip" href="#/bookings?phone=' + encodeURIComponent(b.phone) + '" id="sameCust">Đơn khác của khách</a></span></span></div></div>') +
      '<div class="form-grid">' +
      '<label class="field"><span>Họ và tên</span><input id="eName" maxlength="80" autocomplete="off" value="' + esc(b.name) + '"></label>' +
      '<label class="field"><span>Số điện thoại</span><input id="ePhone" inputmode="tel" maxlength="20" autocomplete="off" value="' + esc(b.phone) + '"' + (masked ? ' readonly' : '') + '></label>' +
      '<label class="field"><span>Điểm đến</span><select id="eDest">' + opt('', 'Chưa chọn', b.destination || '') + DESTS.map(function (x) {
      return opt(x, x, b.destination || '');
    }).join('') + '</select></label>' +
      '<label class="field"><span>Ngày khởi hành</span><input type="date" id="eDate" value="' + esc(b.depart_date || '') + '"></label>' +
      '<label class="field"><span>Số người</span><input type="number" id="ePeople" min="1" max="200" inputmode="numeric" value="' + esc(b.people == null ? '' : b.people) + '"></label></div>' +
      (!isNew && b.coupon ? '<p class="perm-note">Mã giảm giá: <b>' + esc(b.coupon) + '</b>' +
        (b.discount ? ' (−' +
          fmt(b.discount) + 'đ)' : '') + '</p>' : '') +
      (isNew ? '' : '<label class="field"><span>Doanh thu (đồng) – khi đã chốt, để trống = tự tính theo giá tour</span><input type="number" id="eAmount" min="0" step="10000" inputmode="numeric" value="' + esc(b.amount == null ? '' : b.amount) + '"></label>' +
        '<div class="field"><span>Trả lời nhanh cho khách</span><div class="tpl-row"><select id="tplSel"><option value="">Chọn mẫu…</option></select><button type="button" class="btn" id="tplCopy"><span class="ms">content_copy</span>Sao chép</button></div></div>') +
      '<label class="field"><span>Lời nhắn của khách</span><textarea id="eMsg" maxlength="1000">' + esc(b.message || '') + '</textarea></label>' +
      '<div><h3 style="font-size:15px;margin-bottom:8px">Trạng thái</h3><div class="seg" id="seg">' +
      Object.keys(STATUS).map(function (k) {
        return '<button type="button" data-s="' + k + '" aria-pressed="' + (b.status === k) + '">' + STATUS[k] +
          '</button>';
      }).join('') + '</div></div>' +
      '<label class="field"><span>Ghi chú nội bộ</span><textarea id="note" maxlength="2000" placeholder="Ví dụ: hẹn gọi lại 9h sáng mai">' + esc(b.note) + '</textarea></label></div>' +
      '<footer>' + (isNew ? '<button class="btn" id="dCancel" type="button">Huỷ</button>' : '<button class="btn danger" id="del"><span class="ms">delete</span>Xoá đơn</button>') +
      '<button class="btn primary" id="save">' + (isNew ? 'Tạo đơn' : 'Lưu thay đổi') + '</button></footer>';
    $('scrim').hidden = false;
    d.hidden = false;
    (isNew ? $('eName') : $('dClose')).focus();

    function fields() {
      return {
        name: $('eName').value,
        phone: masked ? undefined : $('ePhone').value,
        destination: $('eDest').value,
        depart_date: $('eDate').value,
        people: $('ePeople').value,
        message: $('eMsg').value,
        note: $('note').value,
        amount: $('eAmount') ? $('eAmount').value : undefined
      };
    }
    $('dClose').onclick = function () {
      closeDrawer();
    };
    if (!isNew && $('tplSel')) {
      Promise.all([getTemplates(), getTours()]).then(function (r) {
        if (!$('tplSel')) {
          return;
        }
        $('tplSel').innerHTML = '<option value="">Chọn mẫu…</option>' + r[0].map(function (t) {
          return '<option value="' + t.id + '">' + esc(t.title) + '</option>';
        }).join('');
        $('tplCopy').onclick = function () {
          var t = r[0].filter(function (x) {
            return x.id == $('tplSel').value;
          })[0];
          if (!t) {
            toast('Hãy chọn một mẫu trước', true);
            return;
          }
          var text = fillTpl(t.body, { name: b.name, tour: tourFor($('eDest').value) });
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () {
              toast('Đã sao chép. Dán vào Zalo hoặc tin nhắn.');
            }, function () {
              toast('Không sao chép được', true);
            });
          } else {
            toast('Trình duyệt không cho sao chép', true);
          }
        };
      }).catch(function () {});
    }
    if (isNew) {
      $('dCancel').onclick = function () {
        closeDrawer();
      };
    }
    if (!isNew) {
      if (!masked) {
        $('sameCust').onclick = function () {
          closeDrawer();
        };
      }
      if (!masked) {
        $('copyPhone').onclick = function () {
          var done = function () {
            toast('Đã sao chép ' + b.phone);
          };
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(b.phone).then(done, function () {
              toast('Không sao chép được', true);
            });
          } else {
            toast('Trình duyệt không cho sao chép', true);
          }
        };
      }
      $('del').onclick = function () {
        confirmBox('Xoá đơn của ' + b.name + '? Không thể khôi phục.', {
          title: 'Xoá đơn',
          ok: 'Xoá đơn',
          danger: true
        }).then(function (ok) {
          if (ok) {
            api('/bookings/' + b.id, { method: 'DELETE' }).then(function () {
              toast('Đã xoá đơn');
              closeDrawer(true);
            }).catch(function (ex) {
              toast(ex.message, true);
            });
          }
        });
      };
    }
    $('seg').onclick = function (e) {
      var btn = e.target.closest('button');
      if (!btn || btn.getAttribute('aria-pressed') === 'true') {
        return;
      }
      var mark = function (s) {
        $('seg').querySelectorAll('button').forEach(function (x) {
          x.setAttribute('aria-pressed', x.dataset.s === s);
        });
      };
      if (isNew) {
        newStatus = btn.dataset.s;
        mark(newStatus);
        return;
      }
      patch(b, { status: btn.dataset.s }, 'Đã chuyển sang “' + STATUS[btn.dataset.s] + '”', function (row) {
        mark(row.status);
      });
    };
    $('save').onclick = function () {
      var btn = this;
      btn.disabled = true;
      if (isNew) {
        var body = fields();
        body.status = newStatus;
        api('/bookings', { method: 'POST', body: body }).then(function () {
          toast('Đã tạo đơn');
          closeDrawer(true);
        })
          .catch(function (ex) {
          toast(ex.message, true);
          btn.disabled = false;
        });
      } else {
        patch(b, fields(), 'Đã lưu thay đổi', function (row) {
          $('drawerTitle').textContent = row.name;
          btn.disabled = false;
        }, function () {
          btn.disabled = false;
        });
      }
    };
  }
  function patch(b, body, okMsg, done, fail) {
    api('/bookings/' + b.id, { method: 'PATCH', body: body }).then(function (row) {
      Object.assign(b, row);
      toast(okMsg);
      if (done) {
        done(row);
      }
      if (onChanged) {
        var f = onChanged;
        onChanged = null;
        changedLater = f;
      }
    }).catch(function (ex) {
      toast(ex.message, true);
      if (fail) {
        fail();
      }
    });
  }
  var changedLater = null;
  function closeDrawer(refresh) {
    if ($('drawer').hidden) {
      return;
    }
    $('drawer').hidden = true;
    $('scrim').hidden = true;
    var f = changedLater || (refresh === true ? onChanged : null);
    changedLater = null;
    onChanged = null;
    if (drawerOpener && document.body.contains(drawerOpener)) {
      drawerOpener.focus();
    }
    if (f) {
      f();
    }
  }
  $('scrim').onclick = function () {
    closeDrawer();
  };
  document.addEventListener('keydown', function (e) {
    var d = $('drawer');
    if (d.hidden) {
      return;
    }
    if (e.key === 'Escape') {
      closeDrawer();
      return;
    }
    if (e.key === 'Tab') { // giữ phím Tab trong ngăn chi tiết
      var f = d.querySelectorAll('a[href],button:not([disabled]),textarea,input,select');
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  /* ---------- Thanh bên: thu gọn nảy (máy tính) / trượt ra nảy (điện thoại) ---------- */
  var appEl = $('app'), sideEl = $('side'), phoneMQ = window.matchMedia('(max-width: 760px)'), bumpT;
  function bump() {
    sideEl.classList.remove('bump');
    void sideEl.offsetWidth;
    sideEl.classList.add('bump');
    clearTimeout(bumpT);
    bumpT = setTimeout(function () {
      sideEl.classList.remove('bump');
    }, 900);
  }
  function setCollapsed(on, save) {
    appEl.classList.toggle('collapsed', on);
    $('sideToggle').setAttribute('aria-expanded', String(!on));
    $('sideToggle').setAttribute('aria-label', on ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên');
    if (save !== false) {
      bump();
      try {
        localStorage.setItem('vdk-side', on ? '1' : '0');
      } catch (e) {}
    }
  }
  function openSide(on) {
    appEl.classList.toggle('side-open', on);
    $('sideScrim').hidden = !on;
    $('menuBtn').setAttribute('aria-expanded', String(on));
    if (on) {
      bump();
    }
  }
  function closeSideMobile() {
    if (appEl.classList.contains('side-open')) {
      openSide(false);
    }
  }
  $('sideToggle').onclick = function () {
    if (phoneMQ.matches) {
      openSide(false);
    } else {
      setCollapsed(!appEl.classList.contains('collapsed'));
    }
  };
  $('menuBtn').onclick = function () {
    openSide(!appEl.classList.contains('side-open'));
  };
  $('sideScrim').onclick = function () {
    openSide(false);
  };
  try {
    if (localStorage.getItem('vdk-side') === '1') {
      setCollapsed(true, false);
    }
  } catch (e) {}
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && appEl.classList.contains('side-open')) {
      openSide(false);
    }
    if (e.key === '[' && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && !$('app').hidden && $('drawer').hidden) {
      $('sideToggle').click();
    }
  });
  if (phoneMQ.addEventListener) {
    phoneMQ.addEventListener('change', function () {
      openSide(false);
    });
  }

  /* ---------- Tự làm mới mỗi 60 giây khi đang xem tab ---------- */
  setInterval(function () {
    if (document.hidden || $('app').hidden || !$('drawer').hidden) {
      return;
    }
    if (view === 'overview') {
      renderOverview(true);
    } else if (view === 'bookings') {
      loadChips();
      loadList(true);
    } else if (view === 'departures') {
      renderDepartures();
    }
  }, 60000);

  /* Phím tắt: "/" để tìm kiếm */
  document.addEventListener('keydown', function (e) {
    var t = e.target.tagName;
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(t) && $('fq')) {
      e.preventDefault();
      $('fq').focus();
    }
  });

  /* ---------- Khởi động ---------- */
  loadMe().then(function () {
    showApp();
    pollMsgBadge();
  }).catch(function () {
    showLogin();
  });
})();
