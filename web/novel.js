// 채팅형 인터랙티브 소설 엔진 — story/story.json (tools/build.js 생성물)
let STORY=null, NODE=null, CHAPTER_SEEN=new Set(), HISTORY=[];
let AUTO=true, TIMER=null, CURRENT_ILLUS=null, RENDER_LOCK=false;
let SETTINGS={auto:true,theme:'dark'};
let SAVE_REC={pos:null,endings:[]};
const $=s=>document.querySelector(s);
const chat=$('#chat'), choices=$('#choices'), nextBtn=$('#btn-next');
const SAVE_KEY='novel-save-v1', SET_KEY='novel-settings-v1';

init();
async function init(){
  STORY=await (await fetch('../story/story.json')).json();
  document.title=`${STORY.title} — 채팅형 소설`;
  $('.brand').firstChild.textContent=STORY.title;
  loadSettings(); applyTheme(); syncAutoUI();
  const rec=loadSave();
  nextBtn.onclick=()=>{cancelTimer();advance();};
  $('#btn-restart').onclick=()=>{cancelTimer();resetProgress();chat.innerHTML='';CHAPTER_SEEN.clear();HISTORY=[];NODE=byId(STORY.start);updateProgress();advance();};
  $('#btn-auto').onclick=()=>setAuto(!AUTO);
  $('#btn-settings').onclick=openSettings;
  $('#btn-close-settings').onclick=closeSettings;
  $('#settings-panel').addEventListener('click',e=>{if(e.target.id==='settings-panel')closeSettings();});
  $('#set-auto').onclick=()=>setAuto(true);
  $('#set-manual').onclick=()=>setAuto(false);
  $('#set-dark').onclick=()=>setTheme('dark');
  $('#set-light').onclick=()=>setTheme('light');
  $('#btn-status').onclick=()=>{ $('#status-body').textContent=currentStatusText(); $('#status-panel').hidden=false; };
  $('#btn-close-status').onclick=()=>$('#status-panel').hidden=true;
  $('#status-panel').addEventListener('click',e=>{if(e.target.id==='status-panel')$('#status-panel').hidden=true;});
  // 이어보기 팝업
  $('#btn-resume').onclick=()=>{ $('#resume-panel').hidden=true; NODE=(SAVE_REC.pos&&byId(SAVE_REC.pos))||byId(STORY.start); updateProgress(); advance(); };
  $('#btn-fresh').onclick=()=>{ $('#resume-panel').hidden=true; $('#btn-restart').click(); };
  // 본문을 누르면 기다림을 건너뛰고 바로 다음 문장 (일시정지 중에도 탭하면 넘어감)
  $('.chat-wrap').addEventListener('click',e=>{
    if(modalOpen()||e.target.closest('button,a'))return;
    if(TIMER){cancelTimer();advance();}
    else if(!AUTO&&nextBtn.style.display!=='none'){advance();}
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){if(!$('#settings-panel').hidden)closeSettings();$('#status-panel').hidden=true;return;}
    if(modalOpen())return;
    // 스페이스·엔터·→·↓·볼륨아래(모바일)로 다음 문장
    if([' ','Enter','ArrowRight','ArrowDown','AudioVolumeDown','VolumeDown'].includes(e.key)||e.keyCode===25){
      e.preventDefault();cancelTimer();if(nextBtn.style.display!=='none')advance();}
  });
  // 탭 전환·창 닫기 → 자동 저장 + 일시정지, 돌아오면 자동 재개
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){cancelTimer();writeSave();}
    else if(AUTO&&!modalOpen()&&nextBtn.style.display!=='none')scheduleNext(lastNode());
  });
  window.addEventListener('pagehide',writeSave);
  window.addEventListener('beforeunload',writeSave);
  updateProgress();
  if(rec&&rec.pos&&byId(rec.pos))showResume(rec);
  else{NODE=byId(STORY.start);advance();}
}

/* ── 설정 (로컬스토리지 저장) ── */
function loadSettings(){try{const s=JSON.parse(localStorage.getItem(SET_KEY));if(s)SETTINGS={...SETTINGS,...s}}catch(e){}AUTO=SETTINGS.auto!==false;}
function saveSettings(){try{localStorage.setItem(SET_KEY,JSON.stringify(SETTINGS))}catch(e){}}
function applyTheme(){document.documentElement.dataset.theme=SETTINGS.theme||'dark';}
function setTheme(t){SETTINGS.theme=t;saveSettings();applyTheme();syncSettingsUI();}
function setAuto(v){AUTO=!!v;SETTINGS.auto=AUTO;saveSettings();syncAutoUI();syncSettingsUI();cancelTimer();
  if(AUTO&&!modalOpen()&&nextBtn.style.display!=='none')scheduleNext(lastNode());}
