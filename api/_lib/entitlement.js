// Gói NÓI của một tài khoản — hỏi WriteRight (nơi thu tiền duy nhất cho cả hai app).
// GET {WRITERIGHT_URL}/api/entitlement?email=...  header x-unicoach-key: PRECISELY_ENTITLEMENT_SECRET
// WriteRight trả speak_plan ĐÃ TÍNH HẠN ('free' khi hết hạn).
//
// Trước 02/11/2026 Precisely chưa từng gọi endpoint này: planFor(session) luôn ra 'free', nên
// người đã mua Speak/Duo cũng chỉ có 15 phút dùng thử. File này vá lỗ đó.
//
// Lỗi mạng / thiếu cấu hình → 'free' (không bao giờ mở hạn mức trả phí khi không chắc).
// Cache trong bộ nhớ 5 phút cho mỗi email để không gọi WriteRight ở mọi lượt ghi âm.
const TTL_MS = 5 * 60 * 1000;
const cache = new Map();

export async function entitledSpeakPlan(session) {
  const email = String(session?.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) return "free";
  const hit = cache.get(email);
  if (hit && hit.until > Date.now()) return hit.plan;

  const base = (process.env.WRITERIGHT_URL || "https://writeright.unicoach.vn").replace(/\/+$/, "");
  const key = process.env.PRECISELY_ENTITLEMENT_SECRET;
  if (!key) {
    console.error("[entitlement] thieu PRECISELY_ENTITLEMENT_SECRET — moi tai khoan tinh la free");
    return "free";
  }
  let plan = "free";
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(`${base}/api/entitlement?email=${encodeURIComponent(email)}`, {
      headers: { "x-unicoach-key": key }, signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (r.ok) {
      const j = await r.json();
      if (typeof j.speak_plan === "string") plan = j.speak_plan;
    } else {
      console.error("[entitlement] WriteRight tra", r.status);
      return "free";   // không cache lỗi
    }
  } catch (e) {
    console.error("[entitlement] goi WriteRight loi:", e?.message);
    return "free";
  }
  cache.set(email, { plan, until: Date.now() + TTL_MS });
  return plan;
}
