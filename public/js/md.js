/* Bộ dựng Markdown nhỏ gọn, an toàn (mọi HTML đều bị escape). Dùng chung cho admin (xem trước) và hòm thư của khách.
Hỗ trợ: tiêu đề # và gạch chân ===/---, đậm, nghiêng, đậm-nghiêng, gạch ngang ~~, tô sáng ==, chỉ số trên ^x^ / dưới ~x~,
code nội dòng, khối code ```lang, trích dẫn lồng nhau, danh sách số / gạch đầu dòng lồng nhau, danh sách việc [ ] [x],
bảng có căn lề, liên kết, liên kết tự động, ảnh, đường kẻ ngang, xuống dòng, ký tự thoát \, chú thích cuối trang [^1]. */
(function () {
  'use strict';
  var uid = 0;
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
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
    t = t.replace(/\\([\\`*_{}\[\]()#+\-.!~^=|>])/g, function (m, c) {
      return keep(c);
    });
    t = t.replace(/!\[([^\]]*)\]\(\s*([^\s)]+)(?:\s+&quot;([^)]*?)&quot;)?\s*\)/g, function (m, alt, u, ttl) {
      var s = okUrl(u, true);
      return s ? keep('<img src="' + s + '" alt="' + alt + '" loading="lazy"' + (ttl ? ' title="' + ttl + '"' : '') + '>') : alt;
    });
    t = t.replace(/\[([^\]]+)\]\(\s*([^\s)]+)(?:\s+&quot;([^)]*?)&quot;)?\s*\)/g, function (m, txt, u, ttl) {
      var s = okUrl(u, false);
      return s ? keep('<a href="' + s + '" target="_blank" rel="noopener noreferrer"' + (ttl ? ' title="' + ttl + '"' : '') + '>') + txt + keep('</a>') : txt;
    });
    t = t.replace(/&lt;(https?:\/\/[^\s&]+(?:&amp;[^\s&]*)*)&gt;/g, function (m, u) {
      return keep('<a href="' + okUrl(u) + '" target="_blank" rel="noopener noreferrer">' + u + '</a>');
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
      .replace(/\^([^\s^]+)\^/g, '<sup>$1</sup>')
      .replace(/~([^\s~]+)~/g, '<sub>$1</sub>');
    t = t.replace(/(?: {2,}|\\)\n/g, '<br>').replace(/\n/g, '<br>');
    return t.replace(/\u0000(\d+)\u0000/g, function (m, i) {
      return stash[+i];
    });
  }

  var RE_HR = /^ {0,3}([-*_])( *\1){2,} *$/;
  var RE_LI = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
  var RE_SEP = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

  function cells(line) {
    var s = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    return s.split(/(?<!\\)\|/).map(function (c) {
      return c.trim().replace(/\\\|/g, '|');
    });
  }
  function startsBlock(l, next) {
    return /^ {0,3}#{1,6}\s/.test(l) || /^ {0,3}(```|~~~)/.test(l) || RE_HR.test(l) || /^ {0,3}>/.test(l) || RE_LI.test(l) ||
      (l.indexOf('|') > -1 && next != null && RE_SEP.test(next) && next.indexOf('-') > -1 && next.indexOf('|') > -1);
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
        out.push('<pre><code' + (m[2] ? ' class="lang-' + esc(m[2]) + '"' : '') + '>' + esc(code.join('\n')) + '</code></pre>');
        continue;
      }
      if ((m = l.match(/^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/))) {
        out.push('<h' + (m[1].length + 1 > 6 ? 6 : m[1].length + 1) + '>' + inline(m[2], fn) + '</h' + (m[1].length + 1 > 6 ? 6 : m[1].length + 1) + '>');
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
        out.push('<blockquote>' + blocks(q, fn) + '</blockquote>');
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
        out.push('<h' + lv + '>' + inline(para.join(' '), fn) + '</h' + lv + '>');
      } else {
        out.push('<p>' + inline(para.join('\n'), fn) + '</p>');
      }
    }
    return out.join('');
  }

  function render(src) {
    var text = String(src == null ? '' : src).replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
    var defs = {}, fn = { uid: ++uid, order: [] };
    text = text.replace(/^\[\^([^\]\s]+)\]:\s*(.*)$/gm, function (m, id, body) {
      defs[id] = body;
      return '';
    });
    var html = blocks(text.split('\n'), fn);
    if (fn.order.length) {
      html += '<section class="fn"><hr><ol>' + fn.order.map(function (id, k) {
        return '<li id="fn' + fn.uid + '-' + (k + 1) + '">' + inline(defs[id] || '', null) + ' <a href="#fr' + fn.uid + '-' + (k + 1) + '" aria-label="Quay lại">↩</a></li>';
      }).join('') + '</ol></section>';
    }
    return html;
  }
  window.vdkMd = { render: render };
})();
