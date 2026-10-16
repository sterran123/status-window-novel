// 원고 검사: 경계표시·글자수·장수·목차일치·금지구·중복문단·실명
// 사용: node tools/check.js  (manuscript.md 대상)
const fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');
const src=fs.readFileSync(path.join(ROOT,'manuscript.md'),'utf8');

const start=(src.match(/\[\[ALEPH_BODY_START\]\]/g)||[]).length;
const end=(src.match(/\[\[ALEPH_BODY_END\]\]/g)||[]).length;
console.log(`경계표시 START x${start} / END x${end}`, start===1&&end===1?'✅':'❌');
const si=src.indexOf('[[ALEPH_BODY_START]]'), ei=src.indexOf('[[ALEPH_BODY_END]]');
console.log('순서 START<END:', si>-1&&ei>si?'✅':'❌');

const body=src.slice(si+20,ei);
const count=s=>[...s.normalize('NFC')].filter(c=>!/\s/.test(c)).length;
const bodyCount=count(body);
console.log(`본문 글자 수(공백 제외·NFC): ${bodyCount}`, bodyCount>=30000?'✅':'❌');

const chaps=[...body.matchAll(/^###\s+(제\s*\d+장|CH\d+)\.?\s*(.+)$/gm)];
console.log(`본문 장 수: ${chaps.length}`, chaps.length>=10?'✅':'❌');
chaps.forEach(c=>console.log('  ',c[0].replace(/^###\s*/,'')));

// 목차 일치
const tocBlock=(src.match(/## 목차\n([\s\S]*?)\n\n|\[\[/)||[''])[0];
const toc=[...src.matchAll(/^- 제\s*(\d+)장\s+(.+)$/gm)].map(m=>m[2].trim());
const bodyTitles=chaps.map(c=>c[2].trim());
const tocOk = toc.length===bodyTitles.length && toc.every((t,i)=>t===bodyTitles[i]);
console.log(`목차 장 수: ${toc.length}, 본문과 순서·제목 일치:`, tocOk?'✅':'❌');
if(!tocOk){toc.forEach((t,i)=>{if(t!==bodyTitles[i])console.log(`  불일치 ${i+1}: 목차="${t}" 본문="${bodyTitles[i]}"`)});}

// 금지 구문
const banned=[/TODO/i,/TBD/i,/FIXME/i,/자리\s*표시/,/내용\s*추가\s*예정/,/나중에\s*채움/];
for(const re of banned){const f=re.test(src);console.log(`금지구 ${re}:`, f?'❌ 발견':'✅ 없음');}

// 중복 문단 (빈 줄 구분, 정규화 후 40자 이상 동일 쌍)
const paras=body.split(/\n\s*\n/).map(p=>p.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'')).filter(p=>[...p].length>=40);
const seen={},dup=[];
paras.forEach((p,i)=>{if(seen[p]!==undefined)dup.push([seen[p],i]);seen[p]=i});
console.log(`정규화 40자↑ 문단: ${paras.length}개, 동일 쌍: ${dup.length}`, dup.length===0?'✅':'❌');
dup.forEach(([a,b])=>console.log('  중복 문단',a,b));

// 실명 검사 (본인 김민기 제외 타인 실명)
const real=['손준혁','주한태','최주용'];
for(const r of real)console.log(`실명 ${r}:`, src.includes(r)?'❌ 발견':'✅ 없음');
// 비밀값
const secrets=[/api[_-]?key\s*[:=]\s*[A-Za-z0-9_-]{16,}/i,/token\s*[:=]\s*[A-Za-z0-9_-]{16,}/i,/password/i,/AIza[0-9A-Za-z_-]{30,}/];
for(const re of secrets)console.log(`비밀값 패턴 ${re}:`, re.test(src)?'⚠ 확인 필요':'✅ 없음');
