// Bổ sung bộ đề vào các bundle đã minify (mã TS gốc đã mất nên vá thẳng bundle).
// Chạy lại nhiều lần vẫn an toàn: bỏ qua nếu p1-21 đã có. Dữ liệu nằm ở scripts/prompts-extra.json.
// Dùng: node scripts/add-prompts.mjs            (ghi vào app.js, mocktest.js, gigi.js, profile.js)
//       node scripts/add-prompts.mjs --dry      (chỉ in thống kê)
import fs from 'node:fs';
const dry = process.argv.includes('--dry');
const data = JSON.parse(fs.readFileSync(new URL('./prompts-extra.json', import.meta.url), 'utf8'));
const BASE = { skills:'5.5-6.5',travel:'5.5-6.5',people:'5.5-6.5',media:'5.5-6.5',decisions:'6.5+',technology:'5.5-6.5',celebrations:'4.0-5.5',places:'4.0-5.5',memories:'5.5-6.5',goals:'6.5+',gifts:'4.0-5.5',food:'4.0-5.5',apps:'5.5-6.5',weather:'5.5-6.5',teachers:'5.5-6.5',history:'6.5+',advice:'6.5+',photos:'4.0-5.5','daily-life':'4.0-5.5',possessions:'5.5-6.5',traditions:'6.5+',nature:'5.5-6.5',music:'4.0-5.5',promises:'6.5+',changes:'6.5+' };
const LADDER = { '4.0-5.5':['4.0-5.5','5.5-6.5','6.5+'], '5.5-6.5':['5.5-6.5','5.5-6.5','6.5+'], '6.5+':['5.5-6.5','6.5+','6.5+'] };
const esc = (s) => JSON.stringify(s).replace(/[\u0080-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'));
const escJ = (v) => JSON.stringify(v).replace(/[\u0080-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'));
const pad = (n) => String(n).padStart(2, '0');

const items = []; let p1 = 21, p2 = 26, p3 = 21;
for (const [topic, diff, text, fu] of data.part1) items.push({ id: `p1-${pad(p1++)}`, type: 'part1', topic, diff, text, fu });
for (const [topic, diff, text, qs] of data.cards) {
  items.push({ id: `p2-${pad(p2++)}`, type: 'cue_card', topic, diff, text });
  BASE[topic] = diff;
}
for (const [topic, qs] of Object.entries(data.part3)) qs.forEach((q, i) => items.push({ id: `p3-${pad(p3++)}`, type: 'part3', topic, diff: LADDER[BASE[topic]][i], text: q }));
for (const [topic, , , qs] of data.cards) qs.forEach((q, i) => items.push({ id: `p3-${pad(p3++)}`, type: 'part3', topic, diff: LADDER[BASE[topic]][i], text: q }));

const ids = new Set(items.map((x) => x.id)); if (ids.size !== items.length) throw new Error('trùng id');
const count = (t) => items.filter((x) => x.type === t).length;
console.log(`Bổ sung: part1 ${count('part1')}, cue_card ${count('cue_card')}, part3 ${count('part3')} (tổng ${items.length})`);
if (dry) process.exit(0);

for (const f of ['app.js', 'mocktest.js', 'gigi.js', 'profile.js']) {
  let s = fs.readFileSync(f, 'utf8');
  if (s.includes('"p1-21"')) { console.log(f, 'đã có, bỏ qua'); continue; }
  const m = s.match(/(\w+)\("p1-01","test_prep","part1"/); if (!m) throw new Error(f + ': không thấy hàm tạo đề');
  const h = m[1], anchor = `,${h}("sc-01","conversational"`;
  if (s.split(anchor).length !== 2) throw new Error(f + ': mốc chèn không duy nhất');
  const code = items.map((x) => `${h}(${esc(x.id)},"test_prep",${esc(x.type)},${esc(x.topic)},${esc(x.diff)},${esc(x.text)}${x.fu ? `,{followups:${esc(x.fu).replace(/^"|"$/g, '') && JSON.stringify(x.fu).replace(/[\u0080-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'))}}` : ''})`).join(',');
  fs.writeFileSync(f, s.replace(anchor, ',' + code + anchor));
  console.log(f, 'đã chèn', items.length, 'đề (hàm', h + ')');
}
