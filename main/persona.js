'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),L=require('./logic');
const TEXT='Atri会按自己的好奇心和实际需要，使用浏览器查阅公开资料，逐渐形成兴趣与感想；不必每次都搜索或分享，也不把尚未取得的资料当作已经读过。';
class PersonaManager{
 constructor(engine,store){this.engine=engine;this.store=store;this.plan=null}
 async resolve(session){
 const s=this.engine.service;
 if(!s||['canManageSession','getStory','updateSetting','serial','addAdminScriptNote'].some(k=>typeof s[k]!=='function'))throw Error('HDS管理接口不可用');
 if(!s.canManageSession(session))throw Error('需要HDS原有管理权限，不修改白名单');
 const where=this.engine.lastWhere;if(!where?.storyId)throw Error('请先正常聊一句以定位现有故事；不自动创建');const story=await s.getStory(where.storyId);return{s,story};
 }
 async preview(session){
 const{s,story}=await this.resolve(session);const current=await s.getStory(story.id),profile=current.setting?.character?.profile;
 if(typeof profile!=='string'||!profile.trim())throw Error('当前完整人设不可读，拒绝覆盖');
 if(profile.includes(TEXT))return'当前故事已包含该词条，无需重复追加。';
 const id=crypto.randomBytes(8).toString('hex');this.plan={id,storyId:story.id,hash:L.hash(profile),at:Date.now()};
 return`只在现有人设末尾追加${TEXT.length}字；不改state/overlay、记忆、剧本、关系或故事ID。\n请先在Console模板中手动追加同一段，避免只更新一边。\n${TEXT}\n确认当前故事追加：/asearch persona apply ${id}（10分钟内有效）`;
 }
 async apply(session,id){
 const plan=this.plan;if(!plan||plan.id!==id||Date.now()-plan.at>600000)throw Error('预览失效，请重新preview');
 const{s,story}=await this.resolve(session);if(story.id!==plan.storyId)throw Error('故事已变化，拒绝更新');
 return s.serial(story.id,async()=>{
 const current=await s.getStory(story.id),profile=current.setting?.character?.profile;if(L.hash(profile)!==plan.hash)throw Error('原人设已变化，请重新preview；不覆盖');
 const dir=path.join(this.store.dir,'private-backups');fs.mkdirSync(dir,{recursive:true,mode:0o700});fs.chmodSync(dir,0o700);
 const file=path.join(dir,Date.now()+'-'+L.hash(story.id).slice(0,12)+'.json'),fd=fs.openSync(file,'wx',0o600);
 try{fs.writeFileSync(fd,JSON.stringify({storyId:story.id,setting:current.setting,state:current.state,at:new Date().toISOString()},null,2));fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
 // Native API writes setting + updatedAt only. Never write state or rebuild the story.
 await s.updateSetting(current,{character:{name:current.setting.character.name,profile:profile+'\n\n'+TEXT}});this.plan=null;
 return'已备份并追加当前故事人设；没有执行清库、重建或overlay清除。Console模板需单独核对，不自动修改koishi.yml。';
 });
 }
 async introduce(session){
 const{s,story}=await this.resolve(session);const remote=this.engine.provider;
 if(typeof remote.health!=='function')throw Error('浏览器服务不可用');const health=await remote.health();if(health.version!=='0.2.0-beta.1')throw Error('第二台版本未匹配，不写入安装事实');
 // Existing HDS admin-note is explicit human-provided truth, not an invented chat or model memory.
 const marker='[Atri浏览器接入 0.2]';
 return s.serial(story.id,async()=>{
 const previous=await s.dbGet('interlude_script_entry',{storyId:story.id,kind:'admin-note'});
 if(previous.some(e=>String(e.content).includes(marker)))return'本次功能接入已经告知，不重复写入。';
 const current=await s.getStory(story.id),note=`${marker} 这次更新是对方为Atri接入了一个浏览器工具入口，运行在独立外设上，不是更换人格。当前只开放公开资料检索与只读能力，实际可用性和读到的内容以工具回执为准；接入成功不等于已完成真实搜索。可以按自己的兴趣使用，不必立刻表演或汇报。`;
 await s.addAdminScriptNote(current,note);return'已通过HDS原生管理员注记记录这次功能接入；未伪造用户消息、阅读经历或自动发送QQ。';
 });
 }
}
module.exports={PersonaManager,TEXT};
