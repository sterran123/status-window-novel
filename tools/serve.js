// 로컬 미리보기 서버: node tools/serve.js → http://localhost:8642/web/
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');
const MIME={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.md':'text/plain; charset=utf-8'};
http.createServer((q,s)=>{
  let p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
  if(fs.existsSync(p)&&fs.statSync(p).isDirectory())p=path.join(p,'index.html');
  try{const d=fs.readFileSync(p);s.writeHead(200,{'Content-Type':(MIME[path.extname(p)]||'application/octet-stream')+'; charset=utf-8'});s.end(d)}
  catch(e){s.writeHead(404);s.end('not found')}
}).listen(8642,()=>console.log('http://localhost:8642/web/'));
