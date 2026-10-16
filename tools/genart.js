// ima2 서버(192.168.1.100:3333)로 소설 삽화 생성 → web/img/ 저장
// 사용: node tools/genart.js           — 전부 생성
//       node tools/genart.js ch02 ch07 — 지정 키만 생성
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'web', 'img');
const BASE = process.env.IMA2_BASE || 'http://192.168.1.100:3333';
const MODEL = 'gpt-6-luna';

const STYLE = 'Korean web novel illustration, soft painterly digital art, muted indigo night palette with warm amber accents, cinematic rim lighting, gentle film grain, no text, no letters, no words, no logos, no watermark';

// file: web/img/<file>, size: ima2 size preset, prompt: 장면 설명
const ART = [
  { file: 'cover.png', size: '1024x1536',
    refs: ['web/img/jihyeok.jpg'],
    prompt:
    `Korean webnovel book cover art, NO TEXT anywhere: the same young man from the reference — wavy dark hair, gentle monolid eyes, dark hoodie — seen from behind at three-quarter angle, sitting at a desk in a dark room at dawn, a large glowing translucent blue holographic status window floating in the air between him and the monitor, faint data glyphs, cat sleeping on the desk edge, coffee can, window curtain with thin dawn light, dramatic upward composition leaving the top third darker for title space. ${STYLE}` },
  { file: 'jihyeok.png', size: '1024x1536',
    refs: ['주인공얼굴사진/KakaoTalk_20261017_040912541_03.jpg', '주인공얼굴사진/KakaoTalk_20261017_040912541_01.jpg'],
    prompt:
    `Half-body illustrated character portrait inspired by the young Korean man in the reference photos — keep his recognizable features: wavy dark hair falling over the forehead, gentle deep monolid eyes, soft face shape, pale skin — but drawn as a handsome Korean webnovel protagonist: slightly sharper jawline, clean skin, subtle quiet charisma. Early twenties university student, plain dark hoodie, seated at a desk turned toward the viewer, soft blue monitor glow lighting one side of his face, calm observant expression, plain deep indigo background. ${STYLE}` },
  { file: 'ch01_laptop.png', size: '1536x1024', prompt:
    `Night bedroom desk: a middle-school boy's hand gently resting on the lid of an old thick scuffed silver laptop that his father just handed down, warm desk lamp glow, stacked textbooks, cozy dim room, seen slightly from above, nostalgic mood. ${STYLE}` },
  { file: 'ch02_window.png', size: '1536x1024', prompt:
    `Dark bedroom at 3am, a young man seen from behind at a computer desk, an impossible translucent holographic blue window panel floating in midair between his eyes and the monitor, glowing abstract bars and unreadable glyphs like a game status screen, cold blue light on his silhouette, sense of wonder. ${STYLE}` },
  { file: 'ch03_monitors.png', size: '1536x1024', prompt:
    `Small studio apartment desk at night, dual monitors showing an app architecture diagram of connected abstract boxes and arrows, colorful sticky notes on the wall, an instant noodle cup, warm lamp mixed with cool screen light, a quiet planning night for a student team project. ${STYLE}` },
  { file: 'ch04_merge.png', size: '1536x1024', prompt:
    `Close view of a monitor at dawn showing a three-way code merge, three columns of colored abstract code lines folding into one column, coffee cans on the desk, cold blue screen light with a thin strip of sunrise through the curtains, exhausted but persistent mood. ${STYLE}` },
  { file: 'ch05_backup.png', size: '1536x1024', prompt:
    `An external hard drive with a glowing cable on a dark desk, monitor showing a messy overflowing folder tree of old project folders and database dumps, sense of years of digital memories pouring out of a box, dusty nostalgic mood, screen glow. ${STYLE}` },
  { file: 'ch06_packets.png', size: '1536x1024', prompt:
    `A monitor filled with rows of hexadecimal numbers like a magazine spread, an open handwritten notebook beside the keyboard with arrows and boxed byte diagrams, a highlighter pen resting on the page, late-night reverse-engineering study, concentrated quiet mood. ${STYLE}` },
  { file: 'ch07_egg.png', size: '1536x1024', prompt:
    `Inside a glowing monitor screen, a small cute pixel-art style egg with tiny feet resting on a soft knitted blanket, abstract chat bubbles floating around it like fireflies, adorable virtual pet about to hatch, warm cozy glow, heartwarming mood. ${STYLE}` },
  { file: 'ch08_breach.png', size: '1536x1024', prompt:
    `A dark room where a monitor displays a stranger's private account page as abstract UI blocks, the silhouette of a young man frozen with one finger hovering over the Enter key, cold blue glow, tense quiet thriller atmosphere. ${STYLE}` },
  { file: 'ch09_proxy.png', size: '1536x1024', prompt:
    `Abstract visualization of computer network traffic: many glowing data streams flowing through a fine mesh net while one stream slips past completely untouched, dark terminal windows with abstract graphs, deep blue technical mood, a lone observer silhouette. ${STYLE}` },
  { file: 'ch10_classroom.png', size: '1536x1024', prompt:
    `Morning light filling a small Korean lecture room, rows of desks, a young man in a dark hoodie taking a seat by the window, a small paper name tag on his desk, chairs gradually filling with students, hopeful new-beginning mood. ${STYLE}` },
  { file: 'ch11_yn.png', size: '1536x1024', prompt:
    `Extreme close-up in total darkness: a single blinking cursor beside two glowing letter keys Y and N floating in the air, a finger hovering hesitantly over the keyboard, heavy silence, the weight of a life choice, minimal composition. ${STYLE}` },
  { file: 'ch12_witness.png', size: '1536x1024', prompt:
    `A night sky over a sleeping city where the stars are actually small glowing chat message bubbles and log lines, thin threads of light connecting them into a constellation above one boy's lit window, warm emotional finale mood. ${STYLE}` },
];

