#!/usr/bin/env bash
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo '请在主服务器root终端执行。'; exit 1; }
HOST_DIR="${1:-/opt/hds-interlude}"
SERVICE="${2:-hds-interlude.service}"
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
TGZ="$ROOT/dist/koishi-plugin-atri-search-0.2.0-beta.1.tgz"
[ -f "$TGZ" ] || { echo '请从完整ZIP中的main/scripts运行，不是从已安装的node_modules运行。'; exit 1; }
cd "$HOST_DIR"
[ -f package.json ] && [ -f data/koishi.db ] || { echo '现有工程/数据库路径不匹配，不创建新工程或数据库。'; exit 1; }
HDS_ENTRY="$(node -p 'require.resolve("koishi-plugin-hds-interlude")')"
KOISHI_ENTRY="$(node -p 'require.resolve("koishi")')"
HDS_HASH="$(sha256sum "$HDS_ENTRY" | cut -d' ' -f1)"
KOISHI_HASH="$(sha256sum "$KOISHI_ENTRY" | cut -d' ' -f1)"
WAS_ACTIVE=0
systemctl is-active --quiet "$SERVICE" && WAS_ACTIVE=1
systemctl stop "$SERVICE"
# On failure remain stopped: never start an unverified partial dependency upgrade.
trap 'echo "未完成时请勿清库或覆盖旧data；保留备份并检查错误。"' ERR
BACKUP="$HOST_DIR/.atri-search-backups/$(date -u +%Y%m%dT%H%M%SZ)-browser020"
install -d -m 700 "$BACKUP"
cp -p package.json "$BACKUP/"
[ ! -f package-lock.json ] || cp -p package-lock.json "$BACKUP/"
[ ! -f koishi.yml ] || cp -p koishi.yml "$BACKUP/"
[ ! -d node_modules/koishi-plugin-atri-search ] || cp -aL node_modules/koishi-plugin-atri-search "$BACKUP/previous-plugin"
cp -aL node_modules/koishi-plugin-hds-interlude "$BACKUP/hds-package"
python3 "$ROOT/scripts/data-guard.py" backup --db "$HOST_DIR/data/koishi.db" --dir "$BACKUP/database"
umask 022
npm install --offline --ignore-scripts --no-audit --no-fund --legacy-peer-deps "$TGZ"
[ "$(node -p 'require.resolve("koishi-plugin-hds-interlude")')" = "$HDS_ENTRY" ]
[ "$(sha256sum "$HDS_ENTRY" | cut -d' ' -f1)" = "$HDS_HASH" ]
[ "$(node -p 'require.resolve("koishi")')" = "$KOISHI_ENTRY" ]
[ "$(sha256sum "$KOISHI_ENTRY" | cut -d' ' -f1)" = "$KOISHI_HASH" ]
python3 "$ROOT/scripts/data-guard.py" check --db "$HOST_DIR/data/koishi.db" --dir "$BACKUP/database"
chown -R hdsinterlude:hdsinterlude node_modules/koishi-plugin-atri-search
printf '代码安装完成，数据库未变化。私有备份：%s\n' "$BACKUP"
if [ "$WAS_ACTIVE" -eq 1 ]; then systemctl start "$SERVICE"; echo '原服务已启动。'; else echo '原服务本就未运行，保持停止。'; fi
