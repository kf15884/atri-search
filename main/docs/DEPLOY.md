# 两端部署方案（替代0.1.0单端Brave教程）

本轮没有登录你的服务器。以下命令需你执行；先部署第二台，再升级主机，同一atri-search实例。不要同时升级HDS、B站、照片库或日记插件，便于定位兼容问题。

## 0. 前提与文件传输

ZIP已包含主插件tgz和第二台源码。先解压；所有地址/账号/Token留空或提示填写，不要原样使用占位符。Windows PowerShell上传整个ZIP（自行填远端地址，不能把第二台Linux命令直接贴进PowerShell）：

```powershell
$MainServer = Read-Host '主服务器地址'
$Node2Server = Read-Host '第二台地址'
$Node2Port = Read-Host '第二台SSH端口'
$Package = "$env:USERPROFILE\Downloads\Atri_Browser_0.2.0-beta.1.zip"
scp $Package "root@${MainServer}:/root/"
scp -P $Node2Port -i "$env:USERPROFILE\.ssh\atri_senses" $Package "atri@${Node2Server}:~/"
```

主机仍用既有SSH方式。第二台登录（Windows PowerShell）：

```powershell
ssh -p $Node2Port -i "$env:USERPROFILE\.ssh\atri_senses" "atri@$Node2Server"
```

## 1. 第二台终端（提示符应是atri@atri-senses）

先检查，不输出私有配置：

```bash
node -v
npm -v
command -v chromium
```

需要Node22或24及npm。Debian12默认软件源的nodejs可能不足，不要直接用旧版代替；缺失时先准备受支持Node，再继续。安装Debian Chromium：

```bash
sudo apt-get update
sudo apt-get install -y chromium unzip
unzip -q Atri_Browser_0.2.0-beta.1.zip
sudo bash Atri_Browser_0.2.0-beta.1/node2/deploy/install.sh
```

安装脚本要求Node版本，自动创建独立服务用户，`npm ci`使用锁定依赖，不安装HDS。首次会询问第二台WireGuard地址，并在本机生成随机Token，不显示到聊天。升级保留原config/Token/receipts，不重置。

### 防火墙（第二台终端）

只允许主服务器从wg0访问8103，不开放公网端口。若使用既有ufw：

```bash
read -r -p '填写主服务器WireGuard地址: ' MAIN_WG
NODE_WG=$(sudo node -p "JSON.parse(require('fs').readFileSync('/etc/atri-browser/config.json','utf8')).listenAddress")
sudo ufw allow in on wg0 from "$MAIN_WG" to "$NODE_WG" port 8103 proto tcp
sudo systemctl start atri-browser.service
systemctl is-enabled atri-browser.service
systemctl is-active atri-browser.service
```

不启用/重置整个防火墙，不更改SSH端口或其他已有规则。若ufw未在用，应在当前防火墙中加同等限定规则，不要为本插件另起一套。

服务地址为`http://<第二台WireGuard地址>:8103`。Token位于`/etc/atri-browser/config.json`，用你已有的SSH编辑器在本机查看后填入Koishi秘密字段；不要将整份文件/Token发到聊天。该配置归root:atri-browser、0640；状态目录归服务用户、0700。

Chromium以非root用户、启用浏览器sandbox启动，内部使用受限出口代理，代理仅本机可见、不暴露CDP。真实机器若因内核/沙箱限制启动失败，不静默添加--no-sandbox；先排查日志。systemd最多约1.5核CPU/2G内存，单任务；实际与Senses/照片库并发余量待现场观察。

## 2. 主服务器root终端（不是第二台，也不是PowerShell）

解压、检查SHA256SUMS，然后运行安装脚本：

```bash
cd /root
unzip -q Atri_Browser_0.2.0-beta.1.zip
cd Atri_Browser_0.2.0-beta.1
sha256sum -c SHA256SUMS
bash main/scripts/install-upgrade.sh /opt/hds-interlude hds-interlude.service
```

脚本将：

