'use strict';
const { test }=require('node:test'), assert=require('node:assert/strict');
const {fixture}=require('./helpers.cjs'),{createBridge}=require('../bridge');
function bridge(t, options={}) {
 const f=fixture(t), listeners=[];let observed;
 const native={decide:async r=>{observed=r;return {script:f.source.content,memories:[{category:'atri-search',content:'查询：天文 星云形成',importance:0.2},{category:'life',content:'日常记忆',importance:0.5}]}}};
 let narrator=native, stored;
 const original=async function(...args){stored=args[2];if(options.fail)throw Error('commit-failed');return {messages:[],scriptEntry:options.noScript?undefined:f.source,commit:{id:'real-commit'}}};
 Object.assign(f.service,{getNarrator:()=>narrator,setNarrator:n=>narrator=n,persistDecision:original});
 const ctx={inject:(_deps,fn)=>fn({interlude:f.service,on:(_event,fn)=>listeners.push(fn)})};
 const b=createBridge(ctx,f.c,f.engine,{now:f.now});t.after(()=>b.dispose());
 return {...f,b,native,original,ctx,listeners,observed:()=>observed,stored:()=>stored,narrator:()=>narrator,commit:raw=>f.service.persistDecision(f.story,f.participant,raw,new Date(),new Date(),true,'user-message')};
}
test('discarded draft never queues/searches, token stripped only on actual persistence',async t=>{
 const f=bridge(t),raw=await f.narrator().decide(f.req);assert.match(raw.memories[0].content,/^atri-search-intent:/);await f.engine.pump();assert.equal(f.calls(),0);assert.equal(f.engine.jobs.length,0);assert.equal(f.req.story.setting.world,'原世界');assert.match(f.observed().story.setting.world,/浏览器工具/);
 await f.commit({...raw});assert.equal(f.engine.jobs.length,1);assert.equal(f.calls(),0);assert.equal(f.stored().memories.length,1);assert.equal(f.stored().memories[0].category,'life');await f.engine.pump();assert.equal(f.calls(),1);
});
test('commit failure or no script entry => no external effects',async t=>{
 for(const o of [{fail:true},{noScript:true}]){const f=bridge(t,o),raw=await f.narrator().decide(f.req);try{await f.commit(raw)}catch{}await f.engine.pump();assert.equal(f.calls(),0);assert.equal(f.engine.jobs.length,0);}
});
test('duplicate copied raw commit, forged token, changed script cannot enqueue twice',async t=>{
 const f=bridge(t),raw=await f.narrator().decide(f.req);await f.commit(raw);await f.commit({...raw});assert.equal(f.engine.jobs.length,1);
 const g=bridge(t);await g.commit({script:g.source.content,memories:[{category:'atri-search',content:'atri-search-intent:forged'}]});assert.equal(g.engine.jobs.length,0);
 const h=bridge(t),draft=await h.narrator().decide(h.req);await h.commit({...draft,script:'别的草稿'});assert.equal(h.engine.jobs.length,0);
});
test('group, other user, recovery and private query do not mint executable intents',async t=>{
 const f=bridge(t);await f.narrator().decide({...f.req,groupContext:{}});assert.equal(f.b.candidates.size,0);await f.narrator().decide({...f.req,participant:{...f.participant,userId:'OTHER'}});assert.equal(f.b.candidates.size,0);
 let d=await f.narrator().decide({...f.req,outputRecovery:true});assert.equal(d.memories.some(x=>x.category==='atri-search'),false);
 f.native.decide=async()=>({script:f.source.content,memories:[{category:'atri-search',content:'查询：token ABC'}]});d=await f.narrator().decide(f.req);assert.equal(d.memories.length,0);
});
test('pause/reset between draft and commit rejects obsolete capability',async t=>{
 const f=bridge(t),raw=await f.narrator().decide(f.req);f.engine.pause();f.engine.resume();await f.commit(raw);assert.equal(f.engine.jobs.length,0);
 const g=bridge(t),d=await g.narrator().decide(g.req);g.generation('g2');await g.commit(d);assert.equal(g.engine.jobs.length,0);
});
test('nested decorators call through safely after disposal; HDS reattach works',async t=>{
 const f=bridge(t),old=f.narrator(),oldPersist=f.service.persistDecision;const outer=Object.create(old);outer.decide=r=>old.decide(r);f.service.setNarrator(outer);f.service.persistDecision=(...a)=>oldPersist(...a);
 f.b.dispose();assert.equal(f.narrator(),outer);await outer.decide(f.req);assert.equal(f.observed().story.setting.world,'原世界');assert.equal(f.engine.service,null);
 const g=bridge(t);g.listeners[0]();assert.equal(g.narrator(),g.native);g.ctx.inject=(_d,fn)=>fn({interlude:g.service,on:()=>{}});const again=createBridge(g.ctx,g.c,g.engine);t.after(()=>again.dispose());assert.ok(g.service.__atriSearchBridge);assert.equal(g.engine.service,g.service);
});
test('in-flight search does not delay foreground narrator; no extra narrator/model call',async t=>{
 const f=bridge(t);let resolve,modelCalls=0;const real=f.native.decide;f.native.decide=async r=>{modelCalls++;return real(r)};
 const draft=await f.narrator().decide(f.req);await f.commit(draft);f.provider.search=async(_q,o)=>{o.onSubmit();return new Promise(r=>resolve=r)};
 const work=f.engine.pump();await new Promise(r=>setImmediate(r));
 const result=await Promise.race([f.narrator().decide({...f.req,userMessage:'别的话题'}),new Promise((_,reject)=>setTimeout(()=>reject(Error('foreground blocked')),100))]);
 assert.ok(result.script);assert.equal(modelCalls,2,'exactly one narrator call per requested turn');assert.equal(f.observed().webContext.length,0,'pending result not invented');
 resolve([]);await work;
});
