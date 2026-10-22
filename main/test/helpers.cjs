'use strict';
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { Store } = require('../store'), { Engine } = require('../engine'), { hash } = require('../logic');
function fixture(t, patch = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atri-search-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const c = { enabled: true, platform: 'onebot', selfId: 'BOT_ACCOUNT', targetUserId: 'OWNER_ACCOUNT', apiKey: 'TEST_ONLY_CREDENTIAL', resultLimit: 3, timeoutSec: 2, dailyLimit: 8, gapMin: 30, resultTtlMin: 60, timezone: 'Asia/Shanghai', blockedTerms: [], interests: '天文', ...patch };
  let now = Date.UTC(2026, 0, 1, 4), calls = 0, busy = false, generation = 'g1';
  const story = { id: 'story-test', platform: c.platform, selfId: c.selfId, status: 'active', setting: { world: '原世界' } };
  const participant = { id: 'participant-test', storyId: story.id, platform: c.platform, selfId: c.selfId, userId: c.targetUserId, channelId: `private:${c.targetUserId}`, status: 'active' };
  const source = { id: 11, kind: 'script', storyId: story.id, participantId: participant.id, content: 'Atri决定查查天文。' };
  const rows = [source], service = { getStory: async () => story, getParticipant: async () => participant,
    dbGet: async (_table, query) => rows.filter(x => x.id === query.id && x.storyId === query.storyId),
    taskGeneration: () => generation, taskGenerationCurrent: (_s, g) => g === generation && story.status === 'active',
    canHandleStory: () => true, canHandleParticipant: () => true, getDesktopRuntimePhase: () => 'running', hasPendingNarrative: () => busy };
  const provider = { configured: () => !!c.apiKey, search: async (_q, { onSubmit }) => { onSubmit(); calls++; return [{ title: '天文资料', excerpt: '真实测试摘要', url: 'https://example.org/astronomy' }]; } };
  const store = new Store(dir), engine = new Engine(c, store, provider, { now: () => now }); engine.attach(service);
  t.after(() => engine.dispose());
  const meta = { storyId: story.id, participantId: participant.id, query: '天文 星云形成', generation, epoch: engine.epoch, scriptHash: hash(source.content), at: now };
  const req = { phase: 'user-message', story, participant, participants: [participant], userMessage: '在看什么', webContext: [] };
  return { c, dir, store, engine, provider, service, story, participant, source, rows, meta, req, now: () => now, advance: n => now += n, calls: () => calls, busy: x => busy = x, generation: x => generation = x };
}
module.exports = { fixture };
