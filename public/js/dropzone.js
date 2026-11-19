/* Kéo thả file vào mọi nút/khung tải lên: tìm ô <input type="file"> gần nhất quanh vị trí thả */
(function () {
  'use strict';
  var hot = null;
  function target(e) {
    var n = e.target && e.target.nodeType === 1 ? e.target : e.target && e.target.parentNode;
    while (n && n !== document.body) {
      var f = n.querySelector && n.querySelector('input[type="file"]');
      if (f && !f.disabled) {
        return { box: n, input: f };
      }
      n = n.parentNode;
    }
    return null;
  }
  function ok(input, file) {
    var acc = (input.getAttribute('accept') || '').split(',').map(function (x) {
      return x.trim().toLowerCase();
    }).filter(Boolean);
    if (!acc.length) {
      return true;
    }
    var name = file.name.toLowerCase(), type = (file.type || '').toLowerCase();
    return acc.some(function (a) {
      return a[0] === '.' ? name.slice(-a.length) === a : a.slice(-2) === '/*' ? type.indexOf(a.slice(0, -1)) === 0 : type === a;
    });
  }
  function clear() {
    if (hot) {
      hot.classList.remove('drop-hot');
      hot = null;
    }
  }
  function hasFiles(e) {
    return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') > -1;
  }
  document.addEventListener('dragover', function (e) {
    if (!hasFiles(e)) {
      return;
    }
    var t = target(e);
    if (!t) {
      clear();
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (hot !== t.box) {
      clear();
      hot = t.box;
      hot.classList.add('drop-hot');
    }
  });
  document.addEventListener('dragleave', function (e) {
    if (!e.relatedTarget) {
      clear();
    }
  });
  document.addEventListener('drop', function (e) {
    if (!hasFiles(e)) {
      return;
    }
    var t = target(e);
    clear();
    if (!t) {
      return;
    }
    e.preventDefault();
    var files = Array.prototype.filter.call(e.dataTransfer.files, function (f) {
      return ok(t.input, f);
    });
    if (!files.length) {
      return;
    }
    try {
      var dt = new DataTransfer();
      (t.input.multiple ? files : files.slice(0, 1)).forEach(function (f) {
        dt.items.add(f);
      });
      t.input.files = dt.files;
      t.input.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (err) { /* trình duyệt cũ: bỏ qua */
    }
  });
})();
