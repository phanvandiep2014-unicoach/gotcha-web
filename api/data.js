// GET  /api/data → { data, updatedAt } for the signed-in user (or {data:null}).
// PUT  /api/data  { data } → save the user's data blob (last-write-wins). Returns { updatedAt }.
import { getSession } from "./_lib/session.js";
import { getData, putData } from "./_lib/db.js";

export default async function handler(req, res) {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: "not_signed_in" });

  if (req.method === "GET") {
    const row = await getData(s.sub);
    return res.status(200).json({ data: row ? row.data : null, updatedAt: row ? row.updatedAt : null });
  }
  if (req.method === "PUT" || req.method === "POST") {
    const data = req.body && req.body.data;
    if (!data || typeof data !== "object") return res.status(400).json({ error: "missing_data" });
    const { updatedAt } = await putData(s.sub, data);
    return res.status(200).json({ ok: true, updatedAt });
  }
  return res.status(405).json({ error: "method_not_allowed" });
}
