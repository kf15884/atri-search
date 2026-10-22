'use strict';
const https=require('node:https'),dns=require('node:dns').promises;
const {publicAddress}=require('./provider');
const fault=code=>Object.assign(new Error(code),{code});
async function publicJson(url,{body,key,header='Authorization',signal,onSubmit,timeoutSec=20,beforeSubmit},deps={}){
 let u;try{u=new URL(url)}catch{throw fault('bad-endpoint')}
 if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443')throw fault('unsafe-endpoint');
 let addresses;try{addresses=await(deps.lookup||dns.lookup)(u.hostname,{all:true})}catch{throw fault('dns-failed')}
 if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw fault('unsafe-dns');
 if(beforeSubmit)await beforeSubmit();
 if(signal.aborted)throw fault('cancelled');
 const data=body==null?null:Buffer.from(JSON.stringify(body)),ip=addresses[0];
 return new Promise((resolve,reject)=>{
 let req,timer,done=false;
 const finish=(e,value)=>{if(done)return;done=true;clearTimeout(timer);signal.removeEventListener('abort',abort);e?reject(e):resolve(value)};
 const abort=()=>{req?.destroy();finish(fault('cancelled'))};
 try{
 req=(deps.request||https.request)(u,{method:data?'POST':'GET',agent:false,lookup:(_h,o,cb)=>o?.all?cb(null,[ip]):cb(null,ip.address,ip.family),headers:{Accept:'application/json',[header]:header==='Authorization'?'Bearer '+key:key,...(data?{'Content-Type':'application/json','Content-Length':data.length}:{})}},res=>{
 if(res.statusCode!==200){res.resume();return finish(fault(res.statusCode===429?'rate-limited':res.statusCode===401||res.statusCode===403?'provider-auth':'provider-http'))}
 const chunks=[];let n=0;res.on('data',b=>{n+=b.length;if(n>512*1024){req.destroy();finish(fault('response-too-large'))}else chunks.push(b)});res.on('error',()=>finish(fault('response-failed')));res.on('end',()=>{try{finish(null,JSON.parse(Buffer.concat(chunks)))}catch{finish(fault('bad-response'))}});
 });req.on('error',()=>finish(fault('network-failed')));signal.addEventListener('abort',abort,{once:true});timer=setTimeout(abort,timeoutSec*1000);if(signal.aborted)return abort();onSubmit?.();req.end(data);
 }catch(e){req?.destroy();finish(fault(e.code==='cancelled'?'cancelled':'submission-failed'))}
 });
}
module.exports={publicJson,fault};
