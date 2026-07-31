// Nối Precisely ↔ UNICOACH LMS.
//   ① LMS phát token SSO (JWT HS256, hết hạn 5 phút) → /api/sso xác thực
//   ② Thi thử xong → đẩy band về LMS qua POST {LMS}/api/v1/results (X-API-Key)
// Không thêm thư viện JWT: chỉ cần verify HS256 nên dùng crypto có sẵn,
// cùng cách với api/_lib/session.js.
import crypto from "crypto";

const b64url = (s) => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");

/** Xác thực token SSO của LMS. Ném lỗi (tiếng Việt) nếu không hợp lệ. */
export function verifyLmsToken(token, secret) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("Token không đúng định dạng.");
  const [h, p, sig] = parts;

  let header;
  try { header = JSON.parse(b64url(h).toString("utf8")); }
  catch { throw new Error("Token không đọc được."); }
  // Chặn alg=none và mọi thuật toán khác — nếu không, ai cũng ký được token giả.
  if (header?.alg !== "HS256") throw new Error("Thuật toán ký không được chấp nhận.");

  const expected = crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest();
  const got = b64url(sig);
  if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got))
    throw new Error("Chữ ký token không hợp lệ.");

  let payload;
  try { payload = JSON.parse(b64url(p).toString("utf8")); }
  catch { throw new Error("Nội dung token không đọc được."); }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && now > payload.exp) throw new Error("Token đã hết hạn. Hãy bấm mở lại từ LMS.");
  if (payload.iss !== "unicoach-lms") throw new Error("Token không do UNICOACH LMS phát hành.");
  if (payload.aud !== "precisely") throw new Error("Token không dành cho Precisely.");
  if (!payload.sub) throw new Error("Token thiếu mã học viên.");
  return payload;
}

/**
 * Đẩy điểm Speaking về LMS. Không bao giờ ném lỗi ra ngoài — học viên vẫn
 * phải xem được kết quả kể cả khi LMS sập hoặc chưa cấu hình.
 * Trả về true nếu đẩy thành công.
 */
export async function pushResultToLms({ studentCode, externalId, band, title, feedback, detail }) {
  const base = (process.env.UNICOACH_LMS_URL || "").replace(/\/+$/, "");
  const apiKey = process.env.UNICOACH_API_KEY;
  if (!base || !apiKey || !studentCode || band == null) return false;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(`${base}/api/v1/results`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({
        app: "precisely", student_code: studentCode, external_id: externalId,
        skill: "speaking", band, title, feedback, detail,
        submitted_at: new Date().toISOString().slice(0, 10),
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) { console.error("[unicoach] đẩy điểm thất bại:", r.status, (await r.text()).slice(0, 200)); return false; }
    return true;
  } catch (e) {
    console.error("[unicoach] đẩy điểm lỗi:", e?.message);
    return false;
  }
}
