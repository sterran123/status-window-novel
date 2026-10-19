// 채팅형 인터랙티브 소설 엔진 — story/story.json (tools/build.js 생성물)
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const ROOT = document.documentElement;
const chat = $('#chat'), choices = $('#choices'), dock = $('#dock');
const SAVE_KEY = 'novel-save-v1', SET_KEY = 'novel-settings-v1';

let STORY = null, BYID = new Map(), NODE = null, HISTORY = [], SEEN = new Set();
let TIMER = null, CUR_ILLUS = null, LOCK = false, STATE = null; // STATE: 'flow' | 'choice' | 'end'
let FIRST = {}, MAIN_CH = [], PARENT = {}; // PARENT: 사이드 씬 → 그 씬으로 갈라지는 본선 장

/* ── 설정 ───────────────────────────────────────── */
// 자동 읽기 속도 = 초당 읽는 글자(음절) 수. 한국어로 내용을 이해하며 읽는 속도는 대략 초당 6~9자
const SPEEDS = [3.5, 4.5, 5.5, 6.3, 7, 8, 9.5, 11.5, 14];
const SPEED_NAMES = ['아주 천천히', '천천히', '느긋하게', '조금 느긋하게', '보통', '조금 빠르게', '빠르게', '아주 빠르게', '훑어보기'];
const SPEED_NORMAL = 7, SPEED_PICK = { slow: 5.5, normal: 7, fast: 9.5 }; // 첫 안내 화면 선택값 — 양쪽으로 더 조절할 여지를 남긴다
const FONTS = {
  pretendard: { label: '프리텐다드', note: '깔끔한 고딕', stack: "'Pretendard Variable',Pretendard,'Noto Sans KR',system-ui,sans-serif" },
  notoserif: { label: '본명조', note: '단정한 명조', g: 'Noto+Serif+KR:wght@400;600;700', stack: "'Noto Serif KR',serif" },
  gowunbatang: { label: '고운바탕', note: '부드러운 바탕', g: 'Gowun+Batang:wght@400;700', stack: "'Gowun Batang',serif" },
  nanummyeongjo: { label: '나눔명조', note: '책 같은 명조', g: 'Nanum+Myeongjo:wght@400;700', stack: "'Nanum Myeongjo',serif" },
  gowundodum: { label: '고운돋움', note: '둥근 돋움', g: 'Gowun+Dodum', stack: "'Gowun Dodum',sans-serif" },
  ibmplex: { label: 'IBM Plex', note: '단단한 고딕', g: 'IBM+Plex+Sans+KR:wght@400;600', stack: "'IBM Plex Sans KR',sans-serif" },
};
const DEF = { auto: true, cps: SPEED_NORMAL, layout: 'chat', font: 'pretendard', size: 17, lh: 1.85, width: 'normal',
  theme: 'dark', illus: 'big', motion: 'auto', wake: true, voice: false, vol: 0.8, voicewho: 'all', voicewait: true };
let S = { ...DEF };

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SET_KEY));
    if (s) { S = { ...DEF, ...s }; if (s.cps == null && s.speed) S.cps = SPEED_NORMAL / s.speed; delete S.speed; } // 구버전 '머무름 배율' 설정 변환
  } catch (e) {}
}
function saveSettings() { try { localStorage.setItem(SET_KEY, JSON.stringify(S)); } catch (e) {} }
const speedIdx = () => { let b = 4, d = 99; SPEEDS.forEach((v, i) => { if (Math.abs(v - S.cps) < d) { d = Math.abs(v - S.cps); b = i; } }); return b; };
const speedText = i => `${SPEED_NAMES[i]} · 분당 ${Math.round(SPEEDS[i] * 60)}자`;
const reduced = () => S.motion === 'reduce' || matchMedia('(prefers-reduced-motion: reduce)').matches;

function loadCss(href, id) {
  if (document.getElementById(id)) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.id = id; document.head.appendChild(l);
}
function applySettings() {
  ROOT.dataset.theme = S.theme; ROOT.dataset.layout = S.layout; ROOT.dataset.width = S.width;
  ROOT.dataset.motion = S.motion; ROOT.dataset.auto = String(S.auto);
  ROOT.style.setProperty('--fs', S.size + 'px'); ROOT.style.setProperty('--lh', S.lh);
  const f = FONTS[S.font] || FONTS.pretendard;
  if (f.g) loadCss(`https://fonts.googleapis.com/css2?family=${f.g}&display=swap`, 'font-' + S.font);
  ROOT.style.setProperty('--font', f.stack);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(ROOT).getPropertyValue('--bg').trim() || '#0d0f15';
  syncAutoUI(); syncVoiceUI(); syncWake();
}
function setOpt(k, v) {
  S[k] = v; saveSettings(); applySettings(); syncSettingsUI();
  if (k === 'cps' || k === 'auto') { cancelTimer(); resume(); }
  if (k === 'voice') { if (v) { VOICES ? markExisting() : loadVoices(); } else stopVoice(); }
  if (k === 'vol') AUDIO.volume = v;
}

/* ── 저장 ───────────────────────────────────────── */
// {pos, endings:[], reached:[CHxx], sides:[BR_x], t} — 구버전(문자열·필드 없는 객체)도 읽는다
let SAVE = { pos: null, endings: [], reached: [], sides: [] };
function loadSave() {
  try {
    const r = localStorage.getItem(SAVE_KEY); if (!r) return;
    let o = null; try { o = JSON.parse(r); } catch (e) {}
    if (o && typeof o === 'object') SAVE = { pos: o.pos || null, endings: o.endings || [], reached: o.reached || [], sides: o.sides || [] };
    else SAVE.pos = typeof o === 'string' ? o : r;
    if (SAVE.pos && !BYID.has(SAVE.pos)) SAVE.pos = null;
    // 구버전 세이브: 현재 위치까지의 장은 지나온 것으로 본다
    const n = SAVE.pos && BYID.get(SAVE.pos);
    if (n && !SAVE.reached.length && /^CH\d+$/.test(n.chapter)) MAIN_CH.forEach(c => { if (c.id <= n.chapter) SAVE.reached.push(c.id); });
  } catch (e) {}
}
function writeSave() {
  try { const n = lastNode(); if (n) SAVE.pos = n.id; SAVE.t = Date.now(); localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) {}
}
const addUniq = (arr, v) => { if (v && !arr.includes(v)) arr.push(v); };

