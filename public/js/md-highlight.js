/* Việt Du Ký – tô màu mã nguồn cho khối ```ngôn-ngữ trong Markdown (không dùng thư viện ngoài, chạy được khi mất mạng).
window.vdkHl.tokenize(lang, code) trả về mảng [lớp, chữ]; ghép mọi "chữ" lại luôn đúng bằng mã gốc.
Lớp: k từ khoá · t kiểu / hàm dựng sẵn · f hàm · l giá trị (true/null...) · s chuỗi · n số · c chú thích · p thuộc tính ·
tag thẻ HTML · v biến · a dòng thêm (diff) · d dòng xoá (diff) · '' chữ thường.
Ngôn ngữ chưa biết: tokenize trả về null và mã hiện nguyên văn. */
(function () {
  'use strict';
  var MAX = 60000; // mã quá dài thì bỏ qua tô màu cho nhẹ máy

  function set(s) {
    var o = Object.create(null);
    s.split(/\s+/).forEach(function (w) {
      if (w) {
        o[w] = 1;
      }
    });
    return o;
  }
  function Out() {
    var out = [];
    return {
      out: out,
      push: function (c, s) {
        if (!s) {
          return;
        }
        var o = out[out.length - 1];
        if (o && o[0] === c) {
          o[1] += s;
        } else {
          out.push([c, s]);
        }
      }
    };
  }
  function at(re, src, i) {
    re.lastIndex = i;
    return re.exec(src);
  }

  /* ---------- Bộ quét chung cho ngôn ngữ kiểu C / JS / Python / SQL / shell... ---------- */
  var R = {
    ws: /\s+/y,
    id: /[A-Za-z_$\u00C0-\uFFFF][\w$\u00C0-\uFFFF]*/y,
    num: /(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?)[A-Za-z]*/y,
    regex: /(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+\/[a-z]*/y,
    decor: /@[A-Za-z_][\w.]*/y,
    pre: /#[ \t]*[A-Za-z_]+/y,
    inc: /[ \t]*(?:<[^>\n]*>|"[^"\n]*")/y,
    rustq: /'(?:\\.[^'\n]*|[^\\'\n])'/y,
    life: /'[A-Za-z_]\w*/y,
    sym: /:[A-Za-z_]\w*[?!]?/y,
    flag: /--?[A-Za-z][\w-]*/y
  };
  var REGEX_AFTER = /^(?:return|typeof|case|in|of|delete|void|throw|new|else|do|instanceof|yield|await)$/;

  function lineStart(src, i) {
    var j = i - 1;
    while (j >= 0 && (src[j] === ' ' || src[j] === '\t')) {
      j--;
    }
    return j < 0 || src[j] === '\n';
  }

  /* Đọc một chuỗi bắt đầu tại i (ký tự mở q); trả về độ dài */
  function strLen(src, i, q, d) {
    var n = src.length, j = i + 1;
    if (d.triple && src.substr(i, 3) === q + q + q) {
      var e = src.indexOf(q + q + q, i + 3);
      return e < 0 ? n - i : e + 3 - i;
    }
    var multi = d.ml && d.ml[q];
    while (j < n) {
      var c = src[j];
      if (c === '\\' && d.esc !== false) {
        j += 2;
        continue;
      }
      if (c === q) {
        return j + 1 - i;
      }
      if (c === '\n' && !multi) {
        return j - i;
      }
      j++;
    }
    return n - i;
  }

  function scan(src, d) {
    var T = Out(), push = T.push, i = 0, n = src.length, prev = '', prevWord = '', dot = false, m, ch;
    var idRe = d.id || R.id;
    function done(cls, s, isId) {
      push(cls, s);
      prev = s[s.length - 1];
      prevWord = isId ? s : '';
      dot = s === '.';
      i += s.length;
    }
    while (i < n) {
      ch = src[i];
      if (/\s/.test(ch)) {
        m = at(R.ws, src, i);
        push('', m[0]);
        i += m[0].length;
        continue;
      }
      var k, hit = false;
      if (d.bc) {
        for (k = 0; k < d.bc.length && !hit; k++) {
          if (src.startsWith(d.bc[k][0], i)) {
            var e = src.indexOf(d.bc[k][1], i + d.bc[k][0].length);
            var len = e < 0 ? n - i : e + d.bc[k][1].length - i;
            done('c', src.substr(i, len));
            hit = true;
          }
        }
        if (hit) {
          continue;
        }
      }
      if (d.lc) {
        for (k = 0; k < d.lc.length && !hit; k++) {
          var lc = d.lc[k];
          if (src.startsWith(lc, i) && (!d.lcSpace || i === 0 || /\s/.test(src[i - 1]) || lineStart(src, i))) {
            var nl = src.indexOf('\n', i);
            done('c', src.substr(i, (nl < 0 ? n : nl) - i));
            hit = true;
          }
        }
        if (hit) {
          continue;
        }
      }
      if (d.preproc && ch === '#' && lineStart(src, i)) {
        m = at(R.pre, src, i);
        if (m) {
          done('k', m[0]);
          if (/include/.test(m[0]) && (m = at(R.inc, src, i))) {
            push('', m[0].match(/^\s*/)[0]);
            push('s', m[0].trim());
            i += m[0].length;
          }
          continue;
        }
      }
      if (d.php && src.startsWith('<?', i)) {
        m = at(/<\?(?:php|=)?/y, src, i);
        done('k', m[0]);
        continue;
      }
      if (d.php && src.startsWith('?>', i)) {
        done('k', '?>');
        continue;
      }
      if (d.rustq && ch === '\'') {
        if ((m = at(R.rustq, src, i))) {
          done('s', m[0]);
          continue;
        }
        if ((m = at(R.life, src, i))) {
          done('v', m[0]);
          continue;
        }
      }
      if (d.q && d.q.indexOf(ch) >= 0 && !(d.rustq && ch === '\'')) {
        done('s', src.substr(i, strLen(src, i, ch, d)));
        continue;
      }
      if (d.v && (m = at(d.v, src, i)) && (!d.vShell || true)) {
        done('v', m[0]);
        continue;
      }
      if (d.flag && (ch === '-') && (i === 0 || /\s/.test(src[i - 1])) && (m = at(R.flag, src, i))) {
        done('p', m[0]);
        continue;
      }
      if (d.decor && ch === '@' && (m = at(R.decor, src, i))) {
        done('t', m[0]);
        continue;
      }
      if (d.sym && ch === ':' && src[i - 1] !== ':' && src[i + 1] !== ':' && (m = at(R.sym, src, i)) && !/[\w)\]]/.test(src[i - 1] || ' ')) {
        done('s', m[0]);
        continue;
      }
      if (d.regexLit && ch === '/' && (!prev || /[(,=:[!&|?{};+\-*%<>~^}]/.test(prev) || REGEX_AFTER.test(prevWord)) && src[i + 1] !== '/' && src[i + 1] !== '*') {
        m = at(R.regex, src, i + 1);
        if (m) {
          done('s', '/' + m[0]);
          continue;
        }
      }
      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        m = at(R.num, src, i);
        if (m) {
          done('n', m[0]);
          continue;
        }
      }
      if ((m = at(idRe, src, i))) {
        var w = m[0], key = d.ci ? w.toLowerCase() : w, cls = '', j = i + w.length;
        if (d.strPrefix && /^[rRuUbBfF]{1,2}$/.test(w) && (src[j] === '"' || src[j] === '\'')) {
          done('s', w + src.substr(j, strLen(src, j, src[j], d)));
          continue;
        }
        var nx = j;
        while (nx < n && (src[nx] === ' ' || src[nx] === '\t')) {
          nx++;
        }
        if (dot && !(src[nx] === '(')) {
          cls = '';
        } else if (d.kw[key]) {
          cls = 'k';
        } else if (d.lit && d.lit[key]) {
          cls = 'l';
        } else if (d.types && d.types[key]) {
          cls = 't';
        } else if (d.declT && d.declT[prevWord] && /^[A-Za-z_]/.test(w)) {
          cls = 't';
        } else if (src[nx] === '(' || (d.macro && src[j] === '!' && src[j + 1] !== '=') || (d.declF && d.declF[prevWord])) {
          cls = d.cmdlet && /^[A-Z][a-z]+-[A-Z]/.test(w) ? 'f' : 'f';
        } else if (d.cmdlet && /^[A-Z][a-z]+-[A-Z]/.test(w)) {
          cls = 'f';
        } else if (d.pascal && /^[A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*$/.test(w)) {
          cls = 't';
        }
        if (d.firstWord && !cls && lineStart(src, i) && d.firstWord(w, src, i)) {
          cls = 'f';
        }
        done(cls, w, true);
        continue;
      }
      done('', ch);
    }
    return T.out;
  }

  /* ---------- Định nghĩa ngôn ngữ ---------- */
  var LANGS = {}, ALIAS = {}, LABEL = {}, CUSTOM = {};
  function def(names, label, d) {
    var list = names.split(' ');
    list.forEach(function (n) {
      ALIAS[n] = list[0];
    });
    LABEL[list[0]] = label;
    if (d) {
      LANGS[list[0]] = d;
    }
  }
  var C_COM = { lc: ['//'], bc: [['/*', '*/']] };
  function cl(o) {
    var d = {};
    Object.keys(C_COM).forEach(function (k) {
      d[k] = C_COM[k];
    });
    Object.keys(o).forEach(function (k) {
      d[k] = o[k];
    });
    return d;
  }

  var JS_KW = 'break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while with yield async await get set as satisfies enum implements interface package private protected public abstract declare readonly namespace type keyof infer is override module';
  var JS_TYPES = 'Array Object String Number Boolean Map Set WeakMap WeakSet Promise Date Math JSON Symbol Error RegExp console window document process Buffer require exports BigInt globalThis Intl Reflect Proxy string number boolean any unknown never object bigint symbol';
  def('js javascript mjs cjs jsx node', 'JavaScript', cl({ kw: set(JS_KW), lit: set('true false null undefined NaN Infinity'), types: set(JS_TYPES), q: ['"', '\'', '`'], ml: { '`': 1 }, regexLit: true }));
  def('ts typescript tsx', 'TypeScript', cl({ kw: set(JS_KW), lit: set('true false null undefined NaN Infinity'), types: set(JS_TYPES), q: ['"', '\'', '`'], ml: { '`': 1 }, regexLit: true, decor: true }));
  def('py python python3 py3', 'Python', {
    kw: set('and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case'),
    lit: set('True False None self cls'),
    types: set('print len range int str float list dict set tuple bool type isinstance open input super enumerate zip map filter sorted sum min max abs any all bytes object Exception ValueError TypeError KeyError'),
    lc: ['#'], q: ['"', '\''], triple: true, strPrefix: true, decor: true, declT: set('class'), declF: set('def')
  });
  def('java', 'Java', cl({
    kw: set('abstract assert break case catch class const continue default do else enum extends final finally for goto if implements import instanceof interface native new package private protected public return static strictfp super switch synchronized this throw throws transient try volatile while var record sealed permits yield'),
    lit: set('true false null'), types: set('int long short byte char boolean float double void String Integer Long Double Boolean List Map Set ArrayList HashMap Object System Optional'), q: ['"', '\''], decor: true, pascal: true
  }));
  def('kt kotlin kts', 'Kotlin', cl({
    kw: set('as break class continue do else for fun if in interface is object package return super this throw try typealias val var when while by catch constructor init import abstract annotation companion const data enum final inline inner internal lateinit open operator out override private protected public sealed suspend vararg'),
    lit: set('true false null'), types: set('Int Long Short Byte Char Boolean Float Double String Unit Any Nothing List Map Set Array'), q: ['"', '\''], triple: true, decor: true, pascal: true
  }));
  def('swift', 'Swift', cl({
    kw: set('associatedtype class deinit enum extension fileprivate func import init inout internal let open operator private protocol public rethrows static struct subscript typealias var break case catch continue default defer do else fallthrough for guard if in repeat return throw switch where while as await async is super throws try some any'),
    lit: set('true false nil self Self'), types: set('Int Double Float String Bool Character Array Dictionary Set Optional Void Any'), q: ['"'], triple: true, decor: true, pascal: true
  }));
  def('c h', 'C', cl({
    kw: set('auto break case const continue default do else enum extern for goto if inline register restrict return sizeof static struct switch typedef union volatile while'),
    lit: set('NULL true false'), types: set('int char short long float double void unsigned signed size_t bool FILE uint8_t uint16_t uint32_t uint64_t int8_t int16_t int32_t int64_t'), q: ['"', '\''], preproc: true
  }));
  def('cpp c++ cc cxx hpp hxx', 'C++', cl({
    kw: set('auto break case catch class const constexpr continue default delete do else enum explicit extern final for friend goto if inline namespace new noexcept operator override private protected public register return sizeof static static_cast dynamic_cast reinterpret_cast const_cast struct switch template this throw try typedef typename union using virtual volatile while concept requires co_await co_return co_yield decltype mutable'),
    lit: set('NULL nullptr true false'), types: set('int char short long float double void unsigned signed size_t bool string vector map set unordered_map unique_ptr shared_ptr std wchar_t'), q: ['"', '\''], preproc: true
  }));
  def('cs csharp c#', 'C#', cl({
    kw: set('abstract as base break case catch checked class const continue default delegate do else enum event explicit extern finally fixed for foreach goto if implicit in interface internal is lock namespace new operator out override params private protected public readonly ref return sealed sizeof stackalloc static struct switch this throw try typeof unchecked unsafe using virtual volatile while var async await record init get set partial yield'),
    lit: set('true false null'), types: set('int long short byte char bool float double decimal string object void dynamic List Dictionary Task'), q: ['"', '\''], preproc: true, pascal: true
  }));
  def('go golang', 'Go', cl({
    kw: set('break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var'),
    lit: set('true false nil iota'), types: set('int int8 int16 int32 int64 uint uint8 uint16 uint32 uint64 uintptr float32 float64 complex64 complex128 string bool byte rune error any make new len cap append copy delete panic recover print println close'), q: ['"', '\'', '`'], ml: { '`': 1 }, declT: set('type')
  }));
  def('rs rust', 'Rust', cl({
    kw: set('as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while'),
    lit: set('true false'), types: set('i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize f32 f64 bool char str String Vec Option Result Box Some None Ok Err'), q: ['"'], rustq: true, macro: true, declT: set('struct enum trait type impl'), declF: set('fn')
  }));
  def('php', 'PHP', {
    kw: set('abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile extends final finally fn for foreach function global goto if implements include include_once instanceof insteadof interface isset list match namespace new or print private protected public readonly require require_once return static switch throw trait try unset use var while xor yield'),
    lit: set('true false null TRUE FALSE NULL'), types: set('int float string bool array object mixed void self parent iterable'), lc: ['//', '#'], bc: [['/*', '*/']], q: ['"', '\''], ml: { '"': 1, '\'': 1 }, v: /\$[A-Za-z_]\w*/y, php: true
  });
  def('rb ruby', 'Ruby', {
    kw: set('alias and begin break case class def do else elsif end ensure for if in module next not or redo rescue retry return super then undef unless until when while yield require require_relative include extend attr_accessor attr_reader attr_writer puts print'),
    lit: set('true false nil self'), lc: ['#'], q: ['"', '\''], ml: { '"': 1, '\'': 1 }, v: /(?:@@?|\$)[A-Za-z_]\w*/y, sym: true, declT: set('class module'), declF: set('def'), id: /[A-Za-z_][\w]*[?!]?/y
  });
  def('lua', 'Lua', {
    kw: set('and break do else elseif end for function goto if in local not or repeat return then until while'),
    lit: set('true false nil'), types: set('print pairs ipairs table string math os io require type tostring tonumber setmetatable getmetatable'), lc: ['--'], bc: [['--[[', ']]']], q: ['"', '\''], declF: set('function')
  });
  def('r', 'R', {
    kw: set('if else repeat while function for next break in'), lit: set('TRUE FALSE NULL NA Inf NaN'), types: set('library require c list data.frame matrix vector print cat paste length sum mean'), lc: ['#'], q: ['"', '\''], id: /[A-Za-z.][\w.]*/y
  });
  def('dart', 'Dart', cl({
    kw: set('abstract as assert async await break case catch class const continue covariant default deferred do dynamic else enum export extends extension external factory final finally for Function get hide if implements import in interface is late library mixin new on operator part required rethrow return set show static super switch sync this throw try typedef var void while with yield'),
    lit: set('true false null'), types: set('int double num String bool List Map Set Future Stream'), q: ['"', '\''], triple: true, decor: true, pascal: true
  }));
  def('sql mysql postgres postgresql pgsql sqlite', 'SQL', {
    ci: true,
    kw: set('select from where and or not in is like between join inner left right full outer cross on as group by order having limit offset union all distinct insert into values update set delete create table alter drop add column index view database schema primary key foreign references default unique check constraint if exists case when then else end asc desc with recursive returning truncate begin commit rollback transaction grant revoke to using over partition explain analyze'),
    lit: set('true false null'), types: set('int integer bigint smallint tinyint serial varchar char text boolean bool date time timestamp datetime decimal numeric float double real json jsonb uuid blob'),
    lc: ['--'], bc: [['/*', '*/']], q: ['\'', '"', '`'], esc: false
  });
  def('sh bash shell zsh console shellscript', 'Bash', {
    kw: set('if then else elif fi for while until do done case esac in function select time return exit break continue local export declare readonly unset set shift source alias'),
    types: set('echo printf cd pwd ls cat grep sed awk find xargs sort uniq head tail cut tr wc chmod chown mkdir rm cp mv ln touch curl wget tar git npm npx yarn pnpm node python python3 pip docker kubectl sudo apt apt-get brew make ssh scp rsync systemctl wrangler'),
    lc: ['#'], lcSpace: true, q: ['"', '\''], ml: { '"': 1, '\'': 1 }, v: /\$(?:\{[^}\n]*\}|\([^)\n]*\)|[A-Za-z_]\w*|[0-9@#?$!*-])/y, flag: true, id: /[A-Za-z_][\w.-]*/y
  });
  def('ps1 powershell pwsh', 'PowerShell', {
    ci: true,
    kw: set('begin break catch class continue data do dynamicparam else elseif end exit filter finally for foreach from function if in param process return switch throw trap try until using var while'),
    lit: set('true false null'), lc: ['#'], bc: [['<#', '#>']], q: ['"', '\''], ml: { '"': 1, '\'': 1 }, v: /\$[A-Za-z_]\w*|\$\{[^}\n]*\}/y, cmdlet: true, id: /[A-Za-z_][\w]*(?:-[A-Za-z]\w*)*/y, esc: false
  });
  def('dockerfile docker', 'Dockerfile', {
    ci: true,
    kw: set('from run cmd label expose env add copy entrypoint volume user workdir arg onbuild stopsignal healthcheck shell as maintainer'),
    lc: ['#'], lcSpace: true, q: ['"', '\''], v: /\$(?:\{[^}\n]*\}|[A-Za-z_]\w*)/y, flag: true, id: /[A-Za-z_][\w.-]*/y
  });

  /* ---------- Các ngôn ngữ cần bộ quét riêng ---------- */
  function lit(T, s, re) {
    var m, i = 0, n = s.length, last = 0;
    function plain(to) {
      T.push('', s.slice(last, to));
      last = to;
    }
    while (i < n) {
      m = at(re, s, i);
      if (m && m[0]) {
        plain(i);
        T.push(m.cls || '', m[0]);
        i += m[0].length;
        last = i;
      } else {
        i++;
      }
    }
    plain(n);
  }

  /* Giá trị (YAML / TOML / INI): chuỗi, số, từ khoá, neo, chú thích cuối dòng */
  function values(T, s, hash, semi) {
    var i = 0, n = s.length, m, buf = '';
    function flush() {
      T.push('', buf);
      buf = '';
    }
    while (i < n) {
      var ch = s[i];
      if ((ch === '"' || ch === '\'') && (m = at(ch === '"' ? /"(?:\\.|[^"\\\n])*"?/y : /'[^'\n]*'?/y, s, i))) {
        flush();
        T.push('s', m[0]);
        i += m[0].length;
      } else if ((hash && ch === '#' && (i === 0 || /\s/.test(s[i - 1]))) || (semi && ch === ';' && (i === 0 || /\s/.test(s[i - 1])))) {
        flush();
        T.push('c', s.slice(i));
        i = n;
      } else if (/[&*]/.test(ch) && (m = at(/[&*][\w-]+/y, s, i))) {
        flush();
        T.push('v', m[0]);
        i += m[0].length;
      } else if (ch === '!' && (m = at(/!+[\w<>!-]*/y, s, i))) {
        flush();
        T.push('t', m[0]);
        i += m[0].length;
      } else if (/[\w.+-]/.test(ch) && !/[\w]/.test(s[i - 1] || ' ') && (m = at(/[\w.+-]+/y, s, i))) {
        flush();
        var w = m[0];
        T.push(/^(?:true|false|yes|no|on|off|null|~|nil)$/i.test(w) ? 'l' : /^[+-]?(?:0x[\da-f]+|\d[\d_]*\.?\d*(?:e[+-]?\d+)?)$/i.test(w) ? 'n' : '', w);
        i += w.length;
      } else {
        buf += ch;
        i++;
      }
    }
    flush();
  }

  function yaml(src) {
    var T = Out(), lines = src.split('\n'), block = -1;
    lines.forEach(function (ln, k) {
      var nl = k < lines.length - 1 ? '\n' : '', ind = ln.match(/^\s*/)[0].length, m;
      if (block >= 0) {
        if (!ln.trim() || ind > block) {
          T.push('s', ln + nl);
          return;
        }
        block = -1;
      }
      if (/^\s*#/.test(ln)) {
        T.push('c', ln + nl);
        return;
      }
      if (/^(---|\.\.\.)\s*$/.test(ln)) {
        T.push('k', ln + nl);
        return;
      }
      m = ln.match(/^(\s*(?:-\s+)*)((?:"(?:\\.|[^"\\])*"|'[^']*'|[^\s#:'"[\]{},&*!|>-][^#:]*?|-[^\s#:][^#:]*?))(\s*:)(?=\s|$)(.*)$/);
      var rest = ln;
      if (m) {
        T.push('', m[1]);
        T.push('p', m[2]);
        T.push('', m[3]);
        rest = m[4];
      } else if ((m = ln.match(/^(\s*(?:-\s+)+)(.*)$/))) {
        T.push('', m[1]);
        rest = m[2];
      }
      values(T, rest, true, false);
      if (/(^|\s)[|>][+-]?\d*\s*(#.*)?$/.test(rest)) {
        block = ind;
      }
      T.push('', nl);
    });
    return T.out;
  }

  function ini(src, lang) {
    var T = Out(), lines = src.split('\n'), toml = lang === 'toml';
    lines.forEach(function (ln, k) {
      var nl = k < lines.length - 1 ? '\n' : '', m;
      if (/^\s*[#;]/.test(ln)) {
        T.push('c', ln + nl);
      } else if ((m = ln.match(/^(\s*)(\[\[?[^\]\n]*\]\]?)(.*)$/))) {
        T.push('', m[1]);
        T.push('k', m[2]);
        values(T, m[3], true, !toml);
        T.push('', nl);
      } else if ((m = ln.match(/^(\s*)([^=:\s#;][^=:#;]*?)(\s*[=:]\s*)(.*)$/))) {
        T.push('', m[1]);
        T.push('p', m[2]);
        T.push('', m[3]);
        values(T, m[4], true, !toml);
        T.push('', nl);
      } else {
        T.push('', ln + nl);
      }
    });
    return T.out;
  }

  function json(src) {
    var T = Out(), i = 0, n = src.length, m;
    while (i < n) {
      var ch = src[i];
      if (ch === '"' && (m = at(/"(?:\\.|[^"\\\n])*"?/y, src, i))) {
        var after = at(/\s*:/y, src, i + m[0].length);
        T.push(after ? 'p' : 's', m[0]);
        i += m[0].length;
      } else if (ch === '/' && src[i + 1] === '/') {
        var e = src.indexOf('\n', i);
        e = e < 0 ? n : e;
        T.push('c', src.slice(i, e));
        i = e;
      } else if (ch === '/' && src[i + 1] === '*') {
        var e2 = src.indexOf('*/', i + 2);
        e2 = e2 < 0 ? n : e2 + 2;
        T.push('c', src.slice(i, e2));
        i = e2;
      } else if ((m = at(/-?\d+\.?\d*(?:[eE][+-]?\d+)?/y, src, i)) && !/\w/.test(src[i - 1] || ' ')) {
        T.push('n', m[0]);
        i += m[0].length;
      } else if ((m = at(/(?:true|false|null)\b/y, src, i))) {
        T.push('l', m[0]);
        i += m[0].length;
      } else {
        T.push('', ch);
        i++;
      }
    }
    return T.out;
  }

  /* HTML / XML / SVG, kèm <script> và <style> bên trong */
  function markup(src) {
    var T = Out(), push = T.push, i = 0, n = src.length, m;
    function sub(lang, to) {
      var inner = src.slice(i, to), t = tokenize(lang, inner);
      (t || [['', inner]]).forEach(function (x) {
        push(x[0], x[1]);
      });
      i = to;
    }
    while (i < n) {
      if (src.startsWith('<!--', i)) {
        var e = src.indexOf('-->', i + 4);
        e = e < 0 ? n : e + 3;
        push('c', src.slice(i, e));
        i = e;
      } else if ((m = at(/<![^>]*>|<\?[\s\S]*?\?>/y, src, i))) {
        push('k', m[0]);
        i += m[0].length;
      } else if ((m = at(/<\/?[A-Za-z][\w:.-]*/y, src, i))) {
        var name = m[0].replace(/^<\/?/, ''), close = m[0][1] === '/';
        push('', m[0].slice(0, m[0].length - name.length));
        push('tag', name);
        i += m[0].length;
        while (i < n && src[i] !== '>') {
          var a;
          if ((a = at(/\s+/y, src, i))) {
            push('', a[0]);
            i += a[0].length;
          } else if ((a = at(/[^\s=/>"']+/y, src, i))) {
            push('p', a[0]);
            i += a[0].length;
          } else if (src[i] === '=') {
            push('', '=');
            i++;
            a = at(/"[^"]*"?|'[^']*'?|[^\s>"']+/y, src, i);
            if (a) {
              push('s', a[0]);
              i += a[0].length;
            }
          } else {
            push('', src[i]);
            i++;
          }
        }
        var selfClose = src[i - 1] === '/';
        if (i < n) {
          push('', '>');
          i++;
        }
        var lower = name.toLowerCase();
        if (!close && !selfClose && (lower === 'script' || lower === 'style')) {
          var end = src.toLowerCase().indexOf('</' + lower, i);
          sub(lower === 'script' ? 'js' : 'css', end < 0 ? n : end);
        }
      } else if ((m = at(/&[#\w]+;/y, src, i))) {
        push('v', m[0]);
        i += m[0].length;
      } else {
        var nx = src.slice(i + 1).search(/[<&]/);
        var to = nx < 0 ? n : i + 1 + nx;
        push('', src.slice(i, to));
        i = to;
      }
    }
    return T.out;
  }

  /* CSS / SCSS / Less */
  function css(src, lang) {
    var T = Out(), push = T.push, i = 0, n = src.length, depth = 0, paren = 0, m, slash = lang !== 'css';
    function isDecl(j) { // ident ở j có phải "thuộc tính:" không (không phải bộ chọn a:hover {)
      var k = j;
      while (k < n && (src[k] === ' ' || src[k] === '\t')) {
        k++;
      }
      if (src[k] !== ':' || src[k + 1] === ':') {
        return false;
      }
      var e = k + 1;
      while (e < n && ';{}'.indexOf(src[e]) < 0) {
        e++;
      }
      return src[e] !== '{';
    }
    while (i < n) {
      var ch = src[i];
      if (ch === '/' && src[i + 1] === '*') {
        var e = src.indexOf('*/', i + 2);
        e = e < 0 ? n : e + 2;
        push('c', src.slice(i, e));
        i = e;
      } else if (slash && ch === '/' && src[i + 1] === '/') {
        var e1 = src.indexOf('\n', i);
        e1 = e1 < 0 ? n : e1;
        push('c', src.slice(i, e1));
        i = e1;
      } else if ((ch === '"' || ch === '\'') && (m = at(ch === '"' ? /"(?:\\.|[^"\\\n])*"?/y : /'(?:\\.|[^'\\\n])*'?/y, src, i))) {
        push('s', m[0]);
        i += m[0].length;
      } else if (ch === '@' && (m = at(/@[\w-]+/y, src, i))) {
        push('k', m[0]);
        i += m[0].length;
      } else if (ch === '$' && (m = at(/\$[\w-]+/y, src, i))) {
        push('v', m[0]);
        i += m[0].length;
      } else if (ch === '!' && (m = at(/!\s*[a-z]+/y, src, i))) {
        push('k', m[0]);
        i += m[0].length;
      } else if (ch === '#' && depth > 0 && (m = at(/#[\da-fA-F]{3,8}\b/y, src, i))) {
        push('n', m[0]);
        i += m[0].length;
      } else if ((ch === '.' || ch === '#') && (m = at(/[.#][A-Za-z_-][\w-]*/y, src, i)) && (depth === 0 || paren === 0) && !(depth > 0 && /^\.\d/.test(m[0]))) {
        push('f', m[0]);
        i += m[0].length;
      } else if (ch === ':' && depth === 0 && (m = at(/::?[\w-]+/y, src, i))) {
        push('k', m[0]);
        i += m[0].length;
      } else if ((/[\d]/.test(ch) || (ch === '.' && /\d/.test(src[i + 1] || ''))) && (m = at(/-?(?:\d+\.?\d*|\.\d+)(?:[a-zA-Z%]+)?/y, src, i))) {
        push('n', m[0]);
        i += m[0].length;
      } else if ((m = at(/-{0,2}[A-Za-z_][\w-]*/y, src, i))) {
        var w = m[0], after = i + w.length, cls = '';
        if ((depth > 0 || paren > 0) && isDecl(after)) {
          cls = 'p';
        } else if (src[after] === '(') {
          cls = 'f';
        } else if (depth === 0 && paren === 0) {
          cls = 'tag';
        }
        push(cls, w);
        i = after;
      } else {
        if (ch === '{') {
          depth++;
        } else if (ch === '}') {
          depth = Math.max(0, depth - 1);
        } else if (ch === '(') {
          paren++;
        } else if (ch === ')') {
          paren = Math.max(0, paren - 1);
        }
        push('', ch);
        i++;
      }
    }
    return T.out;
  }

  function diff(src) {
    var T = Out(), lines = src.split('\n');
    lines.forEach(function (ln, k) {
      var s = ln + (k < lines.length - 1 ? '\n' : '');
      var c = /^(\+\+\+|---|diff |index |new file|deleted file|rename |similarity )/.test(ln) ? 'k' : ln[0] === '+' ? 'a' : ln[0] === '-' ? 'd' : /^@@/.test(ln) ? 'k' : '';
      T.push(c, s);
    });
    return T.out;
  }

  function markdown(src) {
    var T = Out(), lines = src.split('\n'), fence = false;
    lines.forEach(function (ln, k) {
      var nl = k < lines.length - 1 ? '\n' : '', m;
      if (/^\s*(```|~~~)/.test(ln)) {
        fence = !fence;
        T.push('c', ln + nl);
      } else if (fence) {
        T.push('s', ln + nl);
      } else if (/^ {0,3}#{1,6}\s/.test(ln)) {
        T.push('k', ln + nl);
      } else if (/^\s*>/.test(ln)) {
        T.push('c', ln + nl);
      } else {
        m = ln.match(/^(\s*(?:[-*+]|\d+[.)])\s+)?(.*)$/);
        T.push('k', m[1] || '');
        lit(T, m[2], /`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]*\]\([^)\n]*\)/y);
        T.push('', nl);
      }
    });
    return T.out.map(function (t) {
      return t;
    });
  }

  def('json jsonc json5 geojson', 'JSON');
  def('yaml yml', 'YAML');
  def('toml', 'TOML');
  def('ini conf cfg properties env', 'INI');
  def('html htm xml svg vue xhtml rss', 'HTML');
  def('css', 'CSS');
  def('scss sass', 'SCSS');
  def('less', 'Less');
  def('diff patch', 'Diff');
  def('md markdown', 'Markdown');
  def('text txt plain plaintext none', 'Văn bản');
  CUSTOM.json = json;
  CUSTOM.yaml = yaml;
  CUSTOM.toml = ini;
  CUSTOM.ini = ini;
  CUSTOM.html = markup;
  CUSTOM.css = css;
  CUSTOM.scss = css;
  CUSTOM.less = css;
  CUSTOM.diff = diff;
  CUSTOM.md = markdown;
  CUSTOM.text = function (src) {
    return [['', src]];
  };

  function tokenize(lang, code) {
    var key = ALIAS[String(lang || '').toLowerCase()];
    code = String(code == null ? '' : code);
    if (!key || code.length > MAX) {
      return null;
    }
    var out = CUSTOM[key] ? CUSTOM[key](code, key) : scan(code, LANGS[key]);
    return out.length ? out : [['', code]];
  }
  /* Tên hiển thị của ngôn ngữ ("js" → "JavaScript"); ngôn ngữ chưa biết thì giữ nguyên chữ người dùng gõ */
  function label(lang) {
    var key = ALIAS[String(lang || '').toLowerCase()];
    return key ? LABEL[key] : String(lang || '');
  }
  function known(lang) {
    return !!ALIAS[String(lang || '').toLowerCase()];
  }

  window.vdkHl = { tokenize: tokenize, label: label, known: known };
})();
