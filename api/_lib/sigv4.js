// AWS Signature Version 4 — the minimum needed to talk to an S3-compatible bucket
// (Cloudflare R2, Backblaze B2, MinIO, or S3 itself) with plain fetch.
//
// Why not the AWS SDK: @aws-sdk/client-s3 pulls in megabytes for two operations. On a
// serverless function that is cold-start time on every upload, paid for in the learner's
// waiting. The signing algorithm is about eighty lines; this is those eighty lines.
//
// Pure functions, no network, no environment — so the awkward parts (canonical request,
// credential scope, encoding rules) are testable without a bucket.
import crypto from "crypto";

const sha256hex = (data) => crypto.createHash("sha256").update(data).digest("hex");
const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();

/** RFC 3986 encoding. S3 wants every reserved character escaped — encodeURIComponent
 *  leaves ! ' ( ) * alone, and a key containing one would sign wrong and 403. */
export function uriEncode(str, encodeSlash = true) {
  let out = "";
  for (const ch of Buffer.from(String(str), "utf8")) {
    const c = String.fromCharCode(ch);
    if (/[A-Za-z0-9\-._~]/.test(c)) out += c;
    else if (c === "/") out += encodeSlash ? "%2F" : "/";
    else out += "%" + ch.toString(16).toUpperCase().padStart(2, "0");
  }
  return out;
}

/** 20260902T101530Z / 20260902 */
export function amzDate(now = new Date()) {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amz: iso.slice(0, 15) + "Z", date: iso.slice(0, 8) };
}

export function credentialScope(date, region, service) {
  return `${date}/${region}/${service}/aws4_request`;
}

function signingKey(secret, date, region, service) {
  return hmac(hmac(hmac(hmac("AWS4" + secret, date), region), service), "aws4_request");
}

/**
 * Canonical request, per the AWS spec. Header names lower-cased and sorted; values
 * trimmed; the signed-header list must match exactly what is sent.
 */
export function canonicalRequest({ method, path, query = "", headers, payloadHash }) {
  const names = Object.keys(headers).map(h => h.toLowerCase()).sort();
  const canonHeaders = names.map(n => {
    const key = Object.keys(headers).find(k => k.toLowerCase() === n);
    return `${n}:${String(headers[key]).trim().replace(/\s+/g, " ")}\n`;
  }).join("");
  const signed = names.join(";");
  return {
    signed,
    canonical: [method, path, query, canonHeaders, signed, payloadHash].join("\n"),
  };
}

/** Signs a request and returns the headers to send. */
export function signRequest({
  method, host, path, query = "", body = "", region, service = "s3",
  accessKeyId, secretAccessKey, now = new Date(), extraHeaders = {},
}) {
  const { amz, date } = amzDate(now);
  const payloadHash = sha256hex(body);
  const headers = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amz,
    ...extraHeaders,
  };
  const { signed, canonical } = canonicalRequest({ method, path, query, headers, payloadHash });
  const scope = credentialScope(date, region, service);
  const stringToSign = ["AWS4-HMAC-SHA256", amz, scope, sha256hex(canonical)].join("\n");
  const signature = hmac(signingKey(secretAccessKey, date, region, service), stringToSign).toString("hex");
  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signed}, Signature=${signature}`,
  };
}

/**
 * Presigned GET URL — lets the browser fetch a private object directly, so audio never
 * has to be proxied through a serverless function (which would be slow, and would count
 * against its response-size limits).
 */
export function presignGet({
  host, path, region, service = "s3", accessKeyId, secretAccessKey,
  expiresSeconds = 600, now = new Date(), protocol = "https",
}) {
  const { amz, date } = amzDate(now);
  const scope = credentialScope(date, region, service);
  const params = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKeyId}/${scope}`,
    "X-Amz-Date": amz,
    "X-Amz-Expires": String(Math.min(604800, Math.max(1, Math.floor(expiresSeconds)))),
    "X-Amz-SignedHeaders": "host",
  };
  const query = Object.keys(params).sort()
    .map(k => `${uriEncode(k)}=${uriEncode(params[k])}`).join("&");
  const { canonical } = canonicalRequest({
    method: "GET", path, query, headers: { host }, payloadHash: "UNSIGNED-PAYLOAD",
  });
  const stringToSign = ["AWS4-HMAC-SHA256", amz, scope, sha256hex(canonical)].join("\n");
  const signature = hmac(signingKey(secretAccessKey, date, region, service), stringToSign).toString("hex");
  return `${protocol}://${host}${path}?${query}&X-Amz-Signature=${signature}`;
}
