'use strict';
const path = require('node:path'), { h } = require('koishi'), Config = require('./config');
const { Store } = require('./store'), { RemoteProvider } = require('./remote'), { Engine } = require('./engine'), { createBridge } = require('./bridge');
const { PersonaManager } = require('./persona');
const name = 'atri-search', inject = { optional: ['interlude'] };
function apply(ctx, c) {
  if (!c.targetUserId || !c.selfId) { ctx.logger(name).info('请填写本人/机器人账号，搜索未启用'); return; }
  try { new Intl.DateTimeFormat('en-CA', { timeZone: c.timezone }); } catch { ctx.logger(name).warn('时区无效，搜索未启用'); return; }
  let store;
  try { store = new Store(path.join(ctx.baseDir || process.cwd(), 'data', name)); } catch { ctx.logger(name).warn('私有状态文件不可读写，搜索未启用；不自动清空历史'); return; }
  const engine = new Engine(c, store, new RemoteProvider(c)), bridge = createBridge(ctx, c, engine);
  const persona = new PersonaManager(engine, store);
  const timer = setInterval(() => { void engine.pump(); }, 1000); timer.unref?.();
  ctx.on('dispose', () => { clearInterval(timer); bridge.dispose(); engine.dispose(); });
  const help = '/asearch：状态\n/asearch history：最近20条实际提交查询\n/asearch pause：暂停并取消旧任务\n/asearch resume：恢复（不重放）\n/asearch clear：清空查询历史和临时结果，不重置预算\n/asearch health：检查第二台版本/连接（不搜索）\n/asearch persona preview：预览追加当前故事人设（需HDS管理权限）\n/asearch introduce：明确记录本次工具接入（先验证第二台版本）';
  ctx.middleware(async (s, next) => {
    const text = String(s.content || '').trim();
    if (!/^\/asearch(?:\s|$)/i.test(text) || s.platform !== c.platform || String(s.selfId) !== c.selfId || String(s.userId) !== c.targetUserId || s.isDirect !== true || s.guildId) return next();
    if (/^\/asearch\s+persona\s+preview$/i.test(text)) { try { return h.escape(await persona.preview(s)); } catch (e) { return h.escape(e.message); } }
    const apply = /^\/asearch\s+persona\s+apply\s+([a-f0-9]{16})$/i.exec(text);
    if (apply) { try { return h.escape(await persona.apply(s, apply[1])); } catch (e) { return h.escape(e.message); } }
    if (/^\/asearch\s+introduce$/i.test(text)) { try { return h.escape(await persona.introduce(s)); } catch { return '未写入功能接入：请检查HDS管理权限、现有故事和第二台版本；不自动创建故事。'; } }
    if (/^\/asearch\s+health$/i.test(text)) { try { const j=await engine.provider.health(); return h.escape(`第二台 ${j.version}；Chromium文件${j.browserInstalled ? '存在' : '缺失'}；只读能力 ${(j.capabilities||[]).join('/')}。这不是实际搜索成功证明。`); } catch { return '第二台浏览器服务不可达或鉴权失败；不输出Token。'; } }
    const m = /^\/asearch(?:\s+(history|pause|resume|clear|help))?\s*$/i.exec(text);
    if (!m || m[1] === 'help') return h.escape(help);
    switch (m[1]?.toLowerCase()) {
      case 'history': return h.escape(store.history.length ? store.history.map((q,i) => `${i+1}. ${q}`).join('\n') : '暂无实际提交的搜索');
      case 'pause': engine.pause(); return '搜索已暂停，旧任务已取消';
      case 'resume': engine.resume(); return '已恢复；不会重放旧任务。未开启或缺少搜索Key时仍不会检索';
      case 'clear': engine.clear(); return '已清空搜索历史及临时结果；额度和去重保护保留';
      default: return h.escape(`Atri浏览器 0.2.0-beta.1\n${engine.status}${engine.jobs.at(-1)?.traces?.length ? '\n线路记录：' + engine.jobs.at(-1).traces.map(x => x.stage+':'+x.code).join(' → ') : ''}\n开关：${c.enabled ? '开' : '关'}；私有暂停：${store.state.paused ? '是' : '否'}；浏览器：${c.browserUrl && c.browserToken ? '已配置（未证明可用）' : '未配置'}；API兜底：${engine.provider.fallbackConfigured() ? c.fallbackType : '未配置'}\n最近查询${store.history.length}/20；不独立调用主叙事模型、不直接推送QQ；浏览器失败才切API，两者失败为未获取信息\n${help}`);
    }
  }, true);
}
module.exports = { name, inject, Config, apply };
