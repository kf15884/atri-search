'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {BraveProvider,publicAddress}=require('../provider');
const publicIp=[93,184,216,34].join('.');
function mock(options={}) {
 let ended=0,submitted=0,optionsSeen,urlSeen;
 const lookup=async()=>options.addresses||[{address:publicIp,family:4}];
 const request=(url,opts,cb)=>{
   urlSeen=url;optionsSeen=opts;const req=new EventEmitter();req.destroy=()=>{};
   req.end=()=>{ended++;queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=options.status||200;res.resume=()=>{};cb(res);res.emit('data',Buffer.from(options.body||JSON.stringify({web:{results:[{url:'https://example.org/a',title:'天文',description:'资料'}]}})));res.emit('end');})};return req;
 };
 const c={apiKey:'TEST_ONLY_CREDENTIAL',resultLimit:3,timeoutSec:1};
 return {p:new BraveProvider(c,{lookup,request}),c,submitted:()=>submitted,ended:()=>ended,seen:()=>({url:urlSeen,opts:optionsSeen}),run:extra=>new BraveProvider(c,{lookup,request}).search('天文 星云形成',{signal:new AbortController().signal,onSubmit:()=>submitted++,...extra})};
}
test('provider fixed official HTTPS, query only, no redirects/retries, records at submission',async()=>{
 const f=mock();assert.equal(f.submitted(),0);const out=await f.run();assert.equal(out.length,1);assert.equal(f.ended(),1);assert.equal(f.submitted(),1);const{url,opts}=f.seen();assert.equal(url.origin,'https://api.search.brave.com');assert.equal(url.pathname,'/res/v1/web/search');assert.equal(url.searchParams.get('q'),'天文 星云形成');assert.equal(url.searchParams.get('safesearch'),'strict');assert.equal(opts.headers['X-Subscription-Token'],f.c.apiKey);assert.equal(opts.method,'GET');
});
test('provider no configuration does not resolve or submit',async()=>{
 const f=mock();f.c.apiKey='';await assert.rejects(f.run(),{code:'not-configured'});assert.equal(f.ended(),0);assert.equal(f.submitted(),0);
});
test('private/loopback/mapped IPv6 DNS targets rejected before submission',async()=>{
 for(const address of [[127,0,0,1].join('.'),[10,2,3,4].join('.'),'::1','::ffff:'+publicIp,'fc00::1','2001:db8::1']){const f=mock({addresses:[{address,family:address.includes(':')?6:4}]});await assert.rejects(f.run(),{code:'unsafe-dns'});assert.equal(f.ended(),0);assert.equal(f.submitted(),0);}
 assert.equal(publicAddress(publicIp),true);assert.equal(publicAddress('2606:4700::1111'),true);
});
test('HTTP auth/rate/redirect errors never fabricate results or retry; submission recorded',async()=>{
 for(const status of [401,403,429,302,500]){const f=mock({status});await assert.rejects(f.run());assert.equal(f.ended(),1);assert.equal(f.submitted(),1);}
});
test('invalid JSON bounded failure, no raw server body leak',async()=>{
 const f=mock({body:'SECRET_UPSTREAM_BODY'});await assert.rejects(f.run(),e=>e.code==='bad-response'&&!e.message.includes('SECRET'));assert.equal(f.submitted(),1);
});
test('busy/cancelled admission does not end HTTP request or record history',async()=>{
 const f=mock();await assert.rejects(f.run({onSubmit:()=>{throw Object.assign(Error('deferred'),{code:'deferred'})}}),{code:'deferred'});assert.equal(f.ended(),0);assert.equal(f.submitted(),0);
 const signal=AbortSignal.abort();await assert.rejects(f.run({signal}),{code:'cancelled'});assert.equal(f.ended(),0);
});
test('DNS error produces no submission',async()=>{
 let n=0;const p=new BraveProvider({apiKey:'TEST_ONLY_CREDENTIAL'},{lookup:async()=>{throw Error('secret-network-info')}});await assert.rejects(p.search('天文',{signal:new AbortController().signal,onSubmit:()=>n++}),{code:'dns-failed'});assert.equal(n,0);
});
test('after DNS, async source validation may cancel before HTTP construction/submission',async()=>{
 const f=mock();await assert.rejects(f.run({beforeSubmit:async()=>{throw Object.assign(Error('cancelled'),{code:'cancelled'})}}),{code:'cancelled'});assert.equal(f.ended(),0);assert.equal(f.submitted(),0);assert.equal(f.seen().url,undefined);
});
