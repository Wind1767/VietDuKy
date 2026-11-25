(function () {
  'use strict';

  /* Tên trang không đuôi .html: '/about' -> 'about', '/' -> 'index' */
  var page = location.pathname.replace(/\/+$/, '').split('/').pop().replace(/\.html$/, '') || 'index';

  var here = location.pathname.indexOf('/p/') === 0 ? location.pathname.replace(/\/+$/, '') : (page === 'index' ? '/' : '/' +
    page);

  /* Menu mặc định; quản trị có thể đổi trong Cài đặt → Menu & trang chủ (window.VDK_SITE.nav_items) */
  var DEFAULT_LINKS = [
    {
      label: 'Trang chủ',
      url: '/',
      header: true,
      footer: true
    },
    {
      label: 'Điểm đến',
      url: '/#diem-den',
      header: true,
      footer: true
    },
    {
      label: 'Tour hot',
      url: '/#tour',
      header: true,
      footer: true
    },
    {
      label: 'Về chúng tôi',
      url: '/about',
      header: true,
      footer: true
    },
    {
      label: 'Đánh giá',
      url: '/reviews',
      header: true,
      footer: true
    },
    {
      label: 'Liên hệ',
      url: '/contact',
      header: true,
      footer: true
    }
  ];
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[c];
    });
  }
  function navList() {
    var s = window.VDK_SITE;
    return s && Array.isArray(s.nav_items) ? s.nav_items : DEFAULT_LINKS;
  }
  function safeUrl(u) {
    return /^(https:\/\/|\/(?!\/)|tel:|mailto:)/i.test(u) ? u : '/';
  }
  function linkAttrs(l) {
    return l.blank ? ' target="_blank" rel="noopener noreferrer"' : '';
  }

  /* Ngôi sao 5 cánh, tâm nằm đúng giữa khung 24x24 */
  var STAR = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<polygon points="12,3 14.02,9.22 20.56,9.22 15.27,13.06 17.29,19.28 ' +
    '12,15.44 6.71,19.28 8.73,13.06 3.44,9.22 9.98,9.22"/></svg>';

  /* ---------- Dựng menu + chân trang ---------- */
  function menuItems() {
    return navList().filter(function (l) {
      return l.header;
    }).map(function (l, i) {
      var cls = l.url === here ? ' class="on"' : '';
      return '<li data-nl style="--i:' + i + '"><a href="' + esc(safeUrl(l.url)) + '"' + cls + linkAttrs(l) +
        '>' + esc(l.label) + '</a></li>';
    }).join('');
  }

  function footerItems() {
    return navList().filter(function (l) {
      return l.footer;
    }).map(function (l) {
      return '<li><a href="' + esc(safeUrl(l.url)) + '"' + linkAttrs(l) + '>' + esc(l.label) + '</a></li>';
    }).join('');
  }

  var acctPages = ['login', 'register', 'account'];
  var acctItem = '<li style="--i:6"><a id="acctLink" href="/login"' +
    (acctPages.indexOf(page) > -1 ? ' class="on"' : '') + '>Đăng nhập</a></li>';
  var ctaItem = '<li style="--i:7"><a class="navcta" href="/contact">Đặt tour</a></li>';

  var themeItem = '<li class="nl" style="--i:6"><button class="theme-btn" id="themeBtn" type="button" aria-label="Đổi giao diện sáng/tối"><span class="ms">dark_mode</span><span class="tl">Giao diện tối</span></button></li>';

  var navHTML = '<div class="bar" id="bar"></div>' +
    '<nav class="nav" id="nav"><div class="wrap">' +
    '<a class="logo" href="/" aria-label="Việt Du Ký"><span class="logo-flag"><img src="/icon-192.png" alt="" width="44" height="44" decoding="async"></span>' +
    '<span data-site="site_name">Việt Du Ký</span></a>' +
    '<button class="burger" id="burger" aria-label="Mở menu"><span></span></button>' +
    '</div></nav>' +
    '<div class="scrim" id="scrim"></div>' +
    '<ul class="menu" id="menu">' + menuItems() + acctItem + themeItem + ctaItem + '</ul>';

  var footHTML = '<footer><div class="wrap"><div class="g">' +
    '<div><h4 data-site="site_name">Việt Du Ký</h4><p data-site="footer_about">Đồng hành cùng bạn khám phá đất nước hình chữ S, từ Bắc vào Nam.</p><div class="soc" data-site-social></div></div>' +
    '<div><h4>Khám phá</h4><ul id="footNav">' + footerItems() + '</ul></div>' +
    '<div><h4>Liên hệ</h4><ul>' +
    '<li><span class="ms">call</span><span data-site="hotline">1900 1234</span></li>' +
    '<li><span class="ms">mail</span><span data-site="contact_email">buivanphong7191@gmail.com</span></li>' +
    '<li><span class="ms">location_on</span><span data-site="address">Phan Thiết, Lâm Đồng</span></li>' +
    '</ul></div>' +
    '</div><p class="bugrow"><a class="bugbtn" href="/report?from=' + encodeURIComponent(location.pathname + location.search) + '" id="bugBtn"><span class="ms">warning</span>Báo lỗi website</a></p><small data-site="copyright">© 2026 Việt Du Ký. Bảo lưu mọi quyền.</small></div></footer>' +
    '<button class="top" id="top" aria-label="Lên đầu trang"><span class="ms">arrow_upward</span></button>' +
    '<div class="toast" id="toast"></div>';

  document.body.insertAdjacentHTML('afterbegin', navHTML);

  /* Sáng / tối (mặc định sáng, nhớ lựa chọn) */
  var root = document.documentElement;
  function isDarkTheme() {
    return root.dataset.theme === 'dark';
  }
  function syncTheme() {
    var tb = document.getElementById('themeBtn');
    if (!tb) {
      return;
    }
    tb.querySelector('.ms').textContent = isDarkTheme() ? 'light_mode' : 'dark_mode';
    tb.querySelector('.tl').textContent = isDarkTheme() ? 'Giao diện sáng' : 'Giao diện tối';
  }
  try {
    root.dataset.theme = localStorage.getItem('vdk-theme') === 'dark' ? 'dark' : 'light';
  } catch (e) {
    root.dataset.theme = 'light';
  }
  syncTheme();
  document.getElementById('themeBtn').onclick = function () {
    root.dataset.theme = isDarkTheme() ? 'light' : 'dark';
    try {
      localStorage.setItem('vdk-theme', root.dataset.theme);
    } catch (e) {}
    syncTheme();
  };

  /* Khung chat Messenger (không hiện ở các trang đăng nhập / đăng ký / xác minh) */
  if (['login', 'register', 'verify'].indexOf(page) < 0) {
    var chatJs = document.createElement('script');
    chatJs.src = '/js/chat.js';
    chatJs.defer = true;
    document.head.appendChild(chatJs);
  }
  document.body.insertAdjacentHTML('beforeend', footHTML);

  /* Dựng lại menu khi cài đặt mới từ máy chủ về (site.js gọi sau khi tải /api/site) */
  var menuSig = menuItems();
  window.vdkRenderNav = function () {
    var m = document.getElementById('menu'), fn = document.getElementById('footNav');
    var sig = menuItems();
    /* Menu không đổi (hay gặp nhất) thì giữ nguyên: dựng lại sẽ làm một số mục chạy lại animation còn mục "tên người dùng" thì không */
    if (m && sig !== menuSig) {
      menuSig = sig;
      var anchor = document.getElementById('acctLink');
      anchor = anchor && anchor.parentNode;
      m.querySelectorAll('li[data-nl]').forEach(function (n) {
        n.remove();
      });
      var tmp = document.createElement('ul');
      tmp.innerHTML = sig;
      while (tmp.firstChild) {
        m.insertBefore(tmp.firstChild, anchor || null);
      }
      /* chạy lại animation cho TOÀN BỘ mục để mọi nút (kể cả tên người dùng) rơi xuống cùng nhịp */
      var lis = m.querySelectorAll('li');
      lis.forEach(function (li) {
        li.style.animation = 'none';
      });
      void m.offsetWidth;
      lis.forEach(function (li) {
        li.style.animation = '';
      });
    }
    if (fn) {
      fn.innerHTML = footerItems();
    }
    if (window.vdkSyncNav) {
      window.vdkSyncNav();
    }
  };

  /* Đã đăng nhập thì "Đăng nhập" đổi thành tên người dùng, dẫn tới trang tài khoản */
  var acctLink = document.getElementById('acctLink');
  if (acctLink && window.fetch && !(window.VDK_SITE && window.VDK_SITE.feat_login === false)) {
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then(function (r) {
      return r.ok ? r.json() : null;
    })
      .then(function (d) {
      if (d && d.user) {
        acctLink.href = '/account';
        acctLink.textContent = d.user.name.trim().split(/\s+/).pop();
        acctLink.title = 'Tài khoản của bạn';
        acctLink.classList.add('swap');
        acctLink.parentNode.insertAdjacentHTML('afterend', '<li class="nl late" style="--i:6"><button class="navlogout" id="navLogout" type="button"><span class="ms">logout</span><span>Đăng xuất</span></button></li>');
        fetch('/api/inbox/count', { credentials: 'same-origin' }).then(function (r) {
          return r.ok ? r.json() : null;
        }).then(function (c) {
          var b = document.getElementById('bellN');
          if (c && c.unread && b) {
            b.textContent = c.unread > 99 ? '99+' : c.unread;
            b.hidden = false;
          }
        }).catch(function () {});
        acctLink.parentNode.insertAdjacentHTML('afterend', '<li class="nl late" style="--i:6"><a class="bell" href="/inbox" aria-label="Hòm thư" title="Hòm thư"><span class="ms">mail</span><b id="bellN" hidden></b></a></li>');
        document.getElementById('navLogout').onclick = function () {
          fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(function () {}).then(function () {
            location.href = '/';
          });
        };
      }
    }).catch(function () {});
  }

  var nav = document.getElementById('nav');
  var bar = document.getElementById('bar');
  var burger = document.getElementById('burger');
  var menu = document.getElementById('menu');
  var scrim = document.getElementById('scrim');
  var topBtn = document.getElementById('top');
  var heroBg = document.querySelector('.hero .bg');

  /* ---------- Vị trí menu: PC nằm trong nav, mobile nằm ngoài (tránh lỗi position:fixed) ---------- */
  var mq = window.matchMedia('(max-width: 900px)');
  function placeMenu() {
    if (mq.matches) {
      if (menu.parentNode !== document.body) {
        document.body.insertBefore(menu, scrim.nextSibling);
      }
    } else if (menu.parentNode === document.body) {
      nav.querySelector('.wrap').appendChild(menu);
    }
  }
  if (mq.addEventListener) {
    mq.addEventListener('change', placeMenu);
  } else {
    mq.addListener(placeMenu);
  }
  placeMenu();

  /* ---------- Menu mobile ---------- */
  function setMenu(open) {
    burger.classList.toggle('x', open);
    menu.classList.toggle('open', open);
    scrim.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', open);
    document.documentElement.classList.toggle('lock', open);
  }

  burger.onclick = function () {
    setMenu(!menu.classList.contains('open'));
  };

  scrim.onclick = function () {
    setMenu(false);
  };
  window.addEventListener('resize', function () {
    if (window.innerWidth > 900) {
      setMenu(false);
    }
  });

  menu.onclick = function (e) {
    if (e.target.tagName === 'A') {
      setMenu(false);
    }
  };

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      setMenu(false);
    }
  });

  /* ---------- Scroll-spy: tab neo (#diem-den, #tour...) đổi gạch chân theo vị trí cuộn ---------- */
  function syncNav() {
    if (here !== '/') {
      return;
    }
    var links = menu.querySelectorAll('li[data-nl] > a'), home = null, items = [];
    links.forEach(function (a) {
      var u;
      try {
        u = new URL(a.getAttribute('href'), location.origin);
      } catch (e) {
        return;
      }
      if (u.origin !== location.origin || u.pathname.replace(/\/+$/, '') !== '') {
        return;
      }
      if (!u.hash) {
        home = a;
        return;
      }
      var el = document.getElementById(u.hash.slice(1));
      if (el && el.offsetParent !== null) {
        items.push({ a: a, el: el });
      }
    });
    var line = (nav ? nav.offsetHeight : 70) + 60, cur = home;
    items.forEach(function (it) {
      if (it.el.getBoundingClientRect().top <= line) {
        cur = it.a;
      }
    });
    links.forEach(function (a) {
      a.classList.toggle('on', a === cur);
    });
  }
  window.vdkSyncNav = syncNav;
  window.addEventListener('hashchange', function () {
    setTimeout(syncNav, 50);
  });
  menu.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a');
    if (a) {
      setTimeout(syncNav, 400);
    }
  });

  /* ---------- Cuộn trang: thanh tiến trình, nav, nút lên đầu, parallax ---------- */
  var ticking = false;
  var isMobile = window.matchMedia('(max-width: 900px)').matches;

  function onScroll() {
    var y = window.scrollY;
    var max = document.documentElement.scrollHeight - window.innerHeight;

    nav.classList.toggle('s', y > 40);
    topBtn.classList.toggle('on', y > 600);
    bar.style.setProperty('--p', max > 0 ? y / max : 0);
    syncNav();

    if (heroBg && document.documentElement.classList.contains('no-parallax')) {
      heroBg.style.translate = '';
    } else if (heroBg && !isMobile && y < window.innerHeight) {
      heroBg.style.translate = '0 ' + y * 0.25 + 'px';
    }
  }

  window.addEventListener('scroll', function () {
    if (ticking) {
      return;
    }
    ticking = true;
    requestAnimationFrame(function () {
      onScroll();
      ticking = false;
    });
  }, { passive: true });

  topBtn.onclick = function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  onScroll();

  /* ---------- Tạm dừng animation vô hạn khi banner khuất ---------- */
  var heroEl = document.querySelector('.hero');
  if (heroEl) {
    new IntersectionObserver(function (en) {
      heroEl.classList.toggle('off', !en[0].isIntersecting);
    }).observe(heroEl);
  }

  /* ---------- Tự gắn hiệu ứng hiện dần cho các khối chưa có ---------- */
  var auto = [
    ['.sec-h > *', 'rv', 0.12],
    ['.card', 'rv z', 0.1],
    ['.tour', 'rv', 0.12],
    ['.why .it', 'rv z', 0.1],
    ['.st', 'rv z', 0.1],
    ['.faq details', 'rv', 0.08],
    ['.t', null, 0],
    ['.info > *, .box', 'rv', 0.1],
    ['footer .g > div', 'rv', 0.12],
    ['footer .bugrow', 'rv', 0],
    ['.trust > *', 'rv z', 0.1],
    ['.fld', 'rv', 0.06]
  ];
  auto.forEach(function (a) {
    document.querySelectorAll(a[0]).forEach(function (el, i) {
      if (!a[1] || el.classList.contains('rv')) {
        return;
      }
      a[1].split(' ').forEach(function (c) {
        el.classList.add(c);
      });
      el.dataset.d = ((i % 6) * a[2]).toFixed(2);
    });
  });

  /* ---------- Hiện dần khi cuộn tới ---------- */
  var revealer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) {
        return;
      }
      entry.target.classList.add('in');
      revealer.unobserve(entry.target);
    });
  }, { threshold: 0.15 });

  document.querySelectorAll('.rv').forEach(function (el) {
    el.style.setProperty('--d', (el.dataset.d || 0) + 's');
    revealer.observe(el);
  });

  /* ---------- Hiệu ứng sóng nước (ripple) + nút hút chuột (PC) ---------- */
  document.addEventListener('pointerdown', function (e) {
    var b = e.target.closest && e.target.closest('.btn, .navcta, .search button');
    if (!b || b.classList.contains('vui-btn') || b.closest('.fld, .vui-pop')) {
      return;
    } /* dropdown / chọn ngày: không có vòng tròn lan ra */
    var r = b.getBoundingClientRect();
    var s = Math.max(r.width, r.height) * 2;
    var d = document.createElement('span');
    d.className = 'ripple';
    d.style.cssText = 'width:' + s + 'px;height:' + s + 'px;left:' + (e.clientX - r.left - s / 2) + 'px;top:' +
      (e.clientY - r.top - s / 2) + 'px';
    b.appendChild(d);
    setTimeout(function () {
      d.remove();
    }, 650);
  });

  if (!isMobile && window.matchMedia('(hover:hover)').matches) {
    document.querySelectorAll('.btn').forEach(function (b) {
      b.addEventListener('mousemove', function (e) {
        var r = b.getBoundingClientRect();
        b.style.translate = ((e.clientX - r.left - r.width / 2) * 0.18) + 'px ' +
          ((e.clientY - r.top - r.height / 2) * 0.3) + 'px';
      });
      b.addEventListener('mouseleave', function () {
        b.style.translate = '';
      });
    });
  }

  /* ---------- Chữ tự gõ ở banner ---------- */
  var typedEl = document.getElementById('typed');

  if (typedEl) {
    var words = window.VDK_WORDS = ['Hạ Long', 'Sa Pa', 'Hội An', 'Huế', 'Đà Lạt', 'Phú Quốc'];
    var wordIndex = 0;
    var charIndex = 0;
    var deleting = false;

    (function type() {
      var word = words[wordIndex % words.length] || '';
      var delay = deleting ? 45 : 110;

      charIndex += deleting ? -1 : 1;
      typedEl.textContent = word.slice(0, charIndex);

      if (!deleting && charIndex === word.length) {
        deleting = true;
        delay = 1600;
      } else if (deleting && charIndex === 0) {
        deleting = false;
        wordIndex = (wordIndex + 1) % words.length;
        delay = 400;
      }

      setTimeout(type, document.hidden ? 1000 : delay);
    })();
  }

  /* ---------- Đèn lồng bay ở banner ---------- */
  var hero = document.querySelector('.hero');

  if (hero) {
    for (var i = 0; i < (isMobile ? 3 : 7); i++) {
      var lantern = document.createElement('i');
      lantern.className = 'lantern';
      lantern.style.left = ((isMobile ? 15 + i * 30 : 8 + i * 13) + Math.random() * 6) + '%';
      lantern.style.animationDuration = (14 + Math.random() * 10) + 's';
      lantern.style.animationDelay = (-Math.random() * 20) + 's';
      lantern.style.scale = 0.6 + Math.random() * 0.8;
      hero.appendChild(lantern);
    }
  }

  /* ---------- Đếm số ---------- */
  var counter = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) {
        return;
      }

      var el = entry.target;
      var target = Number(el.dataset.n);
      var start = performance.now();

      counter.unobserve(el);

      (function step(now) {
        var p = Math.min((now - start) / 2200, 1);
        var eased = 1 - Math.pow(1 - p, 3);

        el.textContent = Math.round(target * eased).toLocaleString('vi-VN');
        if (p < 1) {
          requestAnimationFrame(step);
        }
      })(start);
    });
  }, { threshold: 0.6 });

  document.querySelectorAll('[data-n]').forEach(function (el) {
    counter.observe(el);
  });
  /* Số liệu do site.js dựng sau khi tải /api/site */
  window.vdkCount = function (el) {
    counter.observe(el);
  };

  /* ---------- Thẻ điểm đến nghiêng theo chuột (chỉ máy có chuột) ---------- */
  if (window.matchMedia('(hover:hover)').matches) {
    document.querySelectorAll('.card').forEach(function (card) {
      card.addEventListener('mousemove', function (e) {
        var r = card.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5;
        var y = (e.clientY - r.top) / r.height - 0.5;

        card.style.transform =
          'perspective(800px) rotateY(' + x * 8 + 'deg) rotateX(' + -y * 8 + 'deg)';
      });

      card.addEventListener('mouseleave', function () {
        card.style.transform = '';
      });
    });
  }

  /* ---------- Câu hỏi thường gặp: mở/đóng có animation, mở một mục thì đóng mục khác ---------- */
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function faqAnimate(item, open) {
    var summary = item.querySelector('summary');
    var answer = item.querySelector('p');

    if (item._faqAnim) {
      item._faqAnim.cancel();
      item._faqAnim = null;
    }
    /* viền vàng / bóng đổ đi theo trạng thái đích ngay khi bấm, không đợi animation chiều cao chạy xong */
    item.classList.toggle('fc', !open);

    if (reduceMotion || !item.animate) {
      item.open = open;
      return;
    }

    var closedH = summary.offsetHeight;
    var startH = item.offsetHeight;
    var endH;

    if (open) {
      item.open = true;
      endH = closedH + (answer ? answer.offsetHeight : 0);
    } else {
      endH = closedH;
    }

    item.style.overflow = 'hidden';
    var anim = item.animate({ height: [startH + 'px', endH + 'px'] }, { duration: 380, easing: 'cubic-bezier(.22,.8,.3,1)' });
    item._faqAnim = anim;

    if (answer) {
      answer.animate(open ? { opacity: [0, 1], transform: ['translateY(-8px)', 'none'] }
        : { opacity: [1, 0], transform: ['none', 'translateY(-8px)'] }, {
        duration: 320,
        easing: 'ease',
        fill: 'both'
      });
    }

    anim.onfinish = function () {
      item.open = open;
      item.style.overflow = '';
      item._faqAnim = null;
    };
    anim.oncancel = function () {
      item.style.overflow = '';
    };
  }

  document.addEventListener('click', function (e) {
    var summary = e.target.closest && e.target.closest('.faq summary');
    if (!summary) {
      return;
    }
    e.preventDefault();
    var item = summary.parentElement;
    var willOpen = !item.open || item.dataset.closing === '1';

    if (willOpen) {
      document.querySelectorAll('.faq details[open]').forEach(function (other) {
        if (other !== item) {
          other.dataset.closing = '1';
          faqAnimate(other, false);
        }
      });
    }
    item.dataset.closing = willOpen ? '0' : '1';
    faqAnimate(item, willOpen);
  });

  /* ---------- Thông tin cá nhân (trang tài khoản): thẻ mở/đóng có animation ---------- */
  function accAnimate(item, open) {
    var summary = item.querySelector(':scope > summary');
    var body = [].slice.call(item.children).filter(function (c) {
      return c !== summary;
    });
    if (item._accAnim) {
      item._accAnim.cancel();
      item._accAnim = null;
    }
    if (reduceMotion || !item.animate) {
      item.open = open;
      return;
    }
    var startH = item.offsetHeight;
    var endH;
    if (open) {
      item.open = true;
      item.style.height = 'auto';
      endH = item.offsetHeight;
      item.style.height = '';
    } else {
      endH = summary.offsetHeight + 2;
    }
    item.style.overflow = 'hidden';
    item.classList.toggle('acc-closing', !open);
    var anim = item.animate({ height: [startH + 'px', endH + 'px'] }, { duration: 520, easing: 'cubic-bezier(.22,.8,.3,1)' });
    item._accAnim = anim;
    body.forEach(function (el, i) {
      el.animate(open ? { opacity: [0, 1], transform: ['translateY(-12px)', 'none'] } : { opacity: [1, 0], transform: ['none', 'translateY(-8px)'] }, {
        duration: open ? 480 : 260,
        delay: open ? 90 + i * 70 : 0,
        easing: 'cubic-bezier(.2,.8,.2,1)',
        fill: 'both'
      });
    });
    anim.onfinish = function () {
      item.open = open;
      item.style.overflow = '';
      item.classList.remove('acc-closing');
      item._accAnim = null;
      body.forEach(function (el) {
        el.getAnimations().forEach(function (a) {
          a.cancel();
        });
      });
    };
    anim.oncancel = function () {
      item.style.overflow = '';
    };
  }

  document.addEventListener('click', function (e) {
    var summary = e.target.closest && e.target.closest('.acc-sec > summary');
    if (!summary) {
      return;
    }
    e.preventDefault();
    var item = summary.parentElement;
    var willOpen = !item.open || item.dataset.accClosing === '1';
    item.dataset.accClosing = willOpen ? '0' : '1';
    accAnimate(item, willOpen);
  });

  /* ---------- Ô chọn ngày: không cho chọn ngày đã qua ---------- */
  var today = new Date();
  var iso = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  document.querySelectorAll('input[type="date"]').forEach(function (input) {
    input.min = iso;
  });

  /* ---------- Form: gửi đơn lên máy chủ ---------- */
  function toast(message, isError) {
    var el = document.getElementById('toast');

    el.textContent = message;
    el.classList.toggle('err', !!isError);
    el.classList.add('on');
    clearTimeout(toast.t);
    toast.t = setTimeout(function () {
      el.classList.remove('on');
    }, 4200);
  }

  /* ---------- Yêu thích: trái tim ở điểm đến và tour (lưu theo tài khoản) ---------- */
  var favTargets = [], favSet = null; // favSet: null = chưa đăng nhập
  function paintFavs() {
    favTargets.forEach(function (t) {
      var on = !!(favSet && favSet[t[1]]);
      t[3].classList.toggle('on', on);
      t[3].firstChild.className = 'ms' + (on ? ' fill' : '');
      t[3].setAttribute('aria-pressed', on);
    });
  }
  function attachFav(host, key, kind) {
    if (!host || !key || host.querySelector('.fav-btn')) {
      return;
    }
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'fav-btn fav-' + kind;
    b.setAttribute('aria-label', 'Lưu vào yêu thích: ' + key);
    b.innerHTML = '<span class="ms">favorite</span>';
    b.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (!favSet) {
        location.href = '/login?next=%2F';
        return;
      }
      var on = !favSet[key];
      favSet[key] = on;
      paintFavs();
      fetch('/api/auth/favorite', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: key, on: on })
      })
        .then(function (r) {
        if (!r.ok) {
          throw new Error();
        }
        toast(on ? 'Đã lưu vào yêu thích' : 'Đã bỏ khỏi yêu thích');
      })
        .catch(function () {
        favSet[key] = !on;
        paintFavs();
        toast('Chưa lưu được. Vui lòng thử lại.', true);
      });
    };
    host.appendChild(b);
    favTargets.push([host, key, kind, b]);
    paintFavs();
  }
  if (window.fetch) {
    document.querySelectorAll('.dest .card').forEach(function (c) {
      var im = c.querySelector('img');
      if (im) {
        attachFav(c, im.alt, 'card');
      }
    });
    document.querySelectorAll('.tour[data-fav]').forEach(function (t) {
      attachFav(t.querySelector('.im'), t.dataset.fav, 'tour');
    });
    if (favTargets.length || document.querySelector('.tours')) {
      fetch('/api/auth/favorites', { credentials: 'same-origin' }).then(function (r) {
        return r.ok ? r.json() : null;
      }).then(function (d) {
        if (!d) {
          return;
        }
        favSet = {};
        d.items.forEach(function (k) {
          favSet[k] = true;
        });
        paintFavs();
      }).catch(function () {});
    }
  }

  /* Form tìm tour ở trang chủ: chuyển sang trang liên hệ, mang theo lựa chọn */
  document.querySelectorAll('form[data-go]').forEach(function (form) {
    form.onsubmit = function (e) {
      e.preventDefault();
      var q = new URLSearchParams();
      new FormData(form).forEach(function (v, k) {
        if (v) {
          q.set(k, v);
        }
      });
      location.href = form.dataset.go + (q.toString() ? '?' + q : '');
    };
  });

  /* Trang liên hệ: điền sẵn từ lựa chọn ở trang chủ */
  var contactForm = document.querySelector('form[data-api]');
  if (contactForm) {
    var params = new URLSearchParams(location.search);
    window.vdkApplyParams = function () {
      ['destination', 'date', 'people'].forEach(function (k) {
        var f = contactForm.elements[k];
        var v = params.get(k);
        if (f && v) {
          if (k === 'destination' && window.vdkDestTour && window.vdkDestTour[v] && f.options) {
            var has = Array.prototype.some.call(f.options, function (o) {
              return o.value === v;
            });
            v = has ? v : window.vdkDestTour[v];
          }
          f.value = v;
        }
      });
    };
    window.vdkApplyParams();
    if (params.toString()) {
      contactForm.elements.source.value = 'home';
    }

    /* Mã giảm giá: xem trước mức giảm; máy chủ kiểm tra lại khi gửi đơn */
    var cpIn = contactForm.elements.coupon, cpHint = contactForm.querySelector('.cp-hint'), cpT = 0;
    function cpCheck() {
      if (!cpIn || !cpHint || !window.fetch) {
        return;
      }
      var code = cpIn.value.trim();
      cpHint.hidden = !code;
      cpHint.className = 'cp-hint';
      if (!code) {
        return;
      }
      fetch('/api/coupon/check', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code,
          destination: contactForm.elements.destination.value,
          people: contactForm.elements.people.value
        })
      })
        .then(function (r) {
        return r.json().catch(function () {
          return {};
        }).then(function (d) {
          return { ok: r.ok, d: d };
        });
      })
        .then(function (x) {
        cpHint.classList.add(x.ok ? 'ok' : 'err');
        cpHint.textContent = x.ok ? x.d.label +
          (x.d.discount ? ' (−' + x.d.discount.toLocaleString('vi-VN') +
            'đ so với giá tour)' : '') +
          '. Áp dụng khi gửi đơn.' : (x.d.error || 'Không kiểm tra được mã.');
      }).catch(function () {
        cpHint.hidden = true;
      });
    }
    if (cpIn) {
      ['input', 'change'].forEach(function (ev) {
        [cpIn, contactForm.elements.destination, contactForm.elements.people].forEach(function (el) {
          if (el) {
            el.addEventListener(ev, function () {
              clearTimeout(cpT);
              cpT = setTimeout(cpCheck, 500);
            });
          }
        });
      });
    }
    if (cpIn && cpIn.value) {
      cpCheck();
    }

    /* Phải đăng nhập mới đặt được: chưa đăng nhập thì thay biểu mẫu bằng lời mời đăng nhập */
    var backTo = encodeURIComponent('/contact' + location.search);
    function showGate() {
      var gate = document.createElement('div');
      gate.className = 'ct gate';
      gate.innerHTML = '<span class="ms">lock</span><h2>Đăng nhập để đặt tour</h2>' +
        '<p>Bạn cần có tài khoản đã xác minh email để gửi yêu cầu đặt tour. Việc này giúp chúng tôi liên hệ đúng người và bạn theo dõi được đơn của mình.</p>' +
        '<a class="btn gold" href="/login?next=' + backTo + '">Đăng nhập</a>' +
        '<a class="btn line" href="/register?next=' + backTo + '">Tạo tài khoản mới</a>';
      contactForm.replaceWith(gate);
    }
    if (window.fetch) {
      fetch('/api/auth/me', { credentials: 'same-origin' }).then(function (r) {
        return r.json();
      }).then(function (d) {
        if (!d.user) {
          if (d.why === 'login_off') { // quản trị đã tắt đăng nhập: khách đặt tour không cần tài khoản, chỉ để lại tên + SĐT (+ email nếu muốn)
            contactForm.classList.add('guest');
            return;
          }
          showGate();
          return;
        }
        if (contactForm.elements.name && !contactForm.elements.name.value) {
          contactForm.elements.name.value = d.user.name || '';
        }
        if (contactForm.elements.phone && !contactForm.elements.phone.value) {
          contactForm.elements.phone.value = d.user.phone || '';
        }
      }).catch(function () {});
    }

    contactForm.onsubmit = function (e) {
      e.preventDefault();
      var btn = contactForm.querySelector('button');
      var body = {};
      new FormData(contactForm).forEach(function (v, k) {
        body[k] = v;
      });
      if (window.vdkTS && contactForm.querySelector('.ts-box') && !vdkTS.ready(contactForm)) {
        toast('Đang xác minh, vui lòng đợi vài giây rồi bấm lại.', true);
        return;
      }

      btn.disabled = true;
      var label = btn.textContent;
      btn.textContent = 'Đang gửi…';
      fetch('/api/' + contactForm.dataset.api, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then(function (res) {
        return res.json().catch(function () {
          return {};
        }).then(function (data) {
          if (res.status === 401 && data.code === 'login_required') {
            showGate();
            throw new Error(data.error);
          }
          if (!res.ok) {
            throw new Error(data.error || 'Chưa gửi được. Vui lòng thử lại hoặc gọi 1900 1234.');
          }
          toast(contactForm.dataset.msg);
          contactForm.reset();
          if (cpHint) {
            cpHint.hidden = true;
          }
          if (window.fetch) {
            fetch('/api/auth/me', { credentials: 'same-origin' }).then(function (r) {
              return r.json();
            }).then(function (d) {
              if (d.user) {
                contactForm.elements.name.value = d.user.name || '';
                contactForm.elements.phone.value = d.user.phone || '';
              }
            }).catch(function () {});
          }
        });
      }).catch(function (err) {
        toast(err.message === 'Failed to fetch' ? 'Mất kết nối mạng. Vui lòng thử lại.' : err.message, true);
      }).then(function () {
        btn.disabled = false;
        btn.textContent = label;
        if (window.vdkTS) {
          vdkTS.reset(contactForm);
        }
      });
    };
  }

  /* ---------- Điểm đến + tour từ trang quản trị: thẻ ở trang chủ và ô chọn điểm đến ---------- */
  var destSelects = document.querySelectorAll('select[name="destination"]');
  var destGrid = document.querySelector('.dest');
  if ((destSelects.length || destGrid) && window.fetch) {
    var jget = function (u) {
      return fetch(u).then(function (r) {
        return r.ok ? r.json() : null;
      }).catch(function () {
        return null;
      });
    };
    Promise.all([jget('/api/destinations'), jget('/api/tours')]).then(function (rs) {
      var ds = rs[0] && rs[0].items, ts = rs[1] && rs[1].items;
      var escH = function (x) {
        return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) {
          return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
          }[c];
        });
      };
      var imgUrl = function (u) {
        return /^https:/.test(u) ? u : '/' + String(u || '').replace(/^\/+/, '');
      };
      /* thẻ điểm đến ở trang chủ: cập nhật, ẩn, thêm mới, sắp xếp theo admin */
      if (ds && destGrid) {
        var cards = {};
        destGrid.querySelectorAll('.card').forEach(function (c) {
          var im = c.querySelector('img');
          if (im) {
            cards[im.alt] = c;
          }
        });
        var active = {};
        ds.forEach(function (d) {
          active[d.name] = d;
        });
        Object.keys(cards).forEach(function (k) {
          if (!active[k]) {
            cards[k].hidden = true;
          }
        });
        ds.forEach(function (d, i) {
          var c = cards[d.name];
          if (!c) {
            c = document.createElement('a');
            c.className = 'card rv z in';
            c.href = '/contact?destination=' + encodeURIComponent(d.name);
            c.innerHTML = '<img alt="' + escH(d.name) + '" loading="lazy" decoding="async" src="' +
              escH(imgUrl(d.image || 'images/hero.jpg')) +
              '"/><span class="go"><span class="ms">north_east</span></span><div><span class="tag"></span><h3></h3><small></small></div>';
            destGrid.appendChild(c);
            attachFav(c, d.name, 'card');
          } else {
            c.hidden = false;
          }
          var im = c.querySelector('img');
          if (d.image && im.getAttribute('src') !== imgUrl(d.image)) {
            im.src = imgUrl(d.image);
          }
          c.querySelector('.tag').textContent = d.province || '';
          c.querySelector('.tag').hidden = !d.province;
          c.querySelector('h3').textContent = d.title || d.name;
          c.querySelector('small').textContent = d.blurb || '';
          c.href = '/contact?destination=' + encodeURIComponent(d.name);
          destGrid.appendChild(c); // xếp lại đúng thứ tự: bố cục lưới tính theo vị trí
        });
        Object.keys(cards).forEach(function (k) {
          if (!active[k]) {
            destGrid.appendChild(cards[k]);
          }
        });
      }
      /* ô chọn: danh sách tour đang bán (gồm cả tour tự tạo trong trang quản trị).
         Không tải được tour thì giữ nguyên danh sách điểm đến có sẵn trong HTML. */
      if (destSelects.length) {
        var seenTour = {};
        var tourNames = [];
        var destTour = {};
        (ts || []).forEach(function (t) {
          if (!t.active || !t.name) {
            return;
          }
          if (t.destination && !destTour[t.destination]) {
            destTour[t.destination] = t.name;
          }
          if (!seenTour[t.name]) {
            seenTour[t.name] = 1;
            tourNames.push(t.name);
          }
        });
        /* link cũ dạng ?destination=Sa Pa (thẻ điểm đến ở trang chủ) → chọn tour của điểm đó */
        window.vdkDestTour = destTour;
        if (tourNames.length) {
          destSelects.forEach(function (sel) {
            var cur = sel.value;
            while (sel.options.length > 1 || sel.children.length > 1) {
              sel.removeChild(sel.lastChild);
            }
            var g = document.createElement('optgroup');
            g.label = 'Tour';
            tourNames.forEach(function (n) {
              var o = document.createElement('option');
              o.value = n;
              o.textContent = n;
              g.appendChild(o);
            });
            sel.appendChild(g);
            sel.value = cur;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
          });
        }
        if (window.vdkApplyParams) {
          window.vdkApplyParams();
        }
      }
    });
  }

  /* ---------- Giá & thông tin tour lấy từ trang quản trị (/api/tours) ---------- */
  var tourCards = document.querySelectorAll('.tour[data-fav]');
  if ((tourCards.length || document.querySelector('.tours[data-all]')) && window.fetch) {
    fetch('/api/tours').then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (d) {
      if (!d || !d.items) {
        return;
      }
      var by = {};
      d.items.forEach(function (t) {
        by[t.slug] = t;
      });
      /* Tour tự tạo trong admin: chưa có thẻ sẵn trong HTML thì dựng thêm */
      var grid = document.querySelector('.tours');
      var DEF_IMG = {
        'Vịnh Hạ Long': 'd-halong',
        'Sa Pa': 'd-sapa',
        'Hội An': 'd-hoian',
        'Huế': 'd-hue',
        'Đà Lạt': 'd-dalat',
        'Phú Quốc': 'd-phuquoc'
      };
      var esc2 = function (s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
          return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
          }[c];
        });
      };
      /* Đánh giá thật từ khách (đã duyệt); chưa có thì ghi rõ, không tự bịa số */
      var rateHTML = function (t) {
        var n = Number(t.rating_count) || 0;
        return n ? '<span class="ms fill">star</span> ' + String(t.rating_avg).replace('.', ',') + ' (' + n +
          ' đánh giá)' : '<span class="ms">star</span> Chưa có đánh giá';
      };
      var setRate = function (card, t) {
        var r = card.querySelector('.rate');
        if (!r) {
          r = document.createElement('div');
          r.className = 'rate';
          var pr = card.querySelector('.pr');
          pr.parentNode.insertBefore(r, pr);
        }
        r.innerHTML = rateHTML(t);
        r.classList.toggle('none', !(Number(t.rating_count) > 0));
      };
      var have = {};
      tourCards.forEach(function (c) {
        have[c.dataset.fav] = 1;
      });
      if (grid) {
        d.items.forEach(function (t) {
          if (have[t.slug] || !t.active) {
            return;
          }
          var img = t.image ? (/^https:/.test(t.image) ? t.image : '/' + t.image) : '/images/' +
            (DEF_IMG[t.destination] || 'hero') + '.jpg';
          var el = document.createElement('article');
          el.className = 'tour rv in';
          el.dataset.fav = t.slug;
          el.dataset.custom = '1';
          el.innerHTML = '<div class="im">' + (t.badge ? '<span class="bdg">' + esc2(t.badge) + '</span>' : '') + '<img alt="' + esc2(t.name) + '" loading="lazy" decoding="async" src="' + esc2(img) + '"/></div>' +
            '<div class="bd"><div class="meta"><span><span class="ms">schedule</span> ' + esc2(t.duration || 'Liên hệ') + '</span><span><span class="ms">group</span> ' + esc2(t.group_note || 'Nhóm nhỏ') + '</span></div>' +
            '<h3>' + esc2(t.name) + '</h3>' + (t.summary ? '<p class="tsum">' + esc2(t.summary) + '</p>' : '') +
            '<div class="pr"><b>' + (Number(t.price) ? Number(t.price).toLocaleString('vi-VN') + 'đ' : 'Liên hệ') + '</b>' +
            (t.old_price ? '<s class="old">' + Number(t.old_price).toLocaleString('vi-VN') + 'đ</s>' : '') +
            '<a href="/contact?destination=' + encodeURIComponent(t.name) + '">Đặt tour <span class="ms">arrow_forward</span></a></div></div>';
          setRate(el, t);
          grid.appendChild(el);
          attachFav(el.querySelector('.im'), t.slug, 'tour');
        });
      }
      /* Tour hot: trang chủ chỉ hiện 3 tour đầu; nút "Tất cả tour" chuyển sang trang /tours (hiện đủ) */
      var HOT = 3, allBox = document.getElementById('toursAll'), allBtn = document.getElementById('toursAllBtn');
      var loading = document.getElementById('toursLoading');
      if (loading) {
        loading.hidden = true;
      }
      if (grid && grid.hasAttribute('data-all')) {
        var none = document.getElementById('toursNone');
        if (none) {
          none.hidden = grid.querySelectorAll('.tour').length > 0;
        }
      } else if (grid && allBox) {
        var vis = Array.prototype.filter.call(grid.querySelectorAll('.tour'), function (c) {
          var t = by[c.dataset.fav];
          return !(t && !t.active);
        });
        vis.forEach(function (c, i) {
          c.classList.toggle('more', i >= HOT);
        });
        allBox.hidden = vis.length <= HOT;
        allBtn.textContent = 'Tất cả tour (' + vis.length + ')';
      }
      tourCards.forEach(function (card) {
        var t = by[card.dataset.fav];
        if (!t) {
          return;
        }
        if (!t.active) {
          card.hidden = true;
          return;
        }
        var bk = card.querySelector('.pr a[href^="/contact"]');
        if (bk) {
          bk.href = '/contact?destination=' + encodeURIComponent(t.name);
        }
        var set = function (sel, v) {
          var el = card.querySelector(sel);
          if (el && v) {
            el.textContent = v;
          }
        };
        set('h3', t.name);
        set('.pr b', Number(t.price).toLocaleString('vi-VN') + 'đ');
        var meta = card.querySelectorAll('.meta > span');
        var put = function (el, v) {
          if (el && v) {
            el.lastChild.textContent = ' ' + v;
          }
        };
        put(meta[0], t.duration);
        put(meta[1], t.group_note);
        var bdg = card.querySelector('.bdg');
        if (bdg) {
          bdg.textContent = t.badge || '';
          bdg.hidden = !t.badge;
        }
        setRate(card, t);
      });
    }).catch(function () {});
  }

  /* ---------- Dòng tin cậy ở banner: lấy từ đánh giá thật ---------- */
  var heroTrust = document.getElementById('heroTrust');
  if (heroTrust && window.fetch) {
    fetch('/api/reviews?size=1').then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (d) {
      var box = heroTrust.parentNode;
      if (!d || !d.count) {
        box.hidden = true;
        return;
      }
      var full = Math.round(d.avg), st = box.querySelector('.st');
      if (st) {
        st.querySelectorAll('.ms').forEach(function (n, i) {
          n.classList.toggle('fill', i < full);
        });
      }
      heroTrust.textContent = String(d.avg).replace('.', ',') + '/5 từ ' + d.count.toLocaleString('vi-VN') +
        ' đánh giá của khách hàng';
    }).catch(function () {});
  }
})();

/* Thanh tiến độ cuộn trang */
(function () {
  var bar = document.createElement('div');
  bar.id = 'scrollbar';
  bar.setAttribute('aria-hidden', 'true');
  document.body.appendChild(bar);
  var tick = false;
  function upd() {
    var h = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.transform = 'scaleX(' + (h > 0 ? Math.min(1, window.scrollY / h) : 0) + ')';
    tick = false;
  }
  window.addEventListener('scroll', function () {
    if (!tick) {
      tick = true;
      requestAnimationFrame(upd);
    }
  }, { passive: true });
  upd();
})();
