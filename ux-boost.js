/* Precisely — lớp nâng cấp trải nghiệm (cộng thêm, KHÔNG sửa bundle đã minify).
 *
 * Nạp TRƯỚC app.js / mocktest.js / gigi.js. Làm 5 việc:
 *  1. Báo lỗi micro rõ ràng (bị chặn / không có micro / bị app khác chiếm) thay vì im lặng.
 *  2. Cảnh báo bài nói quá ngắn hoặc không nghe thấy giọng.
 *  3. Nút "Kiểm tra micro" có thanh đo âm lượng sống + tần số lấy mẫu.
 *  4. Khiên bảo hiểm chuỗi (Streak Freeze): 1 lần/tuần, tự dùng khi lỡ đúng 1 ngày.
 *     Cần dòng `window.__preciselyFreezeDays` trong hàm tính streak của app.js (đã vá 1 chỗ).
 *  5. Gợi ý đăng nhập Google để lưu streak lên đám mây, hiện đúng 1 lần sau bài luyện đầu tiên.
 * Mọi thứ bọc try/catch: trình duyệt chặn storage hay thiếu API thì trang vẫn chạy như cũ.
 */
(function () {
  'use strict';

  var PROGRESS = 'gotcha.progress.v1';
  var FREEZE = 'gotcha.freeze.v1';
  var PROMPTED = 'gotcha.ux.syncprompt.v1';

  function get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* bỏ qua */ } }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function track(name, data) { try { if (window.va) window.va('event', { name: name, data: data || {} }); } catch (e) { /* bỏ qua */ } }

  /* ---------- giao diện dùng chung: toast + modal ---------- */
  var css = document.createElement('style');
  css.textContent =
    '.ux-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:9999;max-width:min(92vw,520px);' +
    'background:var(--sapphire,#11183A);color:var(--gold-light,#E7CE8E);border:1px solid var(--gold,#C8A14B);' +
    'padding:12px 16px;border-radius:6px;font:500 .95rem/1.4 var(--fb,serif);box-shadow:0 8px 28px rgba(0,0,0,.35)}' +
    '.ux-veil{position:fixed;inset:0;z-index:9998;background:rgba(10,14,36,.72);display:flex;align-items:center;justify-content:center;padding:16px}' +
    '.ux-modal{background:var(--ivory,#FBF7EE);color:var(--ink,#241B10);border:2px solid var(--gold-dark,#8A6A28);border-radius:8px;' +
    'max-width:460px;width:100%;padding:22px 22px 18px;box-shadow:0 18px 50px rgba(0,0,0,.45)}' +
    '.ux-modal h3{font:700 1.05rem var(--fh,serif);letter-spacing:.04em;color:var(--oxblood,#5A1726);margin-bottom:8px}' +
    '.ux-modal p,.ux-modal li{font-size:1rem;line-height:1.5}.ux-modal ol{margin:8px 0 8px 20px}' +
    '.ux-modal .en{display:block;font-style:italic;opacity:.7;font-size:.88rem;margin-top:4px}' +
    '.ux-row{display:flex;gap:10px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap}' +
    '.ux-btn{font:600 .8rem var(--fh,serif);letter-spacing:.05em;padding:9px 16px;border-radius:4px;cursor:pointer;border:1px solid var(--gold-dark,#8A6A28);' +
    'background:transparent;color:var(--ink,#241B10);text-decoration:none;display:inline-block}' +
    '.ux-btn.pri{background:var(--oxblood,#5A1726);color:var(--gold-light,#E7CE8E)}' +
    '.ux-mic{margin:0 auto 10px;max-width:520px;text-align:center}' +
    '.ux-mic button{font:600 .75rem var(--fh,serif);letter-spacing:.05em;padding:7px 14px;border:1px solid var(--gold-dark,#8A6A28);border-radius:4px;background:transparent;color:var(--ink,#241B10);cursor:pointer}' +
    '.ux-meter{display:none;height:10px;margin:8px auto 2px;max-width:320px;background:rgba(0,0,0,.12);border-radius:5px;overflow:hidden}' +
    '.ux-meter i{display:block;height:100%;width:0;background:var(--emerald,#123F33);transition:width .08s linear}' +
    '.ux-meter.hot i{background:var(--oxblood,#5A1726)}' +
    '.ux-micinfo{font-size:.85rem;opacity:.8;min-height:1.2em}' +
    /* Điện thoại: thanh trên cùng xuống dòng thay vì tràn ngang; vùng chạm đủ lớn */
    '@media(max-width:640px){header{flex-wrap:wrap;row-gap:2px}header .spacer{display:none}' +
    'header>a{margin-right:6px!important;padding:11px 6px;font-size:.78rem!important;display:inline-block}' +
    'header button{margin-left:auto}}';
  (document.head || document.documentElement).appendChild(css);

  var toastTimer = null;
  function toast(msg) {
    try {
      var old = document.querySelector('.ux-toast'); if (old) old.remove();
      var t = document.createElement('div'); t.className = 'ux-toast'; t.setAttribute('role', 'status'); t.innerHTML = msg;
      document.body.appendChild(t);
      clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.remove(); }, 7000);
    } catch (e) { /* bỏ qua */ }
  }
  function modal(html, buttons) {
    try {
      if (document.querySelector('.ux-veil')) return;
      var v = document.createElement('div'); v.className = 'ux-veil'; v.setAttribute('role', 'dialog'); v.setAttribute('aria-modal', 'true');
      v.innerHTML = '<div class="ux-modal">' + html + '<div class="ux-row"></div></div>';
      var row = v.querySelector('.ux-row');
      buttons.forEach(function (b) {
        var el = document.createElement(b.href ? 'a' : 'button');
        el.className = 'ux-btn' + (b.primary ? ' pri' : ''); el.textContent = b.label;
        if (b.href) el.href = b.href;
        el.addEventListener('click', function () { v.remove(); if (b.onClick) b.onClick(); });
        row.appendChild(el);
      });
      v.addEventListener('click', function (e) { if (e.target === v) v.remove(); });
      document.body.appendChild(v);
    } catch (e) { /* bỏ qua */ }
  }

  /* ---------- 1. Báo lỗi micro ---------- */
  var micShown = 0;
  function micProblem(kind) {
    if (Date.now() - micShown < 4000) return; micShown = Date.now();
    track('mic_problem', { kind: kind });
    if (kind === 'NotFoundError' || kind === 'audio-capture') {
      modal('<h3>🎙 Không tìm thấy micro</h3><p>Máy chưa nhận micro nào. Hãy cắm tai nghe có micro, hoặc vào cài đặt âm thanh của máy và chọn đúng thiết bị thu, rồi tải lại trang.' +
        '<span class="en">No microphone found. Plug one in or pick the right input device, then reload.</span></p>',
        [{ label: 'Tải lại trang', primary: true, onClick: function () { location.reload(); } }, { label: 'Đóng' }]);
    } else if (kind === 'NotReadableError' || kind === 'AbortError') {
      modal('<h3>🎙 Micro đang bị ứng dụng khác dùng</h3><p>Hãy tắt Zoom, Meet, Zalo hoặc tab khác đang dùng micro, rồi bấm RECORD lại.' +
        '<span class="en">Your microphone is busy in another app or tab.</span></p>', [{ label: 'Đã hiểu', primary: true }]);
    } else {
      modal('<h3>🎙 Trình duyệt đang chặn micro</h3><p>Precisely cần micro để nghe bạn nói. Làm theo 3 bước:</p>' +
        '<ol><li>Bấm vào biểu tượng <b>ổ khóa 🔒</b> (hoặc biểu tượng cài đặt) bên trái thanh địa chỉ.</li>' +
        '<li>Chọn <b>Micro → Cho phép</b>.</li><li>Tải lại trang rồi bấm RECORD.</li></ol>' +
        '<p class="en">Your browser is blocking the microphone. Click the lock icon in the address bar, allow Microphone, then reload.</p>',
        [{ label: 'Tải lại trang', primary: true, onClick: function () { location.reload(); } }, { label: 'Đóng' }]);
    }
  }

  try {
    var md = navigator.mediaDevices;
    if (md && md.getUserMedia) {
      var origGUM = md.getUserMedia.bind(md);
      md.getUserMedia = function (c) {
        return origGUM(c).catch(function (e) { micProblem((e && e.name) || 'NotAllowedError'); throw e; });
      };
    }
  } catch (e) { /* bỏ qua */ }

  /* ---------- 2. Bọc SpeechRecognition để bắt lỗi & bài quá ngắn ---------- */
  ['SpeechRecognition', 'webkitSpeechRecognition'].forEach(function (name) {
    try {
      var Orig = window[name]; if (!Orig) return;
      var Wrapped = function () {
        var r = new Orig(), t0 = 0, heard = false, errored = false;
        r.addEventListener('start', function () { t0 = Date.now(); heard = false; errored = false; });
        r.addEventListener('result', function () { heard = true; });
        r.addEventListener('error', function (ev) {
          var code = ev && ev.error;
          if (code === 'not-allowed' || code === 'service-not-allowed') { errored = true; micProblem('NotAllowedError'); }
          else if (code === 'audio-capture') { errored = true; micProblem('audio-capture'); }
          else if (code === 'network') { errored = true; toast('Mất kết nối mạng nên chưa nhận dạng được giọng nói. Kiểm tra mạng rồi thử lại.'); }
        });
        r.addEventListener('end', function () {
          if (errored || !t0) return;
          var secs = (Date.now() - t0) / 1000;
          if (!heard) toast('Chưa nghe thấy giọng nói. Hãy kiểm tra micro (nút 🎙 phía trên) và nói to rõ hơn.');
          else if (secs < 5) toast('Bài nói hơi ngắn (' + Math.round(secs) + ' giây). Hãy nói ít nhất một câu hoàn chỉnh, trên 5 giây, để phân tích chính xác.');
          t0 = 0;
        });
        return r;
      };
      Wrapped.prototype = Orig.prototype;
      window[name] = Wrapped;
    } catch (e) { /* bỏ qua */ }
  });

  /* ---------- 3. Nút kiểm tra micro + thanh đo âm lượng ---------- */
  function mountMicCheck() {
    var rec = document.getElementById('rec');
    if (!rec || document.querySelector('.ux-mic')) return;
    var wrap = document.createElement('div'); wrap.className = 'ux-mic';
    wrap.innerHTML = '<button type="button" id="uxMicBtn">🎙 Kiểm tra micro</button>' +
      '<div class="ux-meter" id="uxMeter"><i></i></div><div class="ux-micinfo" id="uxMicInfo"></div>';
    rec.parentNode.insertBefore(wrap, rec);

    var stream = null, ctx = null, raf = 0, autoStop = 0;
    var btn = wrap.querySelector('#uxMicBtn'), meter = wrap.querySelector('#uxMeter'), bar = meter.firstChild, info = wrap.querySelector('#uxMicInfo');

    function stop() {
      cancelAnimationFrame(raf); clearTimeout(autoStop);
      try { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { /* bỏ qua */ }
      try { if (ctx) ctx.close(); } catch (e) { /* bỏ qua */ }
      stream = null; ctx = null; meter.style.display = 'none'; btn.textContent = '🎙 Kiểm tra micro';
    }
    btn.addEventListener('click', function () {
      if (stream) { stop(); info.textContent = ''; return; }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { info.textContent = 'Trình duyệt này không hỗ trợ micro.'; return; }
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
        stream = s;
        var AC = window.AudioContext || window.webkitAudioContext; ctx = new AC();
        var an = ctx.createAnalyser(); an.fftSize = 512; ctx.createMediaStreamSource(s).connect(an);
        var buf = new Uint8Array(an.fftSize), peak = 0;
        meter.style.display = 'block'; btn.textContent = '⏹ Dừng kiểm tra';
        info.textContent = 'Micro hoạt động · ' + Math.round(ctx.sampleRate / 1000) + ' kHz — hãy nói thử một câu.';
        (function tick() {
          an.getByteTimeDomainData(buf);
          var m = 0; for (var i = 0; i < buf.length; i++) { var d = Math.abs(buf[i] - 128) / 128; if (d > m) m = d; }
          peak = Math.max(peak * 0.9, m);
          bar.style.width = Math.min(100, Math.round(peak * 160)) + '%';
          meter.className = 'ux-meter' + (peak > 0.6 ? ' hot' : '');
          raf = requestAnimationFrame(tick);
        })();
        autoStop = setTimeout(stop, 10000);
      }).catch(function () { /* getUserMedia đã bọc sẽ hiện modal */ });
    });
    // Nhả micro trước khi ghi thật để không tranh thiết bị với nhận dạng giọng nói.
    var rb = document.getElementById('recBtn');
    if (rb) rb.addEventListener('click', stop, true);
  }

  /* ---------- 4. Streak Freeze ---------- */
  function utcDay(offset) { return new Date(Date.now() - offset * 864e5).toISOString().slice(0, 10); }
  function weekKey(dayStr) { // tuần ISO theo UTC, đủ dùng để "mỗi tuần một lần"
    var d = new Date(dayStr + 'T00:00:00Z'); var dow = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dow); return d.toISOString().slice(0, 10);
  }
  function freezeInit() {
    var state = { days: [], used: {} };
    try { var s = JSON.parse(get(FREEZE) || 'null'); if (s && Array.isArray(s.days)) state = { days: s.days, used: s.used || {} }; } catch (e) { /* bỏ qua */ }
    try {
      var prog = JSON.parse(get(PROGRESS) || '[]'); if (!Array.isArray(prog)) prog = [];
      var have = {}; prog.forEach(function (p) { if (p && p.day) have[p.day] = 1; });
      state.days.forEach(function (d) { have[d] = 1; });
      var today = utcDay(0), yest = utcDay(1), dby = utcDay(2), dby3 = utcDay(3);
      // Lỡ đúng hôm qua, nhưng 2 ngày liền trước đó có luyện (chuỗi >= 2) và tuần này chưa dùng khiên.
      if (!have[today] && !have[yest] && have[dby] && have[dby3] && !state.used[weekKey(yest)]) {
        state.days.push(yest); state.used[weekKey(yest)] = 1;
        state.days = state.days.slice(-30);
        set(FREEZE, JSON.stringify(state));
        track('streak_freeze_used');
        window.addEventListener('load', function () { toast('🛡 Khiên bảo hiểm đã giữ chuỗi ngày học của bạn hôm qua. Mỗi tuần được dùng một lần — hôm nay hãy luyện tiếp nhé!'); });
      }
    } catch (e) { /* bỏ qua */ }
    window.__preciselyFreezeDays = state.days;
  }

  /* ---------- 5. Gợi ý lưu streak lên đám mây sau bài đầu tiên ---------- */
  function syncPromptWatch() {
    if (get(PROMPTED)) return;
    var path = location.pathname;
    if (!/\/(try|test)?(\.html)?$/.test(path) && path !== '/') return;
    var base = 0;
    try { base = (JSON.parse(get(PROGRESS) || '[]') || []).length; } catch (e) { base = 0; }
    if (base > 0) return;                 // đã luyện từ trước: không làm phiền
    var timer = setInterval(function () {
      var list = []; try { list = JSON.parse(get(PROGRESS) || '[]') || []; } catch (e) { /* bỏ qua */ }
      if (!list.length) return;
      clearInterval(timer);
      fetch('/api/auth/me', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (d) {
        if (d && d.user) { set(PROMPTED, '1'); return; }
        var last = list[list.length - 1] || {};
        var wpm = last.wpm ? ' Tốc độ nói của bạn: <b>' + Math.round(last.wpm) + ' từ/phút</b>.' : '';
        modal('<h3>🏛 Chúc mừng bài luyện đầu tiên!</h3><p>Đã ghi nhận <b>Ngày 1</b> trong chuỗi học.' + wpm +
          ' Đăng nhập Google để lưu chuỗi và lịch sử lên đám mây — đổi máy hay xoá bộ nhớ trình duyệt cũng không mất.</p>',
          [{ label: 'Lưu bằng Google', primary: true, href: 'profile' }, { label: 'Để sau' }]);
        set(PROMPTED, '1'); track('sync_prompt_shown');
      }).catch(function () { /* mất mạng: lần sau */ });
    }, 2000);
  }

  freezeInit();
  document.addEventListener('DOMContentLoaded', function () { mountMicCheck(); syncPromptWatch(); });
})();
