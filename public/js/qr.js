/* Việt Du Ký – tạo mã QR ngay trên trình duyệt (chế độ byte, mức sửa lỗi M) để quét bằng Google Authenticator.
Không gửi dữ liệu ra ngoài: khoá bí mật không bao giờ rời khỏi máy người dùng. */
(function (root) {
	'use strict';

	var ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
	var NUM_BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];
	var MAX_VERSION = 11; // đủ cho liên kết otpauth (đã kiểm tra bằng bộ giải mã thật)

	function rawModules(ver) {
		var r = (16 * ver + 128) * ver + 64;
		if (ver >= 2) {
			var n = Math.floor(ver / 7) + 2;
			r -= (25 * n - 10) * n - 55;
			if (ver >= 7) {
				r -= 36;
			}
		}
		return r;
	}
	function dataCodewords(ver) {
		return Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver];
	}

	function gfMul(x, y) {
		var z = 0;
		for (var i = 7; i >= 0; i--) {
			z = (z << 1) ^ ((z >>> 7) * 0x11d);
			z ^= ((y >>> i) & 1) * x;
		}
		return z;
	}
	function rsDivisor(deg) {
		var res = [], i, j, root = 1;
		for (i = 0; i < deg - 1; i++) {
			res.push(0);
		}
		res.push(1);
		for (i = 0; i < deg; i++) {
			for (j = 0; j < res.length; j++) {
				res[j] = gfMul(res[j], root);
				if (j + 1 < res.length) {
					res[j] ^= res[j + 1];
				}
			}
			root = gfMul(root, 2);
		}
		return res;
	}
	function rsRemainder(data, divisor) {
		var res = divisor.map(function () {
			return 0;
		});
		data.forEach(function (b) {
			var f = b ^ res.shift();
			res.push(0);
			divisor.forEach(function (c, i) {
				res[i] ^= gfMul(c, f);
			});
		});
		return res;
	}

	function utf8(text) {
		var s = unescape(encodeURIComponent(text)), out = [];
		for (var i = 0; i < s.length; i++) {
			out.push(s.charCodeAt(i));
		}
		return out;
	}

	/* Trả về ma trận các ô (true = ô đen) */
	function encode(text) {
		var bytes = utf8(text), ver, bitLen;
		for (ver = 1; ver <= MAX_VERSION; ver++) {
			bitLen = 4 + (ver <= 9 ? 8 : 16) + bytes.length * 8;
			if (bitLen <= dataCodewords(ver) * 8) {
				break;
			}
		}
		if (ver > MAX_VERSION) {
			throw new Error('Nội dung quá dài cho mã QR.');
		}

		var bits = [];
		function put(val, len) {
			for (var i = len - 1; i >= 0; i--) {
				bits.push((val >>> i) & 1);
			}
		}
		put(4, 4);
		put(bytes.length, ver <= 9 ? 8 : 16);
		bytes.forEach(function (b) {
			put(b, 8);
		});
		var cap = dataCodewords(ver) * 8;
		put(0, Math.min(4, cap - bits.length));
		put(0, (8 - (bits.length % 8)) % 8);
		for (var pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) {
			put(pad, 8);
		}
		var data = [];
		for (var i = 0; i < bits.length; i += 8) {
			data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
		}

		// chia khối, thêm mã sửa lỗi Reed–Solomon, xen kẽ
		var nb = NUM_BLOCKS[ver], eccLen = ECC_PER_BLOCK[ver], raw = Math.floor(rawModules(ver) / 8);
		var shortBlocks = nb - (raw % nb), shortLen = Math.floor(raw / nb), blocks = [], div = rsDivisor(eccLen), k = 0;
		for (i = 0; i < nb; i++) {
			var dat = data.slice(k, k + shortLen - eccLen + (i < shortBlocks ? 0 : 1));
			k += dat.length;
			var ecc = rsRemainder(dat, div);
			if (i < shortBlocks) {
				dat.push(0);
			}
			blocks.push(dat.concat(ecc));
		}
		var all = [];
		for (i = 0; i < blocks[0].length; i++) {
			blocks.forEach(function (blk, j) {
				if (i !== shortLen - eccLen || j >= shortBlocks) {
					all.push(blk[i]);
				}
			});
		}

		var size = ver * 4 + 17, m = [], fn = [];
		for (i = 0; i < size; i++) {
			m.push(new Array(size).fill(false));
			fn.push(new Array(size).fill(false));
		}
		function setFn(x, y, dark) {
			m[y][x] = dark;
			fn[y][x] = true;
		}
		for (i = 0; i < size; i++) {
			setFn(6, i, i % 2 === 0);
			setFn(i, 6, i % 2 === 0);
		}
		function finder(cx, cy) {
			for (var dy = -4; dy <= 4; dy++) {
				for (var dx = -4; dx <= 4; dx++) {
					var d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
					if (x >= 0 && x < size && y >= 0 && y < size) {
						setFn(x, y, d !== 2 && d !== 4);
					}
				}
			}
		}
		finder(3, 3);
		finder(size - 4, 3);
		finder(3, size - 4);
		var pos = [];
		if (ver > 1) {
			var n = Math.floor(ver / 7) + 2, step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
			pos = [6];
			for (var p = size - 7; pos.length < n; p -= step) {
				pos.splice(1, 0, p);
			}
		}
		pos.forEach(function (cy, a) {
			pos.forEach(function (cx, b) {
				if ((a === 0 && b === 0) || (a === 0 && b === pos.length - 1) || (a === pos.length - 1 && b === 0)) {
					return;
				}
				for (var dy = -2; dy <= 2; dy++) {
					for (var dx = -2; dx <= 2; dx++) {
						setFn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
					}
				}
			});
		});

		function formatBits(mask) {
			var d = (0 << 3) | mask, rem = d; // mức sửa lỗi M = 0
			for (var q = 0; q < 10; q++) {
				rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
			}
			var b = ((d << 10) | rem) ^ 0x5412, bit = function (n) {
				return ((b >>> n) & 1) !== 0;
			}, t;
			for (t = 0; t <= 5; t++) {
				setFn(8, t, bit(t));
			}
			setFn(8, 7, bit(6));
			setFn(8, 8, bit(7));
			setFn(7, 8, bit(8));
			for (t = 9; t < 15; t++) {
				setFn(14 - t, 8, bit(t));
			}
			for (t = 0; t < 8; t++) {
				setFn(size - 1 - t, 8, bit(t));
			}
			for (t = 8; t < 15; t++) {
				setFn(8, size - 15 + t, bit(t));
			}
			setFn(8, size - 8, true);
		}
		formatBits(0);
		if (ver >= 7) {
			var r = ver;
			for (i = 0; i < 12; i++) {
				r = (r << 1) ^ ((r >>> 11) * 0x1f25);
			}
			var vb = (ver << 12) | r;
			for (i = 0; i < 18; i++) {
				var dark = ((vb >>> i) & 1) !== 0, a = size - 11 + (i % 3), b2 = Math.floor(i / 3);
				setFn(a, b2, dark);
				setFn(b2, a, dark);
			}
		}

		// đặt dữ liệu theo đường zig-zag
		var idx = 0;
		for (var right = size - 1; right >= 1; right -= 2) {
			if (right === 6) {
				right = 5;
			}
			for (var vert = 0; vert < size; vert++) {
				for (var j = 0; j < 2; j++) {
					var x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
					if (!fn[y][x] && idx < all.length * 8) {
						m[y][x] = ((all[idx >>> 3] >>> (7 - (idx & 7))) & 1) !== 0;
						idx++;
					}
				}
			}
		}

		function applyMask(mask) {
			for (var y = 0; y < size; y++) {
				for (var x = 0; x < size; x++) {
					var inv;
					switch (mask) {
						case 0:
							inv = (x + y) % 2 === 0;
							break;
						case 1:
							inv = y % 2 === 0;
							break;
						case 2:
							inv = x % 3 === 0;
							break;
						case 3:
							inv = (x + y) % 3 === 0;
							break;
						case 4:
							inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
							break;
						case 5:
							inv = ((x * y) % 2) + ((x * y) % 3) === 0;
							break;
						case 6:
							inv = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
							break;
						default: inv = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
					}
					if (!fn[y][x] && inv) {
						m[y][x] = !m[y][x];
					}
				}
			}
		}
		function penalty() {
			var score = 0, y, x, run, dark = 0;
			for (var pass = 0; pass < 2; pass++) {
				for (y = 0; y < size; y++) {
					run = 1;
					for (x = 1; x < size; x++) {
						var cur = pass ? m[x][y] : m[y][x], prev = pass ? m[x - 1][y] : m[y][x - 1];
						if (cur === prev) {
							run++;
							if (run === 5) {
								score += 3;
							} else if (run > 5) {
								score++;
							}
						} else {
							run = 1;
						}
					}
				}
			}
			for (y = 0; y < size - 1; y++) {
				for (x = 0; x < size - 1; x++) {
					if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) {
						score += 3;
					}
				}
			}
			for (y = 0; y < size; y++) {
				for (x = 0; x < size; x++) {
					if (m[y][x]) {
						dark++;
					}
				}
			}
			score += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
			return score;
		}
		var best = 0, bestScore = Infinity;
		for (var mask = 0; mask < 8; mask++) {
			applyMask(mask);
			formatBits(mask);
			var s = penalty();
			if (s < bestScore) {
				best = mask;
				bestScore = s;
			}
			applyMask(mask); // hoàn tác
		}
		applyMask(best);
		formatBits(best);
		return m;
	}

	/* Dựng phần tử <svg> (không dùng innerHTML) */
	function svg(text, px) {
		var m = encode(text), n = m.length, q = 4, NS = 'http://www.w3.org/2000/svg';
		var el = document.createElementNS(NS, 'svg');
		el.setAttribute('viewBox', '0 0 ' + (n + q * 2) + ' ' + (n + q * 2));
		el.setAttribute('width', px || 200);
		el.setAttribute('height', px || 200);
		el.setAttribute('role', 'img');
		el.setAttribute('shape-rendering', 'crispEdges');
		var bg = document.createElementNS(NS, 'rect');
		bg.setAttribute('width', '100%');
		bg.setAttribute('height', '100%');
		bg.setAttribute('fill', '#fff');
		el.appendChild(bg);
		var d = '';
		for (var y = 0; y < n; y++) {
			for (var x = 0; x < n; x++) {
				if (m[y][x]) {
					d += 'M' + (x + q) + ' ' + (y + q) + 'h1v1h-1z';
				}
			}
		}
		var path = document.createElementNS(NS, 'path');
		path.setAttribute('d', d);
		path.setAttribute('fill', '#000');
		el.appendChild(path);
		return el;
	}

	root.vdkQR = { encode: encode, svg: svg };
	if (typeof module !== 'undefined' && module.exports) {
		module.exports = root.vdkQR;
	}
})(typeof window !== 'undefined' ? window : globalThis);
