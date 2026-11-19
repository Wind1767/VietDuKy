/* Định dạng mã nguồn: mỗi câu lệnh một dòng, luôn có { } cho if/for/while, tách đối tượng nhiều khoá, ngắt chuỗi nối dài.
Chạy:  npm run format   (ghi đè file)   |   npm run format:check   (chỉ kiểm tra, dùng khi CI) */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(root + '/package.json');
let ts;
try {
  ts = req('typescript');
} catch {
  ts = createRequire('/home/claude/.npm-global/lib/node_modules/')('typescript');
}
const K = ts.SyntaxKind;
const BL = '@@BLANKLINE@@';

export function format(code, file) {
  // Bước 0: đánh dấu dòng trống giữa các câu lệnh bằng comment tạm để máy in giữ lại đúng chỗ
  const sf0 = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const ins = [];
  const markList = (list) => {
    for (let i = 1; i < list.length; i++) {
      const n = list[i], gap = code.slice(n.pos, n.getStart(sf0)), m = gap.match(/\n[ \t]*\n/);
      if (m) {
        ins.push(n.pos + m.index + 1);
      }
    }
  };
  (function w0(n) {
    if (n.kind === ts.SyntaxKind.SourceFile || n.kind === ts.SyntaxKind.Block || n.kind === ts.SyntaxKind.ModuleBlock ||
      n.kind === ts.SyntaxKind.CaseClause || n.kind === ts.SyntaxKind.DefaultClause) {
      markList(n.statements);
    }
    ts.forEachChild(n, w0);
  })(sf0);
  ins.sort((x, y) => y - x);
  for (const p of ins) {
    code = code.slice(0, p) + '//' + BL + '\n' + code.slice(p);
  }

  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const text = sf.text;

  const f = ts.factory;
  const wrap = (st) => (st && st.kind !== K.Block ? f.createBlock([st], true) : st);
  const hasComments = (n) => (ts.getLeadingCommentRanges(text, n.pos) || []).length > 0 || (ts.getTrailingCommentRanges(text, n.end) || []).length > 0;
  function walk(n) {
    // thân if/else/for/while không có { } thì thêm { }
    if (n.kind === K.IfStatement) {
      n.thenStatement = wrap(n.thenStatement);
      if (n.elseStatement && n.elseStatement.kind !== K.IfStatement) {
        n.elseStatement = wrap(n.elseStatement);
      }
    }
    if (n.kind === K.ForStatement || n.kind === K.ForInStatement || n.kind === K.ForOfStatement || n.kind === K.WhileStatement || n.kind === K.DoStatement) {
      n.statement = wrap(n.statement);
    }
    if (n.kind === K.ObjectLiteralExpression && n.properties.length > 2 && !n.properties.some(hasComments)) {
      n.multiLine = true;
      n.properties.forEach((p) => {
        p.pos = -1;
        p.end = -1;
      });
    }
    if (n.kind === ts.SyntaxKind.Block) {
      n.multiLine = true;
    }
    ts.forEachChild(n, walk);
  }
  walk(sf);

  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: false });
  let out = printer.printFile(sf);
  out = out.replace(new RegExp('^[ \\t]*//' + BL + '[ \\t]*\\n', 'gm'), '\n');

  // 4 spaces -> 2 spaces, except lines that begin inside a template literal
  const sf2 = ts.createSourceFile(file, out, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const lineStarts = sf2.getLineStarts();
  const skip = new Set();
  (function w(n) {
    if (n.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral || n.kind === ts.SyntaxKind.TemplateHead ||
      n.kind === ts.SyntaxKind.TemplateMiddle || n.kind === ts.SyntaxKind.TemplateTail) {
      const a = sf2.getLineAndCharacterOfPosition(n.getStart(sf2)).line, b = sf2.getLineAndCharacterOfPosition(n.end).line;
      for (let l = a + 1; l <= b; l++) {
        skip.add(l);
      }
    }
    ts.forEachChild(n, w);
  })(sf2);
  const lines = out.split('\n').map((ln, i) => {
    if (skip.has(i)) {
      return ln;
    }
    const m = ln.match(/^( +)/);
    return m ? ' '.repeat(Math.floor(m[1].length / 2)) + ln.slice(m[1].length) : ln;
  });
  const res = [];
  lines.forEach((ln, i) => {
    const t = ln.trim(), prev = res.length ? res[res.length - 1] : '';
    if (!skip.has(i) && /^(else|catch|finally)\b/.test(t) && prev.trim() === '}' && !skip.has(i - 1)) {
      res[res.length - 1] = prev + ' ' + t;
      return;
    }
    if (!skip.has(i) && t.startsWith('}') && /\{$/.test(prev) && !skip.has(i - 1)) {
      res[res.length - 1] = prev + t;
      return;
    }
    res.push(ln);
  });
  return res.join('\n').replace(/\n{3,}/g, '\n\n');
}

const MAX = 110;

function pass(text, file) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const starts = sf.getLineStarts();
  const lineOf = (p) => sf.getLineAndCharacterOfPosition(p).line;
  const lineText = (l) => text.slice(starts[l], l + 1 < starts.length ? starts[l + 1] - 1 : text.length);
  const inTemplate = (n) => {
    for (let p = n.parent; p; p = p.parent) {
      if (p.kind === K.TemplateExpression) {
        return true;
      }
    }
    return false;
  };
  const edits = [];
  (function walk(n) {
    if (n.kind === K.BinaryExpression && n.operatorToken.kind === K.PlusToken && !(n.parent.kind === K.BinaryExpression && n.parent.operatorToken.kind === K.PlusToken && n.parent.left === n) && !inTemplate(n)) {
      const a = lineOf(n.getStart(sf)), b = lineOf(n.end);
      if (a === b && lineText(a).length > MAX) {
        const ops = [];
        let cur = n;
        while (cur.kind === K.BinaryExpression && cur.operatorToken.kind === K.PlusToken) {
          ops.unshift({ op: cur.operatorToken, right: cur.right });
          cur = cur.left;
        }
        const indent = lineText(a).match(/^ */)[0] + '  ';
        let col = n.getStart(sf) - starts[a] + (cur.end - cur.getStart(sf));
        const lineEndCol = () => col;
        for (const { op, right } of ops) {
          const w = ' + '.length + (right.end - right.getStart(sf));
          if (col + w > MAX) {
            const s = op.getStart(sf);
            // thay " + " bằng " +\n<indent>"
            edits.push({
              from: s + 1,
              to: right.getStart(sf),
              text: '\n' + indent
            });
            col = indent.length + (right.end - right.getStart(sf));
          } else {
            col += w;
          }
        }
      }
    }
    ts.forEachChild(n, walk);
  })(sf);
  return edits;
}

