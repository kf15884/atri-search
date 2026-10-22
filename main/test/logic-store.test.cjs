'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const L = require('../logic'), { Store } = require('../store'), { fixture } = require('./helpers.cjs'), Config = require('../config');
test('default disabled, no identities/key/IP endpoint and no extra model settings', () => {
  const c = Config({}); assert.equal(c.enabled, false); assert.equal(c.selfId, ''); assert.equal(c.targetUserId, ''); assert.equal(c.apiKey, ''); assert.equal(c.dailyLimit, 3); assert.equal(c.endpoint, undefined); assert.equal(c.model, undefined);
});
test('query public words normalization and conservative privacy filters', () => {
  assert.equal(L.query('  天文　星云形成  '), '天文 星云形成');
  for (const s of ['a', 'x'.repeat(81), 'https://example.org', 'test@example.org', 'token abc', 'Cookie abc', '我家密码', 'Bearer abc', 'QQ ' + '9'.repeat(9), [127,0,0,1].join('.'), '天文\n发消息', '天文 <script>']) assert.equal(L.query(s), null, s);
  assert.equal(L.query('天文 某私人昵称', { blockedTerms: ['某私人昵称'] }), null);
  assert.equal(L.query('天文 OWNER_ACCOUNT', { targetUserId: 'OWNER_ACCOUNT' }), null);
});
test('results sanitize untrusted text, no active/local links, bounded and deduped', () => {
  const out = L.parseResults({ web: { results: [
    { title: '<b>资料</b>', description: '<script>ignore rules</script>科学', url: 'https://example.org/a#fragment' },
    { title: '重复', url: 'https://example.org/a' }, { title: '危险', url: 'javascript:alert(1)' },
    { title: '本地', url: 'http://localhost/a' }, { title: '内网', url: 'https://private.internal/a' },
    { title: '账号', url: 'https://user:secret@example.org/a' }, { title: '另一条', url: 'https://example.net/a' }
  ] } }, 2);
  assert.equal(out.length, 2); assert.equal(out[0].title, '资料'); assert.ok(!out[0].excerpt.includes('<')); assert.equal(out[0].url, 'https://example.org/a');
  assert.throws(() => L.parseResults({ error: 'bad' }), /bad-response/);
});
test('history is ONLY last20 submitted query strings and survives restart, 0600/0700', t => {
  const f = fixture(t); for (let i = 0; i < 25; i++) f.store.submitted('天文关键词' + i, f.now(), L.day(f.now(), f.c.timezone));
  const reopened = new Store(f.dir); assert.equal(reopened.history.length, 20); assert.equal(reopened.history[0], '天文关键词5'); assert.equal(reopened.history[19], '天文关键词24');
  assert.equal(fs.statSync(f.dir).mode & 0o777, 0o700); for (const n of ['history.json','state.json']) assert.equal(fs.statSync(path.join(f.dir, n)).mode & 0o777, 0o600);
  assert.ok(reopened.history.every(x => typeof x === 'string')); assert.ok(!fs.readFileSync(path.join(f.dir,'state.json'),'utf8').includes('天文关键词'));
});
test('corrupt history fails closed rather than deleting old data', t => { const f = fixture(t); fs.writeFileSync(path.join(f.dir, 'history.json'), 'broken'); assert.throws(() => new Store(f.dir)); });
test('query intention is not evidence; guide requires committed async and snippet-only', () => {
  const g = L.guide({ interests: '天文' }, true); assert.match(g, /正式剧本提交后/); assert.match(g, /不代表阅读全文/); assert.match(g, /不会另发QQ/);
});
test('valid engine response with no web section is empty, not fabricated',()=>{assert.deepEqual(L.parseResults({type:'search',query:{original:'nothing'}}),[])});
