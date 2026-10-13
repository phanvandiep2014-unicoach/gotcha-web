/* Đăng nhập 1 lần với LMS UNICOACH.
 * Học viên đã đăng nhập ở LMS có cookie dấu hiệu `uc_in` trên *.unicoach.vn. Nếu vào Precisely mà
 * chưa có phiên thì chuyển im lặng qua LMS lấy link SSO. Khách chưa từng đăng nhập không có cookie
 * này nên KHÔNG bị chuyển hướng. Chống vòng lặp: LMS trả về ?sso=none khi không có phiên. */
(function () {
  try {
    var q = new URLSearchParams(location.search);
    if (q.get('sso') || q.get('sso_error')) return;
    if (!/(?:^|;\s*)uc_in=1/.test(document.cookie)) return;
    var last = Number(sessionStorage.getItem('uc_sso_try') || 0);
    if (Date.now() - last < 60000) return;
    sessionStorage.setItem('uc_sso_try', String(Date.now()));
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.user) return;
        location.replace('https://lms.unicoach.vn/api/auth/sso-start?app=precisely&mode=silent&return='
          + encodeURIComponent(location.pathname));
      })
      .catch(function () {});
  } catch (e) { /* trình duyệt chặn storage/cookie: bỏ qua, vẫn đăng nhập tay được */ }
})();
