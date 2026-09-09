// GET /api/quota — how many speaking seconds this visitor has left.
//
// Read-only and cheap: the client polls it to draw the "minutes left" meter and the
// "running low" screen. The number here is authoritative; the client only displays it.
import { getSession } from "./_lib/session.js";
import { quotaStatus } from "./_lib/quota.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });
  const session = getSession(req);
  const status = await quotaStatus(req, session);
  // Never cache: the meter changes with every graded answer.
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json(status);
}
