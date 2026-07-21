// POST /api/auth/logout → clear session cookie.
import { clearSessionCookie } from "../_lib/session.js";

export default async function handler(req, res) {
  clearSessionCookie(res);
  return res.status(200).json({ ok: true });
}