/* ── 시작 ───────────────────────────────────────── */
async function init() {
  loadSettings(); applySettings(); if (S.voice) loadVoices();
  try { STORY = await (await fetch('../story/story.json')).json(); }
  catch (e) { chat.innerHTML = '<div class="bubble narration">이야기를 불러오지 못했습니다. 로컬에서는 <b>node tools/serve.js</b>로 열어 주세요.</div>'; return; }
  STORY.nodes.forEach((n, i) => { n._i = i; BYID.set(n.id, n); if (n.chapter && !FIRST[n.chapter]) FIRST[n.chapter] = n.id; });
  MAIN_CH = STORY.chapters;
  const ORDER = ['END_TRUE', 'END_NORMAL', 'END_SAD', 'END_HIDDEN']; // 결말 도감은 트루 → 노멀 → 새드 → 히든 순
  STORY.endings.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  STORY.nodes.forEach(n => { if (n.type === 'choice' && /^CH\d+$/.test(n.chapter)) n.options.forEach(o => { if (/^BR_/.test(o.goto || '')) PARENT[o.goto] = n.chapter; }); });
  $('#progress-ticks').innerHTML = MAIN_CH.map(() => '<span></span>').join('');
  loadSave();
  bindUI();
  showCover();
}

function bindUI() {
  $('#btn-next').onclick = () => { cancelTimer(); advance(); };
  $('#btn-auto').onclick = () => toggleAuto();
  $('#btn-voice').onclick = () => toggleVoice();
  $('#set-voice').onchange = e => setOpt('voice', e.target.checked);
  $('#set-voicewait').onchange = e => setOpt('voicewait', e.target.checked);
  $('#set-vol').oninput = e => setOpt('vol', +e.target.value / 100);
  // 다시 듣기 버튼
  chat.addEventListener('click', e => { const b = e.target.closest('.vbtn'); if (b) { e.stopPropagation(); replayVoice(b.closest('.bubble')); } });
  // 모바일 사파리 등: 첫 터치 때 오디오 재생 권한을 열어 둔다
  addEventListener('pointerdown', unlockAudio, { once: true, capture: true });
  $('#dock-pause').onclick = () => toggleAuto();
  const stepSpeed = dir => {
    const i = Math.max(0, Math.min(SPEEDS.length - 1, speedIdx() + dir));
    setOpt('cps', SPEEDS[i]); toast(speedText(i));
  };
  $('#dock-slower').onclick = () => stepSpeed(-1);
  $('#dock-faster').onclick = () => stepSpeed(1);
  $('#btn-settings').onclick = () => openPanel('settings-panel');
  $('#btn-toc').onclick = () => openToc();
  $('#btn-status').onclick = () => { $('#status-body').textContent = currentStatusText(); openPanel('status-panel'); };
  $('#btn-restart').onclick = () => askConfirm('처음부터 다시 읽을까요?\n읽은 결말과 지나온 장 기록은 남아 있습니다.', '처음부터').then(ok => ok && startFresh());
  $('#btn-open-cast').onclick = () => openCast();
  $('#btn-latest').onclick = () => { scrollToEnd(true); };
  $('#btn-fullscreen').onclick = toggleFullscreen;
  $('#btn-reset-settings').onclick = () => { const keepAuto = S.auto; S = { ...DEF, auto: keepAuto }; saveSettings(); applySettings(); syncSettingsUI(); toast('설정을 기본값으로 되돌렸습니다'); };
  $('#btn-reset-all').onclick = () => askConfirm('읽던 위치, 지나온 장, 모아 둔 결말을 모두 지울까요?\n되돌릴 수 없습니다.', '모두 지우기').then(ok => {
    if (!ok) return; SAVE = { pos: null, endings: [], reached: [], sides: [] }; try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    closeAll(); stopReading(); showCover(); toast('읽은 기록을 지웠습니다');
  });

  // 서랍·모달 닫기: 닫기 버튼, 바깥 클릭
  $$('[data-close]').forEach(b => b.onclick = () => closeAll());
  ['toc-panel', 'status-panel', 'settings-panel', 'cast-panel'].forEach(id => $('#' + id).addEventListener('click', e => { if (e.target.id === id) closeAll(); }));
  $('#illus-light').addEventListener('click', () => closeAll());

  // 설정 컨트롤
  $$('.seg[data-key], .theme-grid[data-key]').forEach(g => g.addEventListener('click', e => {
    const b = e.target.closest('button[data-v]'); if (!b) return;
    const k = g.dataset.key; let v = b.dataset.v;
    if (k === 'auto') v = v === 'true'; else if (k === 'lh') v = +v;
    setOpt(k, v);
  }));
  $('#set-speed').oninput = e => setOpt('cps', SPEEDS[+e.target.value]);
  $('#set-size').oninput = e => setOpt('size', +e.target.value);
  $('#size-dec').onclick = () => setOpt('size', Math.max(14, S.size - 1));
  $('#size-inc').onclick = () => setOpt('size', Math.min(24, S.size + 1));
  $('#set-motion').onchange = e => setOpt('motion', e.target.checked ? 'reduce' : 'auto');
  $('#set-wake').onchange = e => setOpt('wake', e.target.checked);
  buildFontGrid();

  // 표지
  $('#btn-cover-main').onclick = () => {
    const n = SAVE.pos && BYID.get(SAVE.pos);
    if (!n) return openIntro();
    hideCover();
    // 결말까지 읽었으면 '다른 길' — 결말이 갈리는 제11장 선택지로 데려간다
    if (n.type === 'end') resumeAt(STORY.nodes.find(x => x.chapter === 'CH11' && x.type === 'choice').id);
    else resumeAt(n.id);
  };
  $('#btn-cover-fresh').onclick = () => openIntro();
  $('#btn-cover-toc').onclick = () => openToc();
  $('#btn-cover-cast').onclick = () => openCast();

  // 첫 시작 안내 — 모드/속도 고르고 시작
  const pick = (grp, on) => grp.forEach(b => b.classList.toggle('on', b === on));
  const modes = [$('#intro-auto'), $('#intro-manual')], spd = [$('#intro-slow'), $('#intro-normal'), $('#intro-fast')];
  modes.forEach(b => b.onclick = () => { pick(modes, b); $('#intro-speed-row').hidden = b.id !== 'intro-auto'; });
  spd.forEach(b => b.onclick = () => pick(spd, b));
  $('#btn-intro-start').onclick = () => {
    S.auto = $('#intro-auto').classList.contains('on');
    S.cps = SPEED_PICK[$('#intro-slow').classList.contains('on') ? 'slow' : $('#intro-fast').classList.contains('on') ? 'fast' : 'normal'];
    saveSettings(); applySettings();
    $('#intro-panel').hidden = true; hideCover(); startFresh();
  };

  // 확인 창
  $('#confirm-no').onclick = () => confirmDone(false);
  $('#confirm-yes').onclick = () => confirmDone(true);

  // 본문을 누르면 기다림을 건너뛰고 바로 다음 문장
  $('.chat-wrap').addEventListener('click', e => {
    if (anyOpen() || e.target.closest('button,a,.illus,input,label') || getSelection().toString()) return;
    if (STATE === 'flow') { cancelTimer(); advance(); }
  });
  document.addEventListener('keydown', onKey);
  window.addEventListener('scroll', onScroll, { passive: true });
  // 사람이 직접 스크롤한 경우만 '아래 붙어 있기'를 푼다 (코드가 부드럽게 내리는 중의 스크롤 이벤트는 무시)
  ['wheel', 'touchmove'].forEach(ev => addEventListener(ev, () => { userScrollAt = Date.now(); }, { passive: true }));
  addEventListener('keydown', e => { if (['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp'].includes(e.key)) userScrollAt = Date.now(); });

  // 탭 전환·창 닫기 → 자동 저장 + 일시정지, 돌아오면 재개
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelTimer(); writeSave(); if (!AUDIO.paused) AUDIO.pause(); } else { resume(); }
    syncWake();
  });
  window.addEventListener('pagehide', writeSave);
}

function onKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.matches('input,textarea')) return;
  const k = e.key;
  if (k === 'Escape') { closeAll(); return; }
  if (!$('#confirm-panel').hidden) { if (k === 'Enter') { e.preventDefault(); confirmDone(true); } return; }
  if (!$('#cover').hidden) return;
  const lk = k.toLowerCase();
  if (lk === 't') { anyOpen() ? closeAll() : openToc(); return; }
  if (lk === 's') { anyOpen() ? closeAll() : openPanel('settings-panel'); return; }
  if (lk === 'i') { anyOpen() ? closeAll() : $('#btn-status').click(); return; }
  if (lk === 'f') { toggleFullscreen(); return; }
  if (anyOpen()) return;
  if (lk === 'a') { toggleAuto(); return; }
  if (lk === 'v') { toggleVoice(); return; }
  if (STATE === 'choice' && /^[1-9]$/.test(k)) { const b = choices.querySelectorAll('button')[+k - 1]; if (b) { e.preventDefault(); b.click(); } return; }
  // 스페이스·엔터·→·↓·볼륨아래(모바일)로 다음 문장
  if ([' ', 'Enter', 'ArrowRight', 'ArrowDown', 'AudioVolumeDown', 'VolumeDown'].includes(k) || e.keyCode === 25) {
    if (STATE === 'flow') { e.preventDefault(); cancelTimer(); advance(); }
  }
}

/* ── 설정 UI ─────────────────────────────────────── */
function buildFontGrid() {
  const g = $('#font-grid');
  g.innerHTML = Object.entries(FONTS).map(([k, f]) =>
    `<button data-font="${k}" style="font-family:${f.stack.replace(/"/g, "'")}"><b>${f.label}</b><small>${f.note}</small></button>`).join('');
  g.onclick = e => { const b = e.target.closest('button[data-font]'); if (b) setOpt('font', b.dataset.font); };
}
let fontPreviewLoaded = false;
function loadFontPreviews() {
  if (fontPreviewLoaded) return; fontPreviewLoaded = true;
  // 버튼 미리보기용 — 버튼에 쓰인 글자만 받는 가벼운 요청
  const fams = Object.values(FONTS).filter(f => f.g).map(f => 'family=' + f.g).join('&');
  const text = encodeURIComponent(Object.values(FONTS).map(f => f.label).join('') + '가나다새벽세시십칠분지혁은모니터앞에서깨어있었다');
  loadCss(`https://fonts.googleapis.com/css2?${fams}&text=${text}&display=swap`, 'font-previews');
}
function syncSettingsUI() {
  $$('.seg[data-key], .theme-grid[data-key]').forEach(g => {
    const cur = String(S[g.dataset.key]);
    g.querySelectorAll('button[data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === cur));
  });
  $$('#font-grid button').forEach(b => b.classList.toggle('on', b.dataset.font === S.font));
  const si = speedIdx();
  $('#set-speed').max = SPEEDS.length - 1; $('#set-speed').value = si;
  $('#speed-label').textContent = speedText(si); $('#auto-speed').textContent = SPEED_NAMES[si];
  $('#dock-slower').disabled = si === 0; $('#dock-faster').disabled = si === SPEEDS.length - 1;
  $('#set-size').value = S.size; $('#size-label').textContent = S.size + 'px';
  $('#set-motion').checked = S.motion === 'reduce';
  $('#set-voice').checked = !!S.voice; $('#set-voicewait').checked = !!S.voicewait;
  $('#set-vol').value = Math.round(S.vol * 100); $('#vol-label').textContent = Math.round(S.vol * 100) + '%';
  $('#voice-opts').classList.toggle('dim', !S.voice);
  $('#set-wake').checked = !!S.wake;
}
function toggleAuto() { setOpt('auto', !S.auto); toast(S.auto ? '자동 읽기를 켰습니다' : '직접 넘기기로 바꿨습니다'); }
function syncAutoUI() {
  const b = $('#btn-auto'); if (!b) return;
  b.querySelector('use').setAttribute('href', S.auto ? '#i-pause' : '#i-play');
  b.querySelector('.lbl').textContent = S.auto ? '자동' : '수동';
  b.classList.toggle('off', !S.auto);
  b.title = S.auto ? '자동 읽기 끄기 (A)' : '자동 읽기 켜기 (A)';
  $('#dock-pause use').setAttribute('href', S.auto ? '#i-pause' : '#i-play');
}
function toggleFullscreen() {
  try { document.fullscreenElement ? document.exitFullscreen() : ROOT.requestFullscreen(); } catch (e) { toast('이 브라우저는 전체 화면을 지원하지 않습니다'); }
}
// 자동 읽기 중 화면 꺼짐 방지 (Wake Lock API)
let WAKE = null;
async function syncWake() {
  const want = S.wake && S.auto && !document.hidden && $('#cover') && $('#cover').hidden && STATE === 'flow';
  try {
    if (want && !WAKE && 'wakeLock' in navigator) { WAKE = await navigator.wakeLock.request('screen'); WAKE.addEventListener('release', () => { WAKE = null; }); }
    else if (!want && WAKE) { await WAKE.release(); WAKE = null; }
  } catch (e) { WAKE = null; }
}

/* ── 패널·모달 ───────────────────────────────────── */
const PANELS = ['toc-panel', 'status-panel', 'settings-panel', 'cast-panel', 'illus-light', 'intro-panel', 'confirm-panel'];
const anyOpen = () => PANELS.some(id => !$('#' + id).hidden) || !$('#cover').hidden;
let lastFocus = null;
function openPanel(id) {
  PANELS.forEach(p => { if (p !== id && p !== 'confirm-panel') $('#' + p).hidden = true; });
  if (id === 'settings-panel') { syncSettingsUI(); loadFontPreviews(); }
  cancelTimer(); lastFocus = document.activeElement;
  $('#' + id).hidden = false;
  const f = $('#' + id).querySelector('[data-close],button'); if (f) f.focus({ preventScroll: true });
}
function closeAll() {
  if (!$('#confirm-panel').hidden) { confirmDone(false); return; }
  ['toc-panel', 'status-panel', 'settings-panel', 'cast-panel', 'illus-light', 'intro-panel'].forEach(p => $('#' + p).hidden = true);
  if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  resume();
}
let confirmResolve = null;
function askConfirm(msg, yes = '확인') {
  $('#confirm-msg').textContent = msg; $('#confirm-yes').textContent = yes;
  $('#confirm-panel').hidden = false; cancelTimer(); $('#confirm-yes').focus();
  return new Promise(r => { confirmResolve = r; });
}
function confirmDone(v) { $('#confirm-panel').hidden = true; const r = confirmResolve; confirmResolve = null; if (r) r(v); if (!v) resume(); }
let toastT = null;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 1800); }

