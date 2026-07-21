// POST /api/auth/google  { credential }  → verify Google ID token, create session.
import { OAuth2Client } from "google-auth-library";
import { upsertUser } from "../_lib/db.js";
import { signSession, setSessionCookie } from "../_lib/session.js";

const client = new OAuth2Client();

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: "server_not_configured", hint: "Set GOOGLE_CLIENT_ID" });
  const credential = (req.body && req.body.credential) || "";
  if (!credential) return res.status(400).json({ error: "missing_credential" });
  try {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
    const p = ticket.getPayload();
    if (!p || !p.sub) return res.status(401).json({ error: "invalid_token" });
    const user = { sub: p.sub, email: p.email, name: p.name || p.given_name || "Learner", given_name: p.given_name, picture: p.picture };
    await upsertUser(user);
    setSessionCookie(res, signSession({ sub: user.sub, email: user.email, name: user.name, given_name: user.given_name, picture: user.picture }));
    return res.status(200).json({ user });
  } catch (e) {
    return res.status(401).json({ error: "verification_failed" });
  }
}
