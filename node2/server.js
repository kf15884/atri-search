'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),net=require('node:net');
const {BrowserRunner}=require('./browser'),L=require('./shared/logic');
const version='0.2.0-beta.1',fault=code=>Object.assign(new Error(code),{code});
function validate(c){
 const oct=String(c.listenAddress||'').split('.').map(Number),privateIP=net.isIP(c.listenAddress)===4&&(oct[0]===10||oct[0]===172&&oct[1]>=16&&oct[1]<=31||oct[0]===192&&oct[1]===168);
 if(!privateIP||!Number.isSafeInteger(c.port)||c.port<1024||c.port>65535||typeof c.token!=='string'||c.token.length<32||/请填写|CHANGE|REPLACE/i.test(c.token)||!path.isAbsolute(c.dataDir||'')||!path.isAbsolute(c.chromiumPath||''))throw fault('invalid-private-config');
 return c;
}
async function startService(c,deps={}){
 if(!deps.skipValidate)validate(c);
 fs.mkdirSync(c.dataDir,{recursive:true,mode:0o700});fs.chmodSync(c.dataDir,0o700);
 const idsFile=path.join(c.dataDir,'receipts.json');let ids=[];
 try{ids=JSON.parse(fs.readFileSync(idsFile));if(!Array.isArray(ids)||ids.some(x=>!/^[a-f0-9]{32,64}$/.test(x)))throw Error();fs.chmodSync(idsFile,0o600)}catch(e){if(e.code!=='ENOENT')throw fault('invalid-receipts')}
 function receipt(id){ids.push(id);ids=ids.slice(-256);const tmp=idsFile+'.tmp',fd=fs.openSync(tmp,'w',0o600);try{fs.fchmodSync(fd,0o600);fs.writeFileSync(fd,JSON.stringify(ids));fs.fsyncSync(fd)}finally{fs.closeSync(fd)}fs.renameSync(tmp,idsFile)}
 const runner=deps.runner||new BrowserRunner(c),jobs=new Map();let active=null,closing=false;
 const snapshot=j=>({id:j.id,status:j.status,code:j.code||'',attempts:j.attempts,results:j.results||[]});
 function cancel(j){if(['queued','running'].includes(j.status)){j.status='cancelled';j.controller?.abort()}}
 async function pump(){
 if(active||closing)return;const j=[...jobs.values()].find(j=>j.status==='queued');if(!j)return;
 if(Date.now()>j.leaseUntil){j.status='cancelled';return void setImmediate(pump)}
 active=j;j.status='running';j.controller=new AbortController();const timer=setTimeout(()=>cancel(j),Math.max(1,j.leaseUntil-Date.now()));
 try{const result=await runner.run(j,{signal:j.controller.signal,onAttempt:a=>{if(j.status==='running'&&a.query===j.query&&j.attempts.length===0)j.attempts.push(a)}});if(j.status==='running'&&!j.controller.signal.aborted){j.results=result;j.status='ready'}}catch(e){if(j.status==='running'){j.status='failed';j.code=['policy-blocked','browser-challenge'].includes(e.code)?e.code:'browser-failed'}}finally{clearTimeout(timer);active=null;setImmediate(pump)}
 }
 const reply=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
 const expected=crypto.createHash('sha256').update(c.token).digest();
 const server=http.createServer(async(req,res)=>{
 const given=crypto.createHash('sha256').update(String(req.headers.authorization||'').replace(/^Bearer /,'')).digest();
 if(!crypto.timingSafeEqual(expected,given))return reply(res,401,{code:'unauthorized'});
 const url=new URL(req.url,'http://localhost');
 try{
 if(req.method==='GET'&&url.pathname==='/v1/health')return reply(res,200,{version,capabilities:['search','read'],searchEngine:'bing',active:!!active,queued:[...jobs.values()].filter(j=>j.status==='queued').length,browserInstalled:fs.existsSync(c.chromiumPath),accountActions:false});
 const match=/^\/v1\/tasks\/([a-f0-9]{32,64})$/.exec(url.pathname);
 if(match){const j=jobs.get(match[1]);if(!j)return reply(res,404,{code:'task-not-found'});if(req.method==='DELETE'){cancel(j);j.results=[];return reply(res,200,snapshot(j))}if(req.method==='GET')return reply(res,200,snapshot(j));return reply(res,405,{code:'method-not-allowed'})}
 if(req.method!=='POST'||url.pathname!=='/v1/tasks')return reply(res,404,{code:'not-found'});
 let size=0,chunks=[];for await(const b of req){size+=b.length;if(size>8192)return reply(res,413,{code:'request-too-large'});chunks.push(b)}
 let body;try{body=JSON.parse(Buffer.concat(chunks))}catch{return reply(res,400,{code:'bad-json'})}
 if(!/^[a-f0-9]{32,64}$/.test(body.id||'')||!['search','read'].includes(body.op))return reply(res,403,{code:'policy-blocked'});
 const old=jobs.get(body.id);if(old)return reply(res,200,snapshot(old));if(ids.includes(body.id))return reply(res,409,{code:'unknown-no-replay'});
 const now=Date.now();if(!Number.isFinite(body.leaseUntil)||body.leaseUntil<=now||body.leaseUntil>now+120000)return reply(res,400,{code:'invalid-lease'});
 const query=body.op==='search'?L.query(body.query,{blockedTerms:c.blockedTerms||[]}):'',urlValue=body.op==='read'?L.safeUrl(body.url):'';
 if(body.op==='search'&&!query||body.op==='read'&&!urlValue)return reply(res,403,{code:'policy-blocked'});
 if([...jobs.values()].filter(j=>['queued','running'].includes(j.status)).length>=2)return reply(res,429,{code:'browser-busy'});
 for(const[id,j]of jobs)if(now-j.at>10*60000&&!['queued','running'].includes(j.status))jobs.delete(id);
 while(jobs.size>=8){const old=[...jobs.values()].find(j=>!['queued','running'].includes(j.status));if(!old)return reply(res,429,{code:'browser-busy'});jobs.delete(old.id)}
 receipt(body.id);const j={id:body.id,op:body.op,query,url:urlValue,limit:Math.max(1,Math.min(5,Number(body.limit)||3)),leaseUntil:body.leaseUntil,at:now,status:'queued',attempts:[],results:[]};jobs.set(j.id,j);reply(res,202,snapshot(j));setImmediate(pump);
 }catch{reply(res,500,{code:'local-failed'})}
 });
 server.headersTimeout=10000;server.requestTimeout=15000;await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(c.port,c.listenAddress,resolve)});
 return{server,jobs,close:async()=>{closing=true;for(const j of jobs.values())cancel(j);server.closeAllConnections();await new Promise(r=>server.close(r));await runner.close?.()}};
}
if(require.main===module){
 (async()=>{const config=JSON.parse(fs.readFileSync(process.env.ATRI_BROWSER_CONFIG||'/etc/atri-browser/config.json','utf8'));validate(config);if(process.argv.includes('--check')){console.log('配置结构有效；未证明浏览器/网络可用');return}const service=await startService(config);console.log('atri-browser '+version+' started (private service)');let stopping=false;for(const event of ['SIGINT','SIGTERM'])process.on(event,()=>{if(stopping)return;stopping=true;service.close().finally(()=>process.exit(0))})})().catch(()=>{console.error('atri-browser startup failed; check private configuration, permissions and dependencies');process.exit(1)});
}
module.exports={startService,validate,version};
