/* Trên điện thoại: khi bấm vào ô nhập, cuộn để ô (cả viền sáng) không bị thanh menu cố định hay bàn phím che. */
(function () {
  'use strict';
  var narrow = window.matchMedia ? window.matchMedia('(max-width: 900px)') : { matches: false };
  document.addEventListener('focusin', function (e) {
    var t = e.target;
    if (!narrow.matches || !t || !t.matches || !t.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea, select')) {
      return;
    }
    setTimeout(function () {
      if (document.activeElement !== t) {
        return;
      }
      var r = t.getBoundingClientRect(), vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
      if (r.top < 90 || r.bottom > vh - 24) {
        t.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }, 350);
  });
})();
