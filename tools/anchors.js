// 각 챕터에서 키워드가 처음 등장하는 문단 번호(Pnnn)를 찾는다.
// 사용: node tools/anchors.js
const fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');

function paras(file){
  const lines=fs.readFileSync(file,'utf8').split(/\r?\n/);
  const blocks=[];let buf=[];
  for(const L of lines){
    const t=L.trim();
    if(/^#\s/.test(t))continue;
    if(!t){if(buf.length){blocks.push(buf.join('\n'));buf=[]}continue}
    if(/^:::/.test(t)||/^\[(SYS|STATUS|\/)?\]?/.test(t)&&/^\[(SYS|STATUS)\]|^\[\/(SYS|STATUS)\]/.test(t)){if(/^\[/.test(t)&&/\]$/.test(t)===false){buf.push(t);continue}}
    buf.push(t);
  }
  if(buf.length)blocks.push(buf.join('\n'));
  return blocks;
}

const targets=[
  ['CH01','지혁'],['CH01','노트북'],['CH01','매크로'],['CH01','공유기'],['CH01','오픈채팅'],
  ['CH02','시스템 메시지'],['CH02','아리아'],['CH02','상태창'],
  ['CH03','태윤'],['CH03','태우'],['CH03','혼밥비서'],['CH03','Blaze'],['CH03','honbab-ai'],
  ['CH04','permission-denied'],['CH04','Split-Brain'],['CH04','다섯 겹'],
  ['CH05','4,018'],['CH05','irispy'],['CH05','107'],
  ['CH06','redroid'],['CH06','너만오면됑'],['CH06','사투리'],
  ['CH07','09:30'],['CH07','방번호 101'],['CH07','824'],
  ['CH08','userId'],['CH08','-4001'],['CH08','dt_session'],['CH08','SHA-256'],
  ['CH09','Moim'],['CH09','-500'],['CH09','mitmproxy'],['CH09','439'],
  ['CH10','윤재목'],['CH10','리추얼'],['CH10','나도 돌아보자'],['CH10','SKT'],
  ['CH11','전직 퀘스트'],['CH11','네 갈래'],
  ['CH12','거울'],['CH12','AI_REPORT_LOG'],
];
const chDir=path.join(ROOT,'story','chapters');
const enDir=path.join(ROOT,'story','endings');
for(const [ch,kw] of targets){
  const f= ch==='CH12'? path.join(enDir,'end_true.md') : path.join(chDir,ch+'.md');
  if(!fs.existsSync(f)){console.log(ch,kw,'-> FILE MISSING');continue}
  const ps=paras(f);
  const idx=ps.findIndex(p=>p.includes(kw));
  console.log(`${ch}-P${String(idx+1).padStart(3,'0')}  ${kw}  ${idx<0?'‼NOT FOUND':''}`);
}
