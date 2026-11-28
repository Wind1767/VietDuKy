/* Gộp + nén style.css, components.css, form-controls.css thành public/css/base*.min.css (giữ đúng thứ tự cascade của từng nhóm trang) (chạy tự động trước deploy). */
import { readFileSync, writeFileSync } from 'node:fs';

const BUNDLES = {
	'base.min.css': ['style', 'components', 'form-controls'],
	'base2.min.css': ['style', 'form-controls', 'components']
};
const min = (s) =>
	s
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/\s+/g, ' ')
		.replace(/\s*([{};,>])\s*/g, '$1')
		.replace(/:\s+/g, ':')
		.replace(/;}/g, '}')
		.trim();

for (const [name, files] of Object.entries(BUNDLES)) {
	const out = files.map((f) => min(readFileSync(`public/css/${f}.css`, 'utf8'))).join('\n');
	writeFileSync(`public/css/${name}`, out);
	console.log(name, out.length, 'bytes');
}
