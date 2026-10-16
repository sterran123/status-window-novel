// story/chapters/*.md + story/endings/*.md (+branches) → web용 story.json + manuscript.md
// 사용: node tools/build.js
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const CH_DIR = path.join(ROOT, 'story', 'chapters');
const EN_DIR = path.join(ROOT, 'story', 'endings');
const BR_DIR = path.join(ROOT, 'story', 'branches');

/* ---------- 파서 ---------- */
function parseFile(file) {
  const id = path.basename(file, '.md');
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const blocks = [];
  let header = null, i = 0;
  // 첫 비어있지 않은 줄 = 헤더 "# CH03. 제목" / "# END_TRUE. 제목"
  while (i < lines.length && !lines[i].trim()) i++;
  const m = /^#\s+(.+)$/.exec(lines[i] || '');
  header = m ? m[1].trim() : id;
  i++;
  const chMatch = /^(CH\d+|END_\w+|BR_\w+)/.exec(header.split('.')[0].trim());
  const chId = chMatch ? chMatch[1] : id;

  let para = [];
  const flush = () => {
    const t = para.join('\n').trim();
    if (t) blocks.push({ kind: 'para', text: t });
    para = [];
  };

  for (; i < lines.length; i++) {
    const L = lines[i];
    const t = L.trim();
    if (/^\[SYS\]/i.test(t)) {
      flush(); const buf = [];
      for (i++; i < lines.length && !/^\[\/SYS\]/i.test(lines[i].trim()); i++) buf.push(lines[i]);
      blocks.push({ kind: 'sys', text: buf.join('\n').trim() }); continue;
    }
    if (/^\[STATUS\]/i.test(t)) {
      flush(); const buf = [];
      for (i++; i < lines.length && !/^\[\/STATUS\]/i.test(lines[i].trim()); i++) buf.push(lines[i]);
      blocks.push({ kind: 'status', text: buf.join('\n').trim() }); continue;
    }
    if (/^\[IMG\]/i.test(t)) {
      flush(); const buf = [];
      for (i++; i < lines.length && !/^\[\/IMG\]/i.test(lines[i].trim()); i++) buf.push(lines[i]);
      const seg = buf.join(' ').trim().split('|').map(s => s.trim());
      blocks.push({ kind: 'img', src: seg[0], alt: seg[1] || '' }); continue;
    }
    if (/^:::\s*choice/.test(t)) {
      flush();
      const cid = (/id="([^"]+)"/.exec(t) || [])[1] || ('c' + blocks.length);
      const prompt = [], opts = [];
      for (i++; i < lines.length && !/^:::\s*$/.test(lines[i].trim()); i++) {
        const o = /^-\s+(.+)$/.exec(lines[i].trim());
        if (o) {
          const parts = o[1].split('|').map(s => s.trim());
          opts.push({ label: parts[0], goto: (/goto="([^"]+)"/.exec(parts[1] || '') || [])[1], main: /\bmain\b/.test(o[1]) });
        } else if (lines[i].trim()) prompt.push(lines[i].trim());
      }
      blocks.push({ kind: 'choice', id: cid, prompt: prompt.join('\n'), options: opts }); continue;
    }
    if (/^:::\s*scene/.test(t)) { flush(); blocks.push({ kind: 'scene' }); continue; }
    if (/^:::\s*goto\s+(.+)$/i.test(t)) { flush(); blocks.push({ kind: 'goto', target: (/^:::\s*goto\s+(.+)$/i.exec(t)[1]).trim() }); continue; }
    if (/^:::\s*end/.test(t)) { flush(); blocks.push({ kind: 'endmark' }); continue; }
    if (/^:::/.test(t)) { flush(); continue; } // 알 수 없는 ::: 는 무시
    if (!t) { flush(); continue; }
    const sp = /^>\s*([^:：]{1,12})[:：]\s*(.+)$/.exec(t);
    if (sp) { flush(); blocks.push({ kind: 'speech', who: sp[1].trim(), text: sp[2].trim() }); continue; }
    const ch = /^-\s*([^:：]{1,12})[:：]\s*(.+)$/.exec(t);
    if (ch && !/^-\s+.*\|.*goto/.test(t)) { flush(); blocks.push({ kind: 'chatline', who: ch[1].trim(), text: ch[2].trim() }); continue; }
    if (/^《/.test(t)) { flush(); blocks.push({ kind: 'aria', text: t.replace(/^《|》$/g, '') }); continue; }
    para.push(L);
  }
  flush();
  return { id, header, chId, blocks };
}