function wrapText(t, f) {
  for (let round = 0; round < 4; round++) {
    const e = pass(t, f).sort((x, y) => y.from - x.from);
    if (!e.length) {
      break;
    }
    let lastFrom = Infinity;
    for (const x of e) {
      if (x.to <= lastFrom) {
        t = t.slice(0, x.from) + x.text + t.slice(x.to);
        lastFrom = x.from;
      }
    }
  }
  return t;
}

const check = process.argv.includes('--check');
const jsFiles = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (['node_modules', '.git'].includes(e.name)) {
      continue;
    }
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      walk(p);
    } else if (/\.(m?js)$/.test(e.name) && !p.includes(path.join('tests', 'helpers', 'vendor'))) {
      jsFiles.push(p);
    }
  }
};
['src', 'public', 'scripts', 'tools', 'tests'].forEach((d) => fs.existsSync(path.join(root, d)) && walk(path.join(root, d)));
let changed = 0;
for (const file of jsFiles) {
  const src = fs.readFileSync(file, 'utf8');
  // lặp tới khi ổn định (máy in lại thụt dòng sau khi ngắt dòng)
  let out = src;
  for (let i = 0; i < 4; i++) {
    const next = wrapText(format(out, file), file);
    if (next === out) {
      break;
    }
    out = next;
  }
  if (out !== src) {
    changed++;
    if (check) {
      console.log('cần format:', path.relative(root, file));
    } else {
      fs.writeFileSync(file, out);
    }
  }
}
const css = spawnSync('python3', [path.join(root, 'tools', 'fmtcss.py'), ...(check ? ['--check'] : []), ...['public/css/chat.css', 'public/css/components.css', 'public/css/style.css', 'public/css/form-controls.css', 'public/admin/admin.css'].map((p) => path.join(root, p))], { encoding: 'utf8' });
process.stdout.write(css.stdout || '');
if (css.status) {
  changed++;
}
console.log(check ? (changed ? changed + ' file cần format' : 'Tất cả đã đúng định dạng') : 'Đã format xong');
process.exit(check && changed ? 1 : 0);
