'use strict';
const {startGuardProxy}=require('./guard-proxy'),L=require('./shared/logic');
const fault=code=>Object.assign(new Error(code),{code});
function bingUrl(raw){
 try{const u=new URL(raw);if(/(^|\.)bing\.com$/i.test(u.hostname)&&u.pathname==='/ck/a'){let x=u.searchParams.get('u')||'';if(x.startsWith('a1'))x=Buffer.from(x.slice(2),'base64url').toString('utf8');return L.safeUrl(x)}return L.safeUrl(u.href)}catch{return null}
}
class BrowserRunner{
 constructor(c,deps={}){this.c=c;this.deps=deps;this.browser=null;this.proxy=null;this.launching=null;this.closed=false}
 async start(){
 if(this.closed)throw fault('browser-failed');if(this.browser?.isConnected())return;
 if(this.launching)return this.launching;
 this.launching=(async()=>{
 if(this.proxy)await this.proxy.close();this.proxy=this.deps.proxy||await startGuardProxy();
 const chromium=this.deps.chromium||require('playwright').chromium;
 this.browser=await chromium.launch({executablePath:this.c.chromiumPath,headless:true,chromiumSandbox:this.deps.testSandbox===false?false:true,proxy:{server:this.proxy.url,bypass:'<-loopback>'},timeout:25000,args:['--disable-quic','--disable-background-networking','--disable-component-update','--disable-dev-shm-usage','--force-webrtc-ip-handling-policy=disable_non_proxied_udp']});
 })();try{await this.launching}catch{throw fault('browser-failed')}finally{this.launching=null}
 }
 async run(job,{signal,onAttempt}){
 await this.start();if(signal.aborted)throw fault('cancelled');
 const context=await this.browser.newContext({acceptDownloads:false,serviceWorkers:'block',locale:'zh-CN',javaScriptEnabled:true});
 const close=()=>{void context.close().catch(()=>{})};signal.addEventListener('abort',close,{once:true});
 try{
 await context.route('**/*',route=>['image','font','media'].includes(route.request().resourceType())?route.abort():route.continue());
 if(context.routeWebSocket)await context.routeWebSocket('**/*',ws=>ws.close());
 const page=await context.newPage();context.on('page',other=>{if(other!==page)void other.close().catch(()=>{})});page.setDefaultTimeout(12000);page.setDefaultNavigationTimeout(18000);
 if(job.op==='search'){
 await page.goto(this.deps.homeURL||'https://www.bing.com/',{waitUntil:'domcontentloaded'});
 const input=page.locator('#sb_form_q');await input.waitFor({state:'visible'});await input.fill(job.query);
 if(signal.aborted)throw fault('cancelled');
 onAttempt({id:job.id+':browser-search',query:job.query});
 await input.press('Enter');await page.waitForSelector('#b_results',{timeout:18000});
 const text=await page.locator('body').innerText();if(/verify you are human|unusual traffic|人机验证|请完成验证/i.test(text))throw fault('browser-challenge');
 const rows=await page.locator('#b_results li.b_algo').evaluateAll(nodes=>nodes.slice(0,10).map(n=>({title:n.querySelector('h2 a')?.textContent||'',url:n.querySelector('h2 a')?.href||'',snippet:n.querySelector('.b_caption p')?.textContent||n.querySelector('p')?.textContent||''})));
 const results=[];for(const row of rows){const url=bingUrl(row.url),title=L.clean(row.title,160);if(url&&title&&!results.some(r=>r.url===url))results.push({title,url,snippet:L.clean(row.snippet,500)});if(results.length>=job.limit)break}
 return results;
 }
 if(job.op==='read'){
 const url=L.safeUrl(job.url);if(!url)throw fault('policy-blocked');
 const response=await page.goto(url,{waitUntil:'domcontentloaded'});if(!response?.ok())throw fault('browser-failed');const actual=L.safeUrl(page.url());if(!actual)throw fault('policy-blocked');return[{title:L.clean(await page.title(),160),url:actual,snippet:L.clean(await page.locator('body').innerText(),this.c.maxTextCharacters||6000),evidence:'visible-page-excerpt'}];
 }
 throw fault('policy-blocked');
 }catch(e){if(signal.aborted)throw fault('cancelled');if(['policy-blocked','browser-challenge'].includes(e.code))throw e;throw fault('browser-failed')}
 finally{signal.removeEventListener('abort',close);await context.close().catch(()=>{})}
 }
 async close(){this.closed=true;if(this.launching)await this.launching.catch(()=>{});await this.browser?.close().catch(()=>{});await this.proxy?.close()}
}
module.exports={BrowserRunner,bingUrl};
