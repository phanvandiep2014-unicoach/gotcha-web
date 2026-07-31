// GET /api/sso?token=<JWT>  — nhận học viên từ UNICOACH LMS.
// Token do LMS ký bằng khóa SSO riêng của Precisely (HS256, hết hạn 5 phút),
// dùng một lần để đăng nhập, KHÔNG dùng làm phiên.
import { verifyLmsToken } from "./_lib/unicoach.js";
import { signSession, setSessionCookie } from "./_lib/session.js";
import { upsertUser } from "./_lib/db.js";

export default async function handler(req, res) {
  const token = req.query?.token || "";
  const secret = process.env.PRECISELY_SSO_SECRET;

  const fail = (msg) => {
    res.writeHead(302, { Location: "/?sso_error=" + encodeURIComponent(String(msg).slice(0, 200)) });
    return res.end();
  };

  if (!token) return fail("Thiếu token. Hãy mở Precisely từ trong LMS.");
  if (!secret) return fail("Precisely chưa cấu hình khóa SSO. Liên hệ quản trị viên.");

  let p;
  try { p = verifyLmsToken(token, secret); }
  catch (e) { return fail(e?.message || "Token không hợp lệ."); }

  // Định danh riêng cho học viên đến từ LMS, không đụng tài khoản Google.
  const sub = `lms:${p.sub}`;
  const user = {
    sub,
    email: p.email || `${String(p.sub).toLowerCase()}@lms.unicoach.vn`,
    name: p.name || "Học viên UNICOACH",
    given_name: (p.name || "").split(" ").slice(-1)[0] || undefined,
    picture: undefined,
  };

  try { await upsertUser(user); }
  catch (e) { console.error("[sso] upsertUser:", e?.message); }  // chưa có DB thì vẫn cho vào

  // lms_code đi kèm phiên để lúc đẩy điểm biết gửi cho học viên nào
  setSessionCookie(res, signSession({
    sub, email: user.email, name: user.name, given_name: user.given_name,
    lms_code: p.sub, lms_student_id: p.lms_student_id ?? null,
  }));
  res.writeHead(302, { Location: "/test" });
  return res.end();
}
