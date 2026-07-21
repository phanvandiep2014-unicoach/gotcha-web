// POST /api/pronounce  { audio: <base64 16k mono WAV>, refText: "<sentence>" }
// → real pronunciation scores via Azure Pronunciation Assessment. Falls back to a
//   deterministic MOCK when AZURE_SPEECH_KEY is not set, so the feature works in dev
//   and degrades gracefully. The vendor key never leaves the server.
import crypto from "crypto";

// Map a 0–100 pronunciation score to an approximate IELTS-style band (transparent, coarse).
function toBand(pron) {
  if (pron >= 92) return 8.0; if (pron >= 85) return 7.5; if (pron >= 78) return 7.0;
  if (pron >= 70) return 6.5; if (pron >= 62) return 6.0; if (pron >= 54) return 5.5;
  if (pron >= 46) return 5.0; return 4.5;
}

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
  const refText = (req.body && req.body.refText) || "";
  const audioB64 = (req.body && req.body.audio) || "";
  if (!audioB64) return res.status(400).json({ error: "missing_audio" });

  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) return res.status(200).json(mockResult(refText));

  try {
    const audio = Buffer.from(audioB64, "base64");
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
    const json = await r.json();
    if (json.RecognitionStatus && json.RecognitionStatus !== "Success")
      return res.status(200).json({ ok: false, reason: json.RecognitionStatus, hint: "Nói to, rõ và thử lại." });
    return res.status(200).json(normalizeAzure(json));
  } catch (e) {
    return res.status(200).json({ ...mockResult(refText), mock: true, vendorError: "exception" });
  }
}

export const config = { api: { bodyParser: { sizeLimit: "6mb" } } };
