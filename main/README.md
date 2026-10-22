# Atri 浏览器主插件 0.2.0-beta.1

Atri子项目，扩展[HDS-Interlude](https://github.com/ISEKAI-MomoiCore/HDS-Interlude)，非官方组件。**不修改HDS核心，不清库、不重建故事、不清除overlay。**

## 与旧版的区别

仍使用 `koishi-plugin-atri-search` / Koishi实例名 `atri-search` 和 `data/atri-search`，升级原实例，不并排装两个。

0.1.0为主机直连Brave原型；本版是：**第二台真实浏览器优先 → 失败/无结果时主服务器API兜底 → 再失败返回“未获取信息”**。只要浏览器主线路未配置，就不启用自主工具，避免旧Key导致升级后静默继续API直连。

主机负责HDS桥接、任务来源、取消、权限、API兜底与历史；第二台只做浏览器外设，不运行第二套人格，不写主机数据库，不直接发QQ。

## 执行与回复

HDS照常生成 → 正式persistDecision成功并获得相符源剧本 → 有界后台任务 → 真实资料回流后续webContext → HDS决定感想、记忆与分享。普通聊天不等浏览器，不加每条消息的意图判断模型，不直接催发“搜索完成”。

暂停/重置/来源删除/身份停用时任务失效，不走API继续执行。浏览器与API最多各一轮；API必须有结构化真实结果，普通聊天模型自称“查到了”不算。

HDS内置 `browser.enabled` 必须关闭，否则桥接拒绝启用，避免双执行；不删除既有观察、意图和历史。插件对自己处理的回合关闭原生browserIntent执行入口；不改HDS源码。

## 历史与计费

`history.json`继续只保存最近20条实际尝试提交的查询词；浏览器提交回执与API提交分别记账，同词两次尝试保留两条。查询词以外的状态、预算、去重哈希分开保存；不保存原聊天到历史。

第二台只有收到真实页面查询提交时才产生回执。服务突然崩溃或网络失联时，部分远端提交可能无法确认，不伪造缺失历史；租约到期关闭任务，不重放未知请求。历史记录代表尝试提交，不证明引擎收到或计费。浏览器与API共用一次**逻辑任务**额度，默认每日3项、间隔30分钟；两次外部尝试仍可能各有供应商费用。

排队/结果只在内存，重启不重放；结果默认60分钟过期。旧版历史、额度、暂停和去重哈希保留；不会迁移或删除HDS故事数据。

## 管理指令（只接受配置本人私聊的完整前缀）

- `/asearch`：状态与失败阶段，不输出Token/Key。
- `/asearch history`：最近20条查询词。
- `/asearch pause` / `resume`：暂停取消/恢复，不重放。
- `/asearch clear`：明确清空插件历史与结果；不清HDS、额度或去重。本轮更新无需执行。
- `/asearch persona preview`：只读预览当前故事追加人设，需要原有HDS管理权限；先正常聊一句定位当前故事。
- `/asearch persona apply 确认码`：确认后先私有备份，仅追加character.profile；原人设变化时拒绝覆盖，确认码10分钟有效。**不自动写Console模板，不修改state/overlay。**
- `/asearch introduce`：先验证第二台版本，再由HDS原生管理员注记记下“是对方在更新中接入工具”。明确手动触发、去重，不伪造用户发言或阅读成功。也可以改用本人自然聊天告知，不必两者都做。

## 配置

| 字段 | 含义 |
|---|---|
| enabled | 默认false，部署验证后再开 |
| selfId / targetUserId | 请填写机器人/本人账号，不改HDS白名单 |
| browserUrl / browserToken | 请填写第二台WireGuard服务地址和独立Token；仅允许私网地址，不能使用公网浏览器入口 |
| browserTimeoutSec | 默认35秒 |
| fallbackType | deepseek-search / brave / custom-json / disabled；按实际供应商选择 |
| fallbackUrl | 自定义完整HTTPS搜索端点；DeepSeek/Brave留空使用官方端点，不填普通chat/completions |
| fallbackKey | 请在本机秘密配置中填写；不自动复制HDS Key |
| apiKey | 兼容旧版Brave Key，新配置用fallbackKey；不把旧Brave Key误当DeepSeek Key |
| fallbackTimeoutSec | 默认20秒 |
| timeoutSec | 整项任务默认90秒，包含等待和两条线路 |
| dailyLimit / gapMin | 默认3项/日、30分钟 |
| resultLimit / resultTtlMin | 默认3条/60分钟 |
| blockedTerms | 自填真实姓名、私人昵称、地址等；仅启发式过滤，不能保证语义隐私 |

`custom-json`请求为POST `{query,count,need_content:false}`、Bearer鉴权；响应必须是`{results:[{title,url,snippet/summary/excerpt}]}`。不声称任意OpenAI兼容中转都能联网。API地址只允许公共HTTPS并校验/固定DNS，不转跳、不读聊天原文或定位IP。

## 保护边界

人设只表达习惯，插件只在请求副本补充精简能力/状态；不会每轮把能力追加成永久人设。失败以failed证据回流，不制造固定报错对话。实际来源与“仅摘要”标记放入HDS不会丢弃的excerpt中。

数据保护工具与部署流程见`docs/DEPLOY.md`和`docs/CONSOLE.md`。备份含私密数据，只留服务器，不上传GitHub。不能对未检查的生产磁盘/既有故障作绝对承诺；先一致性备份、停服务校验，再按步骤更新。