/* ── 표지·안내 ───────────────────────────────────── */
function hideCover() { $('#cover').hidden = true; syncWake(); }
function showCover() {
  stopReading();
  const n = SAVE.pos ? BYID.get(SAVE.pos) : null;
  const main = $('#btn-cover-main');
  if (n && n.type === 'end') main.textContent = '다른 결말 찾기 — 제11장 선택지로';
  else if (n) main.textContent = `이어보기 — ${placeName(n.chapter).short} · ${Math.round(progressOf(n))}%`;
  else main.textContent = '이야기 시작';
  $('#btn-cover-fresh').hidden = !n;
  $('#btn-cover-toc').hidden = !SAVE.reached.length;
  $('#cover-collect').innerHTML = (SAVE.endings.length || SAVE.reached.length) ? endingChips() : '';
  $('#cover-foot').textContent = SAVE.endings.length
    ? `결말 ${SAVE.endings.length}/${STORY.endings.length} · 사이드 씬 ${SAVE.sides.length}/${STORY.sides.length} — 다른 길도 남아 있습니다`
    : '선택지마다 결말이 갈립니다 · 읽던 자리와 설정은 이 기기에 저장됩니다';
  $('#cover').hidden = false;
}
function endingChips() {
  return STORY.endings.map(e => {
    const got = SAVE.endings.includes(e.id);
    return `<span class="chip${got ? ' got' : ''}">${got ? '<svg class="ic"><use href="#i-check"/></svg>' + esc(e.label) : '<svg class="ic"><use href="#i-lock"/></svg>' + esc(e.label.replace(' 엔딩', '')) + ' ?'}</span>`;
  }).join('');
}
function openIntro() {
  $('#intro-auto').classList.toggle('on', S.auto); $('#intro-manual').classList.toggle('on', !S.auto);
  $('#intro-speed-row').hidden = !S.auto;
  const si = speedIdx();
  $('#intro-slow').classList.toggle('on', si <= 3); $('#intro-normal').classList.toggle('on', si === 4); $('#intro-fast').classList.toggle('on', si >= 5);
  $('#intro-panel').hidden = false; $('#btn-intro-start').focus();
}

/* ── 목차·결말 도감 ──────────────────────────────── */
function placeName(ch) {
  const m = /^CH(\d+)$/.exec(ch || '');
  if (m) { const c = MAIN_CH.find(x => x.id === ch); return { kind: 'ch', short: `제 ${+m[1]}장`, full: `제 ${+m[1]}장 · ${c ? c.title : ''}`, title: c ? c.title : '', no: +m[1] }; }
  if (/^BR_/.test(ch || '')) { const s = (STORY.sides || []).find(x => x.id === ch); return { kind: 'side', short: '사이드 씬', full: `사이드 씬 · ${s ? s.title : ''}`, title: s ? s.title : '' }; }
  if (/^END_/.test(ch || '')) { const e = STORY.endings.find(x => x.id === ch); return { kind: 'end', short: '결말', full: `${e ? e.label : '결말'} · ${e ? e.desc : ''}`, title: e ? e.desc : '' }; }
  return { kind: '', short: '', full: '', title: '' };
}
function openToc() {
  const cur = lastNode() || (SAVE.pos && BYID.get(SAVE.pos));
  const curCh = cur ? cur.chapter : null;
  $('#toc-now').innerHTML = cur ? `지금 읽는 곳 · ${Math.round(progressOf(cur))}%<b>${esc(placeName(curCh).full)}</b>` : '아직 읽기 전입니다<b>제 1장부터 시작합니다</b>';
  $('#toc-list').innerHTML = MAIN_CH.map(c => {
    const no = +c.id.slice(2), reached = SAVE.reached.includes(c.id) || no === 1;
    const isCur = c.id === curCh;
    return `<li><button data-ch="${c.id}" class="${reached ? 'done' : ''}${isCur ? ' cur' : ''}" ${reached ? '' : 'disabled'}>
      <span class="n">${String(no).padStart(2, '0')}</span><span class="t">${reached ? esc(c.title) : '아직 닿지 않은 장'}</span>
      <span class="s"><svg class="ic"><use href="#${reached ? (isCur ? 'i-play' : 'i-check') : 'i-lock'}"/></svg></span></button></li>`;
  }).join('');
  $('#toc-list').onclick = e => {
    const b = e.target.closest('button[data-ch]'); if (!b || b.disabled) return;
    const ch = b.dataset.ch, p = placeName(ch);
    askConfirm(`${p.full}\n이 장의 처음으로 갈까요?`, '이동').then(ok => { if (ok) { closeAll(); hideCover(); jumpTo(FIRST[ch]); } });
  };
  $('#end-grid').innerHTML = STORY.endings.map(e => {
    const got = SAVE.endings.includes(e.id);
    return `<div class="end-card${got ? ' got' : ''}"><b>${esc(e.label)}</b>${got ? esc(e.desc) : '아직 닿지 않은 결말'}</div>`;
  }).join('');
  $('#side-count').textContent = `사이드 씬 ${SAVE.sides.length} / ${(STORY.sides || []).length}편 — 장 끝 선택지에서 본선이 아닌 길을 고르면 열립니다`;
  openPanel('toc-panel');
}

