// 채팅형 인터랙티브 소설 엔진 — story/story.json (tools/build.js 생성물)
let STORY=null, NODE=null, CHAPTER_SEEN=new Set(), HISTORY=[];
const $=s=>document.querySelector(s);
const chat=$('#chat'), choices=$('#choices'), nextBtn=$('#btn-next');
const SAVE_KEY='novel-save-v1';

init();
async function init(){
  STORY=await (await fetch('../story/story.json')).json();
  document.title=`${STORY.title} — 채팅형 소설`;
  $('.brand').textContent=STORY.title;
  const saved=loadSave();
  NODE = saved ? byId(saved) : byId(STORY.start);
  nextBtn.onclick=advance;
  $('#btn-restart').onclick=()=>{localStorage.removeItem(SAVE_KEY);chat.innerHTML='';CHAPTER_SEEN.clear();HISTORY=[];NODE=byId(STORY.start);advance();};
  $('#btn-status').onclick=()=>{ $('#status-body').textContent=currentStatusText(); $('#status-panel').hidden=false; };
  $('#btn-close-status').onclick=()=>$('#status-panel').hidden=true;
  document.addEventListener('keydown',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();if(nextBtn.style.display!=='none')advance();}});
  advance();
}
function loadSave(){try{return localStorage.getItem(SAVE_KEY)}catch(e){return null}}
function save(id){try{localStorage.setItem(SAVE_KEY,id)}catch(e){}}
function byId(id){return STORY.nodes.find(n=>n.id===id)}
function idx(n){return STORY.nodes.indexOf(n)}
function currentStatusText(){
  const s=[...HISTORY].reverse().find(n=>n.type==='status');
  return s? s.display : '아직 상태창이 열리지 않았다.';
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
    case 'choice':renderChoice(n);return;
    case 'end':renderEnd(n);return;
    case 'goto':advance();return;
  }
  nextBtn.style.display='block';
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
  d.innerHTML=`<div class="end-badge">ENDING</div><h2>${esc(e.label)}</h2><p>${esc(e.desc)}</p>`;
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
  render(n);
}