1. 确认是现有工程及现有koishi.db，找不到就退出，不初始化。
2. 暂停主服务；备份配置、依赖清单、旧插件和固定HDS包。
3. SQLite原生backup生成一致性快照，integrity_check验证备份；私有备份在`.atri-search-backups`，权限0700。
4. 离线、禁用安装脚本地安装新tgz；不拉latest。
5. 确认HDS与Koishi运行入口路径/哈希没变；所有SQLite表行数与内容摘要没变。
6. 只修正本插件代码属主，按原运行状态启动服务。

失败时保持服务停止，不自动覆盖旧数据库。若依赖/数据库校验失败，先保留错误和备份，不清库、不删除node_modules、不擅自升级HDS。服务运行后聊天会使数据库合法变化，**不要再拿安装前摘要要求数据库永久不变**。

脚本快照保护数据库；整个data中的照片等外部文件继续沿用现有完整备份机制。主机磁盘/原有损坏/其他插件并发写入无法靠本包绝对保证，需保留原备份与恢复路径。

## 3. Console配置

按`CONSOLE.md`逐项操作：

- 保留原atri-search实例；新增browserUrl/browserToken。
- 设置fallbackType；若用DeepSeek官方选deepseek-search，fallbackUrl留空；中转需有对应搜索端点文档，不能填普通chat/completions冒充联网。
- 在本机填fallbackKey；不会自动复制模型Key，旧apiKey只兼容Brave。
- 默认每日3项、间隔30分钟、浏览器35秒、API20秒、整项90秒。总时限应大于两段时限及必要准备；过短会取消整个任务而非保证跑完备用线路。
- HDS内置browser.enabled如开启则关闭，防止重复执行；保留所有原有数据。
- 保留enabled=false完成配置，然后打开；模板人设末尾追加精简段落，当前故事通过preview/apply确认入口追加。

## 4. QQ私聊验收

1. `/asearch`：主插件0.2.0-beta.1、HDS挂接、开关、浏览器/备用配置。仅“已配置”不证明真实可用。
2. `/asearch health`：检查第二台版本、鉴权、Chromium文件。健康接口不会产生搜索记录，不等于浏览器成功。
3. 正常聊一句定位现有故事；如需要，按CONSOLE.md做persona preview/apply。
4. 以公开主题自然聊天，请她感兴趣时查一查。HDS可不搜索，不为验收强制每轮调用。
5. `/asearch`应能看到取得**浏览器**摘要；`/asearch history`只有实际提交的查询词。结果在之后合适HDS回合出现，不强制马上发消息。
6. 第一条线路实测通过后，再测试故障兜底：第二台临时停止atri-browser，发起新的合规任务；主机API应成功，状态显示browser失败阶段与API结果；测试结束启动第二台服务。冷却/日限额仍生效，不靠删历史重置。
7. 两线路均失败时，HDS只得到“未获取信息”，不编造事实；不要公开错误响应全文或密钥。
8. `/asearch pause`后旧结果失效；resume不重放。重启保持最近20条、暂停、额度；不恢复未完成任务。
9. 与B站、照片、日记共存及真实模型意图稳定性需单独现场观察；本地隔离测试不是已上线回执。

## 5. 如何告知新增功能

真实浏览器验证成功后，你可以正常告诉她“这次更新是我给你加了浏览器工具……”。也可手动`/asearch introduce`写一条真实管理员注记，不伪造用户发言或感受；不需要两者都做。

## 6. 暂停与回退

先在Koishi停用atri-search实例；第二台可`sudo systemctl stop atri-browser.service`，其他服务不动。主机需要代码回退时，用私有备份恢复旧插件与对应清单；不要把旧koishi.db/整个data覆盖回去，避免丢掉新聊天。新增人设可在确认后仅移除追加段落，不清overlay；新增管理员注记是审计事实，不靠清库“撤销”。

本版不自动执行任何数据恢复/删除。服务恢复前若对依赖状态有疑问，先检查，不在未知状态下强行重启。
