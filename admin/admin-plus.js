/* Tính năng bổ sung cho trang quản trị: mật độ hiển thị, cỡ chữ, phím tắt chuyển trang, bảng phím tắt (?),
giữ phiên và kiểm tra lại phiên khi quay lại tab. Chạy độc lập, chỉ dùng DOM nên không sửa admin.js. */
(function () {
  'use strict';
  var root = document.documentElement;

  function $(id) {
    return document.getElementById(id);
  }
  function load(k, d) {
    try {
      return localStorage.getItem(k) || d;
    } catch (e) {
      return d;
    }
  }
  function save(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch (e) {}
  }
  function toast(msg) {
    var t = $('toast');
    if (!t) {
      return;
    }
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toast.t);
    toast.t = setTimeout(function () {
      t.classList.remove('on');
    }, 2200);
  }

  /* ---------- Mật độ hiển thị + cỡ chữ ---------- */
  var DENSITY = [['comfy', 'Thoải mái', 'density_medium'], ['compact', 'Gọn', 'density_small']];
  var SIZES = [['md', 'Chữ vừa', 100], ['lg', 'Chữ lớn', 110], ['xl', 'Chữ rất lớn', 120]];

  function pick(list, key) {
    for (var i = 0; i < list.length; i++) {
      if (list[i][0] === key) {
        return i;
      }
    }
    return 0;
  }
  function apply() {
    var d = DENSITY[pick(DENSITY, load('vdk-density', 'comfy'))];
    var s = SIZES[pick(SIZES, load('vdk-fs', 'md'))];
    root.dataset.density = d[0];
    root.dataset.fs = s[0];
    var bd = $('densityBtn'), bs = $('fsBtn');
    if (bd) {
      bd.querySelector('.t').textContent = 'Mật độ: ' + d[1];
      bd.querySelector('.ms').textContent = d[2];
    }
    if (bs) {
      bs.querySelector('.t').textContent = s[1];
    }
  }
  function cycle(list, key, def) {
    var i = (pick(list, load(key, def)) + 1) % list.length;
    save(key, list[i][0]);
    apply();
    toast(list[i][1]);
  }
  function ghost(id, icon, label, title) {
    var b = document.createElement('button');
    b.className = 'ghost';
    b.id = id;
    b.type = 'button';
    b.title = title;
    b.innerHTML = '<span class="ms">' + icon + '</span><span class="t">' + label + '</span>';
    return b;
  }
  function mountButtons() {
    var foot = document.querySelector('.side-foot'), anchor = $('themeBtn');
    if (!foot || !anchor || $('densityBtn')) {
      return;
    }
    var bd = ghost('densityBtn', 'density_medium', 'Mật độ', 'Đổi mật độ hiển thị (thoải mái / gọn)');
    var bs = ghost('fsBtn', 'format_size', 'Cỡ chữ', 'Đổi cỡ chữ');
    foot.insertBefore(bd, anchor);
    foot.insertBefore(bs, anchor);
    bd.onclick = function () {
      cycle(DENSITY, 'vdk-density', 'comfy');
    };
    bs.onclick = function () {
      cycle(SIZES, 'vdk-fs', 'md');
    };
    apply();
  }

  /* ---------- Phím tắt ---------- */
  var GO = {
    o: ['#/', 'Tổng quan'],
    b: ['#/bookings', 'Đơn đặt'],
    m: ['#/messages', 'Tin nhắn'],
    r: ['#/reviews', 'Đánh giá'],
    c: ['#/customers', 'Khách hàng'],
    d: ['#/departures', 'Lịch khởi hành'],
    t: ['#/tours', 'Tour & giá'],
    p: ['#/reports', 'Báo cáo'],
    l: ['#/activity', 'Nhật ký']
  };
  var SHORTCUTS = [
    ['Ctrl K hoặc /', 'Tìm nhanh'],
    ['?', 'Mở bảng phím tắt này'],
    ['[', 'Thu gọn / mở rộng thanh bên'],
    ['Ctrl Enter hoặc Ctrl S', 'Lưu ngay khi đang mở ngăn chi tiết'],
    ['g rồi o', 'Tổng quan'],
    ['g rồi b', 'Đơn đặt'],
    ['g rồi m', 'Tin nhắn'],
    ['g rồi r', 'Đánh giá'],
    ['g rồi c', 'Khách hàng'],
    ['g rồi d', 'Lịch khởi hành'],
    ['g rồi t', 'Tour & giá'],
    ['g rồi p', 'Báo cáo'],
    ['g rồi l', 'Nhật ký'],
    ['Nhấp đúp vào ô bảng', 'Sao chép nội dung ô (SĐT, email, mã...)'],
    ['Esc', 'Đóng hộp thoại / ngăn chi tiết']
  ];
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[c];
    });
  }
  function help() {
    if (document.querySelector('.dlg-scrim')) {
      return;
    }
    var prev = document.activeElement, wrap = document.createElement('div');
    wrap.className = 'dlg-scrim';
    wrap.innerHTML = '<div class="dlg keys-dlg" role="dialog" aria-modal="true" aria-labelledby="keysT">' +
      '<span class="dlg-ic"><span class="ms">keyboard</span></span><h2 id="keysT">Phím tắt</h2>' +
      '<table class="keys-tbl"><tbody>' + SHORTCUTS.map(function (r) {
      return '<tr><th scope="row"><kbd>' + esc(r[0]) + '</kbd></th><td>' + esc(r[1]) + '</td></tr>';
    }).join('') + '</tbody></table>' +
      '<div class="dlg-acts"><button type="button" class="btn primary" id="keysOk">Đã hiểu</button></div></div>';
    document.body.appendChild(wrap);
    requestAnimationFrame(function () {
      wrap.classList.add('on');
    });
    var ok = wrap.querySelector('#keysOk');
    ok.focus();
    function done() {
      document.removeEventListener('keydown', key, true);
      wrap.classList.remove('on');
      setTimeout(function () {
        wrap.remove();
      }, 160);
      if (prev && prev.focus) {
        prev.focus();
      }
    }
    function key(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        done();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        ok.focus();
      }
    }
    document.addEventListener('keydown', key, true);
    ok.onclick = done;
    wrap.onclick = function (e) {
      if (e.target === wrap) {
        done();
      }
    };
  }
  var gAt = 0;
  document.addEventListener('keydown', function (e) {
    var app = $('app');
    if (!app || app.hidden || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.dlg-scrim, .pal-scrim')) {
      return;
    }
    var t = e.target;
    if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) {
      return;
    }
    if (e.key === '?') {
      e.preventDefault();
      help();
      return;
    }
    if (e.key === 'g' || e.key === 'G') {
      gAt = Date.now();
      return;
    }
    if (gAt && Date.now() - gAt < 1200 && GO[e.key.toLowerCase()]) {
      var to = GO[e.key.toLowerCase()], link = document.querySelector('.nav a[href="' + to[0] + '"]');
      gAt = 0;
      if (link && !link.hidden) {
        e.preventDefault();
        location.hash = to[0];
        toast('Đến ' + to[1]);
      }
    }
  });

  /* ---------- Giữ phiên + kiểm tra lại khi quay lại tab ---------- */
  var lastCheck = Date.now();
  function ping() {
    var app = $('app');
    if (!app || app.hidden || !window.fetch) {
      return;
    }
    lastCheck = Date.now();
    fetch('/api/admin/me', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) {
      if (r.status === 401) {
        location.reload();
      }
    }).catch(function () {});
  }
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && Date.now() - lastCheck > 5 * 60000) {
      ping();
    }
  });
  setInterval(function () {
    if (!document.hidden && Date.now() - lastCheck > 20 * 60000) {
      ping();
    }
  }, 60000);

  /* ---------- Ctrl+Enter / Ctrl+S: lưu ngay trong ngăn chi tiết ---------- */
  document.addEventListener('keydown', function (e) {
    var drawer = $('drawer');
    var save = (e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.key.toLowerCase() === 's');
    if (!save || !drawer || drawer.hidden || document.querySelector('.dlg-scrim')) {
      return;
    }
    var btn = drawer.querySelector('.btn.primary:not([disabled])');
    if (btn) {
      e.preventDefault();
      btn.click();
    }
  });

  /* ---------- Cảnh báo khi rời trang lúc đang sửa dở trong ngăn chi tiết ---------- */
  var dirty = false;
  document.addEventListener('input', function (e) {
    var d = $('drawer');
    if (d && !d.hidden && d.contains(e.target)) {
      dirty = true;
    }
  }, true);
  if ($('drawer')) {
    new MutationObserver(function () {
      if ($('drawer').hidden) {
        dirty = false;
      }
    }).observe($('drawer'), { attributes: true, attributeFilter: ['hidden'] });
  }
  window.addEventListener('beforeunload', function (e) {
    if (dirty && $('drawer') && !$('drawer').hidden) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  /* ---------- Số việc mới hiện trên tiêu đề tab: (3) Việt Du Ký ---------- */
  var baseTitle = document.title.replace(/^\(\d+\)\s*/, '');
  function countTitle() {
    var n = 0;
    ['navNew', 'navMsg', 'navRev'].forEach(function (id) {
      var el = $(id);
      if (el && !el.hidden) {
        n += parseInt(el.textContent, 10) || 0;
      }
    });
    document.title = (n ? '(' + n + ') ' : '') + baseTitle;
  }
  ['navNew', 'navMsg', 'navRev'].forEach(function (id) {
    if ($(id)) {
      new MutationObserver(countTitle).observe($(id), {
        childList: true,
        characterData: true,
        subtree: true,
        attributes: true
      });
    }
  });
  countTitle();

  /* ---------- Nhấp đúp vào ô trong bảng để sao chép (SĐT, email, mã đơn...) ---------- */
  document.addEventListener('dblclick', function (e) {
    var td = e.target.closest ? e.target.closest('.tbl td') : null;
    if (!td || e.target.closest('a, button, input, select, textarea, label')) {
      return;
    }
    var text = (td.innerText || '').replace(/\s+/g, ' ').trim();
    if (!text || text.length > 300 || !navigator.clipboard) {
      return;
    }
    navigator.clipboard.writeText(text).then(function () {
      toast('Đã sao chép: ' + (text.length > 40 ? text.slice(0, 40) + '…' : text));
    }).catch(function () {});
  });

  /* Vào trang quản trị luôn bắt đầu ở "Tổng quan" (không tự nhảy về trang xem lần trước) */
  try {
    localStorage.removeItem('vdk-last-view');
  } catch (e) {}

  /* ---------- Công cụ cho mọi bảng: lọc nhanh trên trang đang xem, đếm dòng, xuất CSV ---------- */
  function csvCell(v) {
    v = String(v).replace(/\s+/g, ' ').trim();
    return /[",;\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function exportCsv(table, name) {
    var rows = [];
    table.querySelectorAll('tr').forEach(function (tr) {
      if (tr.hidden || tr.style.display === 'none') {
        return;
      }
      var cells = [].slice.call(tr.children).filter(function (c) {
        return c.style.display !== 'none';
      }).map(function (c) {
        return csvCell(c.innerText || '');
      });
      if (cells.some(function (c) {
          return c;
        })) {
        rows.push(cells.join(','));
      }
    });
    var blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
    toast('Đã xuất ' + (rows.length - 1) + ' dòng ra CSV');
  }
  function decorateTables() {
    document.querySelectorAll('main table.tbl:not(.static)').forEach(function (table) {
      var host = table.closest('.tbl-wrap') || table;
      if (host.previousElementSibling && host.previousElementSibling.classList.contains('tt-bar')) {
        return;
      }
      if (table.tBodies.length === 0 || table.tBodies[0].rows.length < 2) {
        return;
      }
      var bar = document.createElement('div');
      bar.className = 'tt-bar';
      bar.innerHTML = '<label class="tt-find"><span class="ms">filter_alt</span><input type="search" placeholder="Lọc nhanh trong trang này…" aria-label="Lọc nhanh các dòng đang hiển thị"></label>' +
        '<span class="tt-count" aria-live="polite"></span>' +
        '<button type="button" class="btn sm tt-cols" title="Ẩn / hiện cột" aria-haspopup="true"><span class="ms">view_column</span>Cột</button>' +
        '<button type="button" class="btn sm tt-copy" title="Sao chép các dòng đang hiển thị (dán được vào Excel / Google Sheets)"><span class="ms">content_copy</span>Sao chép</button>' +
        '<button type="button" class="btn sm tt-csv" title="Tải các dòng đang hiển thị về file CSV"><span class="ms">download</span>CSV</button>' +
        '<div class="tt-cols-menu" hidden></div><div class="tt-sum" aria-live="polite"></div>';
      host.parentNode.insertBefore(bar, host);
      var input = bar.querySelector('input'), count = bar.querySelector('.tt-count');
      function apply() {
        var q = input.value.trim().toLowerCase(), shown = 0, rows = table.tBodies[0].rows;
        for (var i = 0; i < rows.length; i++) {
          var ok = !q || (rows[i].innerText || '').toLowerCase().indexOf(q) > -1;
          rows[i].hidden = !ok;
          shown += ok ? 1 : 0;
        }
        count.textContent = q ? shown + '/' + rows.length + ' dòng' : rows.length + ' dòng';
      }
      input.addEventListener('input', function () {
        apply();
      });
      var sumBox = bar.querySelector('.tt-sum');
      function numOf(t) {
        t = String(t).replace(/\s+/g, '').replace(/[₫đdvndVNĐ]|\u00a0/g, '');
        if (!/^-?[\d.,]+$/.test(t) || !/\d/.test(t)) {
          return null;
        }
        return parseFloat(t.replace(/\./g, '').replace(',', '.'));
      }
      function sums() {
        var ths = table.tHead ? [].slice.call(table.tHead.rows[0].cells) : [], out = [];
        ths.forEach(function (th, ci) {
          if (!th.classList.contains('num')) {
            return;
          }
          var tot = 0, n = 0, bad = false;
          [].forEach.call(table.tBodies[0].rows, function (r) {
            if (r.hidden || !r.cells[ci]) {
              return;
            }
            var t = (r.cells[ci].innerText || '').trim();
            if (!t || t === '–' || t === '-') {
              return;
            }
            var v = numOf(t);
            if (v === null || isNaN(v)) {
              bad = true;
            } else {
              tot += v;
              n++;
            }
          });
          if (!bad && n > 1) {
            out.push('<span>' + (th.innerText || '').trim() + ': <b>' + tot.toLocaleString('vi-VN') + '</b></span>');
          }
        });
        sumBox.innerHTML = out.join('');
        sumBox.hidden = !out.length;
      }
      var baseApply = apply;
      apply = function () {
        baseApply();
        sums();
      };
      apply();

      /* sắp xếp khi bấm tiêu đề cột (trong trang đang xem) */
      if (table.tHead) {
        [].forEach.call(table.tHead.rows[0].cells, function (th, ci) {
          if (th.querySelector('button, a, input') || !(th.innerText || '').trim() || th.getAttribute('data-nosort') !== null) {
            return;
          }
          th.classList.add('tt-sortable');
          th.tabIndex = 0;
          th.setAttribute('role', 'columnheader');
          var dir = 0;
          function go() {
            dir = dir === 1 ? -1 : 1;
            [].forEach.call(table.tHead.rows[0].cells, function (o) {
              o.removeAttribute('aria-sort');
            });
            th.setAttribute('aria-sort', dir === 1 ? 'ascending' : 'descending');
            var rows = [].slice.call(table.tBodies[0].rows);
            rows.sort(function (a, b) {
              var x = (a.cells[ci] ? a.cells[ci].innerText : '').trim(), y = (b.cells[ci] ? b.cells[ci].innerText : '').trim();
              var nx = numOf(x), ny = numOf(y);
              if (nx !== null && ny !== null) {
                return (nx - ny) * dir;
              }
              return x.localeCompare(y, 'vi', { numeric: true }) * dir;
            });
            rows.forEach(function (r) {
              table.tBodies[0].appendChild(r);
            });
          }
          th.addEventListener('click', go);
          th.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              go();
            }
          });
        });
      }

      /* ẩn / hiện cột */
      var menu = bar.querySelector('.tt-cols-menu'), colsBtn = bar.querySelector('.tt-cols');
      if (table.tHead) {
        [].forEach.call(table.tHead.rows[0].cells, function (th, ci) {
          var name = (th.innerText || '').trim();
          if (!name) {
            return;
          }
          var l = document.createElement('label');
          l.innerHTML = '<input type="checkbox" checked> ';
          l.appendChild(document.createTextNode(name));
          l.firstChild.onchange = function () {
            var hide = !l.firstChild.checked;
            [].forEach.call(table.rows, function (r) {
              if (r.cells[ci]) {
                r.cells[ci].style.display = hide ? 'none' : '';
              }
            });
          };
          menu.appendChild(l);
        });
      }
      colsBtn.onclick = function (e) {
        e.stopPropagation();
        menu.hidden = !menu.hidden;
      };
      document.addEventListener('click', function (e) {
        if (!menu.hidden && !menu.contains(e.target) && e.target !== colsBtn) {
          menu.hidden = true;
        }
      });
      bar.querySelector('.tt-copy').onclick = function () {
        var rows = [];
        [].forEach.call(table.rows, function (tr) {
          if (tr.hidden) {
            return;
          }
          var c = [].filter.call(tr.cells, function (x) {
            return x.style.display !== 'none';
          }).map(function (x) {
            return (x.innerText || '').replace(/\s+/g, ' ').trim();
          });
          if (c.some(Boolean)) {
            rows.push(c.join('\t'));
          }
        });
        if (navigator.clipboard) {
          navigator.clipboard.writeText(rows.join('\n')).then(function () {
            toast('Đã sao chép ' + (rows.length - 1) + ' dòng');
          }).catch(function () {});
        }
      };
      bar.querySelector('.tt-csv').onclick = function () {
        exportCsv(table, (location.hash.replace(/^#\/?/, '').split(/[?/]/)[0] || 'bang'));
      };
      apply();
    });
  }
  var ttT;
  new MutationObserver(function () {
    clearTimeout(ttT);
    ttT = setTimeout(decorateTables, 120);
  }).observe(document.body, { childList: true, subtree: true });

  /* ---------- Bộ công cụ nổi: tự làm mới, chế độ tập trung, in trang, trang gần đây, ghi chú nhanh ---------- */
  var dock = document.createElement('div');
  dock.className = 'adm-dock';
  dock.innerHTML = '<button type="button" class="dock-fab" aria-label="Công cụ quản trị" aria-expanded="false" title="Công cụ"><span class="ms">construction</span></button>' +
    '<div class="dock-panel" role="dialog" aria-label="Công cụ quản trị" hidden>' +
    '<h3>Công cụ</h3>' +
    '<label class="dock-row"><span class="ms">autorenew</span><span>Tự làm mới</span><select id="dkAuto" aria-label="Chu kỳ tự làm mới"><option value="0">Tắt</option><option value="30">30 giây</option><option value="60">1 phút</option><option value="300">5 phút</option></select></label>' +
    '<button type="button" class="dock-row" id="dkFocus"><span class="ms">fullscreen</span><span>Chế độ tập trung</span><kbd>F</kbd></button>' +
    '<button type="button" class="dock-row" id="dkPrint"><span class="ms">print</span><span>In trang này</span></button>' +
    '<button type="button" class="dock-row" id="dkTop"><span class="ms">vertical_align_top</span><span>Về đầu trang</span></button>' +
    '<h4>Trang xem gần đây</h4><div class="dock-recent" id="dkRecent"></div>' +
    '<h4>Ghi chú nhanh <small>(lưu trên máy này)</small></h4><textarea id="dkNote" rows="4" placeholder="Việc cần nhớ, SĐT khách, ghi chú ca trực…" aria-label="Ghi chú nhanh"></textarea>' +
    '</div>';
  document.body.appendChild(dock);
  var fab = dock.querySelector('.dock-fab'), panel = dock.querySelector('.dock-panel');
  function dockOpen(on) {
    panel.hidden = !on;
    fab.setAttribute('aria-expanded', on ? 'true' : 'false');
    dock.classList.toggle('open', on);
    if (on) {
      renderRecent();
    }
  }
  fab.onclick = function () {
    dockOpen(panel.hidden);
  };
  document.addEventListener('click', function (e) {
    if (!panel.hidden && !dock.contains(e.target)) {
      dockOpen(false);
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !panel.hidden) {
      dockOpen(false);
    }
    var tag = (e.target.tagName || '').toLowerCase();
    if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey && tag !== 'input' && tag !== 'textarea' && tag !== 'select' && !e.target.isContentEditable) {
      toggleFocus();
    }
  });
  function toggleFocus() {
    var app = $('app');
    if (!app || app.hidden) {
      return;
    }
    var on = app.classList.toggle('focus-mode');
    $('dkFocus').querySelector('.ms').textContent = on ? 'fullscreen_exit' : 'fullscreen';
    toast(on ? 'Chế độ tập trung: bấm F để thoát' : 'Đã thoát chế độ tập trung');
  }
  $('dkFocus').onclick = toggleFocus;
  $('dkPrint').onclick = function () {
    dockOpen(false);
    setTimeout(function () {
      window.print();
    }, 150);
  };
  $('dkTop').onclick = function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    dockOpen(false);
  };

  /* tự làm mới: bấm nút "Làm mới" của trang hiện tại (nếu có), không làm khi đang gõ hoặc mở ngăn chi tiết */
  var autoT;
  function setAuto(sec) {
    clearInterval(autoT);
    save('vdk-auto', String(sec));
    if (sec > 0) {
      autoT = setInterval(function () {
        var d = $('drawer'), a = document.activeElement, typing = a && /^(input|textarea|select)$/i.test(a.tagName);
        if (document.hidden || typing || (d && !d.hidden)) {
          return;
        }
        var b = document.querySelector('main #refresh, main #drefresh, main [data-refresh]');
        if (b) {
          b.click();
        }
      }, sec * 1000);
    }
  }
  var auto = $('dkAuto');
  auto.value = load('vdk-auto', '0');
  if (auto.value !== '0') {
    setAuto(parseInt(auto.value, 10));
  }
  auto.onchange = function () {
    setAuto(parseInt(auto.value, 10));
    toast(auto.value === '0' ? 'Đã tắt tự làm mới' : 'Tự làm mới mỗi ' + auto.options[auto.selectedIndex].text);
  };

  /* trang gần đây */
  var recent = [];
  try {
    recent = JSON.parse(load('vdk-recent', '[]')) || [];
  } catch (e) {
    recent = [];
  }
  function trackView() {
    setTimeout(function () {
      var h = document.querySelector('main h1'), hash = location.hash;
      if (!h || !hash || hash === '#/' || hash === '#') {
        return;
      }
      var title = (h.textContent || '').trim();
      recent = recent.filter(function (r) {
        return r.h !== hash;
      });
      recent.unshift({ h: hash, t: title });
      recent = recent.slice(0, 6);
      save('vdk-recent', JSON.stringify(recent));
    }, 700);
  }
  function renderRecent() {
    var box = $('dkRecent');
    box.innerHTML = '';
    var list = recent.filter(function (r) {
      return r.h !== location.hash;
    }).slice(0, 5);
    if (!list.length) {
      box.innerHTML = '<p class="dock-empty">Chưa có trang nào.</p>';
      return;
    }
    list.forEach(function (r) {
      var a = document.createElement('a');
      a.href = r.h;
      a.innerHTML = '<span class="ms">history</span>';
      a.appendChild(document.createTextNode(r.t || r.h));
      a.onclick = function () {
        dockOpen(false);
      };
      box.appendChild(a);
    });
  }
  window.addEventListener('hashchange', trackView);
  trackView();

  /* ghi chú nhanh */
  var note = $('dkNote'), noteT;
  note.value = load('vdk-note', '');
  note.addEventListener('input', function () {
    clearTimeout(noteT);
    noteT = setTimeout(function () {
      save('vdk-note', note.value);
    }, 400);
  });

  /* ---------- Duyệt bảng bằng bàn phím: J / K chọn dòng, Enter mở dòng ---------- */
  var rowIdx = -1;
  document.addEventListener('keydown', function (e) {
    var tag = (e.target.tagName || '').toLowerCase();
    if (e.ctrlKey || e.metaKey || e.altKey || /^(input|textarea|select)$/.test(tag) || e.target.isContentEditable) {
      return;
    }
    var t = document.querySelector('main table.tbl tbody');
    if (!t || (e.key !== 'j' && e.key !== 'k' && e.key !== 'Enter')) {
      return;
    }
    var rows = [].filter.call(t.rows, function (r) {
      return !r.hidden;
    });
    if (!rows.length) {
      return;
    }
    if (e.key === 'Enter') {
      var cur = t.querySelector('tr.kbd-row');
      if (cur && !/^(a|button)$/.test(tag)) {
        e.preventDefault();
        (cur.querySelector('a, button') || cur).click();
      }
      return;
    }
    var at = rows.indexOf(t.querySelector('tr.kbd-row'));
    rowIdx = Math.max(0, Math.min(rows.length - 1, at + (e.key === 'j' ? 1 : -1)));
    if (at < 0) {
      rowIdx = 0;
    }
    rows.forEach(function (r) {
      r.classList.remove('kbd-row');
    });
    rows[rowIdx].classList.add('kbd-row');
    rows[rowIdx].scrollIntoView({ block: 'center', behavior: 'smooth' });
  });

  /* ---------- Nút lên đầu trang quản trị ---------- */
  var up = document.createElement('button');
  up.type = 'button';
  up.className = 'adm-top';
  up.setAttribute('aria-label', 'Lên đầu trang');
  up.innerHTML = '<span class="ms">arrow_upward</span>';
  up.onclick = function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  document.body.appendChild(up);
  window.addEventListener('scroll', function () {
    up.classList.toggle('on', (window.pageYOffset || 0) > 600);
  }, { passive: true });

  /* ---------- Hiện / ẩn mật khẩu ở form đăng nhập ---------- */
  var pw = $('password');
  if (pw && !pw.parentNode.classList.contains('pw-wrap')) {
    var wrap = document.createElement('span');
    wrap.className = 'pw-wrap';
    pw.parentNode.insertBefore(wrap, pw);
    wrap.appendChild(pw);
    var eye = document.createElement('button');
    eye.type = 'button';
    eye.className = 'pw-eye';
    eye.setAttribute('aria-label', 'Hiện mật khẩu');
    eye.setAttribute('aria-pressed', 'false');
    eye.innerHTML = '<span class="ms">visibility</span>';
    eye.onclick = function () {
      var show = pw.type === 'password';
      pw.type = show ? 'text' : 'password';
      eye.setAttribute('aria-pressed', String(show));
      eye.setAttribute('aria-label', show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
      eye.firstChild.textContent = show ? 'visibility_off' : 'visibility';
    };
    wrap.appendChild(eye);
  }

  apply();
  mountButtons();
})();
