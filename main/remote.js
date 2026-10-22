'use strict';
const http=require('node:http'),https=require('node:https'),crypto=require('node:crypto'),net=require('node:net');
const L=require('./logic'),{BraveProvider}=require('./provider'),{publicJson,fault}=require('./network');
const safeCode=e=>['cancelled','deferred','policy-blocked','browser-busy','browser-empty','browser-failed','browser-timeout','browser-unavailable','browser-unconfigured','provider-auth','rate-limited','unsafe-dns','dns-failed','provider-http','bad-response','not-configured'].includes(e?.code)?e.code:'failed';
function rpc(base,token,path,{method='GET',body,signal,timeoutSec=5}={}){
 let u;try{u=new URL(base);const a=u.hostname.split('.').map(Number),privateHost=u.hostname==='localhost'||net.isIP(u.hostname)===4&&(a[0]===10||a[0]===172&&a[1]>=16&&a[1]<=31||a[0]===192&&a[1]===168);if(!privateHost||!['https:','http:'].includes(u.protocol)||u.username||u.password||u.search||u.hash||!token)throw Error();u.pathname=path}catch{return Promise.reject(fault('browser-unconfigured'))}
 return new Promise((resolve,reject)=>{
 let req,timer,done=false;const finish=(e,v)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);e?reject(e):resolve(v)};
 const abort=()=>{req?.destroy();finish(fault('cancelled'))};
 try{const b=body?Buffer.from(JSON.stringify(body)):null;req=(u.protocol==='https:'?https:http).request(u,{method,headers:{Authorization:'Bearer '+token,Accept:'application/json',...(b?{'Content-Type':'application/json','Content-Length':b.length}:{})}},res=>{
 const chunks=[];let n=0;res.on('data',b=>{n+=b.length;if(n>256*1024){req.destroy();finish(fault('bad-response'))}else chunks.push(b)});res.on('error',()=>finish(fault('browser-unavailable')));res.on('end',()=>{let v;try{v=JSON.parse(Buffer.concat(chunks))}catch{return finish(fault('bad-response'))}if(res.statusCode>=400)return finish(fault(['policy-blocked','browser-busy'].includes(v.code)?v.code:'browser-unavailable'));finish(null,v)});
 });req.on('error',()=>finish(fault('browser-unavailable')));signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>{req.destroy();finish(fault('browser-timeout'))},timeoutSec*1000);if(signal?.aborted)return abort();req.end(b)}catch{finish(fault('browser-unavailable'))}
 });
}
function normalizeResults(data,limit){
 if(!Array.isArray(data?.results))throw fault('bad-response');
 return L.parseResults({web:{results:data.results.map(r=>({title:r.title,url:r.url,description:r.snippet||r.excerpt||r.summary||''}))}},limit);
}
class RemoteProvider{
 constructor(c,deps={}){this.c=c;this.rpc=deps.rpc||rpc;this.publicJson=deps.publicJson||publicJson;this.sleep=deps.sleep||((ms,signal)=>new Promise((res,rej)=>{if(signal.aborted)return rej(fault('cancelled'));const t=setTimeout(()=>{signal.removeEventListener('abort',abort);res()},ms);const abort=()=>{clearTimeout(t);rej(fault('cancelled'))};signal.addEventListener('abort',abort,{once:true})}));}
 configured(){return !!(this.c.browserUrl&&this.c.browserToken)}
 fallbackConfigured(){return this.c.fallbackType!=='disabled'&&!!(this.c.fallbackKey||this.c.apiKey)}
 health(){return this.rpc(this.c.browserUrl,this.c.browserToken,'/v1/health',{timeoutSec:5})}
 async browser(query,o){
 if(!this.c.browserUrl||!this.c.browserToken)throw fault('browser-unconfigured');
 const id=o.taskId||crypto.randomBytes(24).toString('hex'),controller=new AbortController(),abort=()=>controller.abort();o.signal.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,this.c.browserTimeoutSec*1000);let created=false;
 try{
 await o.beforeSubmit?.();if(o.signal.aborted)throw fault('cancelled');o.onDispatch?.();
 let data=await this.rpc(this.c.browserUrl,this.c.browserToken,'/v1/tasks',{method:'POST',body:{id,op:'search',query,limit:this.c.resultLimit,leaseUntil:Date.now()+this.c.browserTimeoutSec*1000},signal:controller.signal,timeoutSec:5});created=true;
 const record=d=>{for(const a of d.attempts||[])if(a.query===query&&typeof a.id==='string')o.onSubmit('browser:'+a.id)};
 for(;;){record(data);if(data.status==='ready')return normalizeResults({results:data.results},this.c.resultLimit);if(data.status==='failed'||data.status==='cancelled')throw fault(data.code==='policy-blocked'?'policy-blocked':'browser-failed');await this.sleep(250,controller.signal);data=await this.rpc(this.c.browserUrl,this.c.browserToken,'/v1/tasks/'+id,{signal:controller.signal,timeoutSec:5})}
 }catch(e){if(o.signal.aborted)throw fault('cancelled');if(controller.signal.aborted)throw fault('browser-timeout');throw e}
 finally{clearTimeout(timer);o.signal.removeEventListener('abort',abort);if(created)void this.rpc(this.c.browserUrl,this.c.browserToken,'/v1/tasks/'+id,{method:'DELETE',timeoutSec:2}).catch(()=>{})}
 }
 async fallback(query,o){
 if(!this.fallbackConfigured())throw fault('not-configured');await o.beforeSubmit?.();if(o.signal.aborted)throw fault('cancelled');o.onDispatch?.();
 const key=this.c.fallbackKey||this.c.apiKey,type=this.c.fallbackType;
 if(type==='brave'&&!this.c.fallbackUrl)return new BraveProvider({...this.c,apiKey:key,timeoutSec:this.c.fallbackTimeoutSec}).search(query,{...o,onSubmit:()=>o.onSubmit('api:single')});
 let url=this.c.fallbackUrl||'https://api.deepseek.com/v1/tools/search',body={query,count:this.c.resultLimit,need_content:false};
 if(type==='brave'){const u=new URL(url);u.searchParams.set('q',query);u.searchParams.set('count',String(this.c.resultLimit));u.searchParams.set('safesearch','strict');url=u.href;body=null}
 if(type==='custom-json'&&!this.c.fallbackUrl)throw fault('not-configured');
 const data=await this.publicJson(url,{body,key,header:type==='brave'?'X-Subscription-Token':'Authorization',signal:o.signal,beforeSubmit:o.beforeSubmit,timeoutSec:this.c.fallbackTimeoutSec,onSubmit:()=>o.onSubmit('api:single')});
 return type==='brave'?L.parseResults(data,this.c.resultLimit):normalizeResults(data,this.c.resultLimit);
 }
 async search(query,o){
 const traces=[];
 try{const rows=await this.browser(query,o);if(rows.length)return{rows,source:'browser',traces};traces.push({stage:'browser',code:'browser-empty'})}catch(e){if(['cancelled','deferred','policy-blocked'].includes(e.code))throw e;traces.push({stage:'browser',code:safeCode(e)})}
 if(o.signal.aborted)throw fault('cancelled');
 try{const rows=await this.fallback(query,o);if(rows.length)return{rows,source:'api',traces};traces.push({stage:'api',code:'empty'})}catch(e){if(['cancelled','deferred','policy-blocked'].includes(e.code))throw e;traces.push({stage:'api',code:safeCode(e)})}
 return{rows:[],source:'none',traces};
 }
}
module.exports={RemoteProvider,rpc,normalizeResults};
