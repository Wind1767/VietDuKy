/* Việt Du Ký – đánh giá thật: slider ở trang chủ + trang reviews.html (danh sách, viết đánh giá) */
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
  var STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.6l-6.1 3.5 1.4-6.8-5.1-4.7 6.9-.8z"/></svg>';
  /* Sao hỗ trợ nửa điểm (4,5 sao): mỗi sao có lớp màu cắt theo 0 / 50 / 100% */
  function stars(n) {
    var v = Math.round(Number(n) * 2) / 2;
    var h = '<span class="rv-stars" role="img" aria-label="' + avg(v) + ' trên 5 sao">';
    for (var i = 1; i <= 5; i++) {
      var w = v >= i ? 100 : v >= i - 0.5 ? 50 : 0;
      h += '<span class="s">' + STAR + (w ? '<i style="width:' + w + '%">' + STAR + '</i>' : '') + '</span>';
    }
    return h + '</span>';
  }
  function av(r) {
    return r.avatar ? '<img src="' + esc(r.avatar) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : initial(r.name);
  }
  function initial(name) {
    return esc((String(name || '?').trim().split(/\s+/).pop() || '?').charAt(0).toUpperCase());
  }
  function dmy(ms) {
    return new Date(ms).toLocaleDateString('vi-VN');
  }
  function avg(n) {
    return String(n).replace('.', ',');
  }

  function call(path, opts) {
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
    return fetch(path, init).then(function (res) {
      return res.json().catch(function () {
        return {};
      }).then(function (d) {
        if (!res.ok) {
          var e = new Error(d.error || 'Có lỗi xảy ra. Vui lòng thử lại.');
          e.status = res.status;
          e.code = d.code;
          throw e;
        }
        return d;
      });
    }, function () {
      throw new Error('Mất kết nối mạng. Vui lòng thử lại.');
    });
  }

  /* ---------- Slider ở trang chủ ---------- */
  var box = $('#rvBox');
  if (box) {
    var dots = $('#rvDots'), sum = $('#rvSum');
    call('/api/reviews?size=8').then(function (d) {
      if (!d.items.length) {
        box.innerHTML = '<div class="t on empty"><p>Chưa có đánh giá nào. Hãy là người đầu tiên chia sẻ trải nghiệm của bạn!</p></div>';
        return;
      }
      sum.innerHTML = stars(d.avg) + '<b>' + avg(d.avg) + '/5</b> · ' + d.count +
        ' đánh giá từ khách đã đặt tour';
      sum.hidden = false;
      box.innerHTML = d.items.map(function (r) {
        var text = r.body.length > 220 ? r.body.slice(0, 217).replace(/\s+\S*$/, '') + '…' : r.body;
        return '<div class="t"><div class="rv-av">' + av(r) + '</div>' + stars(r.rating) +
          '<p>“' + esc(text) + '”</p><h4>' + esc(r.name) + (r.destination ? ' · ' + esc(r.destination) : '') + '</h4></div>';
      }).join('');
      var slides = box.querySelectorAll('.t'), current = 0, timer;
      function fit() {
        var h = 0;
        slides.forEach(function (s) {
          h = Math.max(h, s.scrollHeight);
        });
        box.style.minHeight = h + 'px';
      }
      function show(i) {
        current = i;
        slides.forEach(function (s, j) {
          s.classList.toggle('on', j === i);
          if (dots.children[j]) {
            dots.children[j].classList.toggle('on', j === i);
          }
        });
        clearInterval(timer);
        if (slides.length > 1) {
          timer = setInterval(function () {
            show((current + 1) % slides.length);
          }, 6000);
        }
      }
      slides.forEach(function (_, i) {
        var b = document.createElement('button');
        b.setAttribute('aria-label', 'Đánh giá ' + (i + 1));
        b.onclick = function () {
          show(i);
        };
        dots.appendChild(b);
      });
      fit();
      show(0);
      var rz;
      window.addEventListener('resize', function () {
        clearTimeout(rz);
        rz = setTimeout(fit, 150);
      });
    }).catch(function () {
      box.innerHTML = '<div class="t on empty"><p>Không tải được đánh giá lúc này.</p></div>';
    });
  }

  /* ---------- Trang reviews.html ---------- */
  var listEl = $('#rvList');
  if (!listEl) {
    return;
  }

  var page = 1, total = 0, shown = 0;
  var summaryEl = $('#rvSummary'), moreBtn = $('#rvMore'), writeEl = $('#rvWrite');

  function drawSummary(d) {
    if (!d.count) {
      summaryEl.innerHTML = '<div class="rv-none">Chưa có đánh giá nào được duyệt.</div>';
      return;
    }
    var bars = [5, 4, 3, 2, 1].map(function (k) {
      var pct = Math.round((d.dist[k] / d.count) * 100);
      return '<div class="rv-bar"><span>' + k + ' sao</span><i><b style="width:' + pct + '%"></b></i><em>' +
        d.dist[k] + '</em></div>';
    }).join('');
    summaryEl.innerHTML = '<div class="rv-big"><strong>' + avg(d.avg) + '</strong>' + stars(d.avg) + '<small>' +
      d.count + ' đánh giá</small></div><div class="rv-bars">' + bars + '</div>';
  }

  function itemHTML(r) {
    return '<article class="rv-item"><header><div class="rv-av">' + av(r) + '</div><div><b>' + esc(r.name) + '</b>' +
      '<small>' + (r.destination ? '<span class="rv-tour">' + esc(r.destination) + '</span> ' : 'Đã đặt tour · ') + dmy(r.created_at) + '</small></div>' + stars(r.rating) + '</header>' +
      '<p>' + esc(r.body) + '</p>' +
      (r.reply ? '<div class="rv-reply"><b>Phản hồi từ Việt Du Ký</b><p>' + esc(r.reply) + '</p></div>' : '') +
      helpfulHTML(r) + '</article>';
  }

  /* Nút "Đánh giá này có hữu ích không?" + số người thấy hữu ích */
  function helpfulText(n) {
    return n ? n + ' người thấy hữu ích' : 'Chưa có ai bình chọn';
  }

  function helpfulHTML(r) {
    return '<div class="rv-help" data-id="' + r.id + '"><span>Đánh giá này có hữu ích không?</span>' +
      (r.own ? '' : '<button type="button" class="rv-helpbtn' + (r.voted ? ' on' : '') + '" aria-pressed="' + (r.voted ? 'true' : 'false') + '">' +
        '<span aria-hidden="true">👍</span> Hữu ích</button>') +
      '<em class="rv-helpn" data-n="' + (r.helpful || 0) + '">' + helpfulText(r.helpful || 0) + '</em></div>';
  }

  var loggedIn = false;
  listEl.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.rv-helpbtn') : null;
    if (!btn) {
      return;
    }
    if (!loggedIn) {
      location.href = '/login?next=' + encodeURIComponent('/reviews');
      return;
    }
    var box = btn.parentNode, n = box.querySelector('.rv-helpn');
    btn.disabled = true;
    call('/api/reviews/' + box.getAttribute('data-id') + '/helpful', { method: 'POST' }).then(function (d) {
      btn.classList.toggle('on', d.voted);
      btn.setAttribute('aria-pressed', d.voted ? 'true' : 'false');
      n.textContent = helpfulText(d.helpful);
      btn.disabled = false;
    }).catch(function (ex) {
      if (ex.status === 401) {
        location.href = '/login?next=' + encodeURIComponent('/reviews');
        return;
      }
      n.textContent = ex.message;
      btn.disabled = false;
    });
  });

  function load(first) {
    moreBtn.disabled = true;
    call('/api/reviews?size=10&page=' + page).then(function (d) {
      total = d.count;
      loggedIn = !!d.logged_in;
      if (first) {
        listEl.innerHTML = '';
        drawSummary(d);
      }
      listEl.insertAdjacentHTML('beforeend', d.items.map(itemHTML).join(''));
      shown += d.items.length;
      if (first && !d.items.length) {
        listEl.innerHTML = '<div class="rv-none">Hãy là người đầu tiên chia sẻ trải nghiệm của bạn.</div>';
      }
      moreBtn.hidden = shown >= total;
      moreBtn.disabled = false;
    }).catch(function (ex) {
      if (first) {
        listEl.innerHTML = '<div class="rv-none">' + esc(ex.message) + '</div>';
      }
      moreBtn.disabled = false;
    });
  }
  moreBtn.onclick = function () {
    page++;
    load(false);
  };
  load(true);

  /* --- Khung viết đánh giá --- */
  var back = encodeURIComponent('/reviews');
  var STATUS_MSG = {
    pending: ['Đang chờ duyệt', 'Đánh giá của bạn sẽ hiển thị công khai sau khi chúng tôi duyệt.'],
    approved: ['Đã hiển thị', 'Cảm ơn bạn! Đánh giá của bạn đang hiển thị trên website.'],
    rejected: ['Chưa được duyệt', 'Đánh giá chưa phù hợp để hiển thị. Bạn có thể chỉnh sửa và gửi lại.']
  };

  function note(html) {
    writeEl.innerHTML = '<h2>Viết đánh giá</h2>' + html;
  }

  /* Tour khách đã đặt mà chưa có đánh giá: mỗi tour được đánh giá một lần, nhưng khách đánh giá được nhiều tour */
  function freeTours(m) {
    var done = m.reviews.map(function (r) {
      return r.destination;
    });
    return m.destinations.filter(function (d) {
      return done.indexOf(d) < 0;
    });
  }

  function drawForm(m, editing) {
    var r = editing || {
      rating: 0,
      destination: '',
      body: ''
    };
    var opts = editing ? [editing.destination] : freeTours(m);
    var dests = opts.map(function (d) {
      return '<option' + (d === r.destination ? ' selected' : '') + '>' + esc(d) + '</option>';
    }).join('');
    var vals = [5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5];
    var radios = vals.map(function (k) {
      var id = 'rt' + String(k).replace('.', '_'), half = k % 1 !== 0;
      return '<input type="radio" name="rating" id="' + id + '" value="' + k + '"' +
        (r.rating === k ? ' checked' : '') + ' required><label for="' + id + '" class="' +
        (half ? 'h' : 'f') + '" title="' + avg(k) + ' sao"><span class="sr">' + avg(k) + ' sao</span>' +
        STAR + '</label>';
    }).join('');
    writeEl.innerHTML = '<h2>' + (editing ? 'Sửa đánh giá' : 'Viết đánh giá') + '</h2>' +
      '<p class="sub">Đánh giá sẽ hiển thị kèm tên <b>' + esc(m.name) + '</b> sau khi được duyệt.</p>' +
      '<form class="ct rv-form" id="rvForm"><label class="rv-tour-pick"><span>Tour bạn muốn đánh giá</span>' +
      '<select name="destination" aria-label="Tour bạn muốn đánh giá" required' + (editing ? ' disabled' : '') + '>' +
      (editing ? '' : '<option value="">Chọn tour bạn đã đặt</option>') + dests + '</select></label>' +
      '<p class="rv-for" id="rvFor" hidden></p>' +
      '<fieldset class="rv-pick"><legend>Bạn chấm mấy sao?</legend><div>' + radios + '</div><small class="rv-val" id="rvVal">' + (r.rating ? avg(r.rating) +
      ' sao' : 'Chạm vào nửa sao để chấm x,5') + '</small></fieldset>' +
      '<textarea name="body" rows="5" maxlength="600" minlength="10" required placeholder="Chia sẻ trải nghiệm của bạn: hướng dẫn viên, lịch trình, khách sạn…" aria-label="Nội dung đánh giá">' + esc(r.body) + '</textarea>' +
      '<small class="rv-count" id="rvCount"></small><p class="auth-err" id="rvErr" role="alert" hidden></p>' +
      '<div class="ts-box" id="rvTs"></div><button class="btn" type="submit">' + (editing ? 'Gửi lại để duyệt' : 'Gửi đánh giá') + '</button>' +
      (m.reviews.length ? '<button class="btn line" type="button" id="rvCancel">Huỷ</button>' : '') + '</form>';
    var sel = $('select[name=destination]', writeEl), forEl = $('#rvFor');
    function showTour() {
      var t = editing ? editing.destination : sel.value;
      forEl.hidden = !t;
      forEl.innerHTML = t ? 'Bạn đang đánh giá tour: <b>' + esc(t) + '</b>' : '';
    }
    sel.onchange = showTour;
    showTour();
    writeEl.querySelectorAll('input[name=rating]').forEach(function (i) {
      i.onchange = function () {
        $('#rvVal').textContent = avg(i.value) + ' sao';
      };
    });
    var ta = $('textarea', writeEl), cnt = $('#rvCount');
    function count() {
      cnt.textContent = ta.value.length + '/600';
    }
    ta.oninput = count;
    count();
    if (m.reviews.length) {
      $('#rvCancel').onclick = function () {
        drawList(m);
      };
    }
    if (window.vdkTS) {
      vdkTS.mount($('#rvTs'), 'review');
    }
    $('#rvForm').onsubmit = function (e) {
      e.preventDefault();
      var f = e.target, err = $('#rvErr'), btn = $('button[type=submit]', f);
      err.hidden = true;
      var body = {
        rating: Number((f.elements.rating.value || 0)),
        destination: editing ? editing.destination : sel.value,
        body: f.elements.body.value
      };
      if (!body.destination) {
        err.textContent = 'Hãy chọn tour bạn muốn đánh giá.';
        err.hidden = false;
        return;
      }
      if (!body.rating) {
        err.textContent = 'Hãy chọn số sao.';
        err.hidden = false;
        return;
      }
      if (window.vdkTS && !vdkTS.ready($('#rvTs'))) {
        err.textContent = 'Đang xác minh, vui lòng đợi vài giây rồi bấm lại.';
        err.hidden = false;
        return;
      }
      body['cf-turnstile-response'] = window.vdkTS ? vdkTS.token($('#rvTs')) : '';
      var label = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Đang gửi…';
      call('/api/reviews', { method: 'POST', body: body }).then(function (d) {
        m.reviews = m.reviews.filter(function (x) {
          return x.id !== d.review.id;
        });
        m.reviews.unshift(d.review);
        drawList(m);
      }).catch(function (ex) {
        err.textContent = ex.message;
        err.hidden = false;
        btn.disabled = false;
        btn.textContent = label;
        if (window.vdkTS) {
          vdkTS.reset($('#rvTs'));
        }
      });
    };
  }

  function mineHTML(r) {
    var st = STATUS_MSG[r.status] || STATUS_MSG.pending;
    return '<div class="rv-mine ' + esc(r.status) + '"><span class="rv-tour">' + esc(r.destination || 'Chuyến đi') + '</span> <span class="rv-pill">' + st[0] + '</span><p>' + st[1] + '</p>' +
      stars(r.rating) + '<blockquote>' + esc(r.body) + '</blockquote>' +
      (r.reply ? '<div class="rv-reply"><b>Phản hồi từ Việt Du Ký</b><p>' + esc(r.reply) + '</p></div>' : '') +
      '<div class="rv-acts"><button class="btn line rv-edit" data-id="' + r.id + '" type="button">Sửa đánh giá</button>' +
      '<button class="btn line danger rv-del" data-id="' + r.id + '" type="button" aria-label="Xoá đánh giá" title="Xoá đánh giá"><span class="ms">delete</span><span class="rv-del-t">Xoá</span></button></div>' +
      (r.status === 'approved' ? '<p class="sub">Sửa đánh giá sẽ ẩn nó cho đến khi được duyệt lại.</p>' : '') + '</div>';
  }

  function drawList(m) {
    var free = freeTours(m);
    writeEl.innerHTML = '<h2>Đánh giá của bạn</h2>' + m.reviews.map(mineHTML).join('') +
      (free.length ? '<button class="btn gold" id="rvNew" type="button">Đánh giá tour khác</button>' : '<p class="sub">Bạn đã đánh giá tất cả các tour đã đặt. Đặt thêm tour để tiếp tục chia sẻ nhé!</p>');
    function find(btn) {
      var id = Number(btn.getAttribute('data-id'));
      return m.reviews.filter(function (x) {
        return x.id === id;
      })[0];
    }
    writeEl.querySelectorAll('.rv-edit').forEach(function (b) {
      b.onclick = function () {
        drawForm(m, find(b));
      };
    });
    writeEl.querySelectorAll('.rv-del').forEach(function (b) {
      b.onclick = function () {
        var r = find(b);
        if (!confirm('Xoá đánh giá tour ' + (r.destination || '') + '?')) {
          return;
        }
        call('/api/reviews/mine/' + r.id, { method: 'DELETE' }).then(function () {
          m.reviews = m.reviews.filter(function (x) {
            return x.id !== r.id;
          });
          showMine(m);
          load2();
        }).catch(function (ex) {
          alert(ex.message);
        });
      };
    });
    var nb = $('#rvNew');
    if (nb) {
      nb.onclick = function () {
        drawForm(m, null);
      };
    }
  }

  function showMine(m) {
    if (m.reviews.length) {
      drawList(m);
      return;
    }
    if (!m.can_review) {
      note('<p class="sub">Chỉ khách đã đặt tour tại Việt Du Ký mới viết được đánh giá, để mọi đánh giá đều là thật.</p><a class="btn" href="/contact">Đặt tour</a>');
      return;
    }
    drawForm(m, null);
  }

  function load2() {
    page = 1;
    shown = 0;
    load(true);
  }

  call('/api/reviews/mine').then(showMine).catch(function (ex) {
    if (ex.status === 401) {
      note('<p class="sub">Đăng nhập để chia sẻ trải nghiệm của bạn. Chỉ khách đã đặt tour mới viết được đánh giá.</p>' +
        '<a class="btn gold" href="/login?next=' + back + '">Đăng nhập</a><a class="btn line" href="/register?next=' + back + '">Tạo tài khoản</a>');
    } else {
      note('<p class="sub">' + esc(ex.message) + '</p>');
    }
  });
})();
