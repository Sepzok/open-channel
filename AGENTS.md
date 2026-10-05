# Agent 约定（Open Channel）

## 协议变更

修改行为或字段时**同时**更新：

- `docs/SPEC.md`（状态码与能力语义）
- `schema/ocp.v1.schema.json` 与 `schema/fixtures/`
- `@open-channel/sdk`（TypeScript）与 `sdk/python/openchannel`
- 相关测试（`test/`、`server/test/`、`sdk/**/test*`、`e2e/`）

形状以 schema 为准；HTTP 语义以 SPEC 为准。

## 接到别的产品

先读 `docs/SPEC.md`、`schema/ocp.v1.schema.json`、`docs/ADAPT.md`。每个 origin 一个客户端。跨提供方关联只用链接的 `target_url`（频道资源 URL），不要把对方频道 id 写成 `target_id`。没有的能力在发现文档里为 `false`，对应路由返回 `capability_unsupported`；未实现列表 `filter` 时带该参数必须 400。不要从 `examples/native` 抄修订、分享或 SCIM。产品里已有这些能力时按 `docs/ADAPT.md` 接到笔记例子与可拷模块。

## 大厅与对局

OCP 只描述 HTTP 上的文档资源。对局状态不进频道正文、讨论、修订或分享。切法见 `docs/LIVE.md`。禁止：把讨论当输入流、把修订当对局快照、用分享 token 当对局入场证、给 `/v1` 加节拍或二进制频道正文。签发入场凭证若做成 HTTP 路由，仍按「协议变更」四件套改，不要只改对局进程。

## 发布

源码以 MIT 公开。不执行 `npm publish`，不向 PyPI 上传，不部署公网服务。根 `package.json` 为 `private: true`。

## 文案

面向用户的中文界面与文档使用行业用语：频道、讨论、链接、修订、分享。融合台标签以 `docs/PLAN.md` 为准。按钮和分区用两个字及以上的行业词，不要用单个汉字当标签。

## 测试

改服务端或 SDK 后运行 `npm test`；Python SDK 跑 `npm run test:python`；改融合台或 E2E 相关逻辑跑 `npm run test:e2e`。测试须自起进程、临时 `dataDir`，不占用固定 8781–8783。E2E 使用本机 Chrome（Playwright `channel: 'chrome'`），不要写进默认 CI。

## 依赖

服务端与例子运行时仅 Node 内置模块。根开发依赖限于 `typescript`、`tsx`、`playwright`、`ajv`、`ajv-formats`。Python 仅用标准库。Node 版本见根 `package.json` 的 `engines`。
