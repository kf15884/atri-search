'use strict';
const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const{startService}=require('../../node2/server'),{RemoteProvider}=require('../remote'),{fixture}=require('./helpers.cjs');
test('two-end HTTP task/poll pipeline + engine result context; primary browser bypasses fallback',async t=>{
 const f=fixture(t),dir=fs.mkdtempSync(path.join(os.tmpdir(),'atri-two-end-')),token='TEST_ONLY_BROWSER_CREDENTIAL_LONG_ENOUGH';
 const service=await startService({listenAddress:'localhost',port:0,token,dataDir:dir,chromiumPath:process.execPath},{skipValidate:true,runner:{run:async(j,o)=>{o.onAttempt({id:j.id+':search',query:j.query});return[{title:'浏览器资料',url:'https://example.org',snippet:'页面实际提取的摘要'}]},close:async()=>{}}});
 t.after(async()=>{await service.close();fs.rmSync(dir,{recursive:true,force:true})});Object.assign(f.c,{browserUrl:'http://localhost:'+service.server.address().port,browserToken:token,browserTimeoutSec:3,fallbackType:'disabled',resultLimit:3,timeoutSec:5});
 const remote=new RemoteProvider(f.c);remote.fallback=async()=>{throw Error('must not fallback')};f.engine.provider=remote;f.engine.enqueue(f.meta,f.source);await f.engine.pump();assert.equal(f.engine.jobs[0].evidence,'browser');assert.deepEqual(f.store.history,[f.meta.query]);assert.equal(f.store.state.used,1);const obs=await f.engine.context(f.req);assert.match(obs[0].excerpt,/第二台浏览器/);assert.match(obs[0].excerpt,/非全文/);
});
