// /api/recordings — the learner's own kept recordings.
//
//   POST   { audio: <base64 WAV>, promptId, promptText, durationSec, transcript, wpm, pronScore }
//   GET                                    → this account's recordings, newest first
//   DELETE ?id=<id>                        → removes the row AND the object
//
// Keeping a clip is opt-in: nothing reaches this endpoint unless the learner pressed
// "giữ lại bản ghi". Signed-in only — an anonymous visitor has no account to keep them
// under, and we are not going to invent one to hold someone's voice.
import crypto from "crypto";
import { getSession } from "./_lib/session.js";
import { addRecording, listRecordings, getRecording, removeRecording } from "./_lib/db.js";
import {
  putRecording, deleteRecording, playbackUrl, recordingKey,
  storageEnabled, MAX_BYTES, RETENTION_DAYS,
} from "./_lib/storage.js";

const sameOrigin = (req) => {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  const src = req.headers.origin || req.headers.referer || "";
  if (!src) return true;
  try { return new URL(src).host === host; } catch { return false; }
};

export default async function handler(req, res) {
  if (!sameOrigin(req)) return res.status(403).json({ error: "cross_origin" });

  const session = getSession(req);
  if (!session?.sub) {
    return res.status(401).json({
      error: "sign_in_required",
      message: "Đăng nhập để lưu lại bản ghi và nghe lại sau này.",
    });
  }

  if (req.method === "GET") {
    const rows = await listRecordings(session.sub);
    // Presign at read time, not at save time: a URL stored in the database would either
    // expire in the row or, if made long-lived, become a permanent public link.
    return res.status(200).json({
      storage: storageEnabled(),
      retentionDays: RETENTION_DAYS,
      recordings: rows.map(r => ({
        id: r.id,
        promptText: r.prompt_text ?? r.promptText ?? null,
        durationSec: r.duration_sec ?? r.durationSec ?? null,
        transcript: r.transcript ?? null,
        wpm: r.wpm ?? null,
        pronScore: r.pron_score ?? r.pronScore ?? null,
        createdAt: r.created_at ?? r.createdAt ?? null,
        url: playbackUrl(r.object_key ?? r.objectKey),
      })),
    });
  }

  if (req.method === "DELETE") {
    const id = req.query?.id || "";
    if (!id) return res.status(400).json({ error: "missing_id" });
    const row = await getRecording(id);
    // Not found and not-yours give the same answer on purpose: otherwise this endpoint
    // tells a stranger which recording ids exist.
    if (!row || row.sub !== session.sub) return res.status(404).json({ error: "not_found" });
    await deleteRecording(row.object_key ?? row.objectKey);
    await removeRecording(id);
    return res.status(200).json({ deleted: true });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  if (!storageEnabled()) {
    return res.status(503).json({
      error: "storage_disabled",
      message: "Chưa bật lưu bản ghi trên máy chủ. Bài luyện của bạn vẫn được chấm bình thường.",
    });
  }

  const b = req.body || {};
  if (!b.audio) return res.status(400).json({ error: "missing_audio" });

  let audio;
  try { audio = Buffer.from(b.audio, "base64"); }
  catch { return res.status(400).json({ error: "bad_audio" }); }
  if (!audio.length) return res.status(400).json({ error: "empty_audio" });
  if (audio.length > MAX_BYTES) {
    return res.status(413).json({
      error: "too_large", maxBytes: MAX_BYTES,
      message: "Bản ghi dài quá mức lưu được. Thử chia nhỏ câu trả lời.",
    });
  }

  const id = crypto.randomUUID();
  const key = recordingKey(session.sub, id);
  const up = await putRecording(key, audio);
  if (!up.ok) {
    return res.status(502).json({
      error: "upload_failed", detail: up.detail,
      message: "Chưa lưu được bản ghi. Bài luyện của bạn vẫn được chấm bình thường.",
    });
  }

  await addRecording({
    id, sub: session.sub, objectKey: key,
    promptId: b.promptId, promptText: String(b.promptText || "").slice(0, 500),
    durationSec: Math.round(Number(b.durationSec) || 0),
    transcript: String(b.transcript || "").slice(0, 8000),
    wpm: Math.round(Number(b.wpm) || 0) || null,
    pronScore: Math.round(Number(b.pronScore) || 0) || null,
  });

  return res.status(200).json({ id, retentionDays: RETENTION_DAYS, url: playbackUrl(key) });
}

export const config = { api: { bodyParser: { sizeLimit: "12mb" } } };
