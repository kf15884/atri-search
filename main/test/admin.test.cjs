'use strict';
const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const plugin=require('..');
test('exact owner/private command prefix; ordinary/group/other users pass to HDS',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'atri-search-admin-')),dispose=[];t.after(()=>{for(const fn of dispose)fn();fs.rmSync(dir,{recursive:true,force:true})});let mw;
 const ctx={baseDir:dir,logger:()=>({info(){},warn(){}}),inject(){},on:(_e,fn)=>dispose.push(fn),middleware:fn=>mw=fn};
 const c=plugin.Config({selfId:'BOT_ACCOUNT',targetUserId:'OWNER_ACCOUNT'});plugin.apply(ctx,c);assert.equal(typeof mw,'function');
 const s={platform:'onebot',selfId:c.selfId,userId:c.targetUserId,isDirect:true};let passed=0;const next=()=>++passed;
 for(const msg of ['随便聊聊','asearch history','我想 /asearch history','/asearchx','/asearcher'])assert.equal(await mw({...s,content:msg},next),passed);
 assert.equal(passed,5);await mw({...s,isDirect:false,guildId:'GROUP',content:'/asearch'},next);await mw({...s,userId:'OTHER',content:'/asearch history'},next);assert.equal(passed,7);
 assert.match(await mw({...s,content:'/asearch'},next),/未配置/);assert.equal(passed,7);
 assert.match(await mw({...s,content:'/asearch pause'},next),/暂停/);assert.match(await mw({...s,content:'/asearch resume'},next),/不会重放/);assert.match(await mw({...s,content:'/asearch history'},next),/暂无/);
});
