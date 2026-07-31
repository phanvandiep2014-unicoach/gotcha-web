/* Đẩy kết quả bài thi thử về UNICOACH LMS.
 *
 * mocktest.js (bản đã build) lưu kết quả vào localStorage khóa
 * "gotcha.lasteval.v1" ngay khi chấm xong. Script này chỉ theo dõi khóa đó
 * rồi gọi /api/lms-submit — cố ý KHÔNG sửa vào bundle đã minify.
 *
 * Máy chủ tự bỏ qua nếu phiên không đến từ LMS, nên script chạy vô hại với
 * người đăng nhập bằng Google.
 */
(function () {
  var KEY = 'gotcha.lasteval.v1';
  var SENT = 'unicoach.lastsent.v1';

  function read(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }

  function send() {
    var raw = read(KEY);
    if (!raw || raw === read(SENT)) return;          // chưa có, hoặc đã gửi rồi
    var ev;
    try { ev = JSON.parse(raw); } catch (e) { return; }
    if (!ev || !ev.overall) return;

    fetch('/api/lms-submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        overall: ev.overall, low: ev.low, high: ev.high,
        day: ev.day, criteria: ev.criteria, pron: ev.pron, fluency: ev.fluency,
      }),
    }).then(function (r) { return r.json(); })
      .then(function (d) {
        // Chỉ đánh dấu đã gửi khi thực sự lưu được, để lần sau còn thử lại
        if (d && (d.saved || d.skipped)) { try { window.localStorage.setItem(SENT, raw); } catch (e) {} }
      })
      .catch(function () { /* im lặng — không làm hỏng trải nghiệm học viên */ });
  }

  // Bài thi kết thúc là ghi localStorage; soi định kỳ cho chắc, dừng sau 10 phút.
  var n = 0;
  var t = setInterval(function () { send(); if (++n > 200) clearInterval(t); }, 3000);
  window.addEventListener('beforeunload', send);
  document.addEventListener('visibilitychange', function () { if (document.hidden) send(); });
})();