/* ── 등장인물 ────────────────────────────────────── */
const CAST = [
  { key: '권지혁', img: 'img/jihyeok.jpg', desc: '이 이야기의 주인공. 말보다 눈이 먼저인 사람 — 어느 새벽, 상태창이 떴다.' },
  { key: '아리아', cls: 'aria', mark: '《', desc: '《 》로 말하는 안내자. 지혁의 로그를 읽는 존재.' },
  { key: '아버지', desc: '말없이 낡은 노트북을 건넨 사람.' },
  { key: '어머니', desc: '잔소리로 걱정을 표현하는 사람.' },
  { key: '누나', desc: '말수는 적어도 먼저 어깨를 두드려 주는 사람.' },
  { key: '친구', desc: '"이거 반복해야 하는데 좀 도와줘" — 첫 부탁을 가져온 학창 시절 친구.' },
  { key: '태윤', desc: '혼밥비서 팀 — 요리·식비 담당. 버그 일지를 만든 꼼꼼한 사람.' },
  { key: '태우', desc: '혼밥비서 팀 — 냉장고·수다방 담당. 이모지가 말보다 먼저 나간다.' },
  { key: '눈꽃', name: '눈꽃 · 은우 · 민재', desc: '「너만오면됑」 방 사람들. 지혁의 첫 사용자이자 증인.' },
  { key: '윤재목', desc: '리추얼 과정 부장님. "자기 이야기를 각색해 봐."' },
];
function firstAppear(key) {
  for (const n of STORY.nodes) {
    if (!/^CH\d+$/.test(n.chapter || '')) continue;
    if (key === '아리아' ? n.type === 'aria' : (n.speaker === key || (n.speaker === '지혁' && key === '권지혁'))) return n.chapter;
  }
  return null;
}
function openCast() {
  $('#cast-list').innerHTML = CAST.map(c => {
    const ch = firstAppear(c.key), known = !ch || SAVE.reached.includes(ch) || ch === 'CH01';
    const meta = ch ? `<small>${placeName(ch).short} 첫 등장</small>` : '';
    const face = c.img ? `<img src="${esc(c.img)}" alt="">` : `<span class="cast-dot">${esc(c.mark || (c.name || c.key)[0])}</span>`;
    return `<div class="cast-item ${c.cls || ''}">${face}<div><div class="nm">${esc(c.name || c.key)}${meta}</div><div class="ds">${known ? esc(c.desc) : '아직 만나지 않은 인물입니다.'}</div></div></div>`;
  }).join('');
  openPanel('cast-panel');
}

/* ── 진행 ────────────────────────────────────────── */
function cancelTimer() {
  if (TIMER) { clearTimeout(TIMER); TIMER = null; }
  const m = $('#auto-meter'); if (m) { m.style.transition = 'none'; m.style.width = '0'; }
}
function resume() { if (S.auto && STATE === 'flow' && !anyOpen() && !document.hidden) scheduleNext(lastNode()); syncWake(); }
const lastNode = () => HISTORY[HISTORY.length - 1];

