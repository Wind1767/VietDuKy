/* Bộ dựng Markdown nhỏ gọn, an toàn (mọi HTML đều bị escape). Dùng chung cho admin (xem trước) và hòm thư của khách.
Hỗ trợ: tiêu đề # và gạch chân ===/---, đậm, nghiêng, đậm-nghiêng, gạch ngang ~~, tô sáng ==, chỉ số trên ^x^ / dưới ~x~,
code nội dòng, khối code ```lang, trích dẫn lồng nhau, danh sách số / gạch đầu dòng lồng nhau, danh sách việc [ ] [x],
bảng có căn lề, liên kết (kể cả liên kết tham chiếu [a][id]), liên kết tự động, ảnh (có cỡ =200x100), đường kẻ ngang, xuống dòng,
ký tự thoát \, chú thích cuối trang [^1], hộp cảnh báo > [!NOTE], khối ::: (note/tip/warning/danger/details), danh sách định nghĩa,
viết tắt *[HTML]: ..., công thức $x$ và $$x$$, emoji :smile:, ++chèn++, [[Ctrl+C]] / <kbd>, mục lục [[toc]], neo tiêu đề,
code thụt 4 ô, khối ```ngôn-ngữ có tô màu (md-highlight.js) và nút sao chép chỉ lấy phần mã. */
(function () {
  'use strict';
  var uid = 0, refs = {}, abbrs = {};
  var EMOJI = { smile: '😄', grin: '😁', joy: '😂', wink: '😉', heart: '❤️', thumbsup: '👍', '+1': '👍', '-1': '👎', tada: '🎉', fire: '🔥', star: '⭐', rocket: '🚀', warning: '⚠️', check: '✅', white_check_mark: '✅', x: '❌', bulb: '💡', memo: '📝', eyes: '👀', pray: '🙏', clap: '👏', sunny: '☀️', cloud: '☁️', beach: '🏖️', mountain: '⛰️', airplane: '✈️', camera: '📷', pushpin: '📌', point_right: '👉', sparkles: '✨', ok_hand: '👌', thinking: '🤔', sob: '😭', cry: '😢', sunglasses: '😎', wave: '👋', money: '💰', gift: '🎁', car: '🚗', bus: '🚌', house: '🏠', map: '🗺️', flag_vn: '🇻🇳', vn: '🇻🇳' };
  var BOX = { note: 'Ghi chú', tip: 'Mẹo', info: 'Thông tin', warning: 'Cảnh báo', danger: 'Nguy hiểm', important: 'Quan trọng', caution: 'Thận trọng', success: 'Thành công' };
  function slug(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'muc';
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function unesc(s) {
    return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, '\'').replace(/&amp;/g, '&');
  }
  function tex(src, block) {
    return window.vdkTex ? window.vdkTex.render(src, block) : esc(src);
  }
  function okUrl(u, img) {
    u = u.replace(/&amp;/g, '&').trim();
    if (img) {
      return /^https:\/\//i.test(u) ? esc(u) : '';
    }
    return /^(https?:\/\/|\/(?!\/)|#|mailto:|tel:)/i.test(u) ? esc(u) : '';
  }

  function inline(src, fn) {
    var stash = [];
    function keep(h) {
      stash.push(h);
      return '\u0000' + (stash.length - 1) + '\u0000';
    }
    var t = esc(src);
    t = t.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, function (m, a, c) {
      return keep('<code>' + c.trim() + '</code>');
    });
    t = t.replace(/\$\$([^$\n]+?)\$\$|\$([^\s$](?:[^$\n]*?[^\s$])?)\$(?!\d)/g, function (m, a, b) {
      return keep('<span class="md-math">' + tex(unesc(a || b), false) + '</span>');
    });
    t = t.replace(/\\([\\`*_{}\[\]()#+\-.!~^=|>])/g, function (m, c) {
      return keep(c);
    });
    t = t.replace(/!\[([^\]]*)\]\(\s*([^\s)]+)(?:\s+=(\d{1,4})?x(\d{1,4})?)?(?:\s+&quot;([^)]*?)&quot;)?\s*\)/g, function (m, alt, u, w, hh, ttl) {
      var s = okUrl(u, true);
      return s ? keep('<img src="' + s + '" alt="' + alt + '" loading="lazy"' + (w ? ' width="' + w + '"' : '') + (hh ? ' height="' + hh + '"' : '') + (ttl ? ' title="' + ttl + '"' : '') + '>') : alt;
    });
    t = t.replace(/(!?)\[([^\]]+)\]\[([^\]]*)\]/g, function (m, bang, txt, id) {
      var r = refs[(id || txt).toLowerCase()];
      if (!r) {
        return m;
      }
      var s = okUrl(r.u, !!bang);
      if (!s) {
        return txt;
      }
      var ttl = r.t ? ' title="' + esc(r.t) + '"' : '';
      return bang ? keep('<img src="' + s + '" alt="' + txt + '" loading="lazy"' + ttl + '>') : keep('<a href="' + s + '" target="_blank" rel="noopener noreferrer"' + ttl + '>') + txt + keep('</a>');
    });
    t = t.replace(/\[([^\]]+)\]\(\s*([^\s)]+)(?:\s+&quot;([^)]*?)&quot;)?\s*\)/g, function (m, txt, u, ttl) {
      var s = okUrl(u, false);
      return s ? keep('<a href="' + s + '" target="_blank" rel="noopener noreferrer"' + (ttl ? ' title="' + ttl + '"' : '') + '>') + txt + keep('</a>') : txt;
    });
    t = t.replace(/&lt;(https?:\/\/[^\s&]+(?:&amp;[^\s&]*)*)&gt;/g, function (m, u) {
      return keep('<a href="' + okUrl(u) + '" target="_blank" rel="noopener noreferrer">' + u + '</a>');
    });
    t = t.replace(/&lt;(kbd|ins|u|small|mark|sub|sup|del|s|abbr|cite|q)&gt;([\s\S]*?)&lt;\/\1&gt;/gi, function (m, tag, c) {
      return keep('<' + tag.toLowerCase() + '>') + c + keep('</' + tag.toLowerCase() + '>');
    });
    t = t.replace(/&lt;br\s*\/?&gt;/gi, function () {
      return keep('<br>');
    });
    t = t.replace(/\[\[([^\]\n]{1,40})\]\]/g, function (m, k) {
      return keep('<kbd>' + k + '</kbd>');
    });
    t = t.replace(/(^|[\s(])(https:\/\/[^\s<)]+)/g, function (m, p, u) {
      return p + keep('<a href="' + okUrl(u) + '" target="_blank" rel="noopener noreferrer">' + u + '</a>');
    });
    t = t.replace(/\[\^([^\]\s]+)\]/g, function (m, id) {
      if (!fn) {
        return m;
      }
      var n = fn.order.indexOf(id);
      if (n < 0) {
        fn.order.push(id);
        n = fn.order.length - 1;
      }
      return keep('<sup class="fnref"><a href="#fn' + fn.uid + '-' + (n + 1) + '" id="fr' + fn.uid + '-' + (n + 1) + '">' + (n + 1) + '</a></sup>');
    });
    t = t.replace(/(\*\*\*|___)(?=\S)([\s\S]*?\S)\1/g, '<strong><em>$2</em></strong>')
      .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '<strong>$2</strong>')
      .replace(/\*(?=\S)([^*]*?\S)\*/g, '<em>$1</em>')
      .replace(/(^|[^\w])_(?=\S)([^_]*?\S)_(?!\w)/g, '$1<em>$2</em>')
      .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>')
      .replace(/==(?=\S)([\s\S]*?\S)==/g, '<mark>$1</mark>')
      .replace(/\+\+(?=\S)([\s\S]*?\S)\+\+/g, '<ins>$1</ins>')
      .replace(/:([a-z0-9_+-]{1,24}):/g, function (m, k) {
        return EMOJI[k] || m;
      })
      .replace(/\^([^\s^]+)\^/g, '<sup>$1</sup>')
      .replace(/~([^\s~]+)~/g, '<sub>$1</sub>');
    t = t.replace(/(?: {2,}|\\)\n/g, '<br>').replace(/\n/g, '<br>');
    var ab = Object.keys(abbrs);
    if (ab.length) {
      var re = new RegExp('\\b(' + ab.map(function (a) {
        return a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }).join('|') + ')\\b', 'g');
      t = t.split(/(<[^>]*>)/).map(function (part) {
        return part[0] === '<' ? part : part.replace(re, function (w) {
          return '<abbr title="' + esc(abbrs[w]) + '">' + w + '</abbr>';
        });
      }).join('');
    }
    return t.replace(/\u0000(\d+)\u0000/g, function (m, i) {
      return stash[+i];
    });
  }

  var RE_HR = /^ {0,3}([-*_])( *\1){2,} *$/;
  var RE_LI = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
  var RE_TOC = /^\s*(\[\[toc\]\]|\[toc\])\s*$/i;
  var RE_SEP = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

  function cells(line) {
    var s = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    return s.split(/(?<!\\)\|/).map(function (c) {
      return c.trim().replace(/\\\|/g, '|');
    });
  }
  function startsBlock(l, next) {
    return /^ {0,3}#{1,6}\s/.test(l) || /^ {0,3}(```|~~~|:::\s*\w|\$\$)/.test(l) || RE_TOC.test(l) || RE_HR.test(l) || /^ {0,3}>/.test(l) || RE_LI.test(l) ||
      (l.indexOf('|') > -1 && next != null && RE_SEP.test(next) && next.indexOf('-') > -1 && next.indexOf('|') > -1);
  }

  function heading(n, text, fn) {
    var id = slug(text.replace(/[*_`~=^\[\]()!]/g, ''));
    if (fn) {
      var base = id, k = 1;
      while (fn.ids[id]) {
        id = base + '-' + (++k);
      }
      fn.ids[id] = 1;
      fn.toc.push([n, id, text]);
      id = fn.uid + '-' + id;
    }
    return '<h' + n + (fn ? ' id="md' + id + '"' : '') + '>' + inline(text, fn) + '</h' + n + '>';
  }

  /* Khối mã: có nhãn ngôn ngữ + nút sao chép (script ở dưới chỉ chép chữ trong <code>, không dính tên biểu tượng) */
  function codeBlock(lang, code) {
    var hl = window.vdkHl, toks = hl && lang ? hl.tokenize(lang, code) : null, body;
    if (toks) {
      body = toks.map(function (t) {
        return t[0] ? '<span class="tk-' + t[0] + '">' + esc(t[1]) + '</span>' : esc(t[1]);
      }).join('');
    } else {
      body = esc(code);
    }
    var name = lang ? (hl ? hl.label(lang) : lang) : '';
    return '<div class="md-code"><div class="md-ch"><span class="md-lang">' + esc(name) + '</span><button type="button" class="md-copy" data-md-copy aria-label="Sao chép mã"><span class="ms" aria-hidden="true">content_copy</span><span class="md-ct">Sao chép</span></button></div><pre><code' + (lang ? ' class="lang-' + esc(lang) + '"' : '') + '>' + body + '</code></pre></div>';
  }

  function blocks(lines, fn) {
    var out = [], i = 0;
    while (i < lines.length) {
      var l = lines[i], m;
      if (!l.trim()) {
        i++;
        continue;
      }
      if ((m = l.match(/^ {0,3}(```|~~~)\s*([\w+-]*)/))) {
        var fence = m[1], code = [];
        i++;
        while (i < lines.length && !new RegExp('^ {0,3}' + fence + '\\s*$').test(lines[i])) {
          code.push(lines[i++]);
        }
        i++;
        out.push(codeBlock(m[2], code.join('\n')));
        continue;
      }
      if (/^ {0,3}\$\$\s*$/.test(l)) {
        var mt = [];
        i++;
        while (i < lines.length && !/^ {0,3}\$\$\s*$/.test(lines[i])) {
          mt.push(lines[i++]);
        }
        i++;
        out.push('<div class="md-math md-math-block">' + tex(mt.join('\n'), true) + '</div>');
        continue;
      }
      if (RE_TOC.test(l)) {
        out.push('<!--vdk-toc-->');
        i++;
        continue;
      }
      if ((m = l.match(/^ {0,3}:::\s*(\w+)[ \t]*(.*?)\s*$/))) {
        var depth = 1, inner = [];
        i++;
        while (i < lines.length) {
          if (/^ {0,3}:::\s*\w/.test(lines[i])) {
            depth++;
          } else if (/^ {0,3}:::\s*$/.test(lines[i]) && --depth === 0) {
            break;
          }
          inner.push(lines[i++]);
        }
        i++;
        var kind = m[1].toLowerCase(), ttl = m[2];
        if (kind === 'details' || kind === 'spoiler') {
          out.push('<details class="md-details"><summary>' + inline(ttl || 'Chi tiết', fn) + '</summary>' + blocks(inner, fn) + '</details>');
        } else {
          var bk = BOX[kind] ? kind : 'note';
          out.push('<div class="md-box md-' + bk + '"><div class="md-box-t">' + (ttl ? inline(ttl, fn) : BOX[bk]) + '</div>' + blocks(inner, fn) + '</div>');
        }
        continue;
      }
      if (/^ {4,}\S/.test(l)) {
        var ic = [];
        while (i < lines.length && (/^ {4,}\S/.test(lines[i]) || (!lines[i].trim() && i + 1 < lines.length && /^ {4,}\S/.test(lines[i + 1])))) {
          ic.push(lines[i++].slice(4));
        }
        out.push(codeBlock('', ic.join('\n')));
        continue;
      }
      if ((m = l.match(/^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/))) {
        out.push(heading(m[1].length + 1 > 6 ? 6 : m[1].length + 1, m[2], fn));
        i++;
        continue;
      }
      if (RE_HR.test(l)) {
        out.push('<hr>');
        i++;
        continue;
      }
      if (/^ {0,3}>/.test(l)) {
        var q = [];
        while (i < lines.length && lines[i].trim() && /^ {0,3}>/.test(lines[i])) {
          q.push(lines[i++].replace(/^ {0,3}> ?/, ''));
        }
        var al = q[0] && q[0].match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|INFO|SUCCESS|DANGER)\][ \t]*(.*)$/i);
        if (al) {
          var ak = al[1].toLowerCase();
          out.push('<div class="md-box md-' + ak + '"><div class="md-box-t">' + BOX[ak] + '</div>' + blocks((al[2] ? [al[2]] : []).concat(q.slice(1)), fn) + '</div>');
        } else {
          out.push('<blockquote>' + blocks(q, fn) + '</blockquote>');
        }
        continue;
      }
      if (l.indexOf('|') > -1 && i + 1 < lines.length && RE_SEP.test(lines[i + 1]) && lines[i + 1].indexOf('-') > -1 && lines[i + 1].indexOf('|') > -1) {
        var head = cells(l), al = cells(lines[i + 1]).map(function (c) {
          return /^:-+:$/.test(c) ? 'center' : /-:$/.test(c) ? 'right' : /^:-/.test(c) ? 'left' : '';
        });
        i += 2;
        var rows = [];
        while (i < lines.length && lines[i].trim() && lines[i].indexOf('|') > -1) {
          rows.push(cells(lines[i++]));
        }
        var td = function (tag, c, k) {
          return '<' + tag + (al[k] ? ' style="text-align:' + al[k] + '"' : '') + '>' + inline(c, fn) + '</' + tag + '>';
        };
        out.push('<div class="md-tw"><table><thead><tr>' + head.map(function (c, k) {
          return td('th', c, k);
        }).join('') + '</tr></thead><tbody>' + rows.map(function (r) {
          return '<tr>' + head.map(function (_, k) {
            return td('td', r[k] || '', k);
          }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>');
        continue;
      }
      if ((m = l.match(RE_LI))) {
        var base = m[1].replace(/\t/g, '    ').length, ordered = /\d/.test(m[2]), items = [], cur = null;
        var start = ordered ? parseInt(m[2], 10) : 1;
        while (i < lines.length) {
          var ln = lines[i], mm = ln.match(RE_LI);
          if (mm && mm[1].replace(/\t/g, '    ').length <= base + 1 && mm[1].replace(/\t/g, '    ').length >= base) {
            if (/\d/.test(mm[2]) !== ordered) {
              break;
            }
            cur = [mm[3]];
            items.push(cur);
            i++;
          } else if (!ln.trim()) {
            var nx = lines[i + 1];
            if (nx !== undefined && (/^\s{2,}\S/.test(nx) || (RE_LI.test(nx) && nx.match(RE_LI)[1].length >= base))) {
              cur.push('');
              i++;
            } else {
              break;
            }
          } else if (cur && /^\s{2,}\S/.test(ln)) {
            cur.push(ln.replace(/^ {1,4}/, ''));
            i++;
          } else if (cur && !startsBlock(ln)) {
            cur.push(ln.trim());
            i++;
          } else {
            break;
          }
        }
        out.push('<' + (ordered ? 'ol' + (start > 1 ? ' start="' + start + '"' : '') : 'ul') + '>' + items.map(function (it) {
          var first = it[0], task = first.match(/^\[([ xX])\]\s+(.*)$/), cls = '', pre = '';
          if (task) {
            cls = ' class="task"';
            pre = '<input type="checkbox" disabled' + (task[1] === ' ' ? '' : ' checked') + '> ';
            it = [task[2]].concat(it.slice(1));
          }
          var inner = blocks(it, fn);
          if (it.indexOf('') < 0) {
            inner = inner.replace(/^<p>([\s\S]*?)<\/p>/, '$1');
          }
          return '<li' + cls + '>' + pre + inner + '</li>';
        }).join('') + '</' + (ordered ? 'ol' : 'ul') + '>');
        continue;
      }
      if (i + 1 < lines.length && /^ {0,3}:\s+\S/.test(lines[i + 1]) && !startsBlock(l)) {
        var dl = [];
        while (i < lines.length && lines[i].trim() && !startsBlock(lines[i])) {
          if (/^ {0,3}:\s+\S/.test(lines[i])) {
            dl.push('<dd>' + inline(lines[i].replace(/^ {0,3}:\s+/, ''), fn) + '</dd>');
          } else {
            dl.push('<dt>' + inline(lines[i].trim(), fn) + '</dt>');
          }
          i++;
        }
        out.push('<dl>' + dl.join('') + '</dl>');
        continue;
      }
      var para = [l];
      i++;
      while (i < lines.length && lines[i].trim() && !startsBlock(lines[i], lines[i + 1])) {
        if (/^ {0,3}(=+|-+) *$/.test(lines[i])) {
          break;
        }
        para.push(lines[i++]);
      }
      if (i < lines.length && /^ {0,3}(=+|-+) *$/.test(lines[i]) && lines[i].trim()) {
        var lv = lines[i].trim()[0] === '=' ? 2 : 3;
        i++;
        out.push(heading(lv, para.join(' '), fn));
      } else {
        out.push('<p>' + inline(para.join('\n'), fn) + '</p>');
      }
    }
    return out.join('');
  }

  function render(src) {
    var text = String(src == null ? '' : src).replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
    var defs = {}, fn = { uid: ++uid, order: [], ids: {}, toc: [] };
    refs = {};
    abbrs = {};
    text = text.replace(/^ {0,3}\*\[([^\]\n]+)\]:[ \t]*(.+)$/gm, function (m, a, b) {
      abbrs[a] = b.trim();
      return '';
    });
    text = text.replace(/^ {0,3}\[([^\]^\n][^\]\n]*)\]:[ \t]*(\S+)(?:[ \t]+["'(](.*?)["')])?[ \t]*$/gm, function (m, id, u, t) {
      refs[id.toLowerCase()] = { u: u.replace(/^<|>$/g, ''), t: t || '' };
      return '';
    });
    text = text.replace(/^\[\^([^\]\s]+)\]:\s*(.*)$/gm, function (m, id, body) {
      defs[id] = body;
      return '';
    });
    var html = blocks(text.split('\n'), fn);
    html = html.replace('<!--vdk-toc-->', function () {
      return fn.toc.length ? '<nav class="md-toc"><div class="md-box-t">Mục lục</div><ul>' + fn.toc.map(function (t) {
        return '<li class="l' + t[0] + '"><a href="#md' + fn.uid + '-' + t[1] + '">' + inline(t[2], null) + '</a></li>';
      }).join('') + '</ul></nav>' : '';
    }).replace(/<!--vdk-toc-->/g, '');
    if (fn.order.length) {
      html += '<section class="fn"><hr><ol>' + fn.order.map(function (id, k) {
        return '<li id="fn' + fn.uid + '-' + (k + 1) + '">' + inline(defs[id] || '', null) + ' <a href="#fr' + fn.uid + '-' + (k + 1) + '" aria-label="Quay lại">↩</a></li>';
      }).join('') + '</ol></section>';
    }
    return html;
  }
  /* Nút "Sao chép" của khối mã: chỉ lấy chữ trong <code> */
  if (typeof document !== 'undefined' && !window.__vdkMdCopy) {
    window.__vdkMdCopy = 1;
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-md-copy]');
      if (!b) {
        return;
      }
      var code = b.closest('.md-code').querySelector('code'), txt = code ? code.textContent : '', lab = b.querySelector('.md-ct'), ic = b.querySelector('.ms');
      function ok() {
        if (ic) {
          ic.textContent = 'check';
        }
        if (lab) {
          lab.textContent = 'Đã chép';
        }
        setTimeout(function () {
          if (ic) {
            ic.textContent = 'content_copy';
          }
          if (lab) {
            lab.textContent = 'Sao chép';
          }
        }, 1500);
      }
      function old() {
        var ta = document.createElement('textarea');
        ta.value = txt;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
          ok();
        } catch (_) { /* không chép được */ }
        ta.remove();
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(ok, old);
      } else {
        old();
      }
    });
  }
  window.vdkMd = { render: render };
})();
