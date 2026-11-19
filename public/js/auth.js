/* Việt Du Ký – đăng ký, đăng nhập, xác minh email, trang tài khoản */
(function () {
  'use strict';

  function $(s, r) {
    return (r || document).querySelector(s);
  }
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

  function api(path, body) {
    return fetch('/api/auth/' + path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (res) {
      return res.json().catch(function () {
        return {};
      }).then(function (d) {
        if (!res.ok) {
          var e = new Error(d.error || 'Có lỗi xảy ra. Vui lòng thử lại.');
          e.code = d.code;
          throw e;
        }
        return d;
      });
    }, function () {
      throw new Error('Mất kết nối mạng. Vui lòng thử lại.');
    });
  }

  /* Chỉ cho quay về trang cùng website (đường dẫn dạng /contact), tránh chuyển hướng ra ngoài */
  var nextParam = (new URLSearchParams(location.search).get('next') || '').replace(/^([a-z0-9_\-]+)\.html/i, '/$1').replace(/^\/?index(?=$|[?#])/i, '/');
  var safeNext = /^\/(?!\/)[a-z0-9_\-]*(\?[^#]*)?(#.*)?$/i.test(nextParam) ? nextParam : '';
  document.querySelectorAll('[data-keepnext]').forEach(function (a) {
    if (safeNext) {
      a.href += '?next=' + encodeURIComponent(safeNext);
    }
  });

  var card = $('#card');

  /* Nút hiện / ẩn mật khẩu */
  document.querySelectorAll('.pw-toggle').forEach(function (btn) {
    btn.onclick = function () {
      var input = btn.parentNode.querySelector('input');
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-label', show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
      btn.firstChild.textContent = show ? 'visibility_off' : 'visibility';
    };
  });

  /* Nút gửi lại có đếm ngược 60 giây */
  function resendButton(btn, email, onMsg) {
    var t;
    function cooldown(sec) {
      clearInterval(t);
      btn.disabled = true;
      var left = sec;
      btn.textContent = 'Gửi lại sau ' + left + ' giây';
      t = setInterval(function () {
        left--;
        if (left <= 0) {
          clearInterval(t);
          btn.disabled = false;
          btn.textContent = 'Gửi lại email';
        } else {
          btn.textContent = 'Gửi lại sau ' + left + ' giây';
        }
      }, 1000);
    }
    btn.onclick = function () {
      btn.disabled = true;
      btn.textContent = 'Đang gửi…';
      api('resend', { email: email }).then(function () {
        onMsg('Đã gửi lại. Hãy kiểm tra hộp thư (cả mục Spam).');
        cooldown(60);
      }).catch(function (ex) {
        onMsg(ex.message, true);
        btn.disabled = false;
        btn.textContent = 'Gửi lại email';
      });
    };
    return cooldown;
  }

  function stateHTML(icon, cls, title, text) {
    return '<div class="auth-state ' + cls + '"><span class="ms">' + icon + '</span><h2>' + title + '</h2><p>' +
      text + '</p>';
  }

  /* ---------- Đăng ký ---------- */
  function showSent(email, warn) {
    card.innerHTML = stateHTML('mark_email_read', '', 'Kiểm tra hộp thư của bạn', 'Chúng tôi đã gửi email xác minh tới <b>' +
      esc(email) + '</b>. Bấm nút trong email để hoàn tất. Không thấy thư? Hãy xem mục Spam.') +
      (warn ? '<p class="auth-err">' + esc(warn) + '</p>' : '') +
      '<p class="auth-note" id="note" role="status"></p>' +
      '<button class="btn line" id="again" type="button">Gửi lại email</button>' +
      '<p class="auth-foot"><a href="/register">Dùng email khác</a> · <a href="/login">Đăng nhập</a></p></div>';
    var note = $('#note');
    var start = resendButton($('#again'), email, function (m, isErr) {
      note.textContent = m;
      note.className = 'auth-note' + (isErr ? ' bad' : '');
    });
    if (!warn) {
      start(60);
    }
  }

  /* Vào trang tài khoản (hoặc trang đang xem dở) sau khi đăng nhập xong */
  function goHome() {
    try {
      sessionStorage.setItem('vdk-just-login', '1'); // để trang tài khoản biết nếu phiên bị từ chối ngay sau khi đăng nhập
    } catch (e) {}
    location.href = safeNext || '/account';
  }

  /* ---------- Biểu mẫu đăng ký / đăng nhập ---------- */
  var form = $('form[data-auth]');
  if (form) {
    var mode = form.dataset.auth;
    var err = $('.auth-err', form);
    var btn = $('button.btn', form);

    /* Đăng nhập nhanh: Google và passkey (chỉ hiện khi dùng được) */
    if ((mode === 'login' || mode === 'register') && window.vdkMfa) {
      (function () {
        var mfa = vdkMfa.create('/api/auth/mfa');
        var alt = document.createElement('div');
        alt.className = 'mfa-alt';
        var or = document.createElement('p');
        or.className = 'mfa-or';
        or.innerHTML = '<span>hoặc</span>';
        var gbox = document.createElement('div');
        gbox.className = 'mfa-google';
        alt.appendChild(or);
        alt.appendChild(gbox);
        function showErr(t) {
          err.textContent = t;
          err.hidden = false;
        }
        if (mode === 'login' && mfa.passkeySupported()) {
          var pk = document.createElement('button');
          pk.type = 'button';
          pk.className = 'mfa-btn block';
          pk.textContent = 'Đăng nhập bằng passkey';
          pk.onclick = function () {
            err.hidden = true;
            pk.disabled = true;
            mfa.passkeyLogin().then(goHome, function (ex) {
              showErr(mfa.describe(ex));
              pk.disabled = false;
            });
          };
          alt.appendChild(pk);
        }
        form.parentNode.insertBefore(alt, form.nextSibling);
        mfa.googleButton(gbox, goHome, showErr).then(function (ok) {
          if (!ok) {
            gbox.remove();
            if (mode === 'register' || !alt.querySelector('.mfa-btn')) {
              alt.remove();
            }
          }
        });
      })();
    }

    form.onsubmit = function (e) {
      e.preventDefault();
      var body = {};
      new FormData(form).forEach(function (v, k) {
        body[k] = v;
      });
      err.hidden = true;
      if (!form.checkValidity()) {
        err.textContent = 'Vui lòng điền đủ và đúng các ô.';
        err.hidden = false;
        return;
      }

      if (window.vdkTS && form.querySelector('.ts-box') && !vdkTS.ready(form)) {
        err.textContent = 'Đang xác minh bạn không phải robot, vui lòng đợi vài giây rồi bấm lại.';
        err.hidden = false;
        return;
      }
      var label = btn.textContent;
      btn.disabled = true;
      btn.textContent = mode === 'register' ? 'Đang tạo tài khoản…' : mode === 'login' ? 'Đang đăng nhập…' : 'Đang gửi…';

      if (mode === 'reset') {
        body.token = new URLSearchParams(location.search).get('token') || '';
      }
      api(mode, body).then(function (d) {
        if (mode === 'login' && d && d.mfa && window.vdkMfa) {
          // đã bật xác thực hai lớp: nhập mã Authenticator hoặc dùng passkey rồi mới vào
          vdkMfa.create('/api/auth/mfa').challengeUI(card, d, goHome, function () {
            location.reload();
          });
          return;
        }
        if (mode === 'register') {
          showSent(body.email.trim().toLowerCase());
        } else if (mode === 'forgot') {
          card.innerHTML = stateHTML('mark_email_read', '', 'Kiểm tra hộp thư', 'Nếu <b>' +
            esc(body.email.trim()) +
            '</b> đã có tài khoản, chúng tôi vừa gửi liên kết đặt lại mật khẩu (có hiệu lực 1 giờ). Không thấy thư? Hãy xem mục Spam.') +
            '<a class="btn line" href="/login">Quay lại đăng nhập</a></div>';
        } else if (mode === 'reset') {
          card.innerHTML = stateHTML('check_circle', 'ok', 'Đã đổi mật khẩu', 'Bạn có thể đăng nhập bằng mật khẩu mới.') +
            '<a class="btn gold" href="/login">Đăng nhập</a></div>';
        } else {
          goHome();
        }
      }).catch(function (ex) {
        if (mode === 'register' && ex.code === 'mail_failed') {
          showSent(body.email.trim().toLowerCase(), ex.message);
          return;
        }
        err.textContent = ex.message;
        err.hidden = false;
        if (window.vdkTS) {
          vdkTS.reset(form);
        }
        var box = $('.auth-resend');
        if (box) {
          box.hidden = ex.code !== 'unverified';
          if (ex.code === 'unverified') {
            var rb = $('#resendBtn'), email = body.email.trim().toLowerCase();
            resendButton(rb, email, function (m, isErr) {
              err.textContent = m;
              err.className = 'auth-err' + (isErr ? '' : ' okmsg');
              err.hidden = false;
            });
          }
        }
        btn.disabled = false;
        btn.textContent = label;
      });
    };
  }

  /* ---------- Trang xác minh email ---------- */
  var st = $('#state');
  if (st && /\/verify(\.html)?\/?$/.test(location.pathname)) {
    var token = new URLSearchParams(location.search).get('token') || '';
    history.replaceState(null, '', location.pathname); // bỏ mã khỏi thanh địa chỉ
    if (!token) {
      card.innerHTML = stateHTML('error', 'bad', 'Liên kết không hợp lệ', 'Hãy mở lại liên kết trong email, hoặc đăng nhập để gửi lại email xác minh mới.') +
        '<a class="btn" href="/login">Đến trang đăng nhập</a></div>';
    } else {
      api('verify', { token: token }).then(function () {
        card.innerHTML = stateHTML('check_circle', 'ok', 'Xác minh thành công', 'Email của bạn đã được xác minh. Bây giờ bạn có thể đăng nhập.') +
          '<a class="btn gold" href="/login">Đăng nhập</a></div>';
      }).catch(function (ex) {
        card.innerHTML = stateHTML('error', 'bad', ex.code === 'expired' ? 'Liên kết đã hết hạn' : 'Không xác minh được', esc(ex.message)) +
          '<a class="btn" href="/login">Đến trang đăng nhập</a></div>';
      });
    }
  }

  /* ---------- Tên hiển thị của mục yêu thích ---------- */
  var FAV = {
    'du-thuyen-ha-long': ['Du thuyền Hạ Long', '/#tour'],
    'da-nang-hoi-an-hue': ['Đà Nẵng – Hội An – Huế', '/#tour'],
    'phu-quoc-nghi-duong': ['Phú Quốc nghỉ dưỡng', '/#tour']
  };
  var TOURNAME = {};
  if (window.fetch) {
    fetch('/api/tours').then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (d) {
      if (d && d.items) {
        d.items.forEach(function (t) {
          TOURNAME[t.slug] = t;
        });
      }
    }).catch(function () {});
  }
  function favInfo(k) {
    var t = TOURNAME[k];
    if (t) {
      return [t.name, '/contact?destination=' + encodeURIComponent(t.name)];
    }
    return FAV[k] || [k, '/contact?destination=' + encodeURIComponent(k)];
  }

  /* ---------- Đơn của khách ---------- */
  var STATUS = {
    new: ['Đã nhận', 'new'],
    called: ['Đã liên hệ', 'called'],
    won: ['Đã chốt', 'won'],
    cancelled: ['Đã huỷ', 'cancelled']
  };
  function fmtDate(ms) {
    var d = new Date(ms);
    return d.toLocaleDateString('vi-VN');
  }
  function fmtDay(s) {
    return s ? s.split('-').reverse().join('/') : '';
  }
  /* Danh sách thiết bị đang đăng nhập + đăng xuất từng thiết bị */
  function loadSessions() {
    var list = $('#sessList'), msg = $('#sessMsg');
    function fail(ex) {
      msg.textContent = ex.message;
      msg.className = 'auth-err';
      msg.hidden = false;
    }
    function render(items) {
      list.innerHTML = '';
      items.forEach(function (it) {
        var li = document.createElement('li');
        var when = new Date(it.last_seen).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
        var info = document.createElement('div');
        var b = document.createElement('b');
        b.textContent = it.label + (it.current ? ' (thiết bị này)' : '');
        var small = document.createElement('small');
        small.textContent = [it.ip, it.country, 'dùng lần cuối ' + when].filter(Boolean).join(' · ');
        info.appendChild(b);
        info.appendChild(document.createElement('br'));
        info.appendChild(small);
        li.appendChild(info);
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn line sm';
        btn.textContent = it.current ? 'Đăng xuất' : 'Gỡ';
        btn.onclick = function () {
          api('sessions/revoke', { id: it.id }).then(function () {
            if (it.current) {
              location.href = '/login';
            } else {
              load();
            }
          }).catch(fail);
        };
        li.appendChild(btn);
        list.appendChild(li);
      });
    }
    function load() {
      msg.hidden = true;
      fetch('/api/auth/sessions', { credentials: 'same-origin' }).then(function (r) {
        return r.json();
      }).then(function (d) {
        render(d.items || []);
        $('#sessAll').hidden = (d.items || []).length < 2;
      }).catch(fail);
    }
    $('#sessAll').onclick = function () {
      api('sessions/revoke', { all: true }).then(load).catch(fail);
    };
    load();
  }

  function loadOrders() {
    var box = $('#orders'), note = $('#ordersNote');
    fetch('/api/auth/bookings', { credentials: 'same-origin' }).then(function (r) {
      return r.json();
    }).then(function (d) {
      var items = d.items || [];
      if (!items.length) {
        note.innerHTML = 'Bạn chưa có đơn nào. <a href="/contact">Đặt tour ngay</a>';
        return;
      }
      note.remove();
      box.insertAdjacentHTML('beforeend', '<ul class="order-list">' + items.map(function (o) {
        var st = STATUS[o.status] || STATUS.new;
        var meta = [o.depart_date ? 'Đi ngày ' + fmtDay(o.depart_date) : '', o.people ? o.people + ' người' : ''].filter(Boolean).join(' · ');
        return '<li><div><b>' + esc(o.destination || 'Chưa chọn điểm đến') + '</b><small>Gửi ngày ' + fmtDate(o.created_at) + (meta ? ' · ' +
          esc(meta) : '') + '</small>' +
          (o.message ? '<em>' + esc(o.message) + '</em>' : '') +
          (o.status === 'new' ? '<button class="linkbtn" type="button" data-cancel="' + o.id +
            '">Huỷ đơn này</button>' : '') +
          '</div><span class="pill ' + st[1] + '">' + st[0] + '</span></li>';
      }).join('') + '</ul>');
      box.querySelectorAll('[data-cancel]').forEach(function (b) {
        b.onclick = function () {
          if (!confirm('Huỷ đơn đặt tour này?')) {
            return;
          }
          b.disabled = true;
          api('bookings/cancel', { id: Number(b.dataset.cancel) }).then(function () {
            box.querySelector('.order-list').remove();
            note = document.createElement('p');
            note.id = 'ordersNote';
            note.className = 'auth-note';
            note.textContent = 'Đang tải…';
            box.appendChild(note);
            loadOrders();
          })
            .catch(function (ex) {
            b.disabled = false;
            alert(ex.message);
          });
        };
      });
    }).catch(function () {
      note.textContent = 'Không tải được danh sách đơn.';
      note.className = 'auth-note bad';
    });
  }

  function loadFavorites() {
    var box = $('#favs');
    fetch('/api/tours').then(function (r) {
      return r.ok ? r.json() : null;
    }).catch(function () {
      return null;
    }).then(function (td) {
      if (td && td.items) {
        td.items.forEach(function (t) {
          TOURNAME[t.slug] = t;
        });
      }
      return fetch('/api/auth/favorites', { credentials: 'same-origin' });
    }).then(function (r) {
      return r.json();
    }).then(function (d) {
      var items = d.items || [];
      box.innerHTML = items.length ? '<ul class="fav-list">' + items.map(function (k) {
        var f = favInfo(k);
        return '<li><a href="' + f[1] + '"><span class="ms fill">favorite</span>' + esc(f[0]) +
          '</a><button type="button" class="linkbtn" data-unfav="' + esc(k) + '">Bỏ</button></li>';
      }).join('') + '</ul>' : '<p class="auth-note">Chưa có mục nào. Bấm biểu tượng trái tim ở điểm đến hoặc tour để lưu lại.</p>';
      box.querySelectorAll('[data-unfav]').forEach(function (b) {
        b.onclick = function () {
          api('favorite', { item: b.dataset.unfav, on: false }).then(loadFavorites).catch(function () {});
        };
      });
    }).catch(function () {
      box.innerHTML = '<p class="auth-note bad">Không tải được danh sách yêu thích.</p>';
    });
  }

  /* Biểu mẫu nhỏ trong thẻ tài khoản (sửa hồ sơ, đổi mật khẩu) */
  function inlineForm(el, path, onOk) {
    var msg = $('.auth-err', el);
    el.onsubmit = function (e) {
      e.preventDefault();
      var body = {};
      new FormData(el).forEach(function (v, k) {
        body[k] = v;
      });
      var b = $('button.btn', el);
      b.disabled = true;
      msg.hidden = true;
      api(path, body).then(function (d) {
        msg.textContent = 'Đã lưu.';
        msg.className = 'auth-err okmsg';
        msg.hidden = false;
        if (path !== 'profile') {
          el.reset();
        }
        if (onOk) {
          onOk(d);
        }
      }).catch(function (ex) {
        msg.textContent = ex.message;
        msg.className = 'auth-err';
        msg.hidden = false;
      })
        .then(function () {
        b.disabled = false;
      });
    };
  }

  /* ---------- Trang tài khoản ---------- */
  if (st && /\/account(\.html)?\/?$/.test(location.pathname)) {
    fetch('/api/auth/me', { credentials: 'same-origin' }).then(function (r) {
      return r.json();
    }).then(function (d) {
      if (!d.user) {
        /* Báo rõ lý do thay vì tự quay về đăng nhập (tránh vòng lặp khó hiểu) */
        var WHY = {
          no_cookie: ['Trình duyệt không gửi cookie đăng nhập', 'Hãy kiểm tra trình duyệt có đang chặn cookie không, tắt tiện ích chặn theo dõi/quảng cáo cho trang này, hoặc không dùng chế độ riêng tư rồi đăng nhập lại.'],
          device: ['Phiên đăng nhập không khớp với trình duyệt này', 'Vì lý do bảo mật, phiên chỉ dùng được trên đúng trình duyệt và hệ điều hành đã đăng nhập. Hãy đăng nhập lại.'],
          country: ['Địa chỉ mạng của bạn vừa đổi quốc gia', 'Có thể bạn đang bật VPN/proxy hoặc đổi mạng. Hãy tắt VPN rồi đăng nhập lại.'],
          error: ['Máy chủ chưa xử lý được phiên đăng nhập', 'Vui lòng thử lại sau ít phút.']
        };
        WHY.unknown_session = ['Máy chủ không tìm thấy phiên vừa tạo', 'Phiên có thể đã bị xoá khi đăng nhập ở nơi khác, hoặc cơ sở dữ liệu chưa lưu được phiên. Hãy đăng nhập lại; nếu vẫn lỗi, báo quản trị viên kiểm tra bảng user_sessions.'];
        WHY.expired = ['Phiên đăng nhập đã hết hạn', 'Hãy đăng nhập lại.'];
        WHY.blocked = ['Tài khoản này đã bị khoá', 'Vui lòng liên hệ hotline 1900 1234.'];
        WHY.unverified = ['Email này chưa được xác minh', 'Hãy mở email xác minh rồi đăng nhập lại.'];
        var justLogin = false;
        try {
          justLogin = sessionStorage.getItem('vdk-just-login') === '1';
          sessionStorage.removeItem('vdk-just-login');
        } catch (e) {}
        var w = WHY[d.why];
        /* Vừa đăng nhập xong mà bị từ chối: nói rõ lý do (kèm mã) thay vì lặng lẽ quay về trang đăng nhập */
        if (w || justLogin) {
          w = w || ['Đăng nhập chưa được ghi nhận', 'Trình duyệt chưa giữ được phiên đăng nhập. Hãy thử lại.'];
          card.innerHTML = stateHTML('error', 'bad', w[0], w[1] + '<br><small>Mã lỗi: ' +
            esc(d.why || 'khong_ro') + '</small>') +
            '<a class="btn gold" href="/login?next=%2Faccount">Đăng nhập lại</a></div>';
          return;
        }
        location.replace('/login?next=%2Faccount');
        return;
      }
      var u = d.user;
      card.classList.add('wide');
      card.innerHTML = '<h2>Xin chào, ' + esc(u.name.trim().split(/\s+/).pop()) + '</h2><p class="sub">Tài khoản đã được xác minh.</p>' +
        '<div class="avbox"><div class="avbig" id="avBig"></div><div class="avbtns"><button class="btn line sm av-change" id="avBtn" type="button"><span class="ms">add_a_photo</span>Đổi ảnh đại diện</button><button class="av-del" id="avDel" type="button" hidden><span class="ms">delete</span>Gỡ ảnh</button><input type="file" id="avFile" accept="image/*" hidden><p class="auth-note" id="avMsg"></p></div></div>' +
        '<ul class="acct" id="acct">' +
        '<li><span class="ms">person</span><span><small>Họ và tên</small><b id="aName">' + esc(u.name) + '</b></span></li>' +
        '<li><span class="ms">mail</span><span><small>Email</small><b>' + esc(u.email) + '</b></span></li>' +
        '<li><span class="ms">call</span><span><small>Số điện thoại</small><b id="aPhone">' + esc(u.phone || '–') + '</b></span></li></ul>' +
        '<div class="acct-btns"><a class="btn gold" href="/contact">Đặt tour</a><a class="btn line" href="/reviews">Viết đánh giá</a></div>' +
        '<div class="orders" id="orders"><h3>Đơn đặt tour của bạn</h3><p class="auth-note" id="ordersNote">Đang tải…</p></div>' +
        '<div class="orders"><h3>Yêu thích</h3><div id="favs"><p class="auth-note">Đang tải…</p></div></div>' +
        '<details class="acc-sec"><summary>Sửa thông tin<span class="ms">expand_more</span></summary>' +
        '<form class="ct" id="profileForm"><label class="pf"><span>Họ và tên</span><input name="name" maxlength="80" required value="' + esc(u.name) + '"/></label><label class="pf"><span>Số điện thoại</span><input name="phone" type="tel" maxlength="20" required value="' + esc(u.phone || '') + '"/></label><p class="auth-err" role="alert" hidden></p><button class="btn block">Lưu thông tin</button></form></details>' +
        '<details class="acc-sec"><summary>' + (u.has_password ? 'Đổi mật khẩu' : 'Đặt mật khẩu') + '<span class="ms">expand_more</span></summary>' +
        (u.has_password ? '' : '<p class="auth-note">Tài khoản này đăng nhập bằng Google. Đặt mật khẩu để dùng cả email, lấy lại tài khoản bằng “Quên mật khẩu”, tải dữ liệu và xoá tài khoản.</p>') +
        '<form class="ct" id="passForm"><input aria-label="Mật khẩu hiện tại" name="current" type="password" autocomplete="current-password" maxlength="128' + (u.has_password ? '" required' : '"') + ' placeholder="' + (u.has_password ? 'Mật khẩu hiện tại' : 'Mã 6 số Authenticator (bỏ trống nếu chưa bật)') + '"/><input aria-label="Mật khẩu mới" name="password" type="password" autocomplete="new-password" data-pass-new="" minlength="10" maxlength="128" required placeholder="Mật khẩu mới (ít nhất 10 ký tự)"/><p class="auth-err" role="alert" hidden></p><button class="btn block">' + (u.has_password ? 'Đổi mật khẩu' : 'Đặt mật khẩu') + '</button></form></details>' +
        (u.delete_at ? '<div class="del-note"><b>Tài khoản đang chờ xoá</b><p>Sẽ xoá hoàn toàn vào ' +
          new Date(u.delete_at).toLocaleDateString('vi-VN') +
          '. Đăng nhập lại và bấm huỷ nếu bạn đổi ý.</p><button class="btn gold sm" id="delCancel" type="button">Huỷ yêu cầu xoá</button></div>' : '') +
        '<details class="acc-sec" id="mfaSec"><summary>Bảo mật nâng cao (xác thực hai lớp)<span class="ms">expand_more</span></summary><div class="priv" id="mfaBox"></div></details>' +
        '<details class="acc-sec" id="sessSec"><summary>Thiết bị đăng nhập<span class="ms">expand_more</span></summary><div class="priv"><p class="auth-note">Những thiết bị đang đăng nhập tài khoản này. Thấy thiết bị lạ thì đăng xuất nó và đổi mật khẩu ngay.</p><ul class="sess-list" id="sessList"></ul><p class="auth-err" id="sessMsg" role="alert" hidden></p><button class="btn line sm" id="sessAll" type="button"><span class="ms">devices</span>Đăng xuất mọi thiết bị khác</button></div></details>' +
        '<details class="acc-sec"><summary>Dữ liệu &amp; quyền riêng tư<span class="ms">expand_more</span></summary><div class="priv">' +
        '<p class="auth-note">Tải về bản sao thông tin tài khoản, đơn đặt tour, yêu thích, đánh giá và tin nhắn của bạn (file JSON).</p><form class="ct" id="dataForm"><input aria-label="Mật khẩu" name="current" type="password" autocomplete="current-password" maxlength="128' + (u.has_password ? '" required' : '"') + ' placeholder="Nhập mật khẩu để tải dữ liệu"/><p class="auth-err" role="alert" hidden></p><button class="btn line sm"><span class="ms">download</span>Yêu cầu dữ liệu của tôi</button></form>' +
        (u.delete_at ? '' : '<hr><p class="auth-note">Xoá tài khoản: tài khoản được giữ <b>30 ngày</b> rồi mới xoá hoàn toàn (đơn đặt tour giữ lại ở dạng ẩn danh). Trong 30 ngày bạn có thể huỷ yêu cầu.</p><form class="ct" id="delForm"><input aria-label="Mật khẩu" name="current" type="password" autocomplete="current-password" maxlength="128' +
          (u.has_password ? '" required' : '"') +
          ' placeholder="Nhập mật khẩu để xác nhận"/><p class="auth-err" role="alert" hidden></p><button class="btn danger block">Yêu cầu xoá tài khoản</button></form>') +
        '</div></details>' +
        '<div class="acct-out"><button class="btn line sm" id="logout" type="button"><span class="ms">logout</span>Đăng xuất</button></div>';
      loadOrders();
      loadFavorites();
      (function security() {
        var sec = $('#mfaSec');
        if (!sec || !window.vdkMfa) {
          return;
        }
        sec.addEventListener('toggle', function once() {
          if (sec.open) {
            sec.removeEventListener('toggle', once);
            vdkMfa.create('/api/auth/mfa').settingsUI($('#mfaBox'));
          }
        });
      })();
      (function avatars() {
        var big = $('#avBig'), msg = $('#avMsg'), del = $('#avDel'), cur = u.avatar || '';
        function paint() {
          big.innerHTML = cur ? '<img src="' + esc(cur) + '" alt="Ảnh đại diện">' : '<span>' +
            esc(u.name.trim().charAt(0).toUpperCase()) + '</span>';
          del.hidden = !cur;
        }
        function call(path, body) {
          return fetch('/api/auth/' + path, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          }).then(function (r) {
            return r.json().then(function (d) {
              if (!r.ok) {
                throw new Error(d.error || 'Có lỗi xảy ra.');
              }
              return d;
            });
          });
        }
        paint();
        fetch('/api/auth/avatars', { credentials: 'same-origin' }).then(function (r) {
          return r.ok ? r.json() : null;
        }).then(function (d) {
          if (d) {
            cur = d.current || '';
            paint();
          }
        }).catch(function () {});
        $('#avBtn').onclick = function () {
          $('#avFile').click();
        };
        $('#avFile').onchange = function () {
          var file = this.files[0];
          if (!file) {
            return;
          }
          var b = $('#avBtn');
          b.disabled = true;
          msg.textContent = 'Đang tải ảnh lên…';
          window.ikUpload(file, '/api/auth/imagekit', 512, true).then(function (r) {
            return call('avatar', { url: r.url, fileId: r.fileId });
          })
            .then(function (d) {
            cur = d.avatar;
            paint();
            msg.textContent = 'Đã cập nhật ảnh đại diện (ảnh mới thay ảnh cũ).';
          }).catch(function (ex) {
            msg.textContent = ex.message;
          })
            .then(function () {
            b.disabled = false;
            $('#avFile').value = '';
          });
        };
        del.onclick = function () {
          if (!confirm('Gỡ ảnh đại diện?')) {
            return;
          }
          call('avatar/delete', {}).then(function () {
            cur = '';
            paint();
            msg.textContent = 'Đã gỡ ảnh đại diện.';
          }).catch(function (ex) {
            msg.textContent = ex.message;
          });
        };
      })();
      inlineForm($('#profileForm'), 'profile', function (r) {
        $('#aName').textContent = r.user.name;
        $('#aPhone').textContent = r.user.phone || '–';
        $('#profileForm').elements.name.value = r.user.name;
        $('#profileForm').elements.phone.value = r.user.phone || '';
      });
      inlineForm($('#passForm'), 'password');
      if (window.vdkApplyRules) {
        window.vdkApplyRules();
      }
      $('#dataForm').onsubmit = function (e) {
        e.preventDefault();
        var form = e.target, msg = $('.auth-err', form), btn = $('button', form);
        btn.disabled = true;
        msg.hidden = true;
        fetch('/api/auth/export', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ current: form.current.value })
        }).then(function (res) {
          if (!res.ok) {
            return res.json().catch(function () {
              return {};
            }).then(function (d) {
              throw new Error(d.error || 'Không tải được dữ liệu. Vui lòng thử lại.');
            });
          }
          return res.blob();
        }).then(function (blob) {
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'du-lieu-viet-du-ky.json';
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(function () {
            URL.revokeObjectURL(a.href);
          }, 2000);
          form.reset();
        }).catch(function (ex) {
          msg.textContent = ex.message;
          msg.className = 'auth-err';
          msg.hidden = false;
        }).then(function () {
          btn.disabled = false;
        });
      };
      loadSessions();
      if ($('#delForm')) {
        inlineForm($('#delForm'), 'delete-request', function () {
          location.reload();
        });
      }
      if ($('#delCancel')) {
        $('#delCancel').onclick = function () {
          api('delete-cancel').then(function () {
            location.reload();
          }).catch(function (ex) {
            alert(ex.message);
          });
        };
      }
      $('#logout').onclick = function () {
        api('logout').catch(function () {}).then(function () {
          location.href = '/';
        });
      };
    }).catch(function () {
      card.innerHTML = stateHTML('error', 'bad', 'Không tải được', 'Kiểm tra kết nối mạng rồi tải lại trang.') +
        '</div>';
    });
  }
})();
