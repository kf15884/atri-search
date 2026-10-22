'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {App}=require('koishi'),HTTP=require('@koishijs/plugin-http').default,SQLite=require('@koishijs/plugin-database-sqlite').default,HDS=require(process.env.ATRI_SEARCH_HDS_MODULE || 'koishi-plugin-hds-interlude');
const Search=require('..'),{Store}=require('../store'),{Engine}=require('../engine'),{createBridge}=require('../bridge');
for(const order of ['search-first','hds-first'])test('real Koishi4.18.11 + HDS '+HDS.version+' + SQLite: '+order+' draft/commit/result-context/unload',{timeout:20000},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'atri-search-real-')),app=new App();app.baseDir=dir;
 app.plugin(HTTP,{});app.plugin(SQLite,{path:path.join(dir,'koishi.db')});
 const hc=HDS.Config({storyDefaults:{characterName:'Atri',characterProfile:'原人设',world:'原世界'},runtime:{autoAdvanceEnabled:false,allowProactiveMessages:false,splitReplyMessages:true,messageSeparator:'<sep/>'},model:{providers:[]},memory:{enabled:false},onebot:{enabled:false},logging:{logScriptPreview:false}});
 const c=Search.Config({enabled:true,targetUserId:'OWNER_ACCOUNT',selfId:'BOT_ACCOUNT',apiKey:'TEST_ONLY_CREDENTIAL'});
 let engine,store,bridge,fork,calls=0;
 const harness={name:'search-integration-harness',apply(ctx){store=new Store(path.join(dir,'data','atri-search'));engine=new Engine(c,store,{configured:()=>true,search:async(q,{onSubmit})=>{onSubmit();calls++;return[{title:'星云资料',url:'https://example.org/nebula',excerpt:'模拟引擎实际返回的摘要'}]}});bridge=createBridge(ctx,c,engine);ctx.on('dispose',()=>{bridge.dispose();engine.dispose()})}};
 const sp=()=>fork=app.plugin(harness),hp=()=>app.plugin(HDS,hc);if(order==='search-first'){sp();hp()}else{hp();sp()}
 t.after(async()=>{await app.stop();fs.rmSync(dir,{recursive:true,force:true})});await app.start();await new Promise(r=>setTimeout(r,100));
 const s=app.interlude,session={platform:'onebot',selfId:c.selfId,userId:c.targetUserId,channelId:`private:${c.targetUserId}`,username:'测试',isDirect:true};
 const story=await s.createStory(session),participant=await s.ensureParticipant(story,session),wrapped=s.getNarrator(),native=Object.getPrototypeOf(wrapped),oldDecide=native.decide;
 let observed;native.decide=async function(r){observed=r;return{script:'Atri决定查查星云的形成，等待检索资料。',interaction:{seen:true,reply:{mode:'immediate',content:'我想查一点天文资料<sep/>晚些时候再聊'}},memories:[{category:'atri-search',content:'查询：天文 星云形成',importance:0.2}]}};t.after(()=>native.decide=oldDecide);
 const req={story,participant,participants:[participant],phase:'user-message',userMessage:'在想什么',webContext:[],writingOptions:{messageSeparator:'<sep/>',splitReplyMessages:true,browserMode:'disabled'}};
 // Draft #1 is deliberately discarded; no search, no history, no plugin memory.
 await wrapped.decide(req);await engine.pump();assert.equal(calls,0);assert.equal(store.history.length,0);
 const draft=await wrapped.decide(req);assert.match(observed.story.setting.world,/浏览器工具/);assert.equal(story.setting.world,'原世界');
 const now=new Date(),raw={intents:[],intentUpdates:[],followUpResolutions:[],...draft};
 const persisted=await s.serial(story.id,()=>s.persistDecision(story,participant,{...raw},now,now,true,'user-message',[]));
 assert.ok(persisted.scriptEntry?.id);assert.equal(engine.jobs.length,1);assert.equal(calls,0,'commit returns before network');
 assert.equal((await app.database.get('interlude_memory',{storyId:story.id})).filter(x=>x.category==='atri-search').length,0,'no fabricated query-as-memory');
 await engine.pump();assert.equal(calls,1);assert.deepEqual(store.history,['天文 星云形成']);
 // The next HDS request receives evidence; original world and request are untouched.
 await wrapped.decide({...req,userMessage:'后来看到什么了'});assert.equal(observed.webContext.length,1);assert.match(observed.webContext[0].summary,/未抓取或阅读全文/);assert.equal(req.webContext.length,0);
 // Native current-story persona append must not change any existing state or rows.
 const {PersonaManager,TEXT}=require('../persona');
 const live=await s.getStory(story.id);live.state.settingOverlay={...(live.state.settingOverlay||{}),characterProfile:'已有的人设演化',characterTraits:['原有习惯']};
 await app.database.set('interlude_story',{id:story.id},{state:live.state});
 await s.appendMemory(story.id,{category:'life',content:'原有长期记忆',importance:0.5},new Date(),participant.id);
 const stateBefore=JSON.stringify((await s.getStory(story.id)).state),participantsBefore=await app.database.get('interlude_participant',{storyId:story.id}),memoriesBefore=await app.database.get('interlude_memory',{storyId:story.id}),scriptsBefore=await app.database.get('interlude_script_entry',{storyId:story.id});
 const pm=new PersonaManager(engine,store);await pm.preview(session);await pm.apply(session,pm.plan.id);
 const changed=await s.getStory(story.id);assert.equal(changed.id,story.id);assert.equal(changed.setting.character.profile,'原人设\n\n'+TEXT);assert.equal(JSON.stringify(changed.state),stateBefore);assert.deepEqual(await app.database.get('interlude_participant',{storyId:story.id}),participantsBefore);assert.deepEqual(await app.database.get('interlude_memory',{storyId:story.id}),memoriesBefore);assert.deepEqual(await app.database.get('interlude_script_entry',{storyId:story.id}),scriptsBefore);
 // Delete the real source entry; stale evidence must disappear on the next request.
 await app.database.remove('interlude_script_entry',{id:persisted.scriptEntry.id});await wrapped.decide(req);assert.equal(observed.webContext.length,0);
 fork.dispose();assert.equal(s.getNarrator(),native);assert.equal(s.__atriSearchBridge,undefined);
});