function syncAutoUI(){$('#btn-auto').textContent=AUTO?'⏸ 자동':'▶ 수동';$('#btn-auto').classList.toggle('off',!AUTO);
  nextBtn.classList.toggle('auto-hidden',AUTO);}
function syncSettingsUI(){
  $('#set-auto').classList.toggle('on',AUTO);
  $('#set-manual').classList.toggle('on',!AUTO);
  $('#set-dark').classList.toggle('on',SETTINGS.theme!=='light');
  $('#set-light').classList.toggle('on',SETTINGS.theme==='light');
  $('#set-note').textContent=(AUTO
    ?'자동: 글자 수에 맞춰 문장이 이어지고, 선택지·엔딩에서 멈춥니다. 탭하면 즉시 넘어갑니다.'
    :'수동: 클릭·탭·스페이스·→·↓ 키로 넘깁니다. 모바일은 볼륨 아래 키도 됩니다(기기에 따라 다름).')
    +'\n\n바꾼 이름은 다음 문장부터 적용되고 이 브라우저에 저장됩니다.';
}
function modalOpen(){return !$('#settings-panel').hidden||!$('#resume-panel').hidden;}
function openSettings(){syncSettingsUI();buildNameFields();cancelTimer();$('#settings-panel').hidden=false;}
function closeSettings(){$('#settings-panel').hidden=true;
  if(AUTO&&nextBtn.style.display!=='none')scheduleNext(lastNode());}
function showResume(rec){
  const n=byId(rec.pos);
  const cm=n&&n.chapter?/^CH(\d+)$/.exec(n.chapter):null;
  const ch=cm?`제 ${+cm[1]}장`:(/^BR_/.test(n&&n.chapter||'')?'사이드 씬':(/^END_/.test(n&&n.chapter||'')?'엔딩':''));
  const chTitle=n&&n.chapter?(STORY.chapters.find(c=>c.id===n.chapter)||{}).title:null;
  const pct=n?Math.round(idx(n)/STORY.nodes.length*100):0;
  const ends=(SAVE_REC.endings||[]).map(e=>(STORY.endings.find(x=>x.id===e)||{}).label).filter(Boolean).join(' · ');
  $('#resume-info').innerHTML=
    `<b>${esc(ch)}${chTitle?' — '+esc(chTitle):''}</b>\n진행률 ${pct}% 지점까지 읽었습니다`+
    (ends?`\n\n읽은 엔딩: ${esc(ends)}`:'');
  $('#resume-panel').hidden=false;
}

function cancelTimer(){if(TIMER){clearTimeout(TIMER);TIMER=null;}}
function lastNode(){return HISTORY[HISTORY.length-1];}

/* ── 인물 이름 바꾸기 (독자 지정 → 표시 시 치환, 저장됨) ── */
const NAME_FIELDS=[
  {key:'권지혁',label:'주인공',also:['지혁']},
  {key:'친구',label:'어린 시절 친구',notAfter:'밥'},   // '밥친구'(앱 이름)는 제외
  {key:'어머니',label:'어머니'},
  {key:'아버지',label:'아버지'},
  {key:'누나',label:'누나'},
  {key:'태윤',label:'혼밥비서 팀원'},
  {key:'태우',label:'혼밥비서 팀원'},
  {key:'윤재목',label:'리추얼 부장님'},
  {key:'눈꽃',label:'채팅방 유저'},
  {key:'은우',label:'채팅방 유저'},
  {key:'민재',label:'채팅방 유저'},
];
// 아리아는 'ARIA = A Reader, In the Archives' 약자가 CH12 반전 소재라 고정
function applyNames(t){
  const nm=SETTINGS.names;if(!nm||!t)return t;
  for(const f of NAME_FIELDS){
    const v=nm[f.key];if(!v)continue;
    if(f.notAfter)t=t.replace(new RegExp(`(?<!${f.notAfter})${f.key}`,'g'),v);
    else t=t.split(f.key).join(v);
    for(const a of f.also||[])t=t.split(a).join(v);
  }
  return t;
}
function disp(t){return applyNames(t)}
function buildNameFields(){
  const g=$('#name-fields');g.innerHTML='';
  NAME_FIELDS.forEach(f=>{
    const d=document.createElement('div');d.className='name-field';
    const l=document.createElement('label');l.textContent=`${f.label} (${f.key})`;
    const i=document.createElement('input');i.placeholder=f.key;i.maxLength=12;
    i.value=(SETTINGS.names||{})[f.key]||'';
    i.oninput=()=>{SETTINGS.names=SETTINGS.names||{};const v=i.value.trim().slice(0,12);
      if(v)SETTINGS.names[f.key]=v;else delete SETTINGS.names[f.key];saveSettings();};
    d.append(l,i);g.appendChild(d);
  });
}

