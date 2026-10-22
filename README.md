# Atri 浏览器工具 0.2.0-beta.1

Atri子项目 / [HDS-Interlude](https://github.com/ISEKAI-MomoiCore/HDS-Interlude)的非官方扩展。

- `main/`：原atri-search实例升级，HDS提交后异步协调、主机API兜底、最近20条查询词、人设追加确认工具。
- `main/dist/`：可安装tgz。
- `node2/`：第二台Playwright + Chromium服务；实际在Bing网页填写/提交/读取DOM，不用API冒充浏览器。
- `main/docs/CONSOLE.md`：人设精简文本、Console修改点、当前故事更新与功能接入告知。
- `main/docs/DEPLOY.md`：两端部署、备份、验收和回退。
- `main/docs/QA.md`：本地测试与未验收边界。

用户已确认两端部署及整体验收完成；各备用/故障分支未提供单独最终回执。发布为可选Beta，不代表HDS官方或npm市场发布。见RELEASE-NOTES.md。

首版HDS只提出搜索任务；第二台已具有受限公开页面read操作接口，为后续阅读扩展准备。账号登录、点击任意控件、表单提交、脚本执行、下载、上传、发帖/私信都未开放。API兜底仅适用于公开搜索，不泛化到未来账号写入。

配置均留空/填写提示。无个人账号、服务器IP、真实Token/Key、Cookie、人设全文、参考图或生产数据。运行源码MIT；HDS核心AGPL-3.0及其他依赖许可不变，本包不再分发HDS核心或Chromium二进制。
