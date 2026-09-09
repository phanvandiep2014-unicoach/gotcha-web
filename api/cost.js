// GET /api/cost — how many seconds of paid speech Precisely actually bought.
//
// The pricing model assumes ~650đ per spoken minute. That number came from Azure's list
// price, not from a bill, and every margin in the price sheet rests on it. This endpoint
// reports the one thing we measure exactly — seconds — so the assumption can be replaced
// with arithmetic once a real invoice arrives.
//
// Internal: this is revenue-adjacent data. Access is limited to accounts named in
// PRECISELY_ADMIN_SUBS, and when that variable is unset nobody gets in — an admin page
// that defaults to open is worse than no admin page.
import { getSession } from "./_lib/session.js";
import { usageSummary } from "./_lib/db.js";
import { PLANS, VND_PER_SECOND } from "./_lib/quota-rules.js";

const admins = () =>
  (process.env.PRECISELY_ADMIN_SUBS || "").split(",").map(s => s.trim()).filter(Boolean);

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

  const allow = admins();
  if (!allow.length) {
    return res.status(503).json({
      error: "admin_not_configured",
      message: "Đặt PRECISELY_ADMIN_SUBS (danh sách sub, ngăn bằng dấu phẩy) để mở trang này.",
    });
  }
  const session = getSession(req);
  if (!session?.sub || !allow.includes(session.sub)) {
    // Same answer whether not signed in or not an admin: this page's existence is not
    // something a curious visitor needs confirmed.
    return res.status(404).json({ error: "not_found" });
  }

  const rows = await usageSummary();
  const totalSeconds = rows.reduce((n, r) => n + r.sandboxSeconds + r.accountSeconds, 0);

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    // The assumed rate, clearly labelled as an assumption rather than a measurement.
    assumedVndPerSecond: VND_PER_SECOND,
    plans: Object.fromEntries(Object.entries(PLANS).map(([k, p]) => [k, { label: p.label, minutes: p.seconds / 60, window: p.window }])),
    totalSeconds,
    periods: rows,
  });
}
