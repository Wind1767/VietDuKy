/* Nhận diện "thiết bị" (trình duyệt + hệ điều hành + quốc gia) để gắn phiên đăng nhập vào đúng nơi đã đăng nhập.
Cookie bị chép sang trình duyệt / máy khác sẽ không còn dùng được. Không dùng số phiên bản trình duyệt,
nên cập nhật trình duyệt không làm khách bị đăng xuất. */
const BROWSERS = [
	['Edge', /Edg(?:e|A|iOS)?\//],
	['Opera', /OPR\/|Opera/],
	['Samsung Internet', /SamsungBrowser\//],
	['Firefox', /Firefox\/|FxiOS\//],
	['Chrome', /Chrome\/|CriOS\//],
	['Safari', /Safari\//]
];
const SYSTEMS = [
	['iOS', /iPhone|iPad|iPod/],
	['Android', /Android/],
	['Windows', /Windows/],
	['macOS', /Mac OS X|Macintosh/],
	['ChromeOS', /CrOS/],
	['Linux', /Linux|X11/]
];

export function deviceInfo(request) {
	const ua = request.headers.get('User-Agent') || '';
	const browser = (BROWSERS.find(([, rx]) => rx.test(ua)) || ['Trình duyệt khác'])[0];
	const system = (SYSTEMS.find(([, rx]) => rx.test(ua)) || ['Hệ điều hành khác'])[0];
	const mobile = /Mobi|Android|iPhone|iPad|iPod/.test(ua) ? 'm' : 'd';
	const country = (request.headers.get('CF-IPCountry') || '').toUpperCase();
	return {
		key: `${browser}|${system}|${mobile}`,
		label: `${browser} · ${system}`,
		country: /^[A-Z]{2}$/.test(country) && country !== 'XX' && country !== 'T1' ? country : '',
		ip: request.headers.get('CF-Connecting-IP') || ''
	};
}

/* Chỉ hiện một phần địa chỉ IP trong danh sách thiết bị: 113.161.xxx.xxx */
export function maskIp(ip) {
	if (!ip) {
		return '';
	}
	if (ip.includes(':')) {
		return ip.split(':').slice(0, 3).join(':') + ':…';
	}
	const p = ip.split('.');
	return p.length === 4 ? `${p[0]}.${p[1]}.xxx.xxx` : '';
}

/* Hai quốc gia khác nhau (đều đã biết) = cùng một phiên không thể đang ở cả hai nơi */
export function countryClash(a, b) {
	return !!a && !!b && a !== b;
}

/* Điện thoại bấm "Trang web cho máy tính" sẽ gửi User-Agent giả máy tính:
   Android → Linux, iPhone/iPad → macOS (Macintosh), cờ di động → máy tính.
   Cùng trình duyệt + cặp hệ điều hành đó vẫn là cùng một thiết bị, không đăng xuất. */
const DESKTOP_MODE = { Android: 'Linux', iOS: 'macOS' };

export function sameDevice(stored, current) {
	if (stored === current) {
		return true;
	}
	const [b1, s1] = String(stored).split('|');
	const [b2, s2] = String(current).split('|');
	if (!b1 || b1 !== b2) {
		return false;
	}
	return DESKTOP_MODE[s1] === s2 || DESKTOP_MODE[s2] === s1;
}
