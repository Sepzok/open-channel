# 把已有产品接到 Open Channel

本协议描述**一个提供方进程**上的 HTTP 资源。多个服务端的汇合与业务关联由**客户端**完成，不在某个提供方内部做联邦。

## 服务端（第三方自己实现）

不必使用本仓库的 `@open-channel/server`。对照：

- 行为：`docs/SPEC.md`
- JSON 形状：`schema/ocp.v1.schema.json`
- 黑盒：对你的 `baseUrl` + Bearer 跑与 `test/conformance.test.ts` 相同的发现与链接断言

最小可被融合台读的集合：

1. `GET /v1`：`protocol`、`version`、`provider`、`actor`、`capabilities`
2. 按能力打开的频道 / 讨论 / 链接路由；没有的能力返回 `capability_unsupported`，不要空列表冒充
3. Bearer（引导令牌、会话或授权，见 SPEC §3）
4. 错误为 `application/problem+json`，含 `code`

映射约定：

| 已有对象 | OCP |
| --- | --- |
| 会话、群、项目、任务、笔记、工单 | 频道；用 `type` 区分 |
| 消息、评论、批注 | 讨论 `entry` |
| 父子、阻塞、引用 | 链接；同进程用 `target_id`，其它进程用 `target_url` |
| 自家主键 | `ext.native_id`（字符串标量）。协议不解释该键，适配方用来回写 |

`examples/native` 把内存里的工单映射成频道，源码不引用 `createApp`。

频道 id 必须符合 schema 的 `ch_…` 形态。不要把外部系统的 `T-100` 直接当 `id`，放进 `ext.native_id`。

## 客户端（对接多个服务端）

每个 origin 一个 `Client({ baseUrl, token })`。令牌由该提供方签发（API key、会话或授权），融合台不统一登录。

关联各方业务：

1. 用 `channelResourceUrl(other.baseUrl, channelId)` 得到对方频道资源 URL
2. 在源提供方 `createLink({ type: 'references', target_url, title })`
3. 列表里用 `parseChannelResourceUrl` / `matchProvider` 判断能否打开已配置的另一方

禁止：把对方的频道 id 当作本提供方 `target_id`（会 400 或指到错误对象）。

同提供方层级仍用 `type=parent` + `target_id`。

参考实现：`examples/console`（浏览器只打融合台；各提供方令牌留在融合台进程）。
