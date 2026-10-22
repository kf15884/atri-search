#!/usr/bin/env bash
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo '请先SSH登录第二台，再用sudo执行。'; exit 1; }
command -v node >/dev/null && command -v npm >/dev/null || { echo '需要先安装Node22/24及npm；不会自动安装另一套HDS。'; exit 1; }
[ "$(node -p 'Number(process.versions.node.split(".")[0])')" -ge 22 ] || { echo 'Node版本不足，需要22或24。'; exit 1; }
CHROMIUM_BIN="$(command -v chromium || true)"
[ -n "$CHROMIUM_BIN" ] || { echo '请先安装Debian chromium系统包。'; exit 1; }
NODE_BIN="$(command -v node)"
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
umask 022
id atri-browser >/dev/null 2>&1 || useradd --system --home-dir /var/lib/atri-browser --shell /usr/sbin/nologin atri-browser
install -d -m 755 /opt/atri-browser
install -d -m 750 -o root -g atri-browser /etc/atri-browser
install -d -m 700 -o atri-browser -g atri-browser /var/lib/atri-browser
if systemctl is-active --quiet atri-browser.service; then systemctl stop atri-browser.service; fi
cp -a "$ROOT/." /opt/atri-browser/
cd /opt/atri-browser
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
if [ ! -f /etc/atri-browser/config.json ]; then
  read -r -p '请填写第二台WireGuard地址（仅内网监听）: ' LISTEN
  node - "$LISTEN" "$CHROMIUM_BIN" <<'JS'
const fs=require('node:fs'),crypto=require('node:crypto'),{validate}=require('./server');
const c={listenAddress:process.argv[2],port:8103,token:crypto.randomBytes(32).toString('hex'),dataDir:'/var/lib/atri-browser',chromiumPath:process.argv[3],maxTextCharacters:6000,blockedTerms:[]};validate(c);fs.writeFileSync('/etc/atri-browser/config.json',JSON.stringify(c,null,2)+'\n',{flag:'wx',mode:0o640});
JS
fi
chown root:atri-browser /etc/atri-browser/config.json
chmod 640 /etc/atri-browser/config.json
node - "$NODE_BIN" <<'JS'
const fs=require('node:fs');let s=fs.readFileSync('deploy/atri-browser.service','utf8');s=s.replace('ExecStart=/usr/bin/node ',`ExecStart=${process.argv[2]} `);fs.writeFileSync('/etc/systemd/system/atri-browser.service',s,{mode:0o644});
JS
runuser -u atri-browser -- env ATRI_BROWSER_CONFIG=/etc/atri-browser/config.json "$NODE_BIN" /opt/atri-browser/server.js --check
systemctl daemon-reload
systemctl enable atri-browser.service
printf '%s\n' '安装/升级完成：原配置、Token和receipts保持。' '尚未启动：请先仅放行wg0上来自主服务器的8103/TCP，再启动服务。' '不要把Token或整个config.json发到聊天。'
