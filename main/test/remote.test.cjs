'use strict';
const{test}=require('node:test'),assert=require('node:assert/strict');
const{RemoteProvider}=require('../remote'),{Engine}=require('../engine'),{fixture}=require('./helpers.cjs');
const fault=code=>Object.assign(Error(code),{code});
function fixtureRemote(options={}){
 const c={browserUrl:'http://browser.invalid',browserToken:'TEST_ONLY_BROWSER_CREDENTIAL',browserTimeoutSec:1,fallbackType:'deepseek-search',fallbackKey:'TEST_ONLY_API_CREDENTIAL',fallbackTimeoutSec:1,resultLimit:3};let browserCalls=0,apiCalls=0,attempts=[],dispatch=0;
 const result={title:'资料',url:'https://example.org/a',snippet:'引擎实际返回摘要'};
 const rpc=async(_u,_t,p,o)=>{if(o?.method==='DELETE')return{};browserCalls++;if(options.failBrowser)throw fault(options.failBrowser);return{status:'ready',results:options.emptyBrowser?[]:[result],attempts:[{id:'task-search',query:'天文 星云形成'}]}};
 const publicJson=async(_u,o)=>{apiCalls++;o.onSubmit();if(options.failApi)throw fault(options.failApi);return{results:options.emptyApi?[]:[result]}};
 const p=new RemoteProvider(c,{rpc,publicJson});const run=()=>p.search('天文 星云形成',{signal:options.signal||new AbortController().signal,taskId:'a'.repeat(64),beforeSubmit:async()=>{},onDispatch:()=>dispatch++,onSubmit:id=>attempts.push(id)});
 return{p,c,run,stats:()=>({browserCalls,apiCalls,attempts,dispatch})};
}
test('real browser results preferred; never invokes API on success',async()=>{const f=fixtureRemote(),r=await f.run();assert.equal(r.source,'browser');assert.equal(r.rows.length,1);assert.equal(f.stats().apiCalls,0);assert.deepEqual(f.stats().attempts,['browser:task-search'])});
test('browser unavailable => exactly one API; source and browser failure retained',async()=>{const f=fixtureRemote({failBrowser:'browser-unavailable'}),r=await f.run();assert.equal(r.source,'api');assert.equal(f.stats().apiCalls,1);assert.deepEqual(r.traces,[{stage:'browser',code:'browser-unavailable'}]);assert.deepEqual(f.stats().attempts,['api:single'])});
test('empty browser => API; both empty/failed produce explicit no-information',async()=>{for(const o of [{emptyBrowser:true,failApi:'provider-auth'},{failBrowser:'browser-timeout',emptyApi:true}]){const f=fixtureRemote(o),r=await f.run();assert.equal(r.source,'none');assert.deepEqual(r.rows,[]);assert.equal(r.traces.length,2);assert.equal(f.stats().apiCalls,1)}});
test('cancelled, policy-denied or administratively obsolete never trigger API fallback',async()=>{for(const code of ['cancelled','policy-blocked','deferred']){const f=fixtureRemote({failBrowser:code});await assert.rejects(f.run(),{code});assert.equal(f.stats().apiCalls,0)}});
test('actual two attempts retained, charge one logical task, final failure enters HDS as failed evidence',async t=>{
 const f=fixture(t);f.c.browserUrl='x';f.c.timeoutSec=2;f.provider.search=async(_q,o)=>{o.onDispatch();o.onSubmit('browser:first');o.onSubmit('browser:first');o.onSubmit('api:second');return{rows:[],source:'none',traces:[{stage:'browser',code:'failed'},{stage:'api',code:'failed'}]}};
 f.engine.enqueue(f.meta,f.source);await f.engine.pump();assert.equal(f.store.state.used,1);assert.deepEqual(f.store.history,[f.meta.query,f.meta.query]);const obs=await f.engine.context(f.req);assert.equal(obs.length,1);assert.equal(obs[0].status,'failed');assert.match(obs[0].excerpt,/没有可据以回答的新信息/);
});
test('source cancelled after browser failure prevents API via submission gate',async()=>{const f=fixtureRemote({failBrowser:'browser-unavailable'});let api=0;f.p.fallback=async(_q,o)=>{await o.beforeSubmit();api++;return[]};await assert.rejects(f.p.search('天文',{signal:new AbortController().signal,beforeSubmit:async()=>{throw fault('cancelled')},onSubmit(){}}),{code:'cancelled'});assert.equal(api,0)});
test('custom JSON API sends only query/count, no original chat or private localization',async()=>{
 const f=fixtureRemote({failBrowser:'browser-unavailable'});f.c.fallbackType='custom-json';f.c.fallbackUrl='https://search.example.org/search';let body;
 f.p.publicJson=async(_u,o)=>{body=o.body;o.onSubmit();return{results:[{title:'公开资料',url:'https://example.org',summary:'摘要'}]}};const r=await f.run();assert.equal(r.source,'api');assert.equal(body.query,'天文 星云形成');assert.equal(body.ori_question,undefined);assert.equal(body.localization,undefined);assert.equal(body.need_content,false);
});
