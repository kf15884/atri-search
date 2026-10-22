'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { fixture } = require('./helpers.cjs'), { Engine } = require('../engine'), { Store } = require('../store');
test('committed job returns immediately; no search until async pump, cache only actual results', async t => {
  const f = fixture(t); assert.equal(f.engine.enqueue(f.meta, f.source), true); assert.equal(f.calls(), 0); assert.deepEqual(f.store.history, []);
  await f.engine.pump(); assert.equal(f.calls(), 1); assert.deepEqual(f.store.history, [f.meta.query]);
  const obs = await f.engine.context(f.req); assert.equal(obs.length, 1); assert.match(obs[0].title, /Atri搜索摘要/); assert.match(obs[0].summary, /未抓取或阅读全文/);
});
test('no key, disabled, paused or zero budget => no admission/request/history', async t => {
  for (const patch of [{ apiKey: '' }, { enabled: false }, { dailyLimit: 0 }]) { const f = fixture(t, patch); assert.equal(f.engine.enqueue(f.meta,f.source),false); await f.engine.pump(); assert.equal(f.calls(),0); assert.equal(f.store.history.length,0); }
  const f = fixture(t); f.engine.pause(); assert.equal(f.engine.enqueue(f.meta,f.source),false);
});
test('one job, duplicate commit, cooldown, budget and day rollover', async t => {
  const f = fixture(t, { dailyLimit: 1 }); assert.ok(f.engine.enqueue(f.meta,f.source)); assert.equal(f.engine.enqueue(f.meta,f.source),false); await f.engine.pump();
  assert.equal(f.engine.available(),false); f.advance(31*60000); assert.equal(f.engine.available(),false); f.advance(24*60*60000); assert.equal(f.engine.available(),true);
  assert.equal(f.engine.enqueue(f.meta,f.source),false,'same receipt never replayed');
});
test('foreground busy defers (not failure), resumes when idle without extra request', async t => {
  const f = fixture(t); f.engine.enqueue(f.meta,f.source); f.busy(true); await f.engine.pump(); assert.equal(f.calls(),0); assert.equal(f.engine.jobs[0].status,'queued');
  f.busy(false); await f.engine.pump(); assert.equal(f.calls(),1);
});
test('foreground arriving during provider setup defers before submission', async t => {
  const f = fixture(t); let first = true;
  f.provider.search = async (_q,o) => { if (first) { first=false; f.busy(true); } o.onSubmit(); return []; };
  f.engine.enqueue(f.meta,f.source); await f.engine.pump(); assert.equal(f.store.history.length,0); assert.equal(f.engine.jobs[0].status,'queued');
  f.busy(false); await f.engine.pump(); assert.equal(f.store.history.length,1); assert.equal(f.engine.jobs[0].status,'ready');
});
test('pause, generation reset, source deletion, owner disabled prevent dispatch', async t => {
  for (const mode of ['pause','generation','source','owner']) {
    const f = fixture(t); f.engine.enqueue(f.meta,f.source);
    if (mode==='pause') f.engine.pause(); if(mode==='generation')f.generation('g2'); if(mode==='source')f.rows.splice(0); if(mode==='owner')f.participant.status='paused';
    await f.engine.pump(); assert.equal(f.calls(),0); assert.equal(f.store.history.length,0);
  }
});
test('pause during in-flight HTTP keeps attempted query, discards late result, resume never replays', async t => {
  const f=fixture(t); let resolve; f.provider.search=async (_q,o)=>{o.onSubmit();return new Promise(r=>resolve=r)};
  f.engine.enqueue(f.meta,f.source); const p=f.engine.pump(); await new Promise(r=>setImmediate(r)); assert.equal(f.store.history.length,1);
  f.engine.pause(); await p; resolve([{title:'late',url:'https://example.org',excerpt:'late'}]); f.engine.resume(); await f.engine.pump(); assert.deepEqual(await f.engine.context(f.req),[]); assert.equal(f.store.history.length,1);
});
test('source deleted after completion blocks later context, no other users/groups', async t => {
  const f=fixture(t); f.engine.enqueue(f.meta,f.source); await f.engine.pump();
  assert.deepEqual(await f.engine.context({...f.req,groupContext:{}}),[]); assert.deepEqual(await f.engine.context({...f.req,participant:{...f.participant,userId:'OTHER'}}),[]);
  f.rows.splice(0); assert.deepEqual(await f.engine.context(f.req),[]);
});
test('submitted HTTP failure counts one query, no retry/fabricated result', async t=>{
  const f=fixture(t); f.provider.search=async(_q,o)=>{o.onSubmit();throw new Error('SECRET UPSTREAM ERROR')};
  f.engine.enqueue(f.meta,f.source);await f.engine.pump();await f.engine.pump();assert.equal(f.store.history.length,1);assert.deepEqual(await f.engine.context(f.req),[]);assert.ok(!f.engine.status.includes('SECRET'));
});
test('pre-submission DNS failure does not count as actual query',async t=>{
  const f=fixture(t);f.provider.search=async()=>{throw new Error('dns')};f.engine.enqueue(f.meta,f.source);await f.engine.pump();assert.equal(f.store.history.length,0);
});
test('bounded queue expiry, result TTL, clear does not reset budget',async t=>{
  const f=fixture(t);f.engine.enqueue(f.meta,f.source);f.advance(11*60000);await f.engine.pump();assert.equal(f.calls(),0);
  const g=fixture(t);g.engine.enqueue(g.meta,g.source);await g.engine.pump();g.advance(61*60000);assert.deepEqual(await g.engine.context(g.req),[]);
  const used=g.store.state.used;g.engine.clear();assert.equal(g.store.history.length,0);assert.equal(g.store.state.used,used);
});
test('restart loads only history/budget/receipt, no jobs/results replay',async t=>{
  const f=fixture(t);f.engine.enqueue(f.meta,f.source);await f.engine.pump();const store=new Store(f.dir),e=new Engine(f.c,store,f.provider);e.attach(f.service);t.after(()=>e.dispose());await e.pump();assert.deepEqual(e.jobs,[]);assert.equal(store.history.length,1);assert.deepEqual(await e.context(f.req),[]);
});
test('timeout cannot hang pump or produce late evidence',async t=>{
  const f=fixture(t,{timeoutSec:0.03});f.provider.search=async(_q,o)=>{o.onSubmit();return new Promise(()=>{})};f.engine.enqueue(f.meta,f.source);await f.engine.pump();assert.equal(f.engine.pumping,false);assert.equal(f.engine.jobs[0].status,'failed');assert.equal(f.store.history.length,1);
});
test('source deleted during DNS/setup is rejected again at submission boundary',async t=>{
 const f=fixture(t);f.provider.search=async(_q,o)=>{f.rows.splice(0);await o.beforeSubmit();o.onSubmit();return[]};f.engine.enqueue(f.meta,f.source);await f.engine.pump();assert.equal(f.store.history.length,0);assert.equal(f.engine.jobs[0].status,'failed');
});