async function api(p, opts) {
  const r = await fetch(BASE + p, opts);
  if (!r.ok) throw new Error(`${opts?.method || 'GET'} ${p} → ${r.status} ${await r.text().catch(() => '')}`);
  return r;
}
async function history() {
  const j = await (await api('/api/history')).json();
  return j.items || [];
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function gen(spec) {
  const before = new Set((await history()).map(i => i.filename));
  const requestId = 'novel_' + spec.file.replace(/\W/g, '_') + '_' + Date.now();
  await api('/api/generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: spec.prompt, provider: 'oauth', model: MODEL,
      size: spec.size, quality: 'high', reasoningEffort: 'high',
      ...(spec.refs ? { references: spec.refs.map(f => fs.readFileSync(path.join(ROOT, f)).toString('base64')) } : {}),
      async: true, requestId,
    }),
  });
  process.stdout.write(`  요청 접수 (${requestId}) — 생성 대기`);
  const deadline = Date.now() + 6 * 60 * 1000;
  let item = null;
  while (Date.now() < deadline) {
    await sleep(4000); process.stdout.write('.');
    const items = await history();
    item = items.find(i => !before.has(i.filename));
    if (item) break;
  }
  process.stdout.write('\n');
  if (!item) throw new Error('생성 타임아웃 (6분)');
  const buf = Buffer.from(await (await api(item.url || ('/generated/' + item.filename))).arrayBuffer());
  fs.writeFileSync(path.join(OUT, spec.file), buf);
  console.log(`  저장: web/img/${spec.file} (${(buf.length / 1024).toFixed(0)}KB, ${item.filename})`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.argv.slice(2);
  const todo = only.length ? ART.filter(a => only.some(k => a.file.includes(k))) : ART;
  console.log(`삽화 ${todo.length}장 생성 시작 → ${OUT}`);
  let ok = 0;
  for (const spec of todo) {
    console.log(`[${spec.file}]`);
    try { await gen(spec); ok++; }
    catch (e) { console.log(`  실패: ${e.message}`); }
  }
  console.log(`완료: ${ok}/${todo.length}`);
})();
