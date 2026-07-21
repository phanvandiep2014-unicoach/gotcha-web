// POST /api/share → create (or reuse) a read-only share token for the signed-in user.
// Returns { token, url } so a learner can share their profile with a teacher.
import crypto from "crypto";
import { getSession } from "./_lib/session.js";
import { createShare } from "./_lib/db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: "not_signed_in" });
  const token = crypto.randomBytes(9).toString("base64url");
  await createShare(s.sub, token);
  const origin = `https://${req.headers.host}`;
  return res.status(200).json({ token, url: `${origin}/api/share/${token}` });
}
