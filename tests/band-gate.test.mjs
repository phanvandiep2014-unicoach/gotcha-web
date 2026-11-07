// Hồi quy chấm band Speaking: nói ít / im lặng không được cao điểm.
// Trích hàm re() thẳng từ bundle mocktest.js (nguồn TS đã mất).
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const src = readFileSync(new URL('../mocktest.js', import.meta.url), 'utf8');
const a = src.indexOf('var We=');
const b = src.indexOf('function se(e,n){');
assert.ok(a > 0 && b > a, 'không tìm thấy re() trong mocktest.js');
const re = new Function(src.slice(a, b).replace(/^var We=/, 'var We=') + '; return re;')();

const mk = (words, o = {}) => ({
  words, wpm: o.wpm ?? 130, fillerCount: o.fillerCount ?? 0, allErrors: o.allErrors ?? [],
  transcript: o.transcript ?? Array.from({ length: words }, (_, i) => 'w' + i).join(' '),
});
const maxBand = r => Math.max(r.fc, r.lr, r.gra, r.overall);

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok -', name); };

t('im lặng hoàn toàn: mọi band = 4.0', () => {
  const r = re(mk(0, { wpm: 0, transcript: '' })); assert.equal(maxBand(r), 4);
});
t('"yes" (1 từ): không quá 4.0', () => assert.ok(maxBand(re(mk(1, { wpm: 20, transcript: 'yes' }))) <= 4));
t('10 từ hoàn hảo, 0 lỗi: không quá 4.0', () => assert.ok(maxBand(re(mk(10))) <= 4));
t('30 từ hoàn hảo: không quá 4.5', () => assert.ok(maxBand(re(mk(30))) <= 4.5));
t('80 từ hoàn hảo: không quá 5.0', () => assert.ok(maxBand(re(mk(80))) <= 5));
t('140 từ hoàn hảo: không quá 5.5', () => assert.ok(maxBand(re(mk(140))) <= 5.5));
t('240 từ hoàn hảo: không quá 6.0', () => assert.ok(maxBand(re(mk(240))) <= 6));
t('bài dài, sạch lỗi vẫn đạt band cao (>=6.5)', () => {
  const words = Array.from({ length: 500 }, (_, i) => 'word' + (i % 330)).join(' ');
  assert.ok(re(mk(500, { transcript: words })).overall >= 6.5);
});
t('thin = true khi < 250 từ', () => { assert.equal(re(mk(100)).thin, true); assert.equal(re(mk(400)).thin, false); });
console.log(`\n${n} test đạt`);

// ---- Fluency từ âm thanh (VAD) ----
const p1 = src.indexOf('function prAnalyze(');
const p2 = src.indexOf('var PrVAD=');
assert.ok(p1 > 0 && p2 > p1, 'không tìm thấy prAnalyze trong mocktest.js');
const { prAnalyze, prAgg } = new Function(src.slice(p1, p2) + '; return {prAnalyze,prAgg};')();
const ST = 0.085, fr = (sec, v) => Array(Math.round(sec / ST)).fill(v);
const noise = 0.003, voice = 0.1;

t('VAD: im lặng hoàn toàn -> không có tiếng nói', () => {
  const a = prAnalyze(fr(30, noise), ST); assert.equal(a.voiced, false); assert.equal(a.ratio, 0);
});
t('VAD: nói liền mạch -> ratio cao, không ngắt', () => {
  const a = prAnalyze([...fr(1, noise), ...fr(40, voice)], ST);
  assert.ok(a.ratio > 0.9 && a.pauses === 0 && a.long === 0, JSON.stringify(a));
});
t('VAD: nói 5s, lặng 3s, nói 5s -> 1 ngắt, ngắt 3s tính là dài', () => {
  const a = prAnalyze([...fr(5, voice), ...fr(3, noise), ...fr(5, voice)], ST);
  assert.equal(a.pauses, 1); assert.equal(a.long, 1); assert.ok(a.longest >= 2.9);
});
t('VAD: khoảng lặng giữa từ < 0.5s không bị tính là ngắt', () => {
  const x = []; for (let i = 0; i < 20; i++) x.push(...fr(1, voice), ...fr(0.3, noise));
  assert.equal(prAnalyze(x, ST).pauses, 0);
});
t('VAD: mở đầu lặng 20s rồi nói 5s -> ratio thấp', () => {
  const a = prAnalyze([...fr(20, noise), ...fr(5, voice)], ST); assert.ok(a.ratio < 0.3, a.ratio);
});
t('re(): ngắt nghỉ nhiều làm giảm Fluency so với bài không ngắt', () => {
  const words = Array.from({ length: 500 }, (_, i) => 'word' + (i % 330)).join(' ');
  const base = mk(500, { transcript: words });
  const good = prAgg([prAnalyze([...fr(1, noise), ...fr(60, voice)], ST)]);
  const bad = prAgg([prAnalyze([...fr(10, noise), ...fr(4, voice), ...fr(5, noise), ...fr(4, voice), ...fr(6, noise), ...fr(4, voice)], ST)]);
  const fGood = re({ ...base, audio: good }).fc, fBad = re({ ...base, audio: bad }).fc;
  assert.ok(fBad < fGood, `fc bad ${fBad} phải < good ${fGood}`);
  assert.equal(re(base).fc, re({ ...base, audio: null }).fc);
});
console.log(`\n${n} test đạt (tổng)`);
