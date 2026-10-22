'use strict';
const http=require('node:http'),net=require('node:net'),dns=require('node:dns').promises;
const {publicAddress}=require('./shared/provider');
async function target(host,port,lookup=dns.lookup){
 if(!host||net.isIP(host.replace(/[\[\]]/g,''))||!host.includes('.')||/(?:^|\.)(?:localhost|local|internal|lan|test|invalid)$/i.test(host)||![80,443].includes(port))throw Error('policy-blocked');
 const rows=await lookup(host,{all:true});if(!rows.length||rows.some(r=>!publicAddress(r.address)))throw Error('policy-blocked');return rows[0];
}
async function startGuardProxy(deps={}){
 const sockets=new Set();const track=s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));return s};
 const server=http.createServer(async(req,res)=>{
 try{
 const u=new URL(req.url);if(u.protocol!=='http:'||u.username||u.password||req.method!=='GET'&&req.method!=='HEAD')throw Error('policy-blocked');
 const ip=await target(u.hostname,Number(u.port)||80,deps.lookup);if(res.destroyed)return;
 const headers={...req.headers,host:u.host};for(const k of ['proxy-authorization','proxy-connection','authorization','cookie'])delete headers[k];
 const upstream=http.request({hostname:ip.address,family:ip.family,port:80,path:u.pathname+u.search,method:req.method,headers,timeout:15000},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)});
 upstream.on('socket',track);upstream.on('timeout',()=>upstream.destroy());upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end()});req.on('aborted',()=>upstream.destroy());res.on('close',()=>upstream.destroy());upstream.end();
 }catch{res.writeHead(403);res.end('blocked')}
 });
 server.on('connection',track);
 server.on('connect',async(req,client,head)=>{
 try{
 const u=new URL('https://'+req.url);if(u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('policy-blocked');const port=Number(u.port)||443,ip=await target(u.hostname,port,deps.lookup);
 if(port!==443)throw Error('policy-blocked');if(client.destroyed)return;
 const remote=track((deps.connect||net.connect)({host:ip.address,port,family:ip.family}));remote.setTimeout(30000,()=>remote.destroy());
 remote.once('connect',()=>{if(client.destroyed)return remote.destroy();client.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)remote.write(head);remote.pipe(client);client.pipe(remote)});
 remote.on('error',()=>client.destroy());client.on('error',()=>remote.destroy());client.on('close',()=>remote.destroy());
 }catch{client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'localhost',resolve)});
 return {url:'http://localhost:'+server.address().port,close:async()=>{for(const s of sockets)s.destroy();await new Promise(r=>server.close(r))}};
}
module.exports={target,startGuardProxy};
