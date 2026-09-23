// Which speaking plan does this learner have? — asked of WriteRight.
//
// WriteRight is the single place UNICOACH takes money (PayOS + expiry dates since 08/2026).
// Precisely never stores a plan of its own: it asks GET <WRITERIGHT_URL>/api/entitlement
// with a shared secret and caches the answer briefly. The link between the two apps is the
// e-mail address, so a learner must sign in to both with the same address.
//
// Env:
//   WRITERIGHT_URL                 https://writeright.unicoach.vn
//   PRECISELY_ENTITLEMENT_SECRET   same value on both Vercel projects
//   PRECISELY_PLAN_OVERRIDES       optional "a@x.vn:speak_plus,b@y.vn:speak" — beta testers,
//                                  teachers, staff. Checked first, never expires; remove
//                                  entries by hand when the promise ends.
import { PLANS } from "./quota-rules.js";

const TTL_MS = 60 * 1000;            // a fresh purchase shows up within a minute
const STALE_OK_MS = 24 * 3600 * 1000; // on an outage, yesterday's answer beats a guess
const TIMEOUT_MS = 2500;
const cache = new Map();             // email -> { plan, at }

const valid = (p) => Object.prototype.hasOwnProperty.call(PLANS, p);

export function parseOverrides(raw = process.env.PRECISELY_PLAN_OVERRIDES || "") {
  const out = new Map();
  for (const part of raw.split(",")) {
    const i = part.lastIndexOf(":");
    if (i <= 0) continue;
    const email = part.slice(0, i).trim().toLowerCase();
    const plan = part.slice(i + 1).trim();
    if (email && valid(plan)) out.set(email, plan);
  }
  return out;
}

/**
 * Resolve the plan key for a signed-in session. Never throws.
 *
 * Failure policy, deliberately asymmetric:
 *  - not configured (no URL/secret)  → "free": nothing has been sold, nothing to honour.
 *  - configured but unreachable      → last known answer if < 24h old, else "speak".
 *    Locking a paying learner out is worse than a free learner getting paid minutes for
 *    the length of an outage — and every plan still has a ceiling, so the tap stays shut.
 */
export async function resolvePlan(session, { fetchImpl = fetch, now = Date.now() } = {}) {
  if (valid(session?.plan) && session.plan !== "free") return session.plan; // set by SSO in future
  const email = String(session?.email || "").trim().toLowerCase();
  if (!email) return "free";

  const ov = parseOverrides().get(email);
  if (ov) return ov;

  const base = (process.env.WRITERIGHT_URL || "").replace(/\/+$/, "");
  const secret = process.env.PRECISELY_ENTITLEMENT_SECRET || "";
  if (!base || !secret) return "free";

  const hit = cache.get(email);
  if (hit && now - hit.at < TTL_MS) return hit.plan;

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const r = await fetchImpl(`${base}/api/entitlement?email=${encodeURIComponent(email)}`, {
      headers: { "x-unicoach-key": secret }, signal: ctrl.signal,
    }).finally(() => clearTimeout(t));
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const plan = valid(j?.speak_plan) ? j.speak_plan : "free";
    cache.set(email, { plan, at: now });
    return plan;
  } catch (e) {
    console.error("[entitlement] lookup failed:", e?.message);
    if (hit && now - hit.at < STALE_OK_MS) return hit.plan;
    return "speak";
  }
}

/** Test hook. */
export function _clearCache() { cache.clear(); }
