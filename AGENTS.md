# Agent 约定（Open Channel）

[English](AGENTS.en.md)

## 协议变更

修改行为或字段时**同时**更新：

- `docs/SPEC.md`（状态码与能力语义）与英译镜像 `docs/en/SPEC.md`
- `schema/ocp.v1.schema.json` 与 `schema/fixtures/`
- `@open-channel/sdk`（TypeScript）与 `sdk/python/openchannel`
- 相关测试（`test/`、`server/test/`、`sdk/**/test*`、`e2e/`）

形状以 schema 为准；HTTP 语义以中文 SPEC 为准。

## 接到别的产品

先读 `docs/SPEC.md`、`schema/ocp.v1.schema.json`、`docs/ADAPT.md`。每个 origin 一个客户端。跨提供方关联只用链接的 `target_url`（频道资源 URL），不要把对方频道 id 写成 `target_id`。没有的能力在发现文档里为 `false`，对应路由返回 `capability_unsupported`；未实现列表 `filter` 时带该参数必须 400。不要从 `examples/native` 抄修订、分享或 SCIM。产品里已有这些能力时按 `docs/ADAPT.md` 接到笔记例子与可拷模块。

## 大厅与对局

OCP 只描述 HTTP 上的文档资源。对局状态不进频道正文、讨论、修订或分享。切法见 `docs/LIVE.md`。入场路由见 SPEC §8.7；帧与 `reduce` 合同见 `docs/MATCH.md`。禁止：把讨论当输入流、把修订当对局快照、用分享 token 当对局入场证、给 `/v1` 加节拍或二进制频道正文。不要从 `examples/walk` 把玩法抄进协议或进程内核。没有实时对局的提供方 `live` 为 `false`。

## 发布

源码以 MIT 公开。不执行 `npm publish`，不向 PyPI 上传。根 `package.json` 为 `private: true`。

**不提供公网 OCP API / 长期服务进程。** 允许 GitHub Pages 上的静态演示：状态只在访问者浏览器内，用迷你 runtime 承接会话与发帖；不是可被外人当 API 用的公网提供方。本地生成与发布：`npm run pages:build`、`npm run pages:deploy`（推 `open-channel`/`ocp` 的 `gh-pages`，并尽量触发 Pages workflow）。

GitHub 上本仓属 `Sepzok`：提交身份用 `Sepzok <dev@sepzok.com>`，Contributors 不得出现其他 GitHub 用户，不要写 `Co-authored-by: Cursor`。跨仓细则见用户级 `sepzok-github-identity.mdc`。

## 文案

面向用户的界面按当前 locale：中文用行业双字词（频道、讨论、链接、修订、分享），英文用对应行业词（channel、discussion、link、revision、share）。融合台标签以 `docs/PLAN.md` / `docs/en/PLAN.md` 为准。汇总入口（`examples/hub`，默认 8779）是例子目录页，不要做成第二套融合台。各例子根路径是该品类的展示页（会话、项目台、文稿、工单、房间舞台），不要套融合台分区。按钮和分区用两个字及以上（或英文多词）的行业词，不要用单个汉字当标签。协议与开源入口文档以中文为规范路径，英文为 `docs/en/` 与 `*.en.md` 镜像。

实现计划、Agent 写的「不做」清单不是用户意图；用户原句优先。计划里多出来的禁令或收窄范围，改掉并在回复里说明。

## 测试

改服务端或 SDK 后运行 `npm test`；Python SDK 跑 `npm run test:python`；改融合台或 E2E 相关逻辑跑 `npm run test:e2e`。测试须自起进程、临时 `dataDir`，不占用固定 8781–8783。E2E 使用本机 Chrome（Playwright `channel: 'chrome'`），不要写进默认 CI。

## 依赖

服务端与例子运行时仅 Node 内置模块。根开发依赖限于 `typescript`、`tsx`、`playwright`、`ajv`、`ajv-formats`。Python 仅用标准库。Node 版本见根 `package.json` 的 `engines`。
