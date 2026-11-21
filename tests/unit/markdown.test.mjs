/* Markdown đầy đủ cú pháp + tô màu mã theo ngôn ngữ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = { window: {} };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['md-math.js', 'md-highlight.js', 'md.js']) {
  vm.runInContext(readFileSync(new URL('../../public/js/' + f, import.meta.url), 'utf8'), ctx);
}
const md = (s) => ctx.vdkMd.render(s);

test('Tô màu: ghép token lại luôn bằng mã gốc, nhiều ngôn ngữ', () => {
  const samples = {
    js: 'const a = `x${1}`; // hi\nif (a) { return /ab+/g.test(a) }',
    py: 'def f(x):\n    """doc"""\n    return f"{x}" # c',
    sql: "SELECT * FROM t WHERE a = 'x' -- c",
    bash: 'echo "$HOME" --flag # c',
    json: '{"a": [1, true, null]}',
    yaml: 'a: 1\nb:\n  - x # c\nc: |\n  text',
    html: '<div class="a">x<script>let a=1</script></div><!-- c -->',
    css: 'a:hover { color: #fff; margin: 0 auto }',
    rust: "fn main() { let x: &'static str = \"a\"; println!(\"{}\", x); }",
    go: 'func main() { fmt.Println("x") }',
    diff: '+a\n-b\n c',
    toml: '[a]\nb = "x" # c',
    php: '<?php echo $a; ?>',
    cpp: '#include <iostream>\nint main(){ return 0; }'
  };
  for (const [lang, code] of Object.entries(samples)) {
    const t = ctx.vdkHl.tokenize(lang, code);
    assert.ok(t, lang);
    assert.equal(t.map((x) => x[1]).join(''), code, lang);
  }
  assert.equal(ctx.vdkHl.tokenize('khongco', 'x'), null);
});

test('Khối ```js nhận ra ngôn ngữ, tô từ khoá, nhãn đẹp và HTML trong mã bị escape', () => {
  const h = md('```js\nconst a = "<b>";\n```');
  assert.match(h, /class="lang-js"/);
  assert.match(h, /<span class="tk-k">const<\/span>/);
  assert.match(h, /md-lang">JavaScript</);
  assert.doesNotMatch(h, /<b>/);
});

test('Nút sao chép nằm ngoài <code> nên chữ sao chép không dính tên biểu tượng', () => {
  const h = md('```py\nprint(1)\n```');
  const code = h.match(/<code[^>]*>([\s\S]*?)<\/code>/)[1];
  assert.doesNotMatch(code, /content_copy/);
  assert.match(h, /data-md-copy/);
});

test('Ngôn ngữ lạ vẫn hiện nguyên văn không tô màu', () => {
  const h = md('```abc\nfoo bar\n```');
  assert.match(h, /foo bar/);
  assert.doesNotMatch(h, /tk-/);
});

test('Cú pháp mở rộng', () => {
  assert.match(md('> [!WARNING]\n> cẩn thận'), /md-box md-warning/);
  assert.match(md('::: details Xem\nnội dung\n:::'), /<details[^>]*><summary>Xem/);
  assert.match(md('::: tip\nmẹo\n:::'), /md-box md-tip/);
  assert.match(md('Từ\n: nghĩa'), /<dl><dt>Từ<\/dt><dd>nghĩa<\/dd>/);
  assert.match(md('*[HTML]: Hyper Text\n\nDùng HTML'), /<abbr title="Hyper Text">HTML<\/abbr>/);
  assert.match(md('Xem [a][1]\n\n[1]: https://x.test "T"'), /<a href="https:\/\/x.test" target="_blank" rel="noopener noreferrer" title="T">a<\/a>/);
  assert.match(md('$E=mc^2$'), /md-math/);
  assert.match(md('$$\nx\n$$'), /md-math-block/);
  assert.match(md(':smile: ++thêm++ [[Ctrl+C]]'), /😄.*<ins>thêm<\/ins>.*<kbd>Ctrl\+C<\/kbd>/);
  assert.match(md('![a](https://x.test/a.png =200x100)'), /width="200" height="100"/);
  assert.match(md('    code thụt'), /<pre><code>code thụt/);
  const toc = md('[[toc]]\n\n# Điểm đến\n\n## Hà Nội');
  assert.match(toc, /class="md-toc"/);
  assert.match(toc, /id="md\d+-diem-den"/);
});

test('Vẫn an toàn: HTML thô và javascript: bị chặn', () => {
  const h = md('<script>alert(1)</script> [x](javascript:alert(1)) <kbd>k</kbd>');
  assert.doesNotMatch(h, /<script/);
  assert.doesNotMatch(h, /href="javascript/);
  assert.match(h, /<kbd>k<\/kbd>/);
});

test('Hộp cảnh báo > [!TIP]: nội dung cùng dòng hoặc dòng sau đều render, không phân biệt hoa thường', () => {
  for (const src of ['> [!TIP]\n> hello', '> [!TIP] hello', '>[!tip]\n>hello', '> [!TIP]  \n> hello']) {
    const h = md(src);
    assert.match(h, /md-box md-tip/, src);
    assert.match(h, /hello/, src);
    assert.doesNotMatch(h, /\[!TIP\]/i, src);
  }
  assert.match(md('> [!DANGER]\n> x'), /md-box md-danger/);
});

test('Admin: danh sách "Đã gửi gần đây" thu gọn bài dài và có nút mở ra', () => {
  const js = readFileSync(new URL('../../public/admin/admin.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../public/admin/admin.css', import.meta.url), 'utf8');
  assert.match(js, /class="clip"/);
  assert.match(js, /clip-btn/);
  assert.match(css, /\.clip \{\s+max-height/);
});

test('Công thức TeX được dựng thật (phân số, căn, tích phân, ma trận), không còn hiện mã thô', () => {
  const h = md('$$\\int_0^1 x\\,dx = \\frac12$$');
  assert.match(h, /tx-op/);
  assert.match(h, /tx-frac/);
  assert.doesNotMatch(h, /\\frac|\\int/);
  assert.match(md('$\\sqrt{a^2+b^2}$'), /tx-sqrt/);
  assert.match(md('$$\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$$'), /tx-mat/);
  assert.match(md('$\\alpha \\leq \\beta$'), /α.*≤.*β/);
  assert.match(md('$\\foo$'), /tx-unk/);
  assert.doesNotMatch(md('$<img src=x onerror=1>$'), /<img/);
  assert.doesNotMatch(md('Giá $5 và $6'), /md-math/);
});

test('Ô nhập nhiều dòng tự dài theo nội dung ở trang khách và admin', () => {
  for (const f of ['public/js/site.js', 'public/admin/admin-plus.js']) {
    const js = readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
    assert.match(js, /tự dài ra theo nội dung/, f);
    assert.match(js, /scrollHeight/, f);
  }
});
