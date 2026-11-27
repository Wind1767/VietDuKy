try {
	var t = localStorage.getItem('vdk-theme');
	if (t === 'dark' || t === 'light') {
		document.documentElement.dataset.theme = t;
	}
} catch (e) {}
