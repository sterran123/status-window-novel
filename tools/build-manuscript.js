// story/story.json → manuscript.md 생성기
// 메인 루트(choice의 main:true 경로)를 따라 본문을 만들고,
// [[ALEPH_BODY_START]]/[[ALEPH_BODY_END]] 경계 표시, 목차, 대조표, 검수 섹션을 한 파일에 쓴다.
const fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');
const story=JSON.parse(fs.readFileSync(path.join(ROOT,'story','story.json'),'utf8'));

const byId={};story.nodes.forEach(n=>byId[n.id]=n);
function seq(n){return story.nodes[story.nodes.indexOf(n)+1]||null}

// 메인 루트 순회
const mainNodes=[];
let cur=byId[story.start];const seen=new Set();
while(cur&&!seen.has(cur.id)){
  seen.add(cur.id);mainNodes.push(cur);
  if(cur.type==='choice'){
    const m=cur.options.find(o=>o.main)||cur.options[0];
    cur=byId[m.goto];
  }else if(cur.type==='end'){break}
  else{cur=cur.next?byId[cur.next]:seq(cur)}
}

// 분기 노드(엔딩 요약용): main이 아닌 선택지
const branches=[];
(function walk(node,fromMain){
  while(node&&!seen.has(node.id)){
    if(!fromMain)branches.push(node);
    seen.add(node.id);
    if(node.type==='choice'){for(const o of node.options){walk(byId[o.goto],false)}return}
    if(node.type==='end')return;
    node=node.next?byId[node.next]:seq(node);
  }
})(null,true);

// 본문 텍스트화
function toText(n){
  switch(n.type){
    case 'msg':
      if(n.speaker==='나레이션')return n.text;
      if(n.speaker===story.protagonist)return n.text;
      return `${n.speaker}: "${n.text}"`;
    case 'sys':return n.text;
    case 'status':return n.display;
    case 'choice':return `[선택] ${n.prompt||''}`;
    case 'end':return '';
  }
}

let body='',curCh=null;const chCounts={};
for(const n of mainNodes){
  if(n.chapter&&n.chapter!==curCh){
    curCh=n.chapter;
    const c=story.chapters.find(x=>x.id===curCh);
    body+=`\n\n### ${c.id.replace('CH','제 ')}장  ${c.title}\n\n`;
  }
  const t=toText(n);if(!t)continue;
  body+=t+'\n\n';
  chCounts[curCh]=(chCounts[curCh]||0)+t.length;
}

// 글자 수(공백 제거, NFC)
const count=s=>[...s.normalize('NFC')].filter(c=>!/\s/.test(c)).length;
const bodyCount=count(body);

// 조립
const out=[];
out.push(`# ${story.title}\n`);
out.push(`— ${story.subtitle||'나의 이야기'} —\n`);
out.push(`주인공: ${story.protagonist}\n`);
out.push(`\n## 목차\n`);
story.chapters.forEach(c=>out.push(`- ${c.id.replace('CH','제 ')}장. ${c.title}`));
out.push(`\n[[ALEPH_BODY_START]]\n`);
out.push(body.trim());
out.push(`\n[[ALEPH_BODY_END]]\n`);
out.push(`\n> 본문 글자 수(공백 제외·NFC): ${bodyCount.toLocaleString()}자\n`);

// 엔딩 분기 요약
out.push(`\n---\n\n## 부록 A. 선택형 분기 안내\n`);
out.push(`이 소설은 웹 채팅형 뷰어에서 선택지에 따라 결말이 달라진다. 원고 본문은 메인 루트(트루 엔딩 방향)를 싣고, 나머지 분기는 요약으로 둔다.\n`);
story.endings.forEach(e=>out.push(`- **${e.label}**: ${e.desc||''}`));

fs.writeFileSync(path.join(ROOT,'manuscript.body.md'),out.join('\n'),'utf8');
console.log('본문 생성 완료');
console.log('본문 글자 수(공백 제외):',bodyCount);
Object.entries(chCounts).forEach(([k,v])=>console.log(`  ${k}: ${v}자`));
if(bodyCount<30000)console.log('⚠ 30,000자 미만 — 더 써야 함');
