// 채팅형 인터랙티브 소설 엔진 — story/story.json (tools/build.js 생성물)
let STORY=null, NODE=null, CHAPTER_SEEN=new Set(), HISTORY=[];
let AUTO=true, TIMER=null;
const $=s=>document.querySelector(s);
const chat=$('#chat'), choices=$('#choices'), nextBtn=$('#btn-next');
const SAVE_KEY='novel-save-v1';

init();
async function init(){
  STORY=await (await fetch('../story/story.json')).json();
  document.title=`${STORY.title} — 채팅형 소설`;
  $('.brand').firstChild.textContent=STORY.title;
  const saved=loadSave();
  NODE = saved ? byId(saved) : byId(STORY.start);
  nextBtn.onclick=()=>{cancelTimer();advance();};
  $('#btn-restart').onclick=()=>{localStorage.removeItem(SAVE_KEY);chat.innerHTML='';CHAPTER_SEEN.clear();HISTORY=[];NODE=byId(STORY.start);updateProgress();advance();};
  $('#btn-auto').onclick=toggleAuto;
  $('#btn-status').onclick=()=>{ $('#status-body').textContent=currentStatusText(); $('#status-panel').hidden=false; };
  $('#btn-close-status').onclick=()=>$('#status-panel').hidden=true;
  $('#status-panel').addEventListener('click',e=>{if(e.target.id==='status-panel')$('#status-panel').hidden=true;});
  // 본문을 누르면 기다림을 건너뛰고 바로 다음 문장 (일시정지 중에도 탭하면 넘어감)
  $('.chat-wrap').addEventListener('click',e=>{
    if(e.target.closest('button,a'))return;
    if(TIMER){cancelTimer();advance();}
    else if(!AUTO&&nextBtn.style.display!=='none'){advance();}
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){$('#status-panel').hidden=true;return;}
    if(e.key===' '||e.key==='Enter'){e.preventDefault();cancelTimer();if(nextBtn.style.display!=='none')advance();}
  });
  updateProgress();
  advance();
}

function toggleAuto(){
  AUTO=!AUTO;
  $('#btn-auto').textContent=AUTO?'⏸ 자동':'▶ 재생';
  $('#btn-auto').classList.toggle('off',!AUTO);
  cancelTimer();
  if(AUTO && nextBtn.style.display!=='none') scheduleNext(lastNode());
}
function cancelTimer(){if(TIMER){clearTimeout(TIMER);TIMER=null;}}
function lastNode(){return HISTORY[HISTORY.length-1];}

// 글자 수에 비례한 읽기 속도 — 짧은 줄은 빠르게, 긴 문단은 머무르게
function delayFor(n){
  const len=((n.text||n.display||n.prompt||'')+'').length;
  let d=420+len*26;
  if(n.type==='sys'||n.type==='status')d+=700;      // 상태창·시스템은 읽을 시간 더
  if(n.type==='scene'||n.type==='chapter')d=900;
  return Math.min(2600,Math.max(480,d));
}
function scheduleNext(n){
  if(!AUTO||TIMER)return;
  TIMER=setTimeout(()=>{TIMER=null;advance();},delayFor(n));
}
function updateProgress(){
  if(!STORY||!NODE)return;
  const pct=Math.max(0,Math.min(100,(idx(NODE)/STORY.nodes.length)*100));
  $('#progress-bar').style.width=pct+'%';
}
function loadSave(){try{return localStorage.getItem(SAVE_KEY)}catch(e){return null}}
function save(id){try{localStorage.setItem(SAVE_KEY,id)}catch(e){}}
function byId(id){return STORY.nodes.find(n=>n.id===id)}
function idx(n){return STORY.nodes.indexOf(n)}
function currentStatusText(){
  let s=[...HISTORY].reverse().find(n=>n.type==='status');
  if(!s&&NODE){ // 새로고침 후에는 현재 위치 이전의 가장 최근 상태창을 찾는다
    const i=idx(NODE);
    for(let k=i;k>=0;k--){if(STORY.nodes[k].type==='status'){s=STORY.nodes[k];break}}
  }
  if(s)return s.display;
  return '[ 상태창 ]\n\n이름: 권지혁\n레벨: ?\n칭호: 없음\n\n[스탯]\n설명력: ??  관찰력: ??  버팀: ??\n\n※ 아직 상태창이 열리지 않았습니다.\n   기록이 동기화되면 이 창에 수치가 채워집니다.';
}
function scroll(){requestAnimationFrame(()=>window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'}))}
function el(cls,html){const d=document.createElement('div');d.className=cls;d.innerHTML=html;chat.appendChild(d);scroll();return d}
function esc(t){const d=document.createElement('div');d.textContent=t;return d.innerHTML}

function showChapter(ch){
  if(CHAPTER_SEEN.has(ch))return;CHAPTER_SEEN.add(ch);
  const c=STORY.chapters.find(x=>x.id===ch);if(!c)return;
  el('chapter-banner',`${c.id.replace('CH','제 ')}장 — ${esc(c.title)}`);
}

function render(n){
  HISTORY.push(n);save(n.id);
  if(n.chapter)showChapter(n.chapter);
  switch(n.type){
    case 'msg':{
      const cls=n.speaker==='나레이션'?'narration':(n.speaker===STORY.protagonist?'me':'other');
      const who=(n.speaker==='나레이션'||n.speaker===STORY.protagonist)?'':`<span class="who">${esc(n.speaker)}</span>`;
      el('bubble '+cls,who+esc(n.text).replace(/\n/g,'<br>'));break}
    case 'aria':el('bubble aria','<span class="who">아리아</span>《'+esc(n.text)+'》');break;
    case 'chatline':el('bubble chatline',`<span class="who">${esc(n.speaker)}</span>`+esc(n.text));break;
    case 'sys':el('bubble sys',esc(n.text).replace(/\n/g,'<br>'));break;
    case 'status':el('bubble status',esc(n.display).replace(/\n/g,'<br>'));break;
    case 'scene':el('scene-divider','* * *');break;
    case 'choice':cancelTimer();nextBtn.style.display='none';renderChoice(n);return;
    case 'end':cancelTimer();nextBtn.style.display='none';renderEnd(n);return;
    case 'goto':advance();return;
  }
  nextBtn.style.display='block';
  scheduleNext(n);
}

function renderChoice(n){
  nextBtn.style.display='none';choices.innerHTML='';
  if(n.prompt)el('bubble narration',esc(n.prompt));
  n.options.forEach(o=>{
    const b=document.createElement('button');
    b.innerHTML=(o.main?'<span class="tag">본선</span>':'')+esc(o.label);
    b.onclick=()=>{
      choices.innerHTML='';el('bubble me',esc(o.label));
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
  const d=document.createElement('div');d.className='endcard';
  const rest=(STORY.endings||[]).filter(x=>x.id!==n.ending).map(x=>esc(x.label)).join(' · ');
  d.innerHTML=`<div class="end-badge">ENDING</div><h2>${esc(e.label)}</h2><p>${esc(e.desc)}</p>`+
    `<div class="end-hint">이 이야기에는 다른 결말이 있습니다 — ${rest}</div>`;
  chat.appendChild(d);
  const r=document.createElement('button');r.className='next-btn end-restart';
  r.textContent='↺ 다른 길로 (처음부터)';
  r.onclick=()=>$('#btn-restart').click();
  chat.appendChild(r);scroll();
}

function advance(){
  if(!NODE)return;
  const n=NODE;
  NODE = n.next? byId(n.next) : (STORY.nodes[idx(n)+1]||null);
  updateProgress();
  render(n);
}
