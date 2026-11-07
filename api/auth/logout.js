// POST /api/auth/logout → clear session cookie.
import { clearSessionCookie } from "../_lib/session.js";

export default async function handler(req, res) {
  clearSessionCookie(res);
  // Đăng xuất chung với LMS/WriteRight: xóa luôn phiên chung *.unicoach.vn (cùng Domain nên xóa được),
  // nếu không sso-silent.js sẽ tự đăng nhập lại ngay lần mở trang kế tiếp.
  const dom = /(^|\.)unicoach\.vn$/.test(String(req.headers.host || '').split(':')[0]) ? "; Domain=.unicoach.vn" : "";
  res.setHeader("Set-Cookie", [].concat(res.getHeader("Set-Cookie") || [],
    `uc_sid=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0${dom}`,
    `uc_in=; Secure; SameSite=Lax; Path=/; Max-Age=0${dom}`));
  return res.status(200).json({ ok: true });
}
