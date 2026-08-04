// POST /api/auth/google  { credential }  → xác thực ID token của Google rồi tạo phiên.
//
// Quy tắc UNICOACH (Phan chốt 04/08/2026): KHÔNG tự mở tài khoản cho người lạ.
// Email Google phải trùng một tài khoản đang hoạt động trong LMS. Nhờ đó phiên
// cũng mang sẵn mã học viên, nên điểm thi thử tự đổ về LMS mà không cần vào bằng SSO.
import { OAuth2Client } from "google-auth-library";
import { upsertUser } from "../_lib/db.js";
import { signSession, setSessionCookie } from "../_lib/session.js";
import { lookupLmsUser } from "../_lib/lms-lookup.js";

const client = new OAuth2Client();

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: "server_not_configured", hint: "Set GOOGLE_CLIENT_ID" });
  const credential = (req.body && req.body.credential) || "";
  if (!credential) return res.status(400).json({ error: "missing_credential" });

  let p;
  try {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
    p = ticket.getPayload();
    if (!p || !p.sub) return res.status(401).json({ error: "invalid_token" });
  } catch {
    return res.status(401).json({ error: "verification_failed" });
  }

  const email = String(p.email || "").trim().toLowerCase();
  if (!email || p.email_verified === false) {
    return res.status(403).json({ error: "email_not_verified", message: "Email Google này chưa được xác minh." });
  }

  // Cửa duy nhất: LMS nói có thì mới cho vào.
  const lms = await lookupLmsUser(email);
  if (!lms.found) {
    return res.status(403).json({
      error: lms.offline ? "lms_unavailable" : "not_registered",
      message: lms.offline
        ? "Hiện chưa kết nối được hệ thống UNICOACH. Vui lòng thử lại sau ít phút."
        : `Email ${email} chưa được đăng ký tại UNICOACH. Hãy liên hệ trung tâm để được cấp tài khoản.`,
    });
  }

  const user = {
    sub: p.sub,
    email,
    name: lms.name || p.name || p.given_name || "Learner",
    given_name: p.given_name,
    picture: p.picture,
  };
  await upsertUser(user);
  setSessionCookie(res, signSession({
    sub: user.sub, email: user.email, name: user.name,
    given_name: user.given_name, picture: user.picture,
    lms_code: lms.student_code || null,   // có mã này thì điểm mới đẩy được về LMS
  }));
  return res.status(200).json({ user });
}
