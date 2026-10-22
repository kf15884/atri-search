'use strict';
const fs = require('node:fs'), path = require('node:path');
class Store {
  constructor(dir) {
    this.dir = dir; fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); fs.chmodSync(dir, 0o700);
    this.history = this.read('history.json', []);
    if (!Array.isArray(this.history) || this.history.some(x => typeof x !== 'string')) throw new Error('invalid-history');
    this.history = this.history.slice(-20);
    this.state = this.read('state.json', { paused: false, day: '', used: 0, lastAt: 0, receipts: [] });
    const st = this.state;
    if (!st || typeof st !== 'object' || typeof st.paused !== 'boolean' || typeof st.day !== 'string' || !Number.isSafeInteger(st.used) || st.used < 0 || !Number.isFinite(st.lastAt) || st.lastAt < 0 || !Array.isArray(st.receipts) || st.receipts.some(x => !/^[a-f0-9]{64}$/.test(x?.key) || !Number.isFinite(x.at) || x.at < 0)) throw new Error('invalid-state');
    st.receipts = st.receipts.slice(-100);
    this.save();
  }
  read(name, fallback) { try { const p = path.join(this.dir, name); fs.chmodSync(p, 0o600); return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return fallback; throw e; } }
  write(name, data) {
    const file = path.join(this.dir, name), temp = file + '.tmp';
    const fd = fs.openSync(temp, 'w', 0o600);
    try { fs.fchmodSync(fd, 0o600); fs.writeFileSync(fd, JSON.stringify(data, null, 2) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temp, file);
  }
  save() { this.write('history.json', this.history); this.write('state.json', this.state); }
  reserve(now, day) {
    if (this.state.day !== day) { this.state.day = day; this.state.used = 0; }
    this.state.used++; this.state.lastAt = now; this.write('state.json', this.state);
  }
  recordAttempt(q) { this.history.push(q); this.history = this.history.slice(-20); this.write('history.json', this.history); }
  submitted(q, now, day) {
    // Write-ahead accounting: means handed to the HTTP client, NOT proven received by engine.
    this.history.push(q); this.history = this.history.slice(-20);
    if (this.state.day !== day) { this.state.day = day; this.state.used = 0; }
    this.state.used++; this.state.lastAt = now; this.write('state.json', this.state); this.write('history.json', this.history);
  }
  receipt(key, at) { this.state.receipts.push({ key, at }); this.state.receipts = this.state.receipts.slice(-100); this.write('state.json', this.state); }
  clearHistory() { this.history = []; this.write('history.json', this.history); }
}
module.exports = { Store };