/* ---------- 로드 ---------- */
const files = {};
function loadDir(d, tag) {
  if (!fs.existsSync(d)) return;
  for (const f of fs.readdirSync(d).filter(x => x.endsWith('.md'))) {
    const p = parseFile(path.join(d, f));
    files[p.chId] = p; files[p.id] = files[p.id] || p;
  }
}
loadDir(CH_DIR, 'CH'); loadDir(EN_DIR, 'END'); loadDir(BR_DIR, 'BR');

const chapterIds = Object.keys(files).filter(k => /^CH\d+$/.test(k)).sort();
const endingIds = Object.keys(files).filter(k => /^END_/.test(k)).sort();
const branchIds = Object.keys(files).filter(k => /^BR_/.test(k)).sort();
const order = [...chapterIds, ...endingIds, ...branchIds]; // CH12(=end_true 파일)는 chapters 안에

/* ---------- story.json 생성 (웹) ---------- */
const nodes = [];
const firstNodeOf = {};
for (const cid of order) {
  const f = files[cid];
  if (!f) continue;
  let prev = null;
  for (let bi = 0; bi < f.blocks.length; bi++) {
    const b = f.blocks[bi];
    const nid = `${cid.toLowerCase()}_b${bi}`;
    if (!firstNodeOf[cid]) firstNodeOf[cid] = nid;
    if (firstNodeOf[f.id] === undefined && f.id === cid) firstNodeOf[f.id] = nid;
    const base = { id: nid, chapter: f.chId };
    let node = null;
    switch (b.kind) {
      case 'para': node = { ...base, type: 'msg', speaker: '나레이션', text: b.text }; break;
      case 'speech': node = { ...base, type: 'msg', speaker: b.who, text: b.text }; break;
      case 'aria': node = { ...base, type: 'aria', text: b.text }; break;
      case 'sys': node = { ...base, type: 'sys', text: b.text }; break;
      case 'status': node = { ...base, type: 'status', display: b.text }; break;
      case 'chatline': node = { ...base, type: 'chatline', speaker: b.who, text: b.text }; break;
      case 'img': node = { ...base, type: 'img', src: b.src, alt: b.alt }; break;
      case 'scene': node = { ...base, type: 'scene' }; break;
      case 'choice': node = {
        ...base, type: 'choice', prompt: b.prompt,
        options: b.options.map(o => ({ label: o.label, goto: o.goto, main: !!o.main }))
      }; break;
      case 'goto': node = { ...base, type: 'goto', target: b.target }; break;
      case 'endmark': node = { ...base, type: 'endmark' }; break;
    }
    if (node) { if (prev) prev.next = nid; nodes.push(node); prev = node; }
  }
}

// goto/choice target 해석 + 엔딩 처리
const byNode = {}; nodes.forEach(n => byNode[n.id] = n);
const warnings = [];
const END_MAP = { END_TRUE: '트루 엔딩', END_NORMAL: '노멀 엔딩', END_SAD: '새드 엔딩', END_HIDDEN: '히든 엔딩' };
for (const n of nodes) {
  if (n.type === 'choice') {
    for (const o of n.options) {
      const tgt = firstNodeOf[o.goto] || firstNodeOf[(files[o.goto] || {}).id] || null;
      if (tgt) o.gotoNode = tgt;
      else { warnings.push(`choice ${n.id}: goto "${o.goto}" 대상 없음`); o.gotoNode = null; }
    }
  }
  if (n.type === 'goto') {
    const tgt = firstNodeOf[n.target];
    if (tgt) n.next = tgt; else warnings.push(`goto ${n.id}: 대상 "${n.target}" 없음`);
  }
  if (n.type === 'endmark') { const f = files[n.chapter]; n.type = 'end'; n.ending = /^END_/.test(n.chapter) ? n.chapter : 'END_TRUE'; delete n.next; }
}

// 파일명 기반 엔딩 매핑: end_true.md의 chId가 CH12일 수 있음 → END_TRUE로 처리
for (const n of nodes) if (n.type === 'end' && !n.ending) n.ending = 'END_TRUE';
const trueEndFile = Object.values(files).find(f => f.id === 'end_true');
if (trueEndFile) nodes.forEach(n => { if (n.type === 'end' && n.chapter === trueEndFile.chId) n.ending = 'END_TRUE'; });

const chapters = chapterIds.map(c => ({ id: c, title: files[c].header.replace(/^CH\d+\.\s*/, '') }));
const endings = [];
for (const e of endingIds) {
  if (files[e].id === 'end_true') continue; // CH12는 본문 장
  endings.push({ id: e, label: END_MAP[e] || e, desc: files[e].header.replace(/^END_\w+\.\s*/, '') });
}
endings.unshift({ id: 'END_TRUE', label: '트루 엔딩', desc: files.end_true ? files.end_true.header.replace(/^\w+\.\s*/, '') : '' });

