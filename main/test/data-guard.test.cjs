'use strict';
const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
test('SQLite data guard backs up WAL-consistent data readonly; detects changes without repairing/deleting',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'atri-db-guard-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const db=path.join(dir,'test.db'),out=path.join(dir,'snapshot'),script=path.resolve(__dirname,'../scripts/data-guard.py');
 let r=spawnSync('python3',['-c',"import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.execute('PRAGMA journal_mode=WAL');c.execute('CREATE TABLE life(id INTEGER PRIMARY KEY, content TEXT)');c.execute('INSERT INTO life VALUES(1,?)',('原有记忆',));c.commit()",db]);assert.equal(r.status,0);
 const run=a=>spawnSync('python3',[script,a,'--db',db,'--dir',out],{encoding:'utf8'});assert.equal(run('backup').status,0);assert.equal(run('check').status,0);assert.equal(fs.statSync(path.join(out,'koishi.db')).mode&0o777,0o600);
 r=spawnSync('python3',['-c',"import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.execute('INSERT INTO life VALUES(2,?)',('新的真实聊天',));c.commit()",db]);assert.equal(r.status,0);assert.equal(run('check').status,2);
 r=spawnSync('python3',['-c',"import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);print(c.execute('SELECT count(*) FROM life').fetchone()[0])",db],{encoding:'utf8'});assert.equal(r.stdout.trim(),'2');
});
