/* Cloudflare Turnstile (widget đã tạo sẵn). Site key công khai; secret chỉ ở Worker. */
(function () {
  'use strict';
  var KEY = '0x4AAAAAAGBeoGyZaT3JewGo', loading = null, ids = new WeakMap();
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
      if (!box || ids.has(box)) {
        return;
      }
      ids.set(box, null);
      load().then(function () {
        if (!window.turnstile) {
          box.textContent = 'Không tải được khung xác minh. Hãy kiểm tra mạng rồi tải lại trang.';
          return;
        }
        ids.set(box, window.turnstile.render(box, {
          sitekey: KEY,
          action: action || box.dataset.action,
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
    },
    token: function (el) {
      var b = boxOf(el), id = b && ids.get(b);
      return id != null && window.turnstile ? (window.turnstile.getResponse(id) || '') : '';
    },
    ready: function (el) {
      return !!api.token(el);
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
