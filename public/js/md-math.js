/* Việt Du Ký – dựng công thức TeX nhỏ gọn (không thư viện ngoài, chạy được với CSP hiện tại).
window.vdkTex.render(mã, khối) → HTML an toàn (mọi chữ đều bị escape). Hỗ trợ: phân số \frac, căn \sqrt[n]{}, mũ ^ và chỉ số _,
chữ Hy Lạp, \int \sum \prod \lim (có cận), \left \right, \text \mathrm \mathbf \mathbb, \hat \bar \vec \overline,
ma trận / \begin{cases}, khoảng trắng \, \; \quad và các ký hiệu toán thông dụng. Lệnh lạ hiện nguyên chữ. */
(function () {
	'use strict';
	function esc(s) {
		return String(s).replace(/[&<>"']/g, function (c) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
		});
	}
	var SYM = {};
	function put(names, ch) {
		names.split(' ').forEach(function (n) {
			SYM[n] = ch;
		});
	}
	put('alpha', 'α'); put('beta', 'β'); put('gamma', 'γ'); put('delta', 'δ'); put('epsilon varepsilon', 'ε'); put('zeta', 'ζ'); put('eta', 'η');
	put('theta vartheta', 'θ'); put('iota', 'ι'); put('kappa', 'κ'); put('lambda', 'λ'); put('mu', 'μ'); put('nu', 'ν'); put('xi', 'ξ'); put('pi', 'π');
	put('rho', 'ρ'); put('sigma', 'σ'); put('tau', 'τ'); put('upsilon', 'υ'); put('phi varphi', 'φ'); put('chi', 'χ'); put('psi', 'ψ'); put('omega', 'ω');
	put('Gamma', 'Γ'); put('Delta', 'Δ'); put('Theta', 'Θ'); put('Lambda', 'Λ'); put('Xi', 'Ξ'); put('Pi', 'Π'); put('Sigma', 'Σ'); put('Phi', 'Φ'); put('Psi', 'Ψ'); put('Omega', 'Ω');
	put('times', '×'); put('cdot', '·'); put('div', '÷'); put('pm', '±'); put('mp', '∓'); put('ast', '∗'); put('circ', '∘'); put('bullet', '•'); put('star', '⋆');
	put('leq le', '≤'); put('geq ge', '≥'); put('neq ne', '≠'); put('approx', '≈'); put('equiv', '≡'); put('sim', '∼'); put('simeq', '≃'); put('cong', '≅'); put('propto', '∝'); put('ll', '≪'); put('gg', '≫');
	put('in', '∈'); put('notin', '∉'); put('ni', '∋'); put('subset', '⊂'); put('supset', '⊃'); put('subseteq', '⊆'); put('supseteq', '⊇'); put('cup', '∪'); put('cap', '∩'); put('emptyset varnothing', '∅'); put('setminus', '∖');
	put('forall', '∀'); put('exists', '∃'); put('nexists', '∄'); put('neg lnot', '¬'); put('land wedge', '∧'); put('lor vee', '∨'); put('oplus', '⊕'); put('otimes', '⊗');
	put('to rightarrow', '→'); put('leftarrow gets', '←'); put('leftrightarrow', '↔'); put('Rightarrow implies', '⇒'); put('Leftarrow', '⇐'); put('Leftrightarrow iff', '⇔'); put('mapsto', '↦'); put('uparrow', '↑'); put('downarrow', '↓');
	put('infty', '∞'); put('partial', '∂'); put('nabla', '∇'); put('hbar', 'ℏ'); put('ell', 'ℓ'); put('Re', 'ℜ'); put('Im', 'ℑ'); put('aleph', 'ℵ'); put('angle', '∠'); put('degree', '°'); put('prime', '′');
	put('ldots dots cdots', '…'); put('vdots', '⋮'); put('ddots', '⋱'); put('therefore', '∴'); put('because', '∵'); put('perp', '⊥'); put('parallel', '∥'); put('triangle', '△'); put('square', '□');
	put('langle', '⟨'); put('rangle', '⟩'); put('lfloor', '⌊'); put('rfloor', '⌋'); put('lceil', '⌈'); put('rceil', '⌉'); put('|', '‖'); put('mid', '∣');
	var BIG = { int: '∫', iint: '∬', iiint: '∭', oint: '∮', sum: '∑', prod: '∏', coprod: '∐', bigcup: '⋃', bigcap: '⋂' };
	var LIMOP = { lim: 1, max: 1, min: 1, sup: 1, inf: 1, limsup: 1, liminf: 1, det: 1, gcd: 1 };
	var FUNC = 'sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh log ln exp lg arg deg dim ker Pr hom'.split(' ');
	var SPACE = { ',': '0.17em', ':': '0.22em', ';': '0.28em', '!': '-0.17em', quad: '1em', qquad: '2em', ' ': '0.28em' };
	var ACCENT = { hat: '^', widehat: '^', bar: '¯', overline: '¯', vec: '→', tilde: '~', widetilde: '~', dot: '˙', ddot: '¨', overrightarrow: '→' };
	var FONT = { mathbf: 'tx-b', boldsymbol: 'tx-b', bf: 'tx-b', mathrm: 'tx-r', rm: 'tx-r', mathit: 'tx-i', mathbb: 'tx-bb', mathcal: 'tx-cal', mathfrak: 'tx-fr', mathsf: 'tx-sf', mathtt: 'tx-tt' };
	var BB = { R: 'ℝ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', C: 'ℂ', P: 'ℙ', H: 'ℍ', E: '𝔼' };

	function tokenize(src) {
		return src.match(/\\[A-Za-z]+|\\[\s\S]|[{}^_&]|\s+|[\s\S]/g) || [];
	}

	function Parser(toks) {
		this.t = toks;
		this.i = 0;
	}
	Parser.prototype.peek = function () {
		return this.t[this.i];
	};
	Parser.prototype.skipWs = function () {
		while (this.i < this.t.length && /^\s+$/.test(this.t[this.i])) {
			this.i++;
		}
	};
	/* Đọc cho tới khi gặp một trong các token dừng (không ăn token dừng) */
	Parser.prototype.seq = function (stop) {
		var out = '';
		while (this.i < this.t.length) {
			var t = this.t[this.i];
			if (stop && stop.indexOf(t) >= 0) {
				break;
			}
			if (t === '}' && !stop) {
				this.i++;
				continue;
			}
			out += this.scripted();
		}
		return out;
	};
	Parser.prototype.arg = function () {
		this.skipWs();
		var t = this.peek();
		if (t === undefined) {
			return '';
		}
		if (t === '{') {
			this.i++;
			var h = this.seq(['}']);
			if (this.peek() === '}') {
				this.i++;
			}
			return h;
		}
		return this.atom();
	};
	Parser.prototype.rawArg = function () {
		this.skipWs();
		var t = this.peek(), out = '';
		if (t === '{') {
			this.i++;
			while (this.i < this.t.length && this.t[this.i] !== '}') {
				out += this.t[this.i++];
			}
			this.i++;
			return out;
		}
		this.i++;
		return t || '';
	};
	/* Một nguyên tử + mũ / chỉ số theo sau */
	Parser.prototype.scripted = function () {
		var startTok = this.peek(), base = this.atom(), sup = '', sub = '', has = false;
		for (;;) {
			this.skipWsIfScript();
			var t = this.peek();
			if (t === '^') {
				this.i++;
				sup = this.arg();
				has = true;
			} else if (t === '_') {
				this.i++;
				sub = this.arg();
				has = true;
			} else {
				break;
			}
		}
		if (!has) {
			return base;
		}
		var name = startTok && startTok[0] === '\\' ? startTok.slice(1) : '';
		if (BIG[name] || LIMOP[name]) {
			return '<span class="tx-op"><span class="tx-lim">' + (sup || '&nbsp;') + '</span><span class="tx-opb">' + base + '</span><span class="tx-lim">' + (sub || '&nbsp;') + '</span></span>';
		}
		if (sup && sub) {
			return base + '<span class="tx-ss"><sup>' + sup + '</sup><sub>' + sub + '</sub></span>';
		}
		return base + (sup ? '<sup>' + sup + '</sup>' : '<sub>' + sub + '</sub>');
	};
	Parser.prototype.skipWsIfScript = function () {
		var j = this.i;
		while (j < this.t.length && /^\s+$/.test(this.t[j])) {
			j++;
		}
		if (this.t[j] === '^' || this.t[j] === '_') {
			this.i = j;
		}
	};
	Parser.prototype.atom = function () {
		var t = this.t[this.i++];
		if (t === undefined) {
			return '';
		}
		if (/^\s+$/.test(t)) {
			return ' ';
		}
		if (t === '{') {
			var h = this.seq(['}']);
			if (this.peek() === '}') {
				this.i++;
			}
			return '<span class="tx-g">' + h + '</span>';
		}
		if (t === '&') {
			return '<span class="tx-amp"></span>';
		}
		if (t[0] === '\\') {
			return this.command(t.slice(1));
		}
		if (/[0-9]/.test(t)) {
			return '<span class="tx-n">' + t + '</span>';
		}
		if (/[A-Za-z]/.test(t)) {
			return '<i>' + t + '</i>';
		}
		if (/[+\-=<>*/|:]/.test(t)) {
			return '<span class="tx-o">' + esc(t === '-' ? '−' : t === '*' ? '∗' : t) + '</span>';
		}
		return esc(t);
	};
	Parser.prototype.command = function (c) {
		var self = this, a, b;
		if (SYM[c]) {
			return /^(leq|le|geq|ge|neq|ne|approx|equiv|sim|simeq|cong|propto|ll|gg|in|notin|ni|subset|supset|subseteq|supseteq|to|rightarrow|leftarrow|gets|leftrightarrow|Rightarrow|implies|Leftarrow|Leftrightarrow|iff|mapsto|times|cdot|div|pm|mp|cup|cap|setminus|oplus|otimes|land|lor|wedge|vee|circ|ast)$/.test(c) ? '<span class="tx-o">' + SYM[c] + '</span>' : SYM[c];
		}
		if (BIG[c]) {
			return '<span class="tx-big">' + BIG[c] + '</span>';
		}
		if (LIMOP[c] || FUNC.indexOf(c) >= 0) {
			return '<span class="tx-fn">' + c + '</span>';
		}
		if (SPACE[c] !== undefined) {
			return '<span style="display:inline-block;width:' + SPACE[c] + '"></span>';
		}
		if (c === '\\') {
			return '<br class="tx-br">';
		}
		if (c === '{' || c === '}' || c === '%' || c === '$' || c === '#' || c === '_' || c === '&') {
			return esc(c);
		}
		switch (c) {
			case 'frac': case 'dfrac': case 'tfrac': case 'cfrac':
				a = this.arg();
				b = this.arg();
				return '<span class="tx-frac"><span class="tx-num">' + a + '</span><span class="tx-den">' + b + '</span></span>';
			case 'binom':
				a = this.arg();
				b = this.arg();
				return '<span class="tx-d">(</span><span class="tx-frac tx-bin"><span class="tx-num">' + a + '</span><span class="tx-den">' + b + '</span></span><span class="tx-d">)</span>';
			case 'sqrt': {
				var idx = '';
				this.skipWs();
				if (this.peek() === '[') {
					this.i++;
					while (this.i < this.t.length && this.t[this.i] !== ']') {
						idx += this.t[this.i++];
					}
					this.i++;
				}
				a = this.arg();
				return (idx ? '<sup class="tx-idx">' + esc(idx) + '</sup>' : '') + '<span class="tx-sqrt"><span class="tx-rad">√</span><span class="tx-rb">' + a + '</span></span>';
			}
			case 'text': case 'textrm': case 'mbox': case 'textbf': case 'textit': case 'operatorname':
				return '<span class="tx-t">' + esc(this.rawArg()) + '</span>';
			case 'left': case 'right': case 'big': case 'Big': case 'bigg': case 'Bigg': case 'bigl': case 'bigr': {
				var d = this.t[this.i++] || '';
				if (d[0] === '\\') {
					d = d === '\\{' ? '{' : d === '\\}' ? '}' : SYM[d.slice(1)] || (d === '\\|' ? '‖' : '');
				}
				return d === '.' ? '' : '<span class="tx-d">' + esc(d) + '</span>';
			}
			case 'begin': {
				var env = this.rawArg();
				return this.matrix(env);
			}
			case 'end':
				this.rawArg();
				return '';
			case 'underline':
				return '<span class="tx-ul">' + this.arg() + '</span>';
			case 'overbrace': case 'underbrace':
				return this.arg();
			case 'not':
				return '<span class="tx-not">' + this.atom() + '</span>';
			case 'displaystyle': case 'textstyle': case 'scriptstyle': case 'limits': case 'nolimits':
				return '';
			default:
		}
		if (ACCENT[c]) {
			return '<span class="tx-acc"><span class="tx-ac">' + ACCENT[c] + '</span>' + this.arg() + '</span>';
		}
		if (FONT[c]) {
			a = this.arg();
			if (c === 'mathbb') {
				var raw = a.replace(/<[^>]+>/g, '');
				if (BB[raw]) {
					return BB[raw];
				}
			}
			return '<span class="' + FONT[c] + '">' + a + '</span>';
		}
		return '<span class="tx-unk">\\' + esc(c) + '</span>';
	};
	Parser.prototype.matrix = function (env) {
		var open = { pmatrix: '(', bmatrix: '[', Bmatrix: '{', vmatrix: '|', Vmatrix: '‖', matrix: '', cases: '{', array: '', aligned: '', align: '', split: '', gathered: '', smallmatrix: '' }[env];
		var close = { pmatrix: ')', bmatrix: ']', Bmatrix: '}', vmatrix: '|', Vmatrix: '‖' }[env] || '';
		if (open === undefined) {
			return '';
		}
		if (env === 'array') {
			this.rawArg();
		}
		var rows = [[]], cell = '', depth = 0;
		while (this.i < this.t.length) {
			var t = this.t[this.i];
			if (t === '\\end') {
				this.i++;
				this.rawArg();
				break;
			}
			if (t === '&') {
				this.i++;
				rows[rows.length - 1].push(cell);
				cell = '';
			} else if (t === '\\\\') {
				this.i++;
				rows[rows.length - 1].push(cell);
				cell = '';
				rows.push([]);
			} else {
				cell += this.scripted();
			}
			depth = 0;
		}
		rows[rows.length - 1].push(cell);
		if (rows.length > 1 && rows[rows.length - 1].join('').trim() === '') {
			rows.pop();
		}
		var cls = env === 'cases' ? ' tx-cases' : /align|split|gathered/.test(env) ? ' tx-aligned' : '';
		var tbl = '<span class="tx-mat' + cls + '">' + rows.map(function (r) {
			return '<span class="tx-row">' + r.map(function (c) {
				return '<span class="tx-cell">' + c + '</span>';
			}).join('') + '</span>';
		}).join('') + '</span>';
		return (open ? '<span class="tx-d tx-big-d">' + esc(open) + '</span>' : '') + tbl + (close ? '<span class="tx-d tx-big-d">' + esc(close) + '</span>' : '');
	};

	function render(src, block) {
		try {
			var p = new Parser(tokenize(String(src == null ? '' : src).slice(0, 5000)));
			var h = p.seq(null);
			return '<span class="tx' + (block ? ' tx-block' : '') + '">' + h + '</span>';
		} catch (e) {
			return '<span class="tx tx-err">' + esc(src) + '</span>';
		}
	}
	window.vdkTex = { render: render };
})();
