import re, sys

def parse(css):
    i, n = 0, len(css)
    def block(depth_end):
        nonlocal i
        items = []
        buf = []
        paren = 0
        while i < n:
            c = css[i]
            if c == '/' and css[i:i+2] == '/*':
                j = css.find('*/', i + 2); j = n if j < 0 else j + 2
                text = css[i:j]
                if ''.join(buf).strip() == '' :
                    items.append(('comment', text))
                else:
                    buf.append(text)
                i = j; continue
            if c in '"\'':
                j = i + 1
                while j < n and css[j] != c:
                    j += 2 if css[j] == '\\' else 1
                buf.append(css[i:j+1]); i = j + 1; continue
            if c == '(':
                paren += 1
            elif c == ')':
                paren -= 1
            if paren == 0 and c == '{':
                prelude = ''.join(buf).strip(); buf = []; i += 1
                items.append(('block', prelude, block(True)))
                continue
            if paren == 0 and c == ';':
                d = ''.join(buf).strip(); buf = []; i += 1
                if d: items.append(('decl', d))
                continue
            if paren == 0 and c == '}':
                d = ''.join(buf).strip(); buf = []; i += 1
                if d: items.append(('decl', d))
                return items
            buf.append(c); i += 1
        d = ''.join(buf).strip()
        if d: items.append(('decl', d))
        return items
    return block(False)

def split_top(s, sep=','):
    out, cur, p, q = [], [], 0, None
    for ch in s:
        if q:
            cur.append(ch)
            if ch == q: q = None
            continue
        if ch in '"\'': q = ch
        elif ch in '([': p += 1
        elif ch in ')]': p -= 1
        if ch == sep and p == 0:
            out.append(''.join(cur).strip()); cur = []
        else: cur.append(ch)
    out.append(''.join(cur).strip())
    return [x for x in out if x]

def norm_ws(s):
    # gộp khoảng trắng ngoài chuỗi
    out, q, prev_sp = [], None, False
    for ch in s:
        if q:
            out.append(ch)
            if ch == q: q = None
            continue
        if ch in '"\'':
            q = ch; out.append(ch); prev_sp = False; continue
        if ch.isspace():
            if not prev_sp: out.append(' ')
            prev_sp = True
        else:
            out.append(ch); prev_sp = False
    return ''.join(out).strip()

def fmt_decl(d):
    d = norm_ws(d)
    m = re.match(r'^([^:\s]+)\s*:\s*(.*)$', d, re.S)
    if m and not d.startswith('@'):
        return m.group(1) + ': ' + m.group(2)
    return d

def emit(items, ind, top):
    out = []
    pad = '  ' * ind
    for k, it in enumerate(items):
        if it[0] == 'comment':
            out.append(pad + it[1].strip())
        elif it[0] == 'decl':
            out.append(pad + fmt_decl(it[1]) + ';')
        else:
            pre = norm_ws(it[1])
            if pre.startswith('@'):
                head = pad + pre + ' {'
            else:
                head = ',\n'.join(pad + norm_ws(s) for s in split_top(pre)) + ' {'
            body = emit(it[2], ind + 1, False)
            out.append(head + ('\n' + body if body else '') + '\n' + pad + '}')
        if top and k + 1 < len(items):
            nxt = items[k + 1]
            # giữ comment sát với khối ngay sau nó
            if not (it[0] == 'comment' and nxt[0] != 'comment' or it[0] == 'comment' and nxt[0] == 'comment'):
                out.append('')
            elif it[0] == 'comment' and nxt[0] == 'comment':
                out.append('')
    return '\n'.join(out)

def format_css(css):
    return emit(parse(css), 0, True) + '\n'

def strip(s):
    return re.sub(r';\}', '}', re.sub(r'\s+', '', s))

if __name__ == '__main__':
    bad = 0
    check = '--check' in sys.argv
    for f in [a for a in sys.argv[1:] if a != '--check']:
        src = open(f, encoding='utf-8').read()
        res = format_css(src)
        if strip(src) != strip(res):
            print('KHÁC (không ghi):', f); bad += 1; continue
        if check:
            if res != src: print('cần format:', f); bad += 1
            continue
        open(f, 'w', encoding='utf-8').write(res)
        print('ok', f, src.count('\n'), '->', res.count('\n'))
    sys.exit(bad)
