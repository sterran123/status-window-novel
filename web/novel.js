// 채팅형 인터랙티브 소설 엔진 — story/story.json (tools/build.js 생성물)
let STORY=null, NODE=null, CHAPTER_SEEN=new Set(), HISTORY=[];
let AUTO=true, TIMER=null, CURRENT_ILLUS=null, RENDER_LOCK=false;
let SETTINGS={auto:true,theme:'dark',speed:1};
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
  $('#set-speed-fast').onclick=()=>setSpeed(0.75);
  $('#set-speed-normal').onclick=()=>setSpeed(1);
  $('#set-speed-slow').onclick=()=>setSpeed(1.4);
  $('#btn-status').onclick=()=>{ $('#status-body').textContent=currentStatusText(); $('#status-panel').hidden=false; };
  $('#btn-close-status').onclick=()=>$('#status-panel').hidden=true;
  $('#status-panel').addEventListener('click',e=>{if(e.target.id==='status-panel')$('#status-panel').hidden=true;});
  // 표지 → 이어보기(바로 재개)/시작·처음부터(읽기 설정 안내 후 시작) + 등장인물 패널
  $('#btn-cover-main').onclick=()=>{
    if(SAVE_REC.pos&&byId(SAVE_REC.pos)){
      $('#cover').hidden=true;NODE=byId(SAVE_REC.pos);updateProgress();advance();
    }else openIntro();
  };
  $('#btn-cover-fresh').onclick=()=>openIntro();
  // 읽기 설정 안내 — 모드/속도 고르고 시작
  const pick=(a,on)=>{a.forEach(b=>b.classList.toggle('on',b===on));};
  $('#intro-auto').onclick=()=>{pick([$('#intro-auto'),$('#intro-manual')],$('#intro-auto'));
    $('#intro-speed-row').hidden=false;};
  $('#intro-manual').onclick=()=>{pick([$('#intro-auto'),$('#intro-manual')],$('#intro-manual'));
    $('#intro-speed-row').hidden=true;};
  const spd=[$('#intro-slow'),$('#intro-normal'),$('#intro-fast')];
  spd.forEach(b=>b.onclick=()=>pick(spd,b));
  $('#btn-intro-start').onclick=()=>{
    setAuto($('#intro-auto').classList.contains('on'));
    setSpeed($('#intro-slow').classList.contains('on')?1.4
      :$('#intro-fast').classList.contains('on')?0.75:1);
    $('#intro-panel').hidden=true;$('#cover').hidden=true;$('#btn-restart').click();
  };
  $('#btn-cover-cast').onclick=()=>openCast();
  $('#btn-open-cast').onclick=()=>openCast();
  $('#btn-close-cast').onclick=()=>$('#cast-panel').hidden=true;
  $('#cast-panel').addEventListener('click',e=>{if(e.target.id==='cast-panel')$('#cast-panel').hidden=true;});
  $('#illus-light').addEventListener('click',e=>{if(e.target.id==='illus-light'||e.target.id==='illus-light-img'||e.target.tagName==='FIGURE')$('#illus-light').hidden=true;});
  // 본문을 누르면 기다림을 건너뛰고 바로 다음 문장 (일시정지 중에도 탭하면 넘어감)
  $('.chat-wrap').addEventListener('click',e=>{
    if(modalOpen()||e.target.closest('button,a,.illus'))return;
    if(TIMER){cancelTimer();advance();}
    else if(!AUTO&&nextBtn.style.display!=='none'){advance();}
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){if(!$('#settings-panel').hidden)closeSettings();$('#status-panel').hidden=true;$('#cast-panel').hidden=true;$('#illus-light').hidden=true;$('#intro-panel').hidden=true;return;}
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
  showCover(rec);
}

/* ── 설정 (로컬스토리지 저장) ── */
function loadSettings(){try{const s=JSON.parse(localStorage.getItem(SET_KEY));if(s)SETTINGS={...SETTINGS,...s}}catch(e){}AUTO=SETTINGS.auto!==false;}
function saveSettings(){try{localStorage.setItem(SET_KEY,JSON.stringify(SETTINGS))}catch(e){}}
function applyTheme(){document.documentElement.dataset.theme=SETTINGS.theme||'dark';}
function setTheme(t){SETTINGS.theme=t;saveSettings();applyTheme();syncSettingsUI();}
function setSpeed(v){SETTINGS.speed=v;saveSettings();syncSettingsUI();
  cancelTimer();if(AUTO&&!modalOpen()&&nextBtn.style.display!=='none')scheduleNext(lastNode());}
