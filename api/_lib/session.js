// Minimal signed session token (HMAC-SHA256) stored in an httpOnly cookie.
// No external JWT dependency — uses Node's crypto.
import crypto from "crypto";

const COOKIE = "gsid";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const b64url = (buf) => Buffer.from(buf).toString("base64url");
const secret = () => process.env.SESSION_SECRET || "dev-insecure-secret-change-me";

export function signSession(payload) {
  const body = { ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + MAX_AGE };
  const data = b64url(JSON.stringify(body));
  const sig = crypto.createHmac("sha256", secret()).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifySession(token) {
  if (!token || token.indexOf(".") < 0) return null;
  const [data, sig] = token.split(".");
  const expect = crypto.createHmac("sha256", secret()).update(data).digest("base64url");
  if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  try {
    const body = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    if (!body.exp || body.exp < Math.floor(Date.now() / 1000)) return null;
    return body;
  } catch { return null; }
}

function parseCookies(req) {
  const h = req.headers.cookie || "";
  const out = {};
  h.split(";").forEach((p) => { const i = p.indexOf("="); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}

export function getSession(req) {
  return verifySession(parseCookies(req)[COOKIE]);
}

export function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie",
    `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`);
}
export function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
}
