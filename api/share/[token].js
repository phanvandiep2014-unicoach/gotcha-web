// GET /api/share/:token → read-only view of a learner's profile (for a teacher).
// Renders a simple printable HTML page; no sign-in required, token is the capability.
import { resolveShare } from "../_lib/db.js";

const esc = (s) => String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

export default async function handler(req, res) {
  const token = req.query && req.query.token;
  const r = token ? await resolveShare(token) : null;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (!r) { res.status(404).send("<!doctype html><meta charset=utf-8><p>Liên kết hồ sơ không hợp lệ hoặc đã bị thu hồi.</p>"); return; }
  const d = r.data || {};
  const sessions = Array.isArray(d.progress) ? d.progress : [];
  const ev = d.lasteval || null;
  const prefs = d.prefs || {};
  const duke = d.duke || {};
  const days = new Set(sessions.map((s) => s.day)).size;
  const avg = (k) => sessions.length ? Math.round(sessions.reduce((a, s) => a + (s[k] || 0), 0) / sessions.length) : 0;
  const chips = (duke.items || []).slice(-8).map((i) => `<span class="chip">${esc(i.kw)}</span>`).join(" ");
  res.status(200).send(`<!doctype html><html lang="vi"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1"><title>Hồ sơ người học · Gotcha</title>
  <style>@page{margin:16mm}body{font-family:Georgia,serif;color:#241B10;max-width:720px;margin:24px auto;padding:0 18px}
  h1{font-size:1.6rem;color:#11183A;margin:0}.motto{color:#8A6A28;font-style:italic;margin:2px 0 18px}
  h2{font-size:1rem;color:#5A1726;border-bottom:2px solid #C8A14B;padding-bottom:4px;margin:20px 0 10px}
  .grid{display:flex;gap:12px;flex-wrap:wrap}.stat{flex:1;min-width:110px;background:#F4ECD8;border:1px solid #8A6A28;border-radius:10px;padding:12px;text-align:center}
  .stat b{display:block;font-size:1.5rem;color:#11183A}.stat span{font-size:.8rem;color:#8A6A28}
  .chip{display:inline-block;background:#11183A;color:#E7CE8E;border-radius:12px;padding:3px 10px;font-size:.8rem;margin:2px}
  .foot{text-align:center;color:#8A6A28;font-style:italic;margin-top:22px;font-size:.85rem}</style></head><body>
  <h1>GOTCHA · Hồ sơ người học</h1>
  <div class="motto">${esc(r.user?.name || "Học viên")} · Per te, ad astra — by UNICOACH</div>
  ${ev ? `<p>Band ước tính gần nhất: <b>${Number(ev.low).toFixed(1)}–${Number(ev.high).toFixed(1)}</b> (${esc(ev.day)}). Band mục tiêu: <b>${esc(prefs.targetBand || "6.5")}</b>.</p>` : ""}
  <h2>Tổng quan luyện tập</h2>
  <div class="grid">
    <div class="stat"><b>${sessions.length}</b><span>buổi luyện</span></div>
    <div class="stat"><b>${days}</b><span>ngày luyện</span></div>
    <div class="stat"><b>${avg("wpm")}</b><span>WPM TB</span></div>
    <div class="stat"><b>${avg("fillers")}</b><span>từ đệm TB</span></div>
  </div>
  ${chips ? `<h2>Chủ đề đã trò chuyện</h2><div>${chips}</div>` : ""}
  <div class="foot">Hồ sơ chỉ đọc, do học viên chủ động chia sẻ · Gotcha · UNICOACH</div>
  </body></html>`);
}
