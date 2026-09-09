// Speaking-minute quota — the meter that makes a paid plan possible.
//
// Why this exists: one minute of pronunciation assessment costs roughly 580–650đ of real
// money at the vendor. A plan sold as "unlimited" is therefore either dishonest scoring
// or an open tap. Every plan has a ceiling, and the ceiling is enforced HERE, on the
// server, because the client can be edited by anyone.
//
// This file is the I/O half: read the meter, apply the rules from quota-rules.js, write
// the meter back. The rules themselves are pure and tested separately.
import crypto from "crypto";
import { getUsageSeconds, addUsageSeconds } from "./db.js";
import {
  PLANS, MAX_CLIP_SECONDS, SANDBOX_SECONDS, periodKey, planFor, decide,
} from "./quota-rules.js";

export { PLANS, MAX_CLIP_SECONDS, periodKey, planFor };

/** Messages live here, not in the rules, so wording changes need no test updates. */
const MESSAGES = {
  clip_too_long: `Đoạn ghi âm vượt mức ${MAX_CLIP_SECONDS} giây cho một lần chấm. Hãy chia nhỏ câu trả lời.`,
  empty_audio: "Chưa nghe được gì trong đoạn ghi âm. Thử nói to hơn và kiểm tra micro nhé.",
  sandbox_daily_cap: "Lượt chấm thử miễn phí hôm nay đã hết. Đăng nhập để dùng 15 phút tặng khi đăng ký nhé.",
  sandbox_used: "Bạn đã dùng hết lượt chấm phát âm thử. Đăng nhập để nhận 15 phút nói có chấm — tặng một lần khi đăng ký.",
};
const exhaustedMessage = (plan) => PLANS[plan].window === "once"
  ? "Bạn đã dùng hết 15 phút nói có chấm được tặng. Shadowing và đọc-chấm phát âm vẫn miễn phí không giới hạn."
  : `Bạn đã dùng hết ${Math.round(PLANS[plan].seconds / 60)} phút nói của tháng này. Hạn mức làm mới vào đầu tháng sau.`;

/** Client IP, hashed — we count per visitor without storing anyone's address. */
export function ipKey(req) {
  const raw = (req.headers["x-forwarded-for"] || "").split(",")[0].trim()
    || req.socket?.remoteAddress || "unknown";
  const salt = process.env.SESSION_SECRET || "dev-insecure-secret-change-me";
  return "ip:" + crypto.createHmac("sha256", salt).update(raw).digest("base64url").slice(0, 22);
}

/**
 * Decides whether this request may spend `seconds` at the vendor.
 *
 * Fails OPEN on a database error: a broken meter must not lock out a paying learner. It
 * logs loudly instead, because silently un-metered spending is what this file prevents.
 */
export async function checkQuota(req, session, seconds) {
  const anon = !session?.sub;
  try {
    let args;
    if (anon) {
      const day = periodKey("day");
      const [mine, all] = await Promise.all([
        getUsageSeconds(ipKey(req), day),
        getUsageSeconds("sandbox:all", day),
      ]);
      args = { scope: "sandbox", seconds, used: 0, sandboxUsedToday: mine, sandboxUsedAll: all };
    } else {
      const plan = planFor(session);
      const used = await getUsageSeconds(session.sub, periodKey(PLANS[plan].window));
      args = { scope: "account", plan, seconds, used, sandboxUsedToday: 0, sandboxUsedAll: 0 };
    }
    const v = decide(args);
    if (v.ok) return v;
    const plan = anon ? null : planFor(session);
    return { ...v, plan, message: MESSAGES[v.reason] || exhaustedMessage(plan || "free") };
  } catch (e) {
    console.error("[quota] check failed, failing open:", e?.message);
    return { ok: true, scope: anon ? "sandbox" : "account", degraded: true };
  }
}

/** Records spend after the vendor call actually happened. Never throws. */
export async function recordUsage(req, session, seconds) {
  try {
    if (!session?.sub) {
      const day = periodKey("day");
      await Promise.all([
        addUsageSeconds(ipKey(req), day, seconds),
        addUsageSeconds("sandbox:all", day, seconds),
      ]);
      return;
    }
    const plan = planFor(session);
    await addUsageSeconds(session.sub, periodKey(PLANS[plan].window), seconds);
  } catch (e) {
    console.error("[quota] recordUsage failed:", e?.message);
  }
}

/** What the client needs to draw the "minutes left" meter. */
export async function quotaStatus(req, session) {
  if (!session?.sub) {
    let used = 0;
    try { used = await getUsageSeconds(ipKey(req), periodKey("day")); } catch {}
    return { scope: "sandbox", plan: null, limitSeconds: SANDBOX_SECONDS,
      usedSeconds: used, remainingSeconds: Math.max(0, SANDBOX_SECONDS - used), window: "day" };
  }
  const plan = planFor(session);
  const { seconds: limit, window, label } = PLANS[plan];
  let used = 0;
  try { used = await getUsageSeconds(session.sub, periodKey(window)); } catch {}
  return { scope: "account", plan, planLabel: label, limitSeconds: limit,
    usedSeconds: used, remainingSeconds: Math.max(0, limit - used), window };
}
