/* Precisely — Thẻ Story 1080x1920 "Khoe chiến tích" (cộng thêm, không sửa bundle).
 * Chỉ dùng số liệu thật trong localStorage (WPM, từ đệm, số từ, chuỗi ngày, số bài).
 * Cố ý KHÔNG hiện band: bài đọc thuộc không phải kỹ năng nói, band chưa hiệu chuẩn.
 * Mã QR cố định trỏ về trang chủ Precisely (ma trận nhúng sẵn, không phụ thuộc thư viện ngoài). */
(function () {
  'use strict';
  var QR = ["1111111001101001111011101110001111111", "1000001000011001100100000011101000001", "1011101011000100000111101001101011101", "1011101011010101000100101110001011101", "1011101011111101000110010110101011101", "1000001011010010101000100011101000001", "1111111010101010101010101010101111111", "0000000010000101100010001011100000000", "1011111000000110001011101111001111100", "1011010101001101110000000110111100110", "0111101110010010010011011001101100111", "0111000010010000100001010011101110001", "0100101101001110110010011101011110111", "0111100110001110010111010000110100000", "1011101010001001110011000101110111011", "1100000100101101111011110010010110001", "0111011101010101100001011111111010111", "1101100001001101001010101100100101010", "0101011100100001111100101111101001111", "0111100001001001000111001001000100001", "0101001001010111010110101110111010100", "1000010111000000101110110110100001010", "1111001000110001101010100001110111011", "0110100111000100000110011001011110010", "1110101110000101001111101110011110101", "1010010011100111110001001000100101100", "1011111111100000010010100011011100011", "1000100011010100100001000011111101001", "1001001000100010010010101111111111101", "0000000011111000110101010001100011010", "1111111000101111010011000000101010111", "1000001011101010011111101010100011011", "1011101011001111100101011111111110110", "1011101010000011001010110110111010001", "1011101010101101100100101111000001111", "1000001001011011000111011001111010001", "1111111010101001110100001110011010111"];
  var W = 1080, H = 1920;

  function read(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } }
  function stats() {
    var prog = read('gotcha.progress.v1', []); if (!Array.isArray(prog)) prog = [];
    var fz = read('gotcha.freeze.v1', { days: [] }).days || [];
    var days = {}; prog.forEach(function (p) { if (p && p.day) days[p.day] = 1; }); fz.forEach(function (d) { days[d] = 1; });
    var key = function (o) { return new Date(Date.now() - o * 864e5).toISOString().slice(0, 10); };
    var o = days[key(0)] ? 0 : (days[key(1)] ? 1 : -1), streak = 0;
    if (o >= 0) while (days[key(o + streak)]) streak++;
    var last = prog[prog.length - 1] || null;
    return { n: prog.length, streak: streak, last: last, bestFill: prog.length ? Math.min.apply(null, prog.map(function (p) { return p.fillers || 0; })) : 0 };
  }
  function cssv(n, f) { try { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || f; } catch (e) { return f; } }

  function draw(canvas, name, s) {
    var c = canvas.getContext('2d');
    var navy = cssv('--sapphire-deep', '#0A0E24'), gold = cssv('--gold', '#C8A14B'), goldL = cssv('--gold-light', '#E7CE8E'), ivory = cssv('--ivory', '#FBF7EE');
    var g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#11183A'); g.addColorStop(1, navy);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.strokeStyle = gold; c.lineWidth = 6; c.strokeRect(48, 48, W - 96, H - 96);
    c.lineWidth = 2; c.strokeRect(68, 68, W - 136, H - 136);
    c.textAlign = 'center';
    var serif = '"EB Garamond", Georgia, serif';
    c.fillStyle = goldL; c.font = '700 78px ' + serif; c.fillText('PRECISELY', W / 2, 230);
    c.font = 'italic 38px ' + serif; c.fillStyle = gold; c.fillText('Per te, ad astra — by UNICOACH', W / 2, 290);
    c.fillStyle = ivory; c.font = '600 64px ' + serif; c.fillText(name || 'Một học viên kiên trì', W / 2, 470);
    c.font = 'italic 40px ' + serif; c.fillStyle = goldL; c.fillText('đang luyện IELTS Speaking cùng giám khảo Duke', W / 2, 535);

    // chuỗi ngày
    c.fillStyle = gold; c.font = '700 300px ' + serif; c.fillText(String(s.streak), W / 2, 850);
    c.fillStyle = ivory; c.font = '600 54px ' + serif; c.fillText(s.streak === 1 ? 'ngày luyện liên tiếp' : 'ngày luyện liên tiếp', W / 2, 925);

    // ba chỉ số thật
    var items = [
      [s.last && s.last.wpm ? Math.round(s.last.wpm) : '—', 'từ / phút'],
      [s.last ? (s.last.fillers || 0) : '—', 'từ đệm bài gần nhất'],
      [s.n, s.n === 1 ? 'bài đã luyện' : 'bài đã luyện']
    ];
    items.forEach(function (it, i) {
      var x = 210 + i * 330;
      c.fillStyle = goldL; c.font = '700 120px ' + serif; c.fillText(String(it[0]), x, 1180);
      c.fillStyle = ivory; c.font = '500 34px ' + serif; wrap(c, it[1], x, 1235, 290, 40);
    });

    // QR
    var size = QR.length, cell = 8, pad = 24, box = size * cell + pad * 2, qx = (W - box) / 2, qy = 1295;
    c.fillStyle = ivory; c.fillRect(qx, qy, box, box);
    c.fillStyle = '#11183A';
    for (var r = 0; r < size; r++) for (var q = 0; q < size; q++) if (QR[r][q] === '1') c.fillRect(qx + pad + q * cell, qy + pad + r * cell, cell, cell);
    c.fillStyle = ivory; c.font = '600 42px ' + serif; wrap(c, 'Quét mã để thử sức phản xạ Speaking cùng Duke', W / 2, qy + box + 66, 840, 50);
    c.fillStyle = gold; c.font = 'italic 34px ' + serif; c.fillText('precisely.unicoach.vn', W / 2, qy + box + 160);
  }
  function wrap(c, text, x, y, maxW, lh) {
    var words = String(text).split(' '), line = '', yy = y;
    words.forEach(function (w) { var t = line ? line + ' ' + w : w; if (c.measureText(t).width > maxW && line) { c.fillText(line, x, yy); line = w; yy += lh; } else line = t; });
    c.fillText(line, x, yy);
  }

  function open() {
    var s = stats();
    if (!s.n) { alert('Hãy hoàn thành ít nhất một bài luyện ở trang Luyện nhanh trước khi tạo thẻ nhé.'); return; }
    var def = ''; try { var u = JSON.parse(localStorage.getItem('gotcha.user.v1') || 'null'); def = (u && (u.name || u.given_name)) || ''; } catch (e) { /* bỏ qua */ }
    var v = document.createElement('div');
    v.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(10,14,36,.8);display:flex;align-items:center;justify-content:center;padding:12px;overflow:auto';
    v.innerHTML = '<div style="background:#FBF7EE;border:2px solid #8A6A28;border-radius:8px;padding:16px;max-width:360px;width:100%;text-align:center">' +
      '<canvas width="' + W + '" height="' + H + '" style="width:100%;border-radius:4px;display:block"></canvas>' +
      '<input id="storyName" placeholder="Tên hiển thị trên thẻ" maxlength="28" style="width:100%;margin-top:10px;padding:8px;border:1px solid #8A6A28;border-radius:4px;font-size:1rem" value="' + def.replace(/"/g, '') + '">' +
      '<div style="display:flex;gap:8px;margin-top:10px;justify-content:center"><button id="storyDl" style="padding:9px 16px;background:#5A1726;color:#E7CE8E;border:0;border-radius:4px;cursor:pointer;font-weight:600">Tải ảnh PNG</button>' +
      '<button id="storyX" style="padding:9px 16px;background:transparent;border:1px solid #8A6A28;border-radius:4px;cursor:pointer">Đóng</button></div></div>';
    document.body.appendChild(v);
    var cv = v.querySelector('canvas'), nm = v.querySelector('#storyName');
    var go = function () { draw(cv, nm.value.trim(), s); };
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(go);
    nm.addEventListener('input', go);
    v.querySelector('#storyX').onclick = function () { v.remove(); };
    v.addEventListener('click', function (e) { if (e.target === v) v.remove(); });
    v.querySelector('#storyDl').onclick = function () {
      cv.toBlob(function (b) { var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'precisely-story.png'; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); }, 'image/png');
      try { if (window.va) window.va('event', { name: 'story_card_download' }); } catch (e) { /* bỏ qua */ }
    };
  }

  function mount() {
    var app = document.getElementById('app'); if (!app) return;
    var place = function () {
      if (document.getElementById('storyBtnWrap') || !app.firstElementChild) return;
      var w = document.createElement('div'); w.id = 'storyBtnWrap'; w.style.cssText = 'text-align:center;margin:14px 0';
      w.innerHTML = '<button type="button" style="font:600 .8rem var(--fh,serif);letter-spacing:.05em;padding:10px 18px;border:1px solid var(--gold-dark,#8A6A28);border-radius:4px;background:var(--oxblood,#5A1726);color:var(--gold-light,#E7CE8E);cursor:pointer">🏛 Khoe chiến tích (thẻ Story)</button>';
      w.firstChild.onclick = open; app.insertBefore(w, app.firstElementChild);
    };
    place(); new MutationObserver(place).observe(app, { childList: true });
  }
  document.addEventListener('DOMContentLoaded', mount);
})();
