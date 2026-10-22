#!/usr/bin/env python3
"""Read-only source SQLite audit + consistent backup. No schema/data mutation."""
import argparse,base64,hashlib,json,os,sqlite3,sys
from pathlib import Path
from urllib.parse import quote

def digest(db):
    result={}
    names=[r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
    for name in names:
        ident='"'+name.replace('"','""')+'"'
        hashes=[]
        for row in db.execute('SELECT * FROM '+ident):
            values=[{'blob':base64.b64encode(v).decode()} if isinstance(v,bytes) else v for v in row]
            hashes.append(hashlib.sha256(json.dumps(values,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode()).hexdigest())
        hashes.sort()
        result[name]={'rows':len(hashes),'sha256':hashlib.sha256(''.join(hashes).encode()).hexdigest()}
    return result

def main():
    p=argparse.ArgumentParser();p.add_argument('action',choices=['backup','check']);p.add_argument('--db',required=True);p.add_argument('--dir',required=True);a=p.parse_args()
    os.umask(0o077);folder=Path(a.dir).resolve()
    if a.action=='backup':folder.mkdir(mode=0o700,parents=True,exist_ok=False)
    else:
        if not folder.is_dir():raise RuntimeError('backup-directory-not-found')
    uri='file:'+quote(str(Path(a.db).resolve()),safe='/')+'?mode=ro'
    with sqlite3.connect(uri,uri=True) as source:
        source.execute('PRAGMA query_only=ON')
        if source.execute('PRAGMA quick_check').fetchone()[0]!='ok':raise RuntimeError('source-integrity-failed')
        if a.action=='backup':
            dest=folder/'koishi.db';out=sqlite3.connect(dest)
            try:source.backup(out)
            finally:out.close()
            os.chmod(dest,0o600)
            with sqlite3.connect('file:'+quote(str(dest),safe='/')+'?mode=ro',uri=True) as snapshot:
                if snapshot.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise RuntimeError('backup-integrity-failed')
                manifest=digest(snapshot)
            (folder/'audit.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n');os.chmod(folder/'audit.json',0o600)
            print('已创建一致性SQLite备份与只读校验清单；请保留在私有目录。')
        else:
            before=json.loads((folder/'audit.json').read_text());after=digest(source)
            changed=[k for k in sorted(set(before)|set(after)) if before.get(k)!=after.get(k)]
            if changed:
                print('校验未通过：数据库内容已变化。服务运行时有新聊天也会导致变化；不要自动覆盖回旧库。');sys.exit(2)
            print('校验通过：所有表的行数与内容摘要一致；数据库未变化。')
if __name__=='__main__':
    try:main()
    except Exception:
        print('数据保护操作失败：检查路径、权限、数据库状态；没有执行清库或自动修复。',file=sys.stderr);sys.exit(1)
