# Console与人设修改方案（不清库/不重建/不清演化）

## 精简人设

仅在现有characterProfile原文末尾追加，不替换全文：

> Atri会按自己的好奇心和实际需要，使用浏览器查阅公开资料，逐渐形成兴趣与感想；不必每次都搜索或分享，也不把尚未取得的资料当作已经读过。

## Console改动清单

| 位置 | 修改 |
|---|---|
| HDS → 故事档案 → characterProfile | 在原文末尾追加上段；这是模板，不保证当前故事自动同步 |
| HDS → browser.enabled | 如为true，改false，避免原生Puppeteer与本插件重复检索；不删除旧数据、不卸载其他插件依赖 |
| atri-search原实例 | 升级到0.2.0-beta.1，只保留一个实例；填写第二台地址/Token、备用搜索API类型/端点/Key |
| HDS → runtime.autoAdvanceEnabled | 如需无人聊天时自主使用，需要已启用生活推进；保持既有节奏，不自动改值 |
| HDS → runtime.allowProactiveMessages | 只影响主动分享；按原有意愿保留，不为搜索强制开启 |
| HDS → sharedStory.managerAccounts与互动白名单 | 不更改；人设更新/注记沿用原有管理权限，拒绝时先核实权限，不放开全部人 |

**不改**：model主叙事路由/extraBody、mainPrompt/stylePrompt/fixedPrompt、world、perspective(s)、relationship、supplementaryFacts、记忆/压缩设置、data路径、数据库绑定、QQ身份、既有overlay。浏览器技术规则只放请求级说明，真实资料放webContext。

不要用preset整段覆盖当前故事来同步一个小词条。绝对不要运行interlude.reset / interlude.database.clear / interlude.overlay.clear，不删除sqlite或data，不重新init。

## 更新当前正在运行的故事

1. 安装完成后，在Console模板中追加上段，保存应用；其他人设原文保持。
2. 插件配置账号/第二台地址，保留同一实例。在本人私聊正常聊一句，供插件定位**现有**故事，不创建新故事。
3. 发 `/asearch persona preview`，只读预览；会给一次性确认码，不把完整私密人设打印到聊天。
4. 核对后发 `/asearch persona apply 确认码`。
5. 插件在HDS现有serial内重读当前故事；原文哈希变化则拒绝更新。先以0600在私有目录备份setting/state，调用HDS原生updateSetting，仅将新段落追加到原character.profile。
6. 故事ID、原profile、world、relationship、perspectives、state.settingOverlay、记忆与剧本均保留。已经有相同段落则不重复追加。

该入口不自动编辑koishi.yml，不自动创建故事、不清理演化层。备份在data/atri-search/private-backups，含隐私，不得公开。正常HDS后续生活/记忆整理仍可能产生合法演化，不应将其当成插件清除数据。

## 让Atri理解是你添加了功能

优先在确认浏览器线路实际成功后，由你自然告诉她：

> 这次更新里，我给你加了一个浏览器工具。你可以按自己的兴趣查资料，不用为了展示功能而每次都用，也不用每次都告诉我；有想聊的发现再分享就好。

这是真实用户发言，不由插件伪造。也可手动执行 `/asearch introduce`：检查第二台版本后，写一条去重的HDS原生管理员注记，说明是对方接入工具、接入不等于已经搜索成功。该步骤不自动编造开心/感谢等情绪、不强制加长期记忆、不直接发QQ。两种方式选一种即可。

本轮只核对了固定源码与既有交接信息，没有读取服务器当前Console私密配置；实施时逐项检查，不假定现场值。
