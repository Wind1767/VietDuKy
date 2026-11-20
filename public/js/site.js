/* Áp cài đặt website do quản trị chỉnh (màu, chữ, banner, bảo trì...). Dùng bản lưu sẵn để không bị nháy khi tải trang. */
(function () {
  'use strict';
  var KEY = 'vdk-site', S = null;
  try {
    S = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch (e) {}
  window.VDK_SITE = S || {};

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
  function set(sel, txt) {
    if (txt == null || txt === '') {
      return;
    }
    document.querySelectorAll(sel).forEach(function (n) {
      n.textContent = txt;
    });
  }

  function applyCss(s) {
    var st = document.getElementById('vdk-site-css');
    if (!st) {
      st = document.createElement('style');
      st.id = 'vdk-site-css';
      document.head.appendChild(st);
    }
    var c = [];
    c.push(':root:not([data-theme="dark"]){--jade:' + s.color_brand + ';--brand:' + s.color_brand +
      ';--jade2:' + s.color_brand2 + ';--mist:' + s.color_mist + '}');
    c.push(':root{--gold:' + s.color_accent + ';--red:' + s.color_red + '}');
    if (s.font_scale && s.font_scale !== 100) {
      c.push('html{font-size:' + (16 * s.font_scale / 100) + 'px}');
    }
    if (s.radius_scale != null && s.radius_scale !== 100) {
      c.push(':root{--r:' + Math.round(22 * s.radius_scale / 100) + 'px}');
    }
    if (s.show_theme_toggle === false) {
      c.push('.theme-btn{display:none!important}');
    }
    c.push('.blk-off{display:none!important}');
    if (s.custom_css) {
      c.push(s.custom_css);
    }
    st.textContent = c.join('\n');
  }

  function banner(s) {
    var old = document.getElementById('vdkBanner');
    if (old) {
      old.remove();
    }
    if (!s.banner_on || !s.banner_text) {
      return;
    }
    try {
      if (sessionStorage.getItem('vdk-banner') === s.banner_text) {
        return;
      }
    } catch (e) {}
    var b = document.createElement('div');
    b.id = 'vdkBanner';
    b.className = 'site-banner ' + (s.banner_style || 'promo');
    b.setAttribute('role', 'status');
    b.innerHTML = '<span>' + esc(s.banner_text) + '</span>' + (s.banner_link ? '<a href="' +
      esc(s.banner_link) + '">' + esc(s.banner_link_text || 'Xem ngay') + '</a>' : '') +
      (s.banner_closable ? '<button type="button" aria-label="Đóng thông báo"><span class="ms">close</span></button>' : '');
    var x = b.querySelector('button');
    if (x) {
      x.onclick = function () {
        b.remove();
        document.documentElement.classList.remove('has-banner');
        try {
          sessionStorage.setItem('vdk-banner', s.banner_text);
        } catch (e) {}
      };
    }
    document.body.insertBefore(b, document.body.firstChild);
    document.documentElement.classList.add('has-banner');
  }

  function maintenance(s) {
    var old = document.getElementById('vdkMaint');
    if (old) {
      old.remove();
    }
    if (!s.maint_on) {
      return;
    }
    var m = document.createElement('div');
    m.id = 'vdkMaint';
    m.className = 'site-maint';
    m.innerHTML = '<div><span class="ms">lock</span><h1>' + esc(s.site_name || 'Việt Du Ký') + '</h1><p>' +
      esc(s.maint_text) + '</p>' +
      (s.hotline ? '<a href="tel:' +
        esc(String(s.hotline).replace(/[^\d+]/g, '')) + '">Hotline ' + esc(s.hotline) + '</a>' : '') +
      '</div>';
    document.body.appendChild(m);
    document.documentElement.classList.add('in-maint');
  }

  function content(s) {
    set('[data-site="site_name"]', s.site_name);
    set('[data-site="hotline"]', s.hotline);
    set('[data-site="contact_email"]', s.contact_email);
    set('[data-site="address"]', s.address);
    set('[data-site="work_hours"]', s.work_hours);
    set('[data-site="footer_about"]', s.footer_about);
    set('[data-site="copyright"]', s.copyright);
    set('[data-site="tagline"]', s.tagline);
    set('.hero .lead', s.hero_lead);
    set('.cta h2', s.cta_title);
    set('.cta p', s.cta_text);
    set('.cta a.btn', s.cta_btn);
    document.querySelectorAll('a[data-site-tel]').forEach(function (a) {
      if (s.hotline) {
        a.href = 'tel:' + String(s.hotline).replace(/[^\d+]/g, '');
      }
    });
    var soc = {
      zalo: 'chat',
      facebook: 'public',
      instagram: 'photo_camera',
      youtube: 'smart_display',
      tiktok: 'music_note'
    }, SN = {
      zalo: 'Zalo',
      facebook: 'Facebook',
      instagram: 'Instagram',
      youtube: 'YouTube',
      tiktok: 'TikTok'
    };
    document.querySelectorAll('[data-site-social]').forEach(function (box) {
      box.innerHTML = Object.keys(soc).filter(function (k) {
        return s[k];
      }).map(function (k) {
        return '<a href="' + esc(s[k]) + '" target="_blank" rel="noopener noreferrer">' + SN[k] + '</a>';
      }).join('');
    });
    set('#diem-den .sec-h h2', s.dest_title);
    set('#diem-den .sec-h p', s.dest_sub);
    if (document.querySelector('.ph') && /^\/about\/?(\.html)?$/.test(location.pathname)) {
      set('.ph h1', s.about_hero_title);
      set('.ph p', s.about_hero_sub);
      var two = document.querySelector('.two .r');
      if (two) {
        set('.two .r h2', s.about_title);
        var ps = two.querySelectorAll('p');
        if (ps[0] && s.about_p1) {
          ps[0].textContent = s.about_p1;
        }
        if (ps[1] && s.about_p2) {
          ps[1].textContent = s.about_p2;
        }
        set('.two .r .btn', s.about_btn);
      }
      set('.why .sec-h h2', s.values_title);
      var g = document.querySelector('.why .g');
      if (g && Array.isArray(s.values_items) && s.values_items.length) {
        g.innerHTML = s.values_items.map(function (v, i) {
          return '<div class="it rv in" data-d=".' + i + '"><div class="ic"><span class="ms">' + esc(v.icon) +
            '</span></div><h3>' + esc(v.title) + '</h3><p>' + esc(v.text) + '</p></div>';
        }).join('');
      }
    }
    var faq = document.querySelector('.faq');
    if (faq && Array.isArray(s.faq_items)) {
      faq.innerHTML = s.faq_items.map(function (f) {
        return '<details><summary>' + esc(f.q) + '<span class="ms">expand_more</span></summary><p>' + esc(f.a) +
          '</p></details>';
      }).join('');
    }
    if (s.meta_title && (document.body.dataset.page === 'index' || location.pathname === '/')) {
      document.title = s.meta_title;
    }
    if (s.meta_desc) {
      var md = document.querySelector('meta[name="description"]');
      if (md) {
        md.setAttribute('content', s.meta_desc);
      }
    }
    if (s.default_theme === 'dark') {
      try {
        if (!localStorage.getItem('vdk-theme')) {
          document.documentElement.dataset.theme = 'dark';
        }
      } catch (e) {}
    }
    var words = String(s.typed_words || '').split(',').map(function (x) {
      return x.trim();
    }).filter(Boolean);
    if (words.length && window.VDK_WORDS) {
      window.VDK_WORDS.length = 0;
      words.forEach(function (w) {
        window.VDK_WORDS.push(w);
      });
    }
  }

  /* bật/tắt và sắp xếp các khối ở trang chủ (khối có data-block; banner lớn đầu trang luôn ở trên cùng) */
  function blocks(s) {
    var end = document.getElementById('blkEnd');
    if (!end) {
      return;
    }
    var els = {};
    document.querySelectorAll('[data-block]').forEach(function (n) {
      els[n.getAttribute('data-block')] = n;
    });
    var order = Array.isArray(s.home_blocks) ? s.home_blocks.slice() : [], seen = {};
    order.forEach(function (o) {
      seen[o.id] = 1;
    });
    Object.keys(els).forEach(function (id) {
      if (!seen[id]) {
        order.push({ id: id, on: true });
      }
    });
    order.forEach(function (o) {
      var el = els[o.id];
      if (!el) {
        return;
      }
      end.parentNode.insertBefore(el, end);
      el.classList.toggle('blk-off', o.on === false);
    });
  }
  function nav() {
    if (window.vdkRenderNav) {
      window.vdkRenderNav();
    }
  }

  /* Công tắc tính năng phía khách: tắt thì ẩn phần giao diện liên quan (class trên <html>, luật CSS ở components.css) */
  var FEATS = ['upload', 'login', 'register', 'chat', 'reviews', 'booking', 'bugreport', 'favorites', 'compare', 'coupons', 'inbox', 'email_verify', 'about', 'tours', 'pages', 'forgot', 'cancel', 'votes', 'share', 'filter'];
  function features(s) {
    var root = document.documentElement;
    FEATS.forEach(function (k) {
      root.classList.toggle('no-' + k, s['feat_' + k] === false);
    });
    if (s.feat_chat === false) {
      var chat = document.getElementById('vdkChat');
      if (chat) {
        chat.remove();
      }
    }
    if (window.vdkTS && window.vdkTS.refresh) {
      window.vdkTS.refresh();
    }
    document.dispatchEvent(new Event('vdk:site'));
  }

  function apply(s) {
    window.VDK_SITE = s;
    applyCss(s);
    features(s);
    var go = function () {
      content(s);
      blocks(s);
      nav();
      banner(s);
      maintenance(s);
    };
    if (document.body) {
      go();
    } else {
      document.addEventListener('DOMContentLoaded', go);
    }
  }
  /* Quy tắc mật khẩu từ máy chủ: ô nhập có data-pass-new nhận minlength/placeholder, chỗ có data-minpass nhận con số */
  window.VDK_RULES = window.VDK_RULES || { minPass: 10, maxPass: 128 };
  function rules(r) {
    if (r && r.minPass) {
      window.VDK_RULES = r;
      try {
        localStorage.setItem('vdk-rules', JSON.stringify(r));
      } catch (e) {}
    }
    var R = window.VDK_RULES;
    document.querySelectorAll('input[data-pass-new]').forEach(function (i) {
      i.setAttribute('minlength', R.minPass);
      i.setAttribute('maxlength', R.maxPass);
      var ph = i.getAttribute('placeholder') || '';
      i.setAttribute('placeholder', ph.replace(/\d+ ký tự/, R.minPass + ' ký tự'));
    });
    document.querySelectorAll('[data-minpass]').forEach(function (n) {
      n.textContent = R.minPass;
    });
    enhancePass();
  }
  /* Ô mật khẩu: nút hiện/ẩn; ô mật khẩu mới có thêm gợi ý còn thiếu bao nhiêu ký tự (theo quy tắc từ máy chủ) */
  function enhancePass() {
    document.querySelectorAll('input[type="password"]').forEach(function (i) {
      if (i.dataset.pwDone) {
        return;
      }
      i.dataset.pwDone = '1';
      var wrap = document.createElement('span');
      wrap.className = 'pw-wrap';
      i.parentNode.insertBefore(wrap, i);
      wrap.appendChild(i);
      var eye = document.createElement('button');
      eye.type = 'button';
      eye.className = 'pw-eye';
      eye.setAttribute('aria-label', 'Hiện mật khẩu');
      eye.setAttribute('aria-pressed', 'false');
      eye.innerHTML = '<span class="ms">visibility</span>';
      eye.onclick = function () {
        var show = i.type === 'password';
        i.type = show ? 'text' : 'password';
        eye.setAttribute('aria-pressed', String(show));
        eye.setAttribute('aria-label', show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
        eye.firstChild.textContent = show ? 'visibility_off' : 'visibility';
      };
      wrap.appendChild(eye);
      if (i.hasAttribute('data-pass-new')) {
        var hint = document.createElement('small');
        hint.className = 'pw-hint';
        hint.setAttribute('aria-live', 'polite');
        wrap.parentNode.insertBefore(hint, wrap.nextSibling);
        var upd = function () {
          var need = window.VDK_RULES.minPass - i.value.length;
          hint.textContent = !i.value ? '' : need > 0 ? 'Cần thêm ' + need + ' ký tự nữa.' : 'Đủ độ dài.';
          hint.classList.toggle('ok', i.value.length >= window.VDK_RULES.minPass);
        };
        i.addEventListener('input', upd);
      }
    });
  }
  window.vdkApplyRules = rules;
  try {
    var cached = JSON.parse(localStorage.getItem('vdk-rules') || 'null');
    if (cached && cached.minPass) {
      window.VDK_RULES = cached;
    }
  } catch (e) {}
  document.addEventListener('DOMContentLoaded', function () {
    rules();
  });
  window.vdkSiteApply = function () {
    if (window.VDK_SITE && window.VDK_SITE.site_name) {
      content(window.VDK_SITE);
      blocks(window.VDK_SITE);
      nav();
      banner(window.VDK_SITE);
      maintenance(window.VDK_SITE);
    }
  };
  if (S && S.site_name) {
    applyCss(S);
    features(S);
    document.addEventListener('DOMContentLoaded', function () {
      content(S);
      blocks(S);
      banner(S);
      maintenance(S);
    });
  }

  if (window.fetch) {
    fetch('/api/site').then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (d) {
      if (!d || !d.site) {
        return;
      }
      try {
        localStorage.setItem(KEY, JSON.stringify(d.site));
      } catch (e) {}
      apply(d.site);
      rules(d.rules);
    }).catch(function () {
      if (S) {
        apply(S);
      }
    });
  } else if (S) {
    apply(S);
  }
})();
