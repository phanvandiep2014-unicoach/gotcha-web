// GET /api/auth/me → current user from session cookie (or null).
import { getSession } from "../_lib/session.js";

export default async function handler(req, res) {
  const s = getSession(req);
  if (!s) return res.status(200).json({ user: null });
  return res.status(200).json({ user: { sub: s.sub, email: s.email, name: s.name, given_name: s.given_name, picture: s.picture } });
}