function setAuto(v){AUTO=!!v;SETTINGS.auto=AUTO;saveSettings();syncAutoUI();syncSettingsUI();cancelTimer();
  if(AUTO&&!modalOpen()&&nextBtn.style.display!=='none')scheduleNext(lastNode());}
function syncAutoUI(){$('#btn-auto').textContent=AUTO?'⏸ 자동':'▶ 수동';$('#btn-auto').classList.toggle('off',!AUTO);
  nextBtn.classList.toggle('auto-hidden',AUTO);}
function syncSettingsUI(){
  $('#set-auto').classList.toggle('on',AUTO);
  $('#set-manual').classList.toggle('on',!AUTO);
  $('#set-dark').classList.toggle('on',SETTINGS.theme!=='light');
  $('#set-light').classList.toggle('on',SETTINGS.theme==='light');
  $('#set-speed-fast').classList.toggle('on',SETTINGS.speed===0.75);
  $('#set-speed-normal').classList.toggle('on',!SETTINGS.speed||SETTINGS.speed===1);
  $('#set-speed-slow').classList.toggle('on',SETTINGS.speed===1.4);
  $('#set-note').textContent=AUTO
    ?'자동: 글자 수에 맞춰 문장이 이어지고, 선택지·엔딩에서 멈춥니다. 탭하면 즉시 넘어갑니다.'
    :'수동: 클릭·탭·스페이스·→·↓ 키로 넘깁니다. 모바일은 볼륨 아래 키도 됩니다(기기에 따라 다름).';
}
function modalOpen(){return !$('#settings-panel').hidden||!$('#cover').hidden||!$('#cast-panel').hidden||!$('#illus-light').hidden||!$('#intro-panel').hidden;}
function openSettings(){syncSettingsUI();cancelTimer();$('#settings-panel').hidden=false;}
function closeSettings(){$('#settings-panel').hidden=true;
  if(AUTO&&nextBtn.style.display!=='none')scheduleNext(lastNode());}
// 표지 — 이어보기 지점·읽은 엔딩을 버튼에 반영
function openIntro(){
  // 안내 화면은 저장된 현재 설정을 반영해 둔다
  const isAuto=SETTINGS.auto!==false;
  $('#intro-auto').classList.toggle('on',isAuto);
  $('#intro-manual').classList.toggle('on',!isAuto);
  $('#intro-speed-row').hidden=!isAuto;
  const s=SETTINGS.speed;
  $('#intro-slow').classList.toggle('on',s===1.4);
  $('#intro-normal').classList.toggle('on',!s||s===1);
  $('#intro-fast').classList.toggle('on',s===0.75);
  $('#intro-panel').hidden=false;
}
function showCover(rec){
  const n=rec&&rec.pos?byId(rec.pos):null;
  const main=$('#btn-cover-main'), fresh=$('#btn-cover-fresh');
  if(n){
    const cm=/^CH(\d+)$/.exec(n.chapter||'');
    const ch=cm?`제 ${+cm[1]}장`:(/^BR_/.test(n.chapter||'')?'사이드 씬':(/^END_/.test(n.chapter||'')?'엔딩':''));
    const pct=Math.round(idx(n)/STORY.nodes.length*100);
    main.textContent=`이어보기 — ${ch} · ${pct}%`;
    fresh.hidden=false;
  }else{main.textContent='이야기 시작';fresh.hidden=true;}
  const ends=(SAVE_REC.endings||[]).map(e=>(STORY.endings.find(x=>x.id===e)||{}).label).filter(Boolean);
  $('.cover-foot').textContent=ends.length
    ?`읽은 엔딩: ${ends.join(' · ')} — 다른 길도 남아 있습니다`
    :'선택지마다 결말이 갈립니다 · 읽던 자리와 설정은 자동 저장됩니다';
  $('#cover').hidden=false;
}

