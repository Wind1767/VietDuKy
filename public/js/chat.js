/* Việt Du Ký – khung chat kiểu Messenger cho khách (hiện ở mọi trang), chia theo PHIÊN trò chuyện:
- một khách có nhiều phiên theo thời gian, tối đa một phiên đang mở;
- tạo phiên bằng cách chọn chủ đề, chọn câu hỏi gợi ý hoặc gõ tin đầu tiên;
- kết thúc phiên bất cứ lúc nào, xem lại các phiên cũ ở mục lịch sử. */
(function () {
  'use strict';
  if (document.getElementById('vdkChat') || !window.fetch || (window.VDK_SITE && (window.VDK_SITE.feat_chat === false || window.VDK_SITE.feat_login === false))) {
    return; // đã có khung chat, hoặc quản trị đã tắt chat
  }

  var link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/css/chat.css';
  document.head.appendChild(link);

  var TOPICS = {
    tour: 'Tư vấn tour',
    booking: 'Đơn đặt của tôi',
    payment: 'Thanh toán & hoàn huỷ',
    other: 'Khác'
  };

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
  function hhmm(ms) {
    return new Date(ms).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  }
  function dmy(ms) {
    return new Date(ms).toLocaleDateString('vi-VN');
  }
  function when(ms) {
    return dmy(ms) === dmy(Date.now()) ? hhmm(ms) : dmy(ms);
  }
  function topicName(t) {
    return TOPICS[t] || TOPICS.other;
  }

  var ICON_CHAT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C6.48 2 2 6.04 2 11c0 2.7 1.33 5.1 3.43 6.74V22l3.95-2.17c.84.23 1.73.35 2.62.35 5.52 0 10-4.04 10-9S17.52 2 12 2Zm1.05 12.1-2.55-2.7-4.98 2.7 5.48-5.82 2.6 2.7 4.93-2.7-5.48 5.82Z"/></svg>';
  var ICON_SEND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.4 20.4 21 12 3.4 3.6 3.39 10.1 15 12 3.39 13.9z"/></svg>';
  var ICON_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z"/></svg>';
  var ICON_HIST = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 3a9 9 0 0 0-9 9H1l3.9 3.9.1.1L9 12H6a7 7 0 1 1 2.05 4.95l-1.42 1.42A9 9 0 1 0 13 3Zm-1 5v5l4.25 2.52.77-1.28-3.52-2.09V8H12Z"/></svg>';
  var ICON_BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20z"/></svg>';

  var root = document.createElement('div');
  root.id = 'vdkChat';
  root.className = 'vc';
  root.innerHTML =
    '<button class="vc-fab" type="button" aria-label="Nhắn tin với Việt Du Ký" aria-expanded="false">' + ICON_CHAT + '<i class="vc-badge" hidden></i></button>' +
      '<section class="vc-panel" role="dialog" aria-label="Trò chuyện với Việt Du Ký" hidden>' +
      '<header><button class="vc-x vc-back" type="button" aria-label="Quay lại cuộc trò chuyện" hidden>' + ICON_BACK + '</button>' +
      '<img src="/icon-192.png" alt="" width="40" height="40"><div><b>Việt Du Ký</b><small><i></i><span class="vc-sub">Thường trả lời trong vài phút</span></small></div>' +
      '<button class="vc-x vc-hist" type="button" aria-label="Các phiên trò chuyện" title="Các phiên trò chuyện">' + ICON_HIST + '</button>' +
      '<button class="vc-x vc-close" type="button" aria-label="Đóng">' + ICON_X + '</button></header>' +
      '<div class="vc-sbar" hidden></div>' +
      '<div class="vc-body" aria-live="polite"></div>' +
      '<div class="vc-closed" hidden></div>' +
      '<form class="vc-form" autocomplete="off"><textarea rows="1" maxlength="1000" placeholder="Nhập tin nhắn…" aria-label="Tin nhắn"></textarea>' +
      '<button type="submit" aria-label="Gửi" disabled>' + ICON_SEND + '</button></form>' +
      '</section>';
  document.body.appendChild(root);

  var fab = root.querySelector('.vc-fab'), badge = root.querySelector('.vc-badge'), panel = root.querySelector('.vc-panel');
  var body = root.querySelector('.vc-body'), form = root.querySelector('.vc-form');
  var input = form.querySelector('textarea'), sendBtn = form.querySelector('button');
  var backBtn = root.querySelector('.vc-back'), histBtn = root.querySelector('.vc-hist'), closeBtn = root.querySelector('.vc-close');
  var sbar = root.querySelector('.vc-sbar'), closedBar = root.querySelector('.vc-closed');
  var subEl = root.querySelector('.vc-sub'), dotEl = root.querySelector('.vc-panel > header small i');

  var user = undefined; // undefined: chưa biết; null: chưa đăng nhập
  var faqs = [], greeting = 'Xin chào! Việt Du Ký có thể giúp gì cho chuyến đi của bạn?';
  var open = false, view = 'chat'; // 'chat' | 'list'
  var cur = null; // phiên đang xem (null: chưa có phiên, sẽ tự tạo khi gửi tin đầu tiên)
  var sessions = [], listLoaded = false;
  var msgs = [], lastId = 0, seen = 0, tmpN = 0, loaded = false, timer = null, busy = false;

  /* ---------- Gọi API ---------- */
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
          var e = new Error(d.error || 'Có lỗi xảy ra.');
          e.status = res.status;
          e.code = d.code;
          throw e;
        }
        return d;
      });
    });
  }

  /* ---------- Hiển thị ---------- */
  function nextUrl() {
    var name = location.pathname.replace(/\/+$/, '').replace(/\.html$/, '') || '/';
    return encodeURIComponent(name + location.search);
  }

  function gateHTML() {
    return '<div class="vc-gate"><b>Đăng nhập để trò chuyện</b><p>Hãy đăng nhập tài khoản Việt Du Ký để nhắn tin trực tiếp với tư vấn viên.</p>' +
      '<a class="vc-btn" href="/login?next=' + nextUrl() + '">Đăng nhập</a>' +
      '<a class="vc-btn line" href="/register?next=' + nextUrl() + '">Tạo tài khoản</a></div>';
  }

  function chipsHTML(cls) {
    if (!faqs.length) {
      return '';
    }
    return '<div class="vc-chips ' + (cls || '') + '">' + faqs.map(function (f) {
      return '<button type="button" class="vc-chip" data-faq="' + f.id + '">' + esc(f.question) + '</button>';
    }).join('') + '</div>';
  }

  function topicsHTML() {
    return '<div class="vc-topics"><span>Bạn cần hỗ trợ về…</span><div>' + Object.keys(TOPICS).map(function (k) {
      return '<button type="button" class="vc-tp" data-topic="' + k + '">' + esc(TOPICS[k]) + '</button>';
    }).join('') + '</div></div>';
  }

  function greetHTML() {
    return '<div class="vc-row ad"><img src="/icon-192.png" alt="" width="28" height="28"><div class="vc-b">' +
      esc(greeting) + '</div></div>' + (cur ? '' : topicsHTML()) + chipsHTML('');
  }

  function bindChips() {
    body.querySelectorAll('.vc-chip').forEach(function (c) {
      c.onclick = function () {
        send(c.textContent, Number(c.dataset.faq));
      };
    });
    body.querySelectorAll('.vc-tp').forEach(function (c) {
      c.onclick = function () {
        startSession(c.dataset.topic);
      };
    });
  }

  /* Thanh trạng thái phiên, tiêu đề, khung nhập: cập nhật theo phiên đang xem */
  function paintChrome() {
    var inChat = view === 'chat';
    backBtn.hidden = inChat;
    histBtn.hidden = !inChat;
    var isOpen = !!(cur && cur.status === 'open'), isClosed = !!(cur && cur.status === 'closed');
    subEl.textContent = !inChat ? 'Các phiên trò chuyện' : isOpen ? 'Đang trò chuyện · ' +
      topicName(cur.topic) : isClosed ? 'Phiên đã kết thúc' : 'Thường trả lời trong vài phút';
    dotEl.classList.toggle('off', inChat && isClosed);
    sbar.hidden = !(inChat && cur);
    if (inChat && cur) {
      sbar.innerHTML = '<span>' + esc(topicName(cur.topic)) + ' · ' + dmy(cur.created_at) + '</span>' +
        (isOpen ? '<button type="button" class="vc-end">Kết thúc phiên</button>' : '');
      var end = sbar.querySelector('.vc-end');
      if (end) {
        end.onclick = endSession;
      }
    }
    form.hidden = !inChat || isClosed;
    closedBar.hidden = !(inChat && isClosed);
    if (inChat && isClosed) {
      closedBar.innerHTML = '<p>' +
        (cur.closed_by === 'admin' ? 'Việt Du Ký đã kết thúc phiên này.' : 'Bạn đã kết thúc phiên này.') +
        '</p><button type="button" class="vc-newbtn">Bắt đầu phiên mới</button>';
      closedBar.querySelector('button').onclick = function () {
        newView();
      };
    }
  }

  function render(stick) {
    if (user === undefined) {
      body.innerHTML = '<div class="vc-gate"><p>Đang tải…</p></div>';
      return;
    }
    if (!user) {
      body.innerHTML = gateHTML();
      form.hidden = true;
      sbar.hidden = true;
      closedBar.hidden = true;
      histBtn.hidden = true;
      backBtn.hidden = true;
      return;
    }
    paintChrome();
    if (view === 'list') {
      renderList();
      return;
    }
    var near = body.scrollHeight - body.scrollTop - body.clientHeight < 90;
    if (!msgs.length) {
      body.innerHTML = loaded ? greetHTML() : '<div class="vc-gate"><p>Đang tải…</p></div>';
      bindChips();
      return;
    }
    // "Đã xem" nằm dưới tin cuối của khách nếu admin đã xem; nếu chưa thì là "Đã gửi"
    var lastMine = -1;
    msgs.forEach(function (m, i) {
      if (m.sender === 'user') {
        lastMine = i;
      }
    });
    var html = '', prev = null;
    msgs.forEach(function (m, i) {
      var gap = !prev || m.created_at - prev.created_at > 3600000 || dmy(m.created_at) !== dmy(prev.created_at);
      if (gap) {
        html += '<div class="vc-time">' + hhmm(m.created_at) +
          (dmy(m.created_at) !== dmy(Date.now()) ? ', ' +
            dmy(m.created_at) : '') + '</div>';
      }
      var mine = m.sender === 'user';
      var cont = prev && prev.sender === m.sender && !gap;
      var next = msgs[i + 1];
      var last = !next || next.sender !== m.sender || next.created_at - m.created_at > 3600000;
      html += '<div class="vc-row ' + (mine ? 'me' : 'ad') + (cont ? ' cont' : '') + (last ? ' last' : '') + '">' +
        (!mine ? (last ? '<img src="/icon-192.png" alt="" width="28" height="28">' : '<span class="vc-sp"></span>') : '') +
        '<div class="vc-b' + (m.state === 'fail' ? ' fail' : '') + (m.state === 'sending' ? ' wait' : '') + '">' + esc(m.body) + '</div></div>';
      if (m.bot && last) {
        html += '<div class="vc-auto">Trả lời tự động' +
          (m.bot === 2 ? '' : ' · tư vấn viên sẽ hỗ trợ thêm nếu cần') + '</div>';
      }
      if (mine && m.state === 'fail') {
        html += '<div class="vc-st bad">Chưa gửi được · <button type="button" class="vc-retry" data-id="' +
          esc(m.id) + '">Thử lại</button></div>';
      } else if (i === lastMine) {
        html += '<div class="vc-st">' +
          (m.state === 'sending' ? 'Đang gửi…' : (typeof m.id === 'number' && m.id <= seen ? 'Đã xem' : 'Đã gửi')) +
          '</div>';
      }
      prev = m;
    });
    var tail = msgs[msgs.length - 1];
    if (tail && tail.bot === 1 && cur && cur.status === 'open') {
      html += chipsHTML('after');
    }
    body.innerHTML = html;
    bindChips();
    body.querySelectorAll('.vc-retry').forEach(function (b) {
      b.onclick = function () {
        retry(b.dataset.id);
      };
    });
    if (stick || near) {
      body.scrollTop = body.scrollHeight;
    }
  }

  /* ---------- Lịch sử các phiên ---------- */
  function renderList() {
    if (!listLoaded) {
      body.innerHTML = '<div class="vc-gate"><p>Đang tải…</p></div>';
      return;
    }
    var hasOpen = sessions.some(function (s) {
      return s.status === 'open';
    });
    var html = '<div class="vc-lh"><b>Các phiên trò chuyện</b>' +
      (hasOpen ? '' : '<button type="button" class="vc-newbtn">+ Phiên mới</button>') + '</div>';
    if (!sessions.length) {
      html += '<p class="vc-none">Bạn chưa có phiên trò chuyện nào. Hãy bắt đầu phiên đầu tiên nhé!</p>';
    }
    html += sessions.map(function (s) {
      return '<button type="button" class="vc-sess' + (cur && cur.id === s.id ? ' on' : '') + '" data-id="' + s.id + '">' +
        '<span class="vc-sh"><b>' + esc(s.title || topicName(s.topic)) + '</b><em class="vc-pill ' + s.status + '">' + (s.status === 'open' ? 'Đang mở' : 'Đã kết thúc') + '</em></span>' +
        '<small>' + esc(s.last_body || 'Chưa có tin nhắn') + '</small>' +
        '<span class="vc-sm">' + esc(topicName(s.topic)) + ' · ' + when(s.updated_at) + (s.unread ? '<i>' +
        s.unread + '</i>' : '') + '</span></button>';
    }).join('');
    body.innerHTML = html;
    body.scrollTop = 0;
    var nb = body.querySelector('.vc-newbtn');
    if (nb) {
      nb.onclick = function () {
        newView();
      };
    }
    body.querySelectorAll('.vc-sess').forEach(function (b) {
      b.onclick = function () {
        openSession(Number(b.dataset.id));
      };
    });
  }

  function loadSessions() {
    if (!user) {
      return Promise.resolve();
    }
    return call('/api/chat/sessions').then(function (d) {
      sessions = d.items || [];
      listLoaded = true;
      if (open && view === 'list') {
        render();
      } else {
        var un = sessions.reduce(function (n, s) {
          return n + (s.unread || 0);
        }, 0);
        if (!open) {
          setBadge(un);
        }
      }
    }).catch(function () {});
  }

  function showList() {
    view = 'list';
    render();
    loadSessions();
    schedule();
  }
  function backToChat() {
    view = 'chat';
    render(true);
    if (cur) {
      sync();
    }
    schedule();
  }

  /* Chuyển sang màn hình "phiên mới": chưa tạo gì trên máy chủ cho đến khi khách chọn chủ đề / gửi tin */
  function newView() {
    cur = null;
    msgs = [];
    lastId = 0;
    seen = 0;
    loaded = true;
    view = 'chat';
    render(true);
    schedule();
    setTimeout(function () {
      input.focus();
    }, 60);
  }

  function openSession(id) {
    var s = sessions.filter(function (x) {
      return x.id === id;
    })[0];
    if (!s) {
      return;
    }
    cur = s;
    msgs = [];
    lastId = 0;
    seen = 0;
    loaded = false;
    view = 'chat';
    render(true);
    sync();
    schedule();
  }

  function startSession(topic) {
    call('/api/chat/sessions', { method: 'POST', body: { topic: topic } }).then(function (d) {
      cur = d.session;
      msgs = [];
      lastId = 0;
      seen = 0;
      loaded = false;
      listLoaded = false;
      render(true);
      sync();
      setTimeout(function () {
        input.focus();
      }, 60);
    }).catch(function (e) {
      if (e.status === 401) {
        user = null;
        render();
        return;
      }
      body.insertAdjacentHTML('beforeend', '<div class="vc-st bad">' + esc(e.message) + '</div>');
    });
  }

  function endSession() {
    if (!cur || cur.status !== 'open') {
      return;
    }
    if (!window.confirm('Kết thúc phiên trò chuyện này?\nBạn vẫn xem lại được lịch sử và có thể bắt đầu phiên mới bất cứ lúc nào.')) {
      return;
    }
    var id = cur.id;
    call('/api/chat/sessions/' + id + '/close', { method: 'POST', body: {} }).then(function (d) {
      if (cur && cur.id === id) {
        cur = d.session;
        listLoaded = false;
        render(true);
      }
    }).catch(function (e) {
      if (e.status === 401) {
        user = null;
        render();
      }
    });
  }

  function setBadge(n) {
    badge.hidden = !n;
    badge.textContent = n > 9 ? '9+' : n;
    fab.setAttribute('aria-label', n ? 'Nhắn tin với Việt Du Ký (' + n + ' tin mới)' : 'Nhắn tin với Việt Du Ký');
  }

  /* ---------- Đồng bộ tin nhắn ---------- */
  function merge(items) {
    var have = {};
    msgs.forEach(function (m) {
      have[m.id] = true;
    });
    var added = 0;
    items.forEach(function (m) {
      if (!have[m.id]) {
        msgs.push(m);
        added++;
      }
      if (m.id > lastId) {
        lastId = m.id;
      }
    });
    // tin tạm đang gửi luôn nằm cuối
    msgs.sort(function (a, b) {
      var ta = typeof a.id !== 'number', tb = typeof b.id !== 'number';
      if (ta !== tb) {
        return ta ? 1 : -1;
      }
      return ta ? a.created_at - b.created_at : a.id - b.id;
    });
    return added;
  }

  /* Bỏ các tin không còn trên máy chủ (admin đã xoá): so với danh sách id còn lại */
  function dropDeleted(alive) {
    if (!alive) {
      return 0;
    }
    var min = alive.length ? alive[alive.length - 1] : Infinity, ok = {};
    alive.forEach(function (i) {
      ok[i] = true;
    });
    var before = msgs.length;
    msgs = msgs.filter(function (m) {
      return typeof m.id !== 'number' || m.id < min || ok[m.id];
    });
    return before - msgs.length;
  }

  function sync() {
    if (!user || busy || view !== 'chat') {
      return Promise.resolve();
    }
    busy = true;
    var sid = cur ? cur.id : 0;
    return call('/api/chat/messages?after=' + lastId + (sid ? '&session=' + sid : '')).then(function (d) {
      if (sid !== (cur ? cur.id : 0) || view !== 'chat') {
        return;
      } // khách đã chuyển phiên khi đang tải
      var statusChanged = false;
      if (d.session) {
        if (!cur) {
          cur = d.session;
          msgs = [];
          lastId = 0;
          seen = 0;
          statusChanged = true;
        } // admin vừa mở phiên cho khách
        else {
          statusChanged = cur.status !== d.session.status || cur.title !== d.session.title;
          cur = d.session;
        }
      }
      var added = merge(d.items || []);
      var removed = dropDeleted(d.alive); // tin bị admin xoá
      var seenChanged = (d.seen_upto || 0) !== seen;
      seen = d.seen_upto || 0;
      var fresh = (d.items || []).some(function (m) {
        return m.sender === 'admin';
      });
      var first = !loaded;
      loaded = true;
      if (added || removed || seenChanged || first || statusChanged) {
        render(fresh || first);
      }
      setBadge(0);
    }).catch(function (e) {
      if (e.status === 401) {
        user = null;
        render();
      }
    }).then(function () {
      busy = false;
    });
  }

  function pollUnread() {
    if (!user || open || document.hidden) {
      return;
    }
    call('/api/chat/unread').then(function (d) {
      setBadge(d.unread || 0);
    }).catch(function () {});
  }

  function schedule() {
    clearInterval(timer);
    timer = setInterval(function () {
      if (document.hidden) {
        return;
      }
      if (!open) {
        pollUnread();
      } else if (view === 'chat') {
        sync();
      } else {
        loadSessions();
      }
    }, open ? 3500 : 30000);
  }

  /* ---------- Gửi ---------- */
  function send(text, faqId) {
    text = String(text || '').trim();
    if (!text || !user) {
      return;
    }
    if (!cur || cur.status !== 'open') {
      cur = null;
      msgs = [];
      lastId = 0;
      seen = 0;
      loaded = true;
    } // gửi tin = tạo phiên mới
    var tmp = {
      id: 'tmp' + (++tmpN),
      sender: 'user',
      body: text,
      created_at: Date.now(),
      state: 'sending',
      faq: faqId || 0
    };
    msgs.push(tmp);
    render(true);
    post(tmp);
  }
  function post(tmp) {
    tmp.state = 'sending';
    var payload = tmp.faq ? { faq: tmp.faq } : { body: tmp.body };
    if (cur) {
      payload.session = cur.id;
    }
    call('/api/chat/send', { method: 'POST', body: payload }).then(function (d) {
      msgs = msgs.filter(function (m) {
        return m !== tmp;
      });
      if (d.session) {
        cur = d.session;
        if (d.created) {
          listLoaded = false;
        }
      }
      merge(d.items || [d.item]);
      render(true);
    }).catch(function (e) {
      if (e.status === 401) {
        user = null;
        render();
        return;
      }
      if (e.code === 'session_closed') { // admin vừa kết thúc phiên: bỏ tin tạm, trả chữ về ô nhập
        msgs = msgs.filter(function (m) {
          return m !== tmp;
        });
        if (cur) {
          cur.status = 'closed';
        }
        if (!tmp.faq && !input.value) {
          input.value = tmp.body;
          sendBtn.disabled = false;
        }
        render(true);
        return;
      }
      tmp.state = 'fail';
      tmp.err = e.message;
      render(true);
    });
  }
  function retry(id) {
    var m = msgs.filter(function (x) {
      return x.id === id;
    })[0];
    if (m) {
      render(true);
      post(m);
    }
  }

  function fit() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 96) + 'px';
  }
  input.oninput = function () {
    sendBtn.disabled = !input.value.trim();
    fit();
  };
  input.onkeydown = function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  };
  form.onsubmit = function (e) {
    e.preventDefault();
    var t = input.value;
    if (!t.trim()) {
      return;
    }
    input.value = '';
    sendBtn.disabled = true;
    fit();
    send(t);
  };

  /* ---------- Mở / đóng ---------- */
  function setOpen(on) {
    open = on;
    panel.hidden = !on;
    fab.classList.toggle('on', on);
    fab.setAttribute('aria-expanded', String(on));
    if (on) {
      setBadge(0);
      view = 'chat';
      render(true);
      if (user) {
        sync();
        setTimeout(function () {
          if (!form.hidden) {
            input.focus();
          }
        }, 60);
      }
    }
    schedule();
  }
  fab.onclick = function () {
    setOpen(!open);
  };
  closeBtn.onclick = function () {
    setOpen(false);
    fab.focus();
  };
  histBtn.onclick = showList;
  backBtn.onclick = backToChat;
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && open) {
      setOpen(false);
      fab.focus();
    }
  });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {
      if (open && view === 'chat') {
        sync();
      } else if (!open) {
        pollUnread();
      }
    }
  });

  /* Bàn phím ảo che khung chat: nâng nút và khung lên đúng bằng phần bị che (visualViewport) */
  if (window.visualViewport) {
    var vv = window.visualViewport;
    var kb = function () {
      var o = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      root.style.setProperty('--vc-kb', (o > 80 ? o : 0) + 'px');
    };
    vv.addEventListener('resize', kb);
    vv.addEventListener('scroll', kb);
    kb();
  }

  /* ---------- Khởi động ---------- */
  fetch('/api/auth/me', { credentials: 'same-origin' }).then(function (r) {
    return r.json();
  }).then(function (d) {
    user = d.user || null;
    if (user) {
      call('/api/chat/faq').then(function (f) {
        faqs = f.items || [];
        if (f.greeting) {
          greeting = f.greeting;
        }
        if (open) {
          render();
        }
      }).catch(function () {});
    }
    if (open) {
      render(true);
      if (user) {
        sync();
      }
    }
    if (user) {
      pollUnread();
    }
    // Liên kết trong email "Việt Du Ký vừa trả lời bạn" mở sẵn khung chat
    if (user && /[?&]chat=1\b/.test(location.search)) {
      setOpen(true);
    }
  }).catch(function () {
    user = null;
  });
  schedule();
})();
