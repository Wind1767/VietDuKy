/* Trang hòm thư của khách */
(function () {
  'use strict';
  var box = document.getElementById('inbox');
  if (!box) {
    return;
  }
  var ICON = { booking: 'luggage', bug: 'warning', review: 'star', admin: 'campaign', system: 'mail' };
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function when(ms) {
    var d = new Date(ms);
    return d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
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
  function draw(d) {
    if (!d.items.length) {
      box.innerHTML = '<p class="inbox-empty"><span class="ms">mail</span>Hòm thư trống. Thông báo mới sẽ hiện ở đây.</p>';
      return;
    }
    box.innerHTML = (d.unread ? '<div class="inbox-top"><button class="btn line sm" id="readAll" type="button"><span class="ms">done_all</span>Đánh dấu đã đọc tất cả</button></div>' : '') +
      d.items.map(function (n, i) {
        var l = safe(n.link);
        return '<article class="inbox-item' + (n.read ? '' : ' unread') + '" data-id="' + n.id + '" style="animation-delay:' + Math.min(i, 8) * 0.06 + 's">' +
          '<span class="ms inbox-ic">' + (ICON[n.kind] || 'mail') + '</span><div class="inbox-bd"><h3>' + esc(n.title) + '</h3><time>' + when(n.created_at) + '</time>' +
          (n.body ? '<p>' + esc(n.body) + '</p>' : '') +
          (n.image && /^https:\/\//.test(n.image) ? '<img src="' + esc(n.image) + '" alt="" loading="lazy">' : '') +
          (l ? '<a class="btn line sm" href="' + esc(l) + '">Xem chi tiết</a>' : '') + '</div></article>';
      }).join('');
    var all = document.getElementById('readAll');
    if (all) {
      all.onclick = function () {
        post({ all: true }).then(load);
      };
    }
    box.querySelectorAll('.inbox-item.unread').forEach(function (el) {
      el.addEventListener('click', function () {
        el.classList.remove('unread');
        post({ id: Number(el.dataset.id) });
        var left = box.querySelectorAll('.inbox-item.unread').length;
        setBell(left);
      });
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
  load();
})();
