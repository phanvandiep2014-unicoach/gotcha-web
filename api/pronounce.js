// POST /api/pronounce  { audio: <base64 16k mono WAV>, refText: "<sentence>" }
// → real pronunciation scores via Azure Pronunciation Assessment. Falls back to a
//   deterministic MOCK when AZURE_SPEECH_KEY is not set, so the feature works in dev
//   and degrades gracefully. The vendor key never leaves the server.
//
// This endpoint SPENDS MONEY (~11đ per second of audio). It is therefore gated:
//   1. same-origin only — no one else may embed our vendor account;
//   2. clip length capped — one runaway upload cannot cost a fortune;
//   3. speaking-minute quota — per account, or a small daily allowance per IP for the
//      no-signup sandbox, plus a global daily ceiling so a bot cannot run up a bill.
// The mock path skips the quota: it costs nothing, and dev should stay frictionless.
import crypto from "crypto";
import { getSession } from "./_lib/session.js";
import { checkQuota, recordUsage } from "./_lib/quota.js";
import { wavSeconds, sameOrigin, MAX_CLIP_SECONDS } from "./_lib/quota-rules.js";

// Map a 0–100 pronunciation score to an approximate IELTS-style band (transparent, coarse).
function toBand(pron) {
  if (pron >= 92) return 8.0; if (pron >= 85) return 7.5; if (pron >= 78) return 7.0;
  if (pron >= 70) return 6.5; if (pron >= 62) return 6.0; if (pron >= 54) return 5.5;
  if (pron >= 46) return 5.0; return 4.5;
}

const originOf = (req) => ({
  host: req.headers["x-forwarded-host"] || req.headers.host || "",
  source: req.headers.origin || req.headers.referer || "",
});

function mockResult(refText) {
  const words = (refText || "hello world").split(/\s+/).filter(Boolean).slice(0, 24);
  const h = crypto.createHash("md5").update(refText || "x").digest();
  const base = 66 + (h[0] % 22); // 66..87 deterministic
  const wl = words.map((w, i) => {
    const acc = Math.max(35, Math.min(99, base + ((h[(i + 1) % 16] % 30) - 15)));
    const error = acc < 55 ? "Mispronunciation" : "None";
    return { w, accuracy: acc, error };
  });
  const weak = [{ p: "θ (th)", accuracy: Math.max(30, base - 25) }, { p: "r", accuracy: Math.max(30, base - 18) }];
  return {
    ok: true, mock: true, pron: base, accuracy: base, fluency: Math.min(99, base + 6),
    completeness: 100, prosody: Math.min(99, base + 3), band: toBand(base), words: wl, weakPhonemes: weak,
  };
}

function normalizeAzure(json) {
  const nb = (json.NBest && json.NBest[0]) || {};
  const pa = nb.PronunciationAssessment || {};
  const words = (nb.Words || []).map((w) => ({
    w: w.Word,
    accuracy: Math.round(w.PronunciationAssessment?.AccuracyScore ?? 0),
    error: w.PronunciationAssessment?.ErrorType || "None",
  }));
  // collect lowest-scoring phonemes across words
  const phon = [];
  (nb.Words || []).forEach((w) => (w.Phonemes || []).forEach((p) =>
    phon.push({ p: p.Phoneme, accuracy: Math.round(p.PronunciationAssessment?.AccuracyScore ?? 0) })));
  phon.sort((a, b) => a.accuracy - b.accuracy);
  const seen = new Set(); const weak = [];
  for (const x of phon) { if (!seen.has(x.p)) { seen.add(x.p); weak.push(x); } if (weak.length >= 4) break; }
  const pron = Math.round(pa.PronScore ?? pa.AccuracyScore ?? 0);
  return {
    ok: true, mock: false,
    pron, accuracy: Math.round(pa.AccuracyScore ?? 0), fluency: Math.round(pa.FluencyScore ?? 0),
    completeness: Math.round(pa.CompletenessScore ?? 0), prosody: Math.round(pa.ProsodyScore ?? 0),
    band: toBand(pron), words, weakPhonemes: weak,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  if (!sameOrigin(originOf(req))) return res.status(403).json({ error: "cross_origin" });

  const refText = (req.body && req.body.refText) || "";
  const audioB64 = (req.body && req.body.audio) || "";
  if (!audioB64) return res.status(400).json({ error: "missing_audio" });

  let audio;
  try { audio = Buffer.from(audioB64, "base64"); }
  catch { return res.status(400).json({ error: "bad_audio" }); }

  const seconds = wavSeconds(audio);
  if (seconds > MAX_CLIP_SECONDS) {
    return res.status(413).json({
      error: "clip_too_long", maxSeconds: MAX_CLIP_SECONDS,
      message: `Đoạn ghi âm dài ${Math.round(seconds)} giây, vượt mức ${MAX_CLIP_SECONDS} giây cho một lần chấm.`,
    });
  }

  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  // No vendor configured → nothing is spent, so no quota is consumed either.
  if (!key || !region) return res.status(200).json(mockResult(refText));

  const session = getSession(req);
  const verdict = await checkQuota(req, session, seconds);
  if (!verdict.ok) {
    return res.status(429).json({
      error: verdict.reason, message: verdict.message,
      remainingSeconds: verdict.remaining ?? 0,
      signedIn: !!session?.sub,
    });
  }

  try {
    const cfg = Buffer.from(JSON.stringify({
      ReferenceText: refText || "",
      GradingSystem: "HundredMark",
      Granularity: "Phoneme",
      Dimension: "Comprehensive",
      EnableProsodyAssessment: true,
    })).toString("base64");
    const url = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US`;
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
        "Pronunciation-Assessment": cfg,
        "Accept": "application/json",
      },
      body: audio,
    });
    if (!r.ok) return res.status(200).json({ ...mockResult(refText), mock: true, vendorError: r.status });

    // The vendor accepted the audio, so it is billable whatever the recognition result.
    await recordUsage(req, session, seconds);

    const json = await r.json();
    if (json.RecognitionStatus && json.RecognitionStatus !== "Success")
      return res.status(200).json({ ok: false, reason: json.RecognitionStatus, hint: "Nói to, rõ và thử lại." });
    return res.status(200).json({
      ...normalizeAzure(json),
      remainingSeconds: Math.max(0, Math.round((verdict.remaining ?? 0))),
    });
  } catch (e) {
    return res.status(200).json({ ...mockResult(refText), mock: true, vendorError: "exception" });
  }
}

export const config = { api: { bodyParser: { sizeLimit: "6mb" } } };
