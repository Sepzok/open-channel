# 把已有产品接到 Open Channel

本协议描述**一个提供方进程**上的 HTTP 资源。多个服务端的汇合与业务关联由**客户端**完成，不在某个提供方内部做联邦。

## 服务端（第三方自己实现）

不必使用本仓库的 `@open-channel/server`。对照：

- 行为：`docs/SPEC.md`
- JSON 形状：`schema/ocp.v1.schema.json`
- 黑盒：对你的 `baseUrl` + Bearer 跑与 `test/conformance.test.ts` 相同的发现与链接断言

最小可被融合台读的集合：

1. `GET /v1`：`protocol`、`version`、`provider`、`actor`、`capabilities`
2. 按能力打开的频道 / 讨论 / 链接路由。`GET /v1` 把没有的能力写成 `false`。对应路由返回 `capability_unsupported`（含 `.../revisions/{id}` 与 restore），不要空列表、也不要用普通 `not_found` 冒充「没有历史」。讨论串未开则 `parent_id` 为 `threads_unsupported`；无正文则锚点为 `anchor_unsupported`。未实现 SCIM 时，列表带 `filter` 必须 400，禁止当没看见该参数仍 200。
3. Bearer（引导令牌、会话或授权，见 SPEC §3）
4. 错误为 `application/problem+json`，含 `code`

映射约定：

| 已有对象 | OCP |
| --- | --- |
| 会话、群、项目、任务、笔记、工单 | 频道；用 `type` 区分 |
| 消息、评论、批注 | 讨论 `entry` |
| 父子、阻塞、引用 | 链接；同进程用 `target_id`，其它进程用 `target_url` |
| 自家主键 | `ext.native_id`（字符串标量）。协议不解释该键，适配方用来回写 |

频道 id 必须符合 schema 的 `ch_…` 形态。不要把外部系统的 `T-100` 直接当 `id`，放进 `ext.native_id`。

`examples/native` 把内存里的工单映射成频道，源码不引用 `createApp`。它**没有**修订、分享、SCIM 和实时对局，因为工单适配没有这些产品能力：发现文档里对应键为 `false`，路由回问题响应。不要从 native 抄这四项。

产品里**已经有**文档历史、对外链接或字段检索时，按下面做。合同仍是 SPEC；全开对照是 `examples/notes`（`NOTES_CAPS`）。TypeScript 可直接拷独立模块，不必依赖 `createApp`。

## 修订

对照 SPEC §1.6、§6、§8.5。打开 `capabilities.revisions`。

必做：

- 创建频道、以及成功 PATCH `title` 或 `body` 时追加快照；频道 `revision` 指向最新一条
- PATCH 必须带等于当前值的 `base_revision`，否则 400；对不上则 409 `conflict`，正文含 `current_revision`，频道不变
- 恢复：把该快照的标题和正文写回，并**再追加**一条修订；旧 id 仍能取回旧正文
- 只改 `members` / `ext` 不产生修订

TypeScript 可看 `server/src/store.ts` 的 `addRevision`（深拷 `body`）。不要改历史记录。行为锁在 `server/test/server.test.ts` 笔记修订用例。

## 分享页

对照 SPEC §1.5、§8.4。打开 `capabilities.shares`。

必做：

- `POST .../shares` 签发不可猜测 token；`url` 为 `{publicOrigin}/s/{token}`
- `GET /s/{token}`：`Accept` 偏 JSON 时返回频道与讨论（无修订、无 token 外泄）；否则浅色 HTML
- 写入页面的标题、正文、作者、文件名、`ext` 必须转义
- `scope=view` 禁止 `POST /s/{token}/entries`（403 `share_forbidden`）；`comment` 允许，作者显示名「访客」
- 撤销后 `share_unavailable`；分享文件 Range 规则与认证下载相同，但只允许该频道引用的文件

TypeScript 可拷 `server/src/html.ts` 的 `sharePageHtml`（依赖 `escapeHtml`）。路由与鉴权仍按 SPEC 自己接。行为锁在分享相关服务端测试。

## 列表 filter（SCIM 子集）

对照 SPEC §5。这不是 capabilities 键：一旦接受 `filter` 查询参数，就必须按子集过滤，不能当没看见。

必做：路径、`eq`/`ne`/`co`/`pr`/`gt` 等、AND/OR/`not`、长度与深度上限；非法 400。与 `type`、`updated_since`、`include_deleted` AND。

TypeScript 可原样使用 `server/src/scimFilter.ts` 的 `parseListFilterQuery`（不引用 `createApp`）。其它语言按 SPEC §5 重写，用 `server/test/ext-filter.test.ts` 当验收。未做引擎时列表带 `filter` 必须 400，见 native。

## 实时对局

对照 SPEC §8.7、`docs/LIVE.md`、`docs/MATCH.md`。产品里**已经有**权威对局进程时才打开 `capabilities.live`。没有则发现文档为 `false`，`POST .../admissions` 返回 `capability_unsupported`。

必做：

- 签发短时 HMAC 票，绑定频道、参与者、约 60 秒过期；`url` 是对局地址
- 对局进程 `verify` 后才进入调用方提供的 `reduce`
- 帧与节拍不进 OCP schema；战绩如需留下再 HTTP 写讨论

第三方实现自己的 `reduce` / `encode`，客户端按 `docs/MATCH.md` 组帧，入场只调 `createAdmission`。不要从 `examples/walk` 抄玩法。会话、任务、笔记、native 保持 `live: false`。

## 客户端（对接多个服务端）

每个 origin 一个 `Client({ baseUrl, token })`。令牌由该提供方签发（API key、会话或授权），融合台不统一登录。

关联各方业务：

1. 用 `channelResourceUrl(other.baseUrl, channelId)` 得到对方频道资源 URL
2. 在源提供方 `createLink({ type: 'references', target_url, title })`
3. 列表里用 `parseChannelResourceUrl` / `matchProvider` 判断能否打开已配置的另一方

禁止：把对方的频道 id 当作本提供方 `target_id`（会 400 或指到错误对象）。

同提供方层级仍用 `type=parent` + `target_id`。

参考实现：`examples/console`（浏览器只打融合台；各提供方令牌留在融合台进程）。
