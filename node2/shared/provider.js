'use strict';
const https = require('node:https'), dns = require('node:dns').promises, net = require('node:net');
const { parseResults } = require('./logic');
const fault = code => Object.assign(new Error(code), { code });
function publicAddress(ip) {
  const v = net.isIP(ip);
  if (v === 4) {
    const [a,b,c] = ip.split('.').map(Number);
    return a > 0 && a < 224 && ![10,127].includes(a) && !(a === 100 && b >= 64 && b <= 127) && !(a === 169 && b === 254) && !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && (b === 168 || b === 0 || b === 2)) && !(a === 198 && (b === 18 || b === 19 || b === 51)) && !(a === 203 && b === 0 && c === 113);
  }
  return v === 6 && /^[23]/.test(ip) && !/^2001:(?:db8|0):/i.test(ip);
}
class BraveProvider {
  constructor(c, deps = {}) { this.c = c; this.lookup = deps.lookup || dns.lookup; this.request = deps.request || https.request; }
  configured() { return !!this.c.apiKey?.trim(); }
  async search(q, { signal, onSubmit, beforeSubmit }) {
    if (!this.configured()) throw fault('not-configured');
    if (signal.aborted) throw fault('cancelled');
    // Fixed provider, no arbitrary endpoints; pin public DNS result; never follow redirects.
    let rows;
    try { rows = await this.lookup('api.search.brave.com', { all: true }); } catch { throw fault('dns-failed'); }
    if (!Array.isArray(rows) || !rows.length || rows.some(r => !publicAddress(r.address))) throw fault('unsafe-dns');
    if (signal.aborted) throw fault('cancelled');
    if (beforeSubmit) await beforeSubmit();
    if (signal.aborted) throw fault('cancelled');
    const address = rows[0];
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', q); url.searchParams.set('count', String(this.c.resultLimit)); url.searchParams.set('safesearch', 'strict');
    return new Promise((resolve, reject) => {
      let req, settled = false, timeout;
      const done = (err, data) => { if (settled) return; settled = true; clearTimeout(timeout); signal.removeEventListener('abort', abort); err ? reject(err) : resolve(data); };
      const abort = () => { req?.destroy(); done(fault('cancelled')); };
      try {
        req = this.request(url, { method: 'GET', agent: false, headers: { Accept: 'application/json', 'X-Subscription-Token': this.c.apiKey },
          lookup: (_host, opts, cb) => opts?.all ? cb(null, [address]) : cb(null, address.address, address.family) }, res => {
          if (res.statusCode !== 200) { res.resume(); return done(fault(res.statusCode === 429 ? 'rate-limited' : res.statusCode === 401 || res.statusCode === 403 ? 'provider-auth' : 'provider-http')); }
          let size = 0; const chunks = [];
          res.on('data', b => { size += b.length; if (size > 512 * 1024) { req.destroy(); done(fault('response-too-large')); } else chunks.push(b); });
          res.on('error', () => done(fault('response-failed')));
          res.on('end', () => { try { done(null, parseResults(JSON.parse(Buffer.concat(chunks).toString('utf8')), this.c.resultLimit)); } catch { done(fault('bad-response')); } });
        });
        req.on('error', () => done(fault('network-failed')));
        signal.addEventListener('abort', abort, { once: true });
        timeout = setTimeout(() => { req.destroy(); done(fault('timeout')); }, this.c.timeoutSec * 1000);
        if (signal.aborted) return abort();
        // No retries. Record immediately before the sole end() submission.
        onSubmit(); req.end();
      } catch (e) { req?.destroy(); done(fault(['deferred', 'cancelled'].includes(e?.code) ? e.code : 'submission-failed')); }
    });
  }
}
module.exports = { BraveProvider, publicAddress };
