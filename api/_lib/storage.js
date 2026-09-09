// Recording storage on an S3-compatible bucket (Cloudflare R2 by default).
//
// Learners keep their own recordings so they can hear themselves 30 days later — that
// comparison is the single most convincing thing the product can show them, and it is
// also the raw material for calibrating the band estimate.
//
// Rules this file enforces, because they are promises made on the home page:
//   • storing is OPT-IN per clip; nothing arrives here unless the learner said yes;
//   • the object key contains no email and no name, only a one-way hash of the account;
//   • playback goes through a short-lived presigned URL, never a public bucket;
//   • deletion is real deletion, so "xoá bản ghi bất cứ lúc nào" is true.
//
// Degrades to disabled when the bucket is not configured: the app keeps working, the
// save button simply reports that storage is off rather than failing mysteriously.
import crypto from "crypto";
import { signRequest, presignGet, uriEncode } from "./sigv4.js";

const cfg = () => ({
  endpoint: process.env.S3_ENDPOINT || "",        // e.g. https://<acct>.r2.cloudflarestorage.com
  bucket: process.env.S3_BUCKET || "",
  region: process.env.S3_REGION || "auto",        // R2 uses "auto"
  accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
});

export const storageEnabled = () => {
  const c = cfg();
  return !!(c.endpoint && c.bucket && c.accessKeyId && c.secretAccessKey);
};

/** How long a recording lives before it is expected to be swept. Also what we tell the
 *  learner. Enforce it with a bucket lifecycle rule too — code that must run to delete
 *  things eventually stops running. */
export const RETENTION_DAYS = Number(process.env.S3_RETENTION_DAYS || 180);

/** Largest clip we will store. A 3-minute 16 kHz mono WAV is about 5.8 MB. */
export const MAX_BYTES = Number(process.env.S3_MAX_BYTES || 8 * 1024 * 1024);

function parts() {
  const c = cfg();
  const u = new URL(c.endpoint);
  return { ...c, host: u.host, protocol: u.protocol.replace(":", "") };
}

/**
 * Object key for a clip.
 *
 * The account id is hashed, so anyone who gets a bucket listing sees neither an email
 * nor an LMS student code. Date folders keep listings and lifecycle rules manageable.
 */
export function recordingKey(sub, id, now = new Date()) {
  const salt = process.env.SESSION_SECRET || "dev-insecure-secret-change-me";
  const owner = crypto.createHmac("sha256", salt).update(String(sub)).digest("base64url").slice(0, 16);
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `rec/${owner}/${y}/${m}/${id}.wav`;
}

const objectPath = (bucket, key) => `/${bucket}/${uriEncode(key, false)}`;

/** Uploads one WAV. Returns { ok } or { ok:false, status, detail }. Never throws. */
export async function putRecording(key, body) {
  if (!storageEnabled()) return { ok: false, status: 0, detail: "storage_disabled" };
  if (!body || !body.length) return { ok: false, status: 0, detail: "empty_body" };
  if (body.length > MAX_BYTES) return { ok: false, status: 0, detail: "too_large" };
  const p = parts();
  const path = objectPath(p.bucket, key);
  const headers = signRequest({
    method: "PUT", host: p.host, path, body, region: p.region,
    accessKeyId: p.accessKeyId, secretAccessKey: p.secretAccessKey,
    extraHeaders: { "content-type": "audio/wav", "content-length": String(body.length) },
  });
  try {
    const r = await fetch(`${p.protocol}://${p.host}${path}`, { method: "PUT", headers, body });
    if (!r.ok) {
      // The bucket's own error body says far more than the status alone — a wrong region
      // and a wrong key both give 403, and only the body tells them apart.
      const detail = (await r.text().catch(() => "")).slice(0, 300);
      console.error("[storage] PUT failed", r.status, detail);
      return { ok: false, status: r.status, detail };
    }
    return { ok: true };
  } catch (e) {
    console.error("[storage] PUT threw", e?.message);
    return { ok: false, status: 0, detail: String(e?.message || e) };
  }
}

/** Short-lived URL the browser can play directly. Ten minutes is plenty for a page view
 *  and short enough that a copied link is not a lasting leak. */
export function playbackUrl(key, expiresSeconds = 600) {
  if (!storageEnabled()) return null;
  const p = parts();
  return presignGet({
    host: p.host, path: objectPath(p.bucket, key), region: p.region,
    accessKeyId: p.accessKeyId, secretAccessKey: p.secretAccessKey,
    expiresSeconds, protocol: p.protocol,
  });
}

/** Real deletion. Called when a learner removes a recording. Never throws. */
export async function deleteRecording(key) {
  if (!storageEnabled()) return { ok: false, detail: "storage_disabled" };
  const p = parts();
  const path = objectPath(p.bucket, key);
  const headers = signRequest({
    method: "DELETE", host: p.host, path, body: "", region: p.region,
    accessKeyId: p.accessKeyId, secretAccessKey: p.secretAccessKey,
  });
  try {
    const r = await fetch(`${p.protocol}://${p.host}${path}`, { method: "DELETE", headers });
    // S3 answers 204 for a delete, and also for a key that was already gone — which is
    // the result we want either way.
    return { ok: r.status === 204 || r.status === 200, status: r.status };
  } catch (e) {
    console.error("[storage] DELETE threw", e?.message);
    return { ok: false, detail: String(e?.message || e) };
  }
}
