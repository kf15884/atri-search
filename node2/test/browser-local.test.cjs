'use strict';
const{test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const{BrowserRunner}=require('../browser');
const chromium=require('playwright').chromium;
test('REAL Chromium + Playwright: local search page, fill, Enter, actual DOM extraction (no external browsing)',{timeout:20000},async t=>{
 let searched=0;const fixture=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');if(req.url.startsWith('/search')){searched++;res.end('<html><body><ol id="b_results"><li class="b_algo"><h2><a href="https://example.org/science">真实DOM结果</a></h2><div class="b_caption"><p>本地测试页面中的实际摘要。</p></div></li></ol></body></html>')}else res.end('<html><body><form action="/search"><input id="sb_form_q" name="q"><button type="submit">搜索</button></form></body></html>')});await new Promise(r=>fixture.listen(0,'localhost',r));
 const homeURL='http://localhost:'+fixture.address().port,runner=new BrowserRunner({chromiumPath:process.env.ATRI_TEST_CHROMIUM||'/usr/local/bin/chromium'},{chromium:{launch:o=>chromium.launch({...o,proxy:undefined,chromiumSandbox:false})},proxy:{url:'http://localhost',close:async()=>{}},homeURL});
 t.after(async()=>{await runner.close();await new Promise(r=>fixture.close(r))});const attempts=[];const results=await runner.run({id:'c'.repeat(64),op:'search',query:'天文 星云形成',limit:3},{signal:new AbortController().signal,onAttempt:a=>attempts.push(a)});
 assert.equal(searched,1);assert.equal(attempts.length,1);assert.equal(results.length,1);assert.equal(results[0].title,'真实DOM结果');assert.match(results[0].snippet,/实际摘要/);assert.equal(results[0].url,'https://example.org/science');
});
