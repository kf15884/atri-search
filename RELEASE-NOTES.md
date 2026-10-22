# Atri Search / Browser 0.2.0-beta.1

Atri子项目，与[HDS-Interlude](https://github.com/ISEKAI-MomoiCore/HDS-Interlude)结合。HDS正式剧情提交后，主机异步协调第二台真实Chromium搜索；技术失败/空结果转主机搜索API，再失败只返回未获取信息。取消/暂停/来源删除不触发兜底。

结果回流HDS后续webContext，由原有人设决定感想与分享；无独立人格模型或QQ推送器。最近20条真实查询，有限队列/冷却/日额度/租约与重启不重放。公开只读阶段，不开放账号登录或社交写入。

主端55项、第二台9项本地测试通过，最终tgz另通过真实HDS rc57宿主往返；浏览器真实表单仅本地夹具，模型/API模拟。用户已确认两端部署及整体验收完成，未提供每个兜底/故障分支单独最终回执。

主机升级一致性备份与全表摘要检查；当前故事人设备份后追加，保留overlay/记忆/剧情。第二台需Node22/24和Chromium；网络受限时可使用另附离线npm依赖缓存，仅Playwright1.64.1两项依赖，不含Chromium二进制。

配置均需自行填写，公开包不包含地址/账号/Key/Token/人设全文/生产数据。默认不启用；部署与人设指南见main/docs。
