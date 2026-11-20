/* Trang báo lỗi: gửi biểu mẫu tới /api/bug-report */
(function () {
  'use strict';
  var form = document.getElementById('bugForm');
  if (!form) {
    return;
  }
  var err = form.querySelector('.auth-err'), btn = form.querySelector('button');
  var ref = new URLSearchParams(location.search).get('from') || document.referrer || '';
  if (ref) {
    form.elements.page.value = ref.slice(0, 300);
  }
  function show(text, ok) {
    err.hidden = false;
    err.textContent = text;
    err.className = 'auth-err' + (ok ? ' okmsg' : '');
  }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    err.hidden = true;
    btn.disabled = true;
    var data = {};
    ['title', 'page', 'body', 'contact', 'website'].forEach(function (k) {
      data[k] = form.elements[k].value;
    });
    fetch('/api/bug-report', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(function (r) {
      return r.json().catch(function () {
        return {};
      }).then(function (d) {
        if (!r.ok) {
          throw new Error(d.error || 'Chưa gửi được. Vui lòng thử lại.');
        }
        form.reset();
        show('Cảm ơn bạn! Chúng tôi đã nhận được báo lỗi và sẽ xử lý sớm.', true);
      });
    }).catch(function (ex) {
      show(ex.message || 'Mất kết nối mạng. Vui lòng thử lại.');
    }).then(function () {
      btn.disabled = false;
    });
  });
})();