// 글자 수에 비례한 읽기 속도 — 짧은 줄은 빠르게, 긴 문단은 머무르게
function delayFor(n){
  const len=((n.text||n.display||n.prompt||'')+'').length;
  let d=420+len*26;
  if(n.type==='sys'||n.type==='status')d+=700;      // 상태창·시스템은 읽을 시간 더
  if(n.type==='scene')d=900;
  if(n.type==='img')d=2600;                          // 삽화는 머무르게
  return Math.min(2600,Math.max(480,d));
}
function scheduleNext(n){
  if(!AUTO||TIMER||!n)return;
  TIMER=setTimeout(()=>{TIMER=null;advance();},delayFor(n));
}
function updateProgress(){
  if(!STORY||!NODE)return;
  const pct=Math.max(0,Math.min(100,(idx(NODE)/STORY.nodes.length)*100));
  $('#progress-bar').style.width=pct+'%';
}
// 읽기 기록 — {pos:노드id, ch, endings:[읽은 엔딩], t} (구버전 문자열 세이브도 호환)
function loadSave(){
  try{const r=localStorage.getItem(SAVE_KEY);if(!r)return null;
    let o=null;try{o=JSON.parse(r)}catch(e){}
    SAVE_REC = (o&&typeof o==='object'&&o.pos) ? {pos:o.pos,endings:o.endings||[]} : {pos:typeof o==='string'?o:r,endings:[]};
    return SAVE_REC;
  }catch(e){return null}
}
function writeSave(){
  try{
    const n=lastNode();
    if(n){SAVE_REC.pos=n.id;if(n.chapter)SAVE_REC.ch=n.chapter;}
    SAVE_REC.t=Date.now();
    localStorage.setItem(SAVE_KEY,JSON.stringify(SAVE_REC));
  }catch(e){}
}
function clearSave(){SAVE_REC={pos:null,endings:[]};try{localStorage.removeItem(SAVE_KEY)}catch(e){}}
// 진행 위치만 리셋 — 읽은 엔딩 기록은 유지
function resetProgress(){SAVE_REC.pos=null;delete SAVE_REC.ch;writeSave();}
function byId(id){return STORY.nodes.find(n=>n.id===id)}
function idx(n){return STORY.nodes.indexOf(n)}
function currentStatusText(){
  let s=[...HISTORY].reverse().find(n=>n.type==='status');
  if(!s&&NODE){ // 새로고침 후에는 현재 위치 이전의 가장 최근 상태창을 찾는다
    const i=idx(NODE);
    for(let k=i;k>=0;k--){if(STORY.nodes[k].type==='status'){s=STORY.nodes[k];break}}
  }
  if(s)return disp(s.display);
  return '[ 상태창 ]\n\n이름: 권지혁\n레벨: ?\n칭호: 없음\n\n[스탯]\n설명력: ??  관찰력: ??  버팀: ??\n\n※ 아직 상태창이 열리지 않았습니다.\n   기록이 동기화되면 이 창에 수치가 채워집니다.';
}
function scroll(){requestAnimationFrame(()=>window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'}))}
function el(cls,html){const d=document.createElement('div');d.className=cls;d.innerHTML=html;chat.appendChild(d);scroll();return d}
function esc(t){const d=document.createElement('div');d.textContent=t;return d.innerHTML}

function showChapter(ch){
  if(CHAPTER_SEEN.has(ch))return;CHAPTER_SEEN.add(ch);
  const c=STORY.chapters.find(x=>x.id===ch);if(!c)return;
  el('chapter-banner',`제 ${+c.id.slice(2)}장 — ${esc(c.title)}`);
}

// 이전 상태창과 비교해 바뀐 줄·새 줄만 남기는 요약 렌더 (전체는 상단 ▦ 버튼)
function prevStatusText(n){
  for(let k=idx(n)-1;k>=0;k--)if(STORY.nodes[k].type==='status')return STORY.nodes[k].display;
  return null;
}
function statusCompactHTML(cur,prev){
  const pl=prev?new Set(prev.split('\n').map(s=>s.trim()).filter(Boolean)):new Set();
  const lines=[];let sec=null;
  for(const raw of cur.split('\n')){
    const t=raw.trim();if(!t)continue;
    if(/^\[.+\]$/.test(t)){sec={h:t,items:[]};lines.push(sec);continue}
    if(!pl.has(t)||t.includes('→'))(sec?sec.items:lines).push(t);
  }
  const kept=lines.filter(s=>s.items?s.items.length:true);
  let html=kept.length?kept.map(s=>s.h
    ?[`<span class="sec">${esc(s.h)}</span>`,...s.items.map(i=>`<span class="delta">${esc(disp(i))}</span>`)].join('<br>')
    :`<span class="delta">${esc(disp(s))}</span>`).join('<br>')
    :'<span class="delta">— 변동 없음 —</span>';
  return html+'<br><span class="mini">바뀐 부분만 표시 · 전체는 상단 ▦ 상태창</span>';
}

function render(n){
  HISTORY.push(n);writeSave();
  if(n.chapter)showChapter(n.chapter);
  // 떠 있는 삽화는 서서히 지우고, 사라진 뒤에 다음 문장을 연다
  if(CURRENT_ILLUS){
    const f=CURRENT_ILLUS;CURRENT_ILLUS=null;RENDER_LOCK=true;
    f.classList.add('out');
    setTimeout(()=>{f.remove();RENDER_LOCK=false;renderNode(n);},1150);
    return;
  }
  renderNode(n);
}

function renderNode(n){
  switch(n.type){
    case 'msg':{
      const cls=n.speaker==='나레이션'?'narration':(n.speaker===STORY.protagonist?'me':'other');
      const who=(n.speaker==='나레이션'||n.speaker===STORY.protagonist)?'':`<span class="who">${esc(disp(n.speaker))}</span>`;
      el('bubble '+cls,who+esc(disp(n.text)).replace(/\n/g,'<br>'));break}
    case 'aria':el('bubble aria','<span class="who">아리아</span>《'+esc(disp(n.text))+'》');break;
    case 'chatline':el('bubble chatline',`<span class="who">${esc(disp(n.speaker))}</span>`+esc(disp(n.text)));break;
    case 'sys':el('bubble sys',esc(disp(n.text)).replace(/\n/g,'<br>'));break;
    case 'status':el('bubble status',statusCompactHTML(n.display,prevStatusText(n)));break;
    case 'scene':el('scene-divider','* * *');break;
    case 'img':CURRENT_ILLUS=el('illus',`<img src="${esc(n.src)}" alt="${esc(disp(n.alt)||'삽화')}" loading="lazy">`+(n.alt?`<figcaption>${esc(disp(n.alt))}</figcaption>`:''));break;
    case 'choice':cancelTimer();nextBtn.style.display='none';renderChoice(n);return;
    case 'end':cancelTimer();nextBtn.style.display='none';renderEnd(n);return;
    case 'goto':advance();return;
  }
  nextBtn.style.display='block';
  nextBtn.classList.toggle('auto-hidden',AUTO);
  scheduleNext(n);
}

function renderChoice(n){
  nextBtn.style.display='none';choices.innerHTML='';
  if(n.prompt)el('bubble narration',esc(disp(n.prompt)));
  const hint=document.createElement('div');hint.className='choice-hint';hint.textContent='선택의 순간';
  choices.appendChild(hint);
  n.options.forEach((o,i)=>{
    const b=document.createElement('button');
    b.style.animationDelay=(i*110)+'ms';
    b.textContent=disp(o.label);
    b.onclick=()=>{
      choices.innerHTML='';el('bubble me',esc(disp(o.label)));
      NODE = o.gotoNode? byId(o.gotoNode) : null;
      if(NODE){advance();}
      else{el('bubble narration','이 길은 아직 닿지 못한다. 다른 선택이 문이 된다.');nextBtn.style.display='none';}
    };
    choices.appendChild(b);
  });
  scroll();
}

function renderEnd(n){
  nextBtn.style.display='none';
  const e=(STORY.endings||[]).find(x=>x.id===n.ending)||{label:'엔딩',desc:''};
  if(!SAVE_REC.endings.includes(n.ending)){SAVE_REC.endings.push(n.ending);writeSave();}
  const d=document.createElement('div');d.className='endcard';
  const rest=(STORY.endings||[]).filter(x=>x.id!==n.ending)
    .map(x=>esc(x.label)+(SAVE_REC.endings.includes(x.id)?' ✓':'')).join(' · ');
  d.innerHTML=`<div class="end-badge">ENDING</div><h2>${esc(e.label)}</h2><p>${esc(e.desc)}</p>`+
    `<div class="end-hint">이 이야기에는 다른 결말이 있습니다 — ${rest}</div>`;
  chat.appendChild(d);
  const r=document.createElement('button');r.className='next-btn end-restart';
  r.textContent='↺ 다른 길로 (처음부터)';
  r.onclick=()=>$('#btn-restart').click();
  chat.appendChild(r);scroll();
}

function advance(){
  if(!NODE||RENDER_LOCK)return;
  const n=NODE;
  NODE = n.next? byId(n.next) : (STORY.nodes[idx(n)+1]||null);
  updateProgress();
  render(n);
}
