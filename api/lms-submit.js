// POST /api/lms-submit  { overall, low, high, day, criteria:[{key,name_vi,band}], pron, fluency }
// Đẩy kết quả bài thi thử về hồ sơ học tập trên UNICOACH LMS.
// Chỉ chạy khi phiên hiện tại đến từ LMS (có lms_code) — người đăng nhập
// bằng Google thường sẽ bị bỏ qua, im lặng, không báo lỗi.
import { getSession } from "./_lib/session.js";
import { pushResultToLms } from "./_lib/unicoach.js";

const half = (n) => Math.max(0, Math.min(9, Math.round(Number(n) * 2) / 2));

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const s = getSession(req);
  if (!s) return res.status(401).json({ error: "not_signed_in" });
  if (!s.lms_code) return res.status(200).json({ ok: true, skipped: "not_lms_user" });

  const b = req.body || {};
  const overall = half(b.overall);
  if (!(overall > 0)) return res.status(400).json({ error: "missing_overall" });

  const crit = Array.isArray(b.criteria) ? b.criteria.slice(0, 6) : [];
  const detail = {};
  for (const c of crit) if (c?.key) detail[String(c.key)] = half(c.band);
  if (b.pron != null) detail.pronunciation_score_100 = Math.round(Number(b.pron));
  if (b.fluency != null) detail.fluency_score_100 = Math.round(Number(b.fluency));

  // Mỗi ngày một bản ghi cho mỗi học viên: thi lại trong ngày sẽ ghi đè thay vì
  // sinh hàng chục dòng điểm. LMS chống trùng theo external_id.
  const day = String(b.day || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const externalId = `mocktest-${s.lms_code}-${day}`;

  const feedback = [
    `Bài thi thử Speaking ngày ${day}.`,
    crit.length ? crit.map((c) => `${c.name_vi || c.key}: ${half(c.band)}`).join(' · ') : '',
    b.low != null && b.high != null ? `Khoảng ước tính ${half(b.low)}–${half(b.high)}.` : '',
    'Đây là điểm tự luyện, không phải điểm IELTS chính thức.',
  ].filter(Boolean).join('\n');

  const ok = await pushResultToLms({
    studentCode: s.lms_code, externalId, band: overall,
    title: `Thi thử Speaking — ${day}`, feedback, detail,
  });
  return res.status(200).json({ ok, saved: ok });
}
