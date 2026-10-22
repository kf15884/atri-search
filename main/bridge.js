'use strict';
const crypto = require('node:crypto'), L = require('./logic');
function createBridge(ctx, c, engine, { now = Date.now } = {}) {
  let service, base, wrapped, persist, decoratedPersist, disposed = false;
  const candidates = new Map();
  function install(s) {
    if (disposed || service) return;
    const methods = ['getNarrator','setNarrator','persistDecision','getStory','getParticipant','dbGet','taskGeneration','taskGenerationCurrent','canHandleStory','canHandleParticipant','hasPendingNarrative','getDesktopRuntimePhase'];
    if (!s || methods.some(k => typeof s[k] !== 'function') || typeof s.getNarrator()?.decide !== 'function' || s.__atriSearchBridge) { engine.status = 'HDS接口不兼容或重复实例，未启用'; return; }
    if (s.config?.browser?.enabled) { engine.status = '请先关闭HDS内置browser.enabled，避免双线路执行；不删除旧观察或意图'; return; }
    service = s; base = s.getNarrator(); persist = s.persistDecision;
    s.__atriSearchBridge = true; engine.attach(s);
    wrapped = Object.create(base);
    wrapped.decide = async function(r) {
      if (!disposed && L.scope(r,c)) engine.lastWhere = { storyId:r.story.id, participantId:L.target(r,c).id };
      if (disposed || !engine.enabled() || !L.scope(r, c) || s.getDesktopRuntimePhase() === 'paused') return base.decide.call(base, r);
      const p = L.target(r, c), generation = s.taskGeneration(r.story.id), epoch = engine.epoch;
      let observations = [];
      try { observations = await engine.context(r); } catch { /* no network or invented fallback */ }
      const allow = engine.available() && !r.outputRecovery;
      const next = { ...r, story: { ...r.story, setting: { ...r.story.setting, world: (r.story.setting?.world || '') + '\n\n' + L.guide(c, allow) } },
        writingOptions: { ...r.writingOptions, browserMode: 'disabled' },
        webContext: [...(r.webContext || []), ...observations].slice(-8),
        contractFeatures: r.contractFeatures ? { ...r.contractFeatures, webObservation: true } : r.contractFeatures };
      const result = await base.decide.call(base, next);
      if (!result || typeof result !== 'object' || !Array.isArray(result.memories)) return result;
      for (const [k,m] of candidates) if (now() - m.at > 10 * 60000) candidates.delete(k);
      let found = false;
      const memories = result.memories.flatMap(m => {
        if (m?.category !== L.CATEGORY) return [m];
        const match = /^查询[：:]\s*(.+)$/.exec(String(m.content || '').trim()), q = match && L.query(match[1], c);
        if (found || !allow || !q || (typeof result.script !== 'string' || !result.script.trim()) || epoch !== engine.epoch || !s.taskGenerationCurrent(r.story.id, generation)) return [];
        found = true;
        const token = 'atri-search-intent:' + crypto.randomUUID();
        candidates.set(token, { query: q, storyId: r.story.id, participantId: p.id, generation, epoch, scriptHash: L.hash(result.script.trim()), at: now() });
        while (candidates.size > 64) candidates.delete(candidates.keys().next().value);
        // Opaque temporary capability survives HDS shallow copies; stripped before HDS persistence.
        return [{ ...m, content: token, participantId: p.id }];
      });
      return { ...result, memories, browserIntents: [] };
    };
    decoratedPersist = async function(...args) {
      if (disposed) return persist.apply(this, args);
      const raw = args[2], ms = raw?.memories;
      const tokens = Array.isArray(ms) ? ms.filter(m => m?.category === L.CATEGORY).map(m => m.content) : [];
      const meta = tokens.map(t => candidates.get(t)).find(m => m && m.storyId === args[0]?.id && (!args[1] || m.participantId === args[1].id) && m.scriptHash === L.hash(String(raw?.script || '').trim()) && now() - m.at <= 10 * 60000);
      // Never persist a query intention as a fabricated search memory.
      if (tokens.length) args[2] = { ...raw, memories: ms.filter(m => m?.category !== L.CATEGORY) };
      const result = await persist.apply(this, args); // commit must succeed FIRST
      for (const token of tokens) candidates.delete(token);
      if (meta && meta.epoch === engine.epoch && !disposed) {
        try { engine.enqueue(meta, result?.scriptEntry); } catch { engine.status = '搜索入队失败（未请求引擎）'; }
      }
      return result;
    };
    s.setNarrator(wrapped); s.persistDecision = decoratedPersist;
  }
  function detach() {
    if (!service) return;
    if (service.getNarrator() === wrapped) service.setNarrator(base);
    if (service.persistDecision === decoratedPersist) service.persistDecision = persist;
    delete service.__atriSearchBridge; engine.epoch++; for (const j of engine.jobs) engine.cancel(j, 'HDS已断开'); engine.jobs = []; engine.service = null; candidates.clear(); service = undefined;
  }
  ctx.inject(['interlude'], inner => { install(inner.interlude); inner.on('dispose', detach); });
  return { dispose() { disposed = true; detach(); }, candidates };
}
module.exports = { createBridge };