// 등장인물 — 지정한 이름(disp)을 반영해 보여 준다
const CAST=[
  {key:'권지혁',img:'img/jihyeok.jpg',desc:'이 이야기의 주인공. 말보다 눈이 먼저인 사람 — 어느 새벽, 상태창이 떴다.'},
  {key:'아리아',desc:'《 》로 말하는 안내자. 시스템 너머의 존재.'},
  {key:'아버지',desc:'말없이 낡은 노트북을 건넨 사람.'},
  {key:'어머니',desc:'잔소리로 걱정을 표현하는 사람.'},
  {key:'누나',desc:'건강검진 링크를 보내는 사람.'},
  {key:'친구',desc:'"이거 반복해야 하는데 좀 도와줘" — 첫 부탁을 가져온 어린 시절 친구.'},
  {key:'태윤',desc:'혼밥비서 팀 — 요리·식비 담당.'},
  {key:'태우',desc:'혼밥비서 팀 — 냉장고·수다방 담당.'},
  {key:'윤재목',desc:'리추얼 과정 부장님. "자기 이야기를 각색해 봐요."'},
  {key:'눈꽃',desc:'지혁의 채팅방 사람들 — 눈꽃·은우·민재. 첫 사용자이자 증인.'},
];
function openCast(){
  const g=$('#cast-list');g.innerHTML='';
  CAST.forEach(c=>{
    const d=document.createElement('div');d.className='cast-item';
    d.innerHTML=(c.img?`<img src="${esc(c.img)}" alt="">`:'<span class="cast-dot"></span>')
      +`<div><div class="nm">${esc(disp(c.key))}</div><div class="ds">${esc(disp(c.desc))}</div></div>`;
    g.appendChild(d);
  });
  cancelTimer();$('#cast-panel').hidden=false;
}

function cancelTimer(){if(TIMER){clearTimeout(TIMER);TIMER=null;}}
function lastNode(){return HISTORY[HISTORY.length-1];}

function disp(t){return t}

// 문장마다 다른 읽기 시간 — 길이·종류·문장부호를 반영, 설정의 읽기 속도로 조절
function delayFor(n){
  if(n.type==='scene')return 900;
  if(n.type==='img')return 2600;
  const t=(n.text||n.display||n.prompt||'')+'';
  const rate=n.type==='msg'?(n.speaker==='나레이션'?28:22)
    :n.type==='chatline'?20
    :n.type==='aria'?30
    :n.type==='choice'?30
    :26;                                            // sys·status 포함
  let d=420+t.length*rate;
  const enders=(t.match(/[.!?…—]/g)||[]).length, mids=(t.match(/[,·]/g)||[]).length;
  d+=Math.min(1400,enders*180+mids*70);             // 문장부호마다 숨 고르기
  if(n.type==='sys'||n.type==='status')d+=600;
  d/=(SETTINGS.speed||1);
  return Math.min(9000,Math.max(480,d));
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
function el(cls,html,view){const d=document.createElement('div');d.className=cls;d.innerHTML=html;chat.appendChild(d);
  if(view==='center')requestAnimationFrame(()=>d.scrollIntoView({block:'center',behavior:'smooth'}));
  else scroll();
  return d}
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
  // 떠 있는 삽화는 서서히 지우고, 자리에는 작은 썸네일 이정표를 남긴다
  if(CURRENT_ILLUS){
    const f=CURRENT_ILLUS;CURRENT_ILLUS=null;RENDER_LOCK=true;
    f.classList.add('out');
    setTimeout(()=>{
      f.classList.remove('out');f.classList.add('mini');
      f.onclick=()=>openIllus(f);
      RENDER_LOCK=false;renderNode(n);
    },1150);
    return;
  }
  renderNode(n);
}

// 미니 썸네일을 누르면 삽화를 크게 다시 보여 준다
function openIllus(f){
  const img=f.querySelector('img'),cap=f.querySelector('figcaption');
  $('#illus-light-img').src=img.src;
  $('#illus-light-img').alt=img.alt;
  $('#illus-light-cap').textContent=cap?cap.textContent:'';
  cancelTimer();$('#illus-light').hidden=false;
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
    case 'img':{
      const f=el('illus'+(n.variant?' '+esc(n.variant):''),`<img src="${esc(n.src)}" alt="${esc(disp(n.alt)||'삽화')}" loading="lazy">`+(n.alt?`<figcaption>${esc(disp(n.alt))}</figcaption>`:''),'center');
      const im=f.querySelector('img');
      // 로드 후 실제 높이로 한 번 더 중앙 정렬 — 삽화가 통째로 보이게
      if(im){const rc=()=>f.scrollIntoView({block:'center',behavior:'smooth'});
        im.addEventListener('load',rc,{once:true});setTimeout(rc,120);}
      CURRENT_ILLUS=f;break}
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