const storyJson = {
  title: '상태창이 뜬 날', subtitle: '나를 소재로 한 채팅형 장편소설',
  protagonist: '지혁', start: firstNodeOf[chapterIds[0]],
  chapters, endings, nodes
};

/* ---------- manuscript 생성 ---------- */
function esc(s) { return s; }
function blockText(b) {
  switch (b.kind) {
    case 'para': return b.text;
    case 'speech': return `${b.who}: "${b.text}"`;
    case 'aria': return `《${b.text}》`;
    case 'sys': return b.text;
    case 'status': return b.text;
    case 'chatline': return `-${b.who}: ${b.text}`;
    case 'img': return `[삽화] ${b.alt || b.src}`;
    case 'scene': return `* * *`;
    case 'choice': {
      const m = b.options.find(o => o.main) || b.options[0];
      return `[선택] ${b.prompt}\n→ 고른 길: '${m ? m.label : ''}'`;
    }
    default: return '';
  }
}

// 메인 루트 = chapterIds 순서(CH12 포함). choice는 main 옵션만 표시.
let body = '', curCh = null; const chCounts = {};
for (const cid of chapterIds) {
  const f = files[cid];
  if (f.chId !== curCh) { curCh = f.chId; body += `\n\n### ${f.header}\n\n`; }
  for (const b of f.blocks) {
    const t = blockText(b);
    if (!t) continue;
    body += t + '\n\n';
    chCounts[curCh] = (chCounts[curCh] || 0) + [...t].length;
  }
}
const count = s => [...s.normalize('NFC')].filter(c => !/\s/.test(c)).length;
const bodyCount = count(body);

const out = [];
out.push(`# ${storyJson.title}\n`);
out.push(`— ${storyJson.subtitle} —\n`);
out.push(`주인공: 권지혁 (소설 속 이름)\n`);
out.push(`\n## 목차\n`);
chapters.forEach(c => out.push(`- ${c.id.replace('CH', '제 ') + '장'} ${c.title}`));
out.push(`\n[[ALEPH_BODY_START]]\n`);
out.push(body.trim());
out.push(`\n[[ALEPH_BODY_END]]\n`);
out.push(`\n> 본문 글자 수(공백 제외·NFC): ${bodyCount.toLocaleString()}자\n`);

// 부록 A: 분기/엔딩 안내
out.push(`\n---\n\n## 부록 A. 선택형 분기 안내\n`);
out.push(`이 소설은 채팅형 웹 뷰어에서 선택지에 따라 결말이 달라진다. 원고 본문은 메인 루트(트루 방향)를 싣고, 나머지 길은 요약으로 둔다.\n`);
out.push(`\n- **트루 엔딩 「네 이름으로」**: 본문 제12장. 시스템의 정체가 열리고, 상태창 없이도 서는 사람으로 완결.`);
out.push(`- **노멀 엔딩 「창을 닫은 아침」**: 창을 스스로 닫고 혼자 아침을 맞는 길. 쓰지만 건강한 이별.`);
out.push(`- **새드 엔딩 「미완료 퀘스트」**: 판단을 시스템에 맡기는 길. 스스로의 문장을 잃어가는 경고적 결말.`);
out.push(`- **히든 엔딩 「로그의 마지막 줄」**: 아리아의 시점에서 서사가 뒤집히는 반전 결말.`);
out.push(`\n또한 각 장 말미의 선택지에는 본선이 아닌 짧은 사이드 씬이 연결되어 있다(웹 뷰어 전용).\n`);

// 부록 B~D + 확인 방법 (appendix.md)
const appendixPath = path.join(ROOT, 'story', 'appendix.md');
if (fs.existsSync(appendixPath)) out.push('\n' + fs.readFileSync(appendixPath, 'utf8').trim() + '\n');

fs.writeFileSync(path.join(ROOT, 'manuscript.md'), out.join('\n'), 'utf8');
fs.writeFileSync(path.join(ROOT, 'story', 'story.json'), JSON.stringify(storyJson, null, 1), 'utf8');

console.log('=== 빌드 완료 ===');
console.log('챕터:', chapterIds.join(', '));
console.log('엔딩:', endingIds.join(', '));
console.log('본문 글자 수(공백 제외):', bodyCount, bodyCount >= 30000 ? '✅' : '⚠ 미달');
Object.entries(chCounts).forEach(([k, v]) => console.log(`  ${k}: ${v}자`));
if (warnings.length) { console.log('--- 경고 ---'); warnings.forEach(w => console.log(' !', w)); }
