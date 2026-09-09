// Speaking-minute rules — pure functions, no database, no request objects.
//
// Split out from quota.js on purpose: these are the decisions that cost money, so they
// must be testable without a Postgres connection. quota.js does the I/O and calls in here.

/** Cost per second of audio sent to the vendor, in VND. Telemetry only. */
export const VND_PER_SECOND = 11;

export const PLANS = {
  // "once" = a one-off allowance that never resets. A monthly free allowance creates a
  // permanent tier that costs real money every month; a one-off one turns the same spend
  // into customer-acquisition cost. See §1.1 of the pricing document.
  free: { label: "Thử", seconds: 15 * 60, window: "once" },
  speak: { label: "Speak", seconds: 60 * 60, window: "month" },
  speak_plus: { label: "Speak+", seconds: 120 * 60, window: "month" },
  // Class seats get a deliberately smaller allowance than retail: at 20 minutes each a
  // busy class turns the plan loss-making. See §3.3 of the pricing document.
  classroom: { label: "Lớp", seconds: 12 * 60, window: "month" },
};

/** Longest single clip we will pay to score. The Part 2 long turn is 2 minutes. */
export const MAX_CLIP_SECONDS = Number(process.env.PRECISELY_MAX_CLIP_SECONDS || 130);
/** Anonymous try-it-now allowance, per visitor per day. One 60-second answer. */
export const SANDBOX_SECONDS = Number(process.env.PRECISELY_SANDBOX_SECONDS || 60);
/** Ceiling on what all anonymous visitors together may spend in one day. */
export const SANDBOX_DAILY_CAP = Number(process.env.PRECISELY_SANDBOX_DAILY_CAP_SECONDS || 3600);

const pad = (n) => String(n).padStart(2, "0");

/** Bucket a moment in time belongs to. UTC so a device clock cannot shift a month. */
export function periodKey(window, now = new Date()) {
  if (window === "once") return "trial";
  if (window === "day") return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}`;
}

/** Unknown or missing plan means the free trial — never an unlimited one. */
export function planFor(session) {
  const p = session?.plan;
  return Object.prototype.hasOwnProperty.call(PLANS, p) ? p : "free";
}

/** Seconds of audio in a PCM WAV. Reads the header when sane, else assumes our own
 *  recorder's format (16 kHz mono 16-bit = 32000 bytes/second). */
export function wavSeconds(buf) {
  const DEFAULT_BYTE_RATE = 32000;
  let byteRate = DEFAULT_BYTE_RATE;
  if (buf.length > 44 && buf.toString("ascii", 0, 4) === "RIFF") {
    const r = buf.readUInt32LE(28);
    if (r >= 8000 && r <= 1536000) byteRate = r;   // ignore absurd headers
  }
  return Math.max(0, (buf.length - 44) / byteRate);
}

/** A POST from another site must not spend our vendor budget. */
export function sameOrigin({ host, source }) {
  if (!source) return true;              // same-origin fetch may omit Origin and Referer
  try { return new URL(source).host === host; } catch { return false; }
}

/**
 * The decision, given only numbers. Returns { ok } or { ok:false, reason, remaining }.
 *
 * `scope` is "sandbox" for anonymous visitors and "account" for signed-in learners.
 */
export function decide({ scope, plan, seconds, used, sandboxUsedToday, sandboxUsedAll }) {
  if (!(seconds > 0)) return { ok: false, reason: "empty_audio", remaining: 0 };
  if (seconds > MAX_CLIP_SECONDS) return { ok: false, reason: "clip_too_long", remaining: 0 };

  if (scope === "sandbox") {
    if (sandboxUsedAll + seconds > SANDBOX_DAILY_CAP) {
      return { ok: false, reason: "sandbox_daily_cap", remaining: 0 };
    }
    if (sandboxUsedToday + seconds > SANDBOX_SECONDS) {
      return { ok: false, reason: "sandbox_used", remaining: Math.max(0, SANDBOX_SECONDS - sandboxUsedToday) };
    }
    return { ok: true, scope: "sandbox", remaining: SANDBOX_SECONDS - sandboxUsedToday - seconds };
  }

  const limit = PLANS[planFor({ plan })].seconds;
  if (used + seconds > limit) {
    return { ok: false, reason: "quota_exhausted", remaining: Math.max(0, limit - used) };
  }
  return { ok: true, scope: "account", remaining: limit - used - seconds };
}