// 읽기 분량 — 한글 1음절 = 1, 영문·숫자 단어는 읽는 데 드는 품만큼 더한다
function readUnits(t) {
  t = String(t || '');
  const hangul = (t.match(/[가-힣]/g) || []).length;
  const latin = (t.match(/[A-Za-z][A-Za-z'_-]*/g) || []).reduce((a, w) => a + Math.min(4, 1 + w.length / 4), 0);
  const nums = (t.match(/\d[\d,.:/]*/g) || []).reduce((a, w) => a + Math.min(3, 0.8 + w.length / 4), 0);
  const marks = (t.match(/[^\s가-힣A-Za-z\d.,!?…—·]/g) || []).length * 0.25; // 괄호·기호
  return hangul + latin + nums + marks;
}
// 문장마다 '이 정도면 다 읽었겠다' 싶은 시간 — 눈이 새 말풍선으로 옮겨 가는 시간 + 읽는 시간 + 문장부호 숨 고르기
function delayFor(n) {
  const slow = Math.sqrt(SPEED_NORMAL / S.cps);       // 글자 수와 무관한 대기도 속도 설정을 조금 따른다
  if (n.type === 'scene') return 1300 * slow;
  if (n.type === 'img') return (S.illus === 'small' ? 2400 : 4800) * slow;
  const t = n.type === 'status' ? statusCompactHTML(n.display, prevStatusText(n)).replace(/<[^>]+>/g, ' ') : (n.text || n.display || '');
  let d = 650 * slow + readUnits(t) / S.cps * 1000;
  const enders = (t.match(/[.!?…]+/g) || []).length, mids = (t.match(/[,·—]/g) || []).length, lines = (t.match(/\n/g) || []).length;
  d += (enders * 260 + mids * 110 + lines * 160) * slow;           // 문장이 끝날 때마다 숨 고르기
  if (n.type === 'sys' || n.type === 'status') d = d * 1.2 + 900 * slow; // 고정폭 목록은 훑어 읽는 데 더 걸린다
  if (n.type === 'aria') d *= 1.08;                                 // 시스템의 말은 한 박자 더 머문다
  if (n.chapter && FIRST[n.chapter] === n.id) d += 1800 * slow;     // 장 표제를 읽을 시간
  return Math.min(30000, Math.max(1400 * slow, d));
}
function scheduleNext(n) {
  if (!S.auto || TIMER || !n || STATE !== 'flow') return;
  let d = delayFor(n);
  // 대사 음성이 나오는 중이면 끝날 때까지(+숨 한 번) 기다린다
  if (S.voicewait && SPEAKING && SPEAKING.node === n) d = Math.max(d, SPEAKING.until - Date.now() + 450);
  TIMER = setTimeout(() => { TIMER = null; advance(); }, d);
  const m = $('#auto-meter');
  m.style.transition = 'none'; m.style.width = '0'; void m.offsetWidth;
  m.style.transition = `width ${d}ms linear`; m.style.width = '100%';
}
// 본선 장 기준 진행률 — 장마다 1/12씩, 장 안에서는 노드 위치로
function progressOf(n) {
  if (!n) return 0;
  let ch = n.chapter, ci;
  if (/^BR_/.test(ch)) { ch = PARENT[ch]; if (!ch) return 0; n = BYID.get(lastOf(ch)); } // 사이드 씬은 갈라져 나온 장의 끝으로 친다
  // 결말 파일은 본선의 마지막 칸(제12장 자리) 안에서 진행된다
  ci = /^END_/.test(ch) ? MAIN_CH.length - 1 : MAIN_CH.findIndex(c => c.id === ch); if (ci < 0) return 0;
  const a = BYID.get(FIRST[ch])._i, b = BYID.get(lastOf(ch))._i;
  const inCh = b > a ? (n._i - a) / (b - a) : 1;
  return Math.max(0, Math.min(100, (ci + inCh) / MAIN_CH.length * 100));
}
const LAST = {};
function lastOf(ch) { if (LAST[ch]) return LAST[ch]; let id = null; for (const n of STORY.nodes) if (n.chapter === ch) id = n.id; return LAST[ch] = id; }
function updateTop(n) {
  $('#progress-bar').style.width = progressOf(n) + '%';
  const p = placeName(n && n.chapter);
  $('#brand-sub').textContent = p.full || '권지혁 이야기';
}

/* ── 렌더 ────────────────────────────────────────── */
function stopReading() {
  cancelTimer(); stopVoice(); STATE = null; LOCK = false; CUR_ILLUS = null; chat.innerHTML = ''; choices.innerHTML = ''; HISTORY = []; SEEN.clear();
  dock.classList.add('hide'); stickBottom = true; $('#btn-latest').hidden = true; scrollTo(0, 0);
}
function startFresh() { SAVE.pos = null; writeSave(); jumpTo(STORY.start); }
function jumpTo(id) { stopReading(); NODE = BYID.get(id); dock.classList.remove('hide'); advance(); }
// 이어보기 — 같은 장의 직전 문장 몇 개를 흐리게 깔아 두고, 그다음부터 이어 읽는다
function resumeAt(id) {
  stopReading();
  const n = BYID.get(id); if (!n) return startFresh();
  const ctx = [];
  for (let k = n._i - 1; k >= 0 && ctx.length < 8; k--) {
    const p = STORY.nodes[k]; if (p.chapter !== n.chapter) break;
    if (['msg', 'aria', 'chatline', 'sys', 'scene'].includes(p.type)) ctx.unshift(p);
  }
  showChapter(n.chapter);
  ctx.forEach(p => { const d = drawNode(p); if (d) d.classList.add('past'); });
  if (ctx.length) el('resume-divider', '여기서부터 이어 읽기');
  dock.classList.remove('hide');
  NODE = n; advance();
}
function advance() {
  if (!NODE || LOCK) return;
  const n = NODE;
  NODE = n.next ? BYID.get(n.next) : (STORY.nodes[n._i + 1] || null);
  render(n);
}

let stickBottom = true, userScrollAt = 0;
function onScroll() {
  if (innerHeight + scrollY >= document.body.scrollHeight - 160) { stickBottom = true; $('#btn-latest').hidden = true; }
  else if (Date.now() - userScrollAt < 1000) stickBottom = false;
}
function scrollToEnd(force) {
  if (!force && !stickBottom) { $('#btn-latest').hidden = false; return; }
  stickBottom = true; $('#btn-latest').hidden = true;
  requestAnimationFrame(() => scrollTo({ top: document.body.scrollHeight, behavior: reduced() ? 'auto' : 'smooth' }));
}
function el(cls, html, view) {
  const d = document.createElement('div'); d.className = cls; d.innerHTML = html; chat.appendChild(d);
  if (view === 'center' && stickBottom) requestAnimationFrame(() => d.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' }));
  else scrollToEnd();
  return d;
}
function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
const nl = t => esc(t).replace(/\n/g, '<br>');

function showChapter(ch) {
  if (!ch || SEEN.has(ch)) return; SEEN.add(ch);
  const p = placeName(ch);
  if (p.kind === 'ch') { addUniq(SAVE.reached, ch); el('chapter-banner', `<div class="cb-kicker">CHAPTER ${String(p.no).padStart(2, '0')}</div><div class="cb-title">${esc(p.title)}</div>`); }
  else if (p.kind === 'side') { addUniq(SAVE.sides, ch); el('chapter-banner side', `<div class="cb-kicker">SIDE SCENE</div><div class="cb-title">${esc(p.title)}</div>`); }
  else if (p.kind === 'end') el('chapter-banner ending', `<div class="cb-kicker">ENDING</div><div class="cb-title">${esc(p.title)}</div>`);
}

// 이전 상태창과 비교해 바뀐 줄·새 줄만 남기는 요약 렌더 (전체는 상단 상태창 버튼)
function prevStatusText(n) { for (let k = n._i - 1; k >= 0; k--) if (STORY.nodes[k].type === 'status') return STORY.nodes[k].display; return null; }
function statusCompactHTML(cur, prev) {
  const pl = prev ? new Set(prev.split('\n').map(s => s.trim()).filter(Boolean)) : new Set();
  const lines = []; let sec = null;
  for (const raw of cur.split('\n')) {
    const t = raw.trim(); if (!t) continue;
    if (/^\[.+\]$/.test(t)) { sec = { h: t, items: [] }; lines.push(sec); continue; }
    if (!pl.has(t) || t.includes('→')) (sec ? sec.items : lines).push(t);
  }
  const kept = lines.filter(s => s.items ? s.items.length : true);
  const html = kept.length ? kept.map(s => s.h
    ? [`<span class="sec">${esc(s.h)}</span>`, ...s.items.map(i => `<span class="delta">${esc(i)}</span>`)].join('<br>')
    : `<span class="delta">${esc(s)}</span>`).join('<br>') : '<span class="delta">— 변동 없음 —</span>';
  return html + '<span class="mini">바뀐 부분만 표시 · 전체는 상단 ‘상태창’</span>';
}
function currentStatusText() {
  let s = [...HISTORY].reverse().find(n => n.type === 'status');
  if (!s && SAVE.pos) { const at = BYID.get(SAVE.pos); for (let k = at ? at._i : -1; k >= 0; k--) if (STORY.nodes[k].type === 'status') { s = STORY.nodes[k]; break; } }
  if (s) return s.display;
  return '[ 상태창 ]\n\n이름: 권지혁\n레벨: ?\n칭호: 없음\n\n[스탯]\n설명력: ??  관찰력: ??  버팀: ??\n\n※ 아직 상태창이 열리지 않았습니다.\n   기록이 동기화되면 이 창에 수치가 채워집니다.';
}

function render(n) {
  HISTORY.push(n); updateTop(n);
  if (n.chapter) showChapter(n.chapter);
  writeSave();
  // 떠 있는 삽화는 서서히 지우고, 자리에는 작은 썸네일 이정표를 남긴다
  if (CUR_ILLUS) {
    const f = CUR_ILLUS; CUR_ILLUS = null; LOCK = true;
    const done = () => { f.classList.remove('out'); toMini(f); LOCK = false; renderNode(n); };
    if (reduced()) return done();
    f.classList.add('out'); setTimeout(done, 1150); return;
  }
  renderNode(n);
}
function toMini(f) { f.classList.add('mini'); f.classList.remove('small'); f.onclick = () => openIllus(f); f.setAttribute('role', 'button'); f.tabIndex = 0; }
function openIllus(f) {
  const img = f.querySelector('img'), cap = f.querySelector('figcaption');
  $('#illus-light-img').src = img.src; $('#illus-light-img').alt = img.alt;
  $('#illus-light-cap').textContent = cap ? cap.textContent : '';
  openPanel('illus-light');
}
// 노드 하나를 그린다 (이어보기 문맥에도 재사용)
function drawNode(n) {
  switch (n.type) {
    case 'msg': {
      const isN = n.speaker === '나레이션', isMe = n.speaker === STORY.protagonist;
      const who = isN ? '' : `<span class="who">${esc(n.speaker)}</span>`;
      return markVoice(n, el('bubble ' + (isN ? 'narration' : isMe ? 'me' : 'other'), `${who}<span class="tx">${nl(n.text)}</span>`));
    }
    case 'aria': { // 아리아가 연달아 말하면 이름표는 첫 말풍선에만
      const cont = chat.lastElementChild && chat.lastElementChild.classList.contains('aria');
      return markVoice(n, el('bubble aria' + (cont ? ' cont' : ''), `<span class="who">아리아</span><span class="tx">${nl(n.text)}</span>`));
    }
    case 'chatline': return markVoice(n, el('bubble chatline', `<span class="who">${esc(n.speaker)}</span><span class="tx">${nl(n.text)}</span>`));
    case 'sys': return markVoice(n, el('bubble sys', nl(n.text)));
    case 'status': return el('bubble status', statusCompactHTML(n.display, prevStatusText(n)));
    case 'scene': return el('scene-divider', '＊ ＊ ＊');
  }
  return null;
}
function renderNode(n) {
  switch (n.type) {
    case 'img': {
      const big = S.illus !== 'small';
      const f = el('illus' + (n.variant ? ' ' + esc(n.variant) : ''), `<img src="${esc('' + n.src)}" alt="${esc(n.alt || '삽화')}">` + (n.alt ? `<figcaption>${esc(n.alt)}</figcaption>` : ''), big ? 'center' : '');
      if (big) {
        const im = f.querySelector('img');
        // 로드 후 실제 높이로 한 번 더 중앙 정렬 — 삽화가 통째로 보이게
        const rc = () => stickBottom && f.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
        im.addEventListener('load', rc, { once: true }); setTimeout(rc, 120);
        CUR_ILLUS = f;
      } else { toMini(f); scrollToEnd(); }
      break;
    }
    case 'choice': return renderChoice(n);
    case 'end': return renderEnd(n);
    case 'goto': return advance();
    default: { const d = drawNode(n); if (d && d.classList.contains('voiced')) playVoice(n, d); else if (!S.voicewait && isVoiceType(n)) stopVoice(); }
  }
  preloadVoices(n);
  STATE = 'flow'; dock.classList.remove('hide');
  scheduleNext(n); syncWake();
}

function renderChoice(n) {
  cancelTimer(); STATE = 'choice'; dock.classList.add('hide'); syncWake();
  choices.innerHTML = '';
  if (n.prompt) el('bubble narration', `<span class="tx">${nl(n.prompt)}</span>`);
  const hint = document.createElement('div'); hint.className = 'choice-hint'; hint.textContent = '선택의 순간'; choices.appendChild(hint);
  n.options.forEach((o, i) => {
    const b = document.createElement('button');
    b.style.animationDelay = (i * 110) + 'ms';
    b.innerHTML = `<span class="no">${i + 1}</span><span>${esc(o.label)}</span>`;
    b.onclick = () => {
      choices.innerHTML = '';
      el('bubble me picked', `<span class="who">선택</span><span class="tx">${esc(o.label)}</span>`);
      NODE = o.gotoNode ? BYID.get(o.gotoNode) : null;
      if (NODE) { STATE = 'flow'; dock.classList.remove('hide'); advance(); }
      else el('bubble narration', '<span class="tx">이 길은 아직 닿지 못한다. 다른 선택이 문이 된다.</span>');
    };
    choices.appendChild(b);
  });
  scrollToEnd();
  // 첫 선택지에 초점 — 키보드로 바로 고를 수 있게
  const first = choices.querySelector('button'); if (first) first.focus({ preventScroll: true });
}

function renderEnd(n) {
  cancelTimer(); STATE = 'end'; dock.classList.add('hide'); syncWake();
  const e = STORY.endings.find(x => x.id === n.ending) || { label: '엔딩', desc: '' };
  addUniq(SAVE.endings, n.ending); writeSave();
  const got = SAVE.endings.length, all = STORY.endings.length;
  const d = document.createElement('div'); d.className = 'endcard';
  d.innerHTML = `<div class="end-badge">ENDING</div><h2>${esc(e.desc || e.label)}</h2><p class="end-desc">${esc(e.label)}</p>
    <div class="end-chips">${endingChips()}</div>
    <div class="end-count">모은 결말 ${got} / ${all}${got < all ? ' — 제11장의 선택지에서 다른 길이 갈립니다' : ' — 모든 결말을 읽었습니다'}</div>
    <div class="end-actions">
      <button class="wide-btn primary" data-act="ch11">제11장 선택지로</button>
      <button class="wide-btn" data-act="restart">처음부터</button>
      <button class="wide-btn ghost" data-act="cover">표지로</button>
    </div>`;
  d.onclick = ev => {
    const a = ev.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'restart') startFresh();
    else if (a.dataset.act === 'cover') showCover();
    else { const c = STORY.nodes.find(x => x.chapter === 'CH11' && x.type === 'choice'); if (c) resumeAt(c.id); }
  };
  chat.appendChild(d); scrollToEnd();
}

/* ── 대사 음성 (tools/tts/voice.py가 만든 web/voice/*.mp3) ───────── */
let VOICES = null, VOICE_LOADING = null, SPEAKING = null; // SPEAKING: {node, el, until}
const AUDIO = new Audio(); AUDIO.preload = 'auto';
const PRELOAD = new Map();
// tools/tts/voice.py line_key와 같은 규칙 — 장\t화자\t글 (채팅 기록은 화자 앞에 '-', 시스템 메시지는 '시스템')
const voiceKey = n => `${n.chapter || ''}\t${n.type === 'aria' ? '아리아' : n.type === 'sys' ? '시스템' : (n.type === 'chatline' ? '-' : '') + n.speaker}\t${n.text}`;
const isVoiceType = n => !!n && ((n.type === 'msg' && n.speaker !== '나레이션') || /^(aria|chatline|sys)$/.test(n.type));
function loadVoices() {
  if (VOICES || VOICE_LOADING) return VOICE_LOADING;
  $('#voice-status').textContent = '음성 목록을 불러오는 중…';
  return VOICE_LOADING = fetch('voice/manifest.json').then(r => r.ok ? r.json() : Promise.reject())
    .then(m => { VOICES = m; $('#voice-status').textContent = `대사 ${Object.keys(m).length}줄에 목소리가 있습니다.`; markExisting(); })
    .catch(() => { VOICE_LOADING = null; $('#voice-status').textContent = '음성 파일을 찾지 못했습니다.'; });
}
function voiceFor(n) {
  if (!S.voice || !VOICES || !isVoiceType(n)) return null;
  const machine = n.type === 'aria' || n.type === 'sys';      // 아리아·시스템 = 창의 목소리
  if (S.voicewho === 'aria' && !machine) return null;
  if (S.voicewho === 'people' && machine) return null;
  return VOICES[voiceKey(n)] || null;
}
// 음성이 있는 말풍선에 '다시 듣기' 버튼
function markVoice(n, d) {
  if (!d) return d;
  d._node = n;
  if (!voiceFor(n) || d.classList.contains('voiced')) return d;
  d.classList.add('voiced');
  d.insertAdjacentHTML('beforeend', '<button class="vbtn" aria-label="다시 듣기" title="다시 듣기"><svg class="ic"><use href="#i-sound"/></svg></button>');
  return d;
}
function markExisting() { $$('#chat .bubble').forEach(b => { if (b._node && !b.classList.contains('voiced')) markVoice(b._node, b); }); }
function playVoice(n, d) {
  const v = voiceFor(n); if (!v) return;
  stopVoice();
  AUDIO.src = 'voice/' + v.f; AUDIO.volume = S.vol; AUDIO.currentTime = 0;
  SPEAKING = { node: n, el: d, until: Date.now() + v.d * 1000 };
  d.classList.add('speaking');
  AUDIO.play().catch(() => { SPEAKING = null; d.classList.remove('speaking'); });
}
function replayVoice(b) { if (b && b._node) { S.voice ? playVoice(b._node, b) : toast('설정에서 대사 음성을 켜 주세요'); } }
function stopVoice() {
  if (!AUDIO.paused) AUDIO.pause();
  if (SPEAKING && SPEAKING.el) SPEAKING.el.classList.remove('speaking');
  SPEAKING = null;
}
AUDIO.addEventListener('ended', () => { if (SPEAKING && SPEAKING.el) SPEAKING.el.classList.remove('speaking'); SPEAKING = null; });
// 다음 몇 문장의 음성을 미리 받아 둔다
function preloadVoices(n) {
  if (!S.voice || !VOICES) return;
  let k = n, cnt = 0;
  for (let i = 0; i < 8 && k && cnt < 3; i++) {
    k = k.next ? BYID.get(k.next) : STORY.nodes[k._i + 1];
    const v = voiceFor(k);
    if (v && !PRELOAD.has(v.f)) { const a = new Audio(); a.preload = 'auto'; a.src = 'voice/' + v.f; PRELOAD.set(v.f, a); cnt++; if (PRELOAD.size > 12) PRELOAD.delete(PRELOAD.keys().next().value); }
  }
}
function unlockAudio() {
  try { AUDIO.muted = true; AUDIO.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='; AUDIO.play().then(() => { AUDIO.pause(); AUDIO.muted = false; }).catch(() => { AUDIO.muted = false; }); } catch (e) {}
}
function toggleVoice() { setOpt('voice', !S.voice); toast(S.voice ? '대사 음성을 켰습니다' : '대사 음성을 껐습니다'); }
function syncVoiceUI() {
  const b = $('#btn-voice'); if (!b) return;
  b.querySelector('use').setAttribute('href', S.voice ? '#i-sound' : '#i-mute');
  b.classList.toggle('off', !S.voice);
  b.title = S.voice ? '대사 음성 끄기 (V)' : '대사 음성 켜기 (V)';
}

// 모든 let/const 선언이 끝난 뒤에 시작한다
init();
