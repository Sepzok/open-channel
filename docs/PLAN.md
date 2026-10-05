# Open Channel 实现计划

本文件是实现合同。行为以 `docs/SPEC.md` 为准，形状以 `schema/ocp.v1.schema.json` 为准。两边冲突时：字段形状听 schema，状态码与能力语义听 SPEC。实现不得另起一套资源名。

## 目标

做成本地可运行的成品，用来把会话、任务、笔记三种来源读写成同一套资源：

- 一份协议（SPEC + JSON Schema）
- 两份客户端 SDK（TypeScript、Python）
- 一个参考服务端
- 三个提供方例子（会话、任务、笔记）
- 一个融合台，同时读取三个提供方，并能写讨论、创建分享
- 测试能单独证明机制，而不是只证明「文件存在」

不发布到公网，不创建远程仓库，不执行 `npm publish`。

## 为什么是这套形状

用户给出的名词（频道、评论、链接、分享、版本，外加 type/category）方向正确，直接照搬会在实现里打架：

- 会话的正文是消息流，笔记的正文是文档，任务的正文是说明。合成一个「频道内容字符串」会让某一类永远在迁就另一类。
- 即时通讯的消息不是评论。资源若命名为 comment，会话适配会长期用错词。讨论记录统一叫 entry，用 `type` 区分 `message` / `comment` / `annotation`。
- 「版本」同时指协议版本和文档历史。文档历史叫 revision；协议版本只出现在 URL `/v1` 和发现文档里。
- type 与 category 两套轴会漂移。频道、讨论、链接都只有一个可扩展的 `type`。链接的 type 就是关系（`parent`、`blocks`、`references` 等）。
- 三种产品做不到的能力不能返回空列表冒充。能力写在 capabilities 里；不支持的路由返回 `capability_unsupported`。
- 这不是联邦协议。一个进程是一个提供方。跨提供方的汇合是客户端的事。链接的 `target_id` 只指向同一提供方里的频道；外部地址用 `target_url`。

正文用块（text / file / embed），不把文件塞进 JSON。文件字节走单独的上传和下载。

同步用软删除加 `updated_since`，不另做事件总线。身份不在协议里展开：一个 Bearer 令牌对应发现文档里的一个 actor，服务端盖章作者，客户端不能代填作者。种子数据是进程内导入，可以保留历史作者。

分享链接必须能被浏览器打开：默认 `Accept: text/html` 返回页面；`Accept: application/json` 返回 JSON。

## 仓库布局

```
docs/SPEC.md
docs/PLAN.md
docs/LIVE.md               大厅 HTTP 与对局进程的边界，不改 OCP 资源
schema/ocp.v1.schema.json
schema/fixtures/valid/*.json
schema/fixtures/invalid/*.json
sdk/typescript/          包名 @open-channel/sdk
sdk/python/              分发名 openchannel，仅标准库 HTTP
server/                  包名 @open-channel/server
examples/chat/           端口 8781，种子见 SPEC 附录 A
examples/tasks/          端口 8782
examples/notes/          端口 8783
examples/console/        端口 8780，融合台
examples/providers.json
e2e/console.mjs
README.md
AGENTS.md
```

根 `package.json` 使用 npm workspaces：`sdk/typescript`、`server`、`examples/chat`、`examples/tasks`、`examples/notes`、`examples/console`。

运行时依赖只允许 Node 内置模块。根开发依赖：`typescript`、`tsx`、`playwright`、`ajv`、`ajv-formats`。Schema 的 `date-time` 要用 ajv-formats，不能手写放行。Python 只用标准库（`urllib`、`unittest`），不引入 pytest、httpx。浏览器验收使用本机 Chrome（`channel: 'chrome'`）。Playwright 只出现在根 devDependencies 和 `e2e/`，不进入 SDK 或服务端的依赖。

## 参考服务端

`createApp(options)` 返回 Node `http.Server`。

选项：

- `providerId`、`providerName`
- `capabilities`：该提供方全部频道共用这一份（v1 不按频道单独开关）
- `actor`：`{ id, display_name }`，写入 API 新讨论的作者
- `token`：Bearer 比对用常量时间比较
- `seed`：见 SPEC 附录；仅当数据文件不存在时导入
- `dataDir`：`store.json` 与 `files/` 放这里
- `publicOrigin`：拼分享 URL，例如 `http://127.0.0.1:8781`
- `maxFileBytes`：默认 `64 * 1024 * 1024`

存储是单文件 JSON，写时先写临时文件再重命名。幂等键只放内存，进程重启失效，SPEC 已说明。

三个例子是薄入口：读自己的 `seed.json`，调用 `createApp`，监听固定端口。业务规则不得复制进例子；能力差异只来自传入的 capabilities。

## SDK 表面

两边方法一一对应。

TypeScript：

- `new Client({ baseUrl, token })`
- `listChannels` `createChannel` `getChannel` `updateChannel` `deleteChannel`（列表查询含 SCIM `filter` 字符串，与 SPEC 相同，不在 SDK 里另做 JSON 查询 DSL）
- `listEntries` `createEntry` `getEntry` `deleteEntry`
- `listLinks` `createLink` `deleteLink`
- `createShare` `getShare` `revokeShare` `resolveShare`（resolve 不带令牌）
- `listRevisions` `getRevision` `restoreRevision`
- `uploadFile` `downloadFile`
- 错误类型 `OcpError`，字段 `status`、`code`、`body`

Python 用同名 snake_case。查询参数、路径、请求体与 SPEC 相同，不在 SDK 里改名。

## 融合台

浏览器只访问 8780。令牌留在服务端。

- `GET /api/channels` 聚合三个提供方。某个来源连接失败时，该来源标记为不可用，其它来源照常返回。这是显式状态，不是静默改用缓存。
- `GET /api/channels/:provider/:id` 返回频道、讨论、链接；仅当 `capabilities.revisions` 为真才请求修订列表，否则响应里 `revisions: null`（区别于空数组「没有历史」）。
- `POST .../entries` 正文是纯文本。type 映射：`dm|group|room` → `message`；`project|task|note` → `comment`。
- `POST .../shares` 固定 `scope: view`，把提供方返回的 `url` 交给页面。
- `POST .../revisions/:rev/restore` 仅修订能力存在时页面出现按钮。
- 文件经融合台反代，页面不直接拿提供方令牌。

界面是浅色操作台，自定义按钮和输入框，不用浏览器默认外观。分区用通栏标题（正文、讨论、链接、修订、分享），不做成卡片堆。没有的能力不渲染该区。

中文标签：私聊、群组、聊天室、项目、任务、笔记、正文、讨论、链接、上级、下级、其它、修订、分享、发送、创建分享、恢复、来源不可用。

## 种子

三个 `seed.json` 的内容以 SPEC 附录 A 为准，原样落地，不要改写成别的故事。导入必须走服务端的创建路径：笔记上的 `edits` 要真正产生两条可读取的修订，而不是在 JSON 里手写一份「看起来像历史」的数组却让 `GET revision` 读不到旧正文。

## 测试与验收

根脚本：

- `npm test`：schema、服务端、TypeScript SDK。每个用例自己 `listen(0)`，使用临时 `dataDir`，结束后关闭。不得依赖 8781–8783 已有进程。
- `npm run test:python`：`python3 -m unittest discover -s sdk/python`。用例用 `node --import tsx` 拉起笔记提供方，端口由子进程打印，临时目录，结束时杀掉进程。
- `npm run test:e2e`：`node e2e/console.mjs`。脚本自己拉起三个提供方和融合台，端口使用系统分配，通过环境变量把地址交给融合台，结束时杀掉进程。Playwright 放在根的 devDependencies，启动参数 `channel: 'chrome'`，不下载 Chromium。

`.gitignore` 忽略 `data/`、`**/store.json`、`examples/**/files/`、`node_modules/`。

必须出现的机制（每条都要有断言，不能只断言 HTTP 200）：

1. Schema：用 Ajv 校验 `schema/fixtures` 里的完整资源（不是种子文件）。合法频道、讨论、内部链接、外部链接通过；缺少 `type` 的频道、空 `body` 的讨论、同时带 `target_id` 和 `target_url` 的链接不通过。种子是否可导入由第 3、6 条覆盖。
2. 会话提供方：`GET /v1/channels/:id/revisions` 的 JSON `code` 为 `capability_unsupported`，且 `capability` 为 `revisions`。响应体不是 `{ data: [] }`。`PATCH` 带 `body` 同样为 `capability_unsupported`。`parent_id` 能建立讨论串，子条列表能按 `parent_id` 找回。
3. 笔记提供方：`base_revision` 不匹配时 409，`code` 为 `conflict`，频道正文保持原块；匹配时 `revision` 变成新 id，旧 id 仍能取回旧正文。种子「接口草案」的第一条修订正文含「频道是可寻址的容器，讨论附在频道上。」且不含「外部可打开的地址」；当前正文含后一句。锚点讨论能按 `anchor.block_id` 读回。`direction=in` 在「术语表」上能看到来自「接口草案」的链接。
4. 分享：无 Authorization 的 `GET /s/:token`，`Accept: text/html` 正文包含频道标题；`Accept: application/json` 含 `channel` 与 `entries`，且没有 `revisions` 字段。撤销后再取，`code` 为 `share_unavailable`。`scope=view` 时 `POST /s/:token/entries` 为 403 `share_forbidden`。`scope=comment` 时该 POST 成功，作者 `display_name` 为「访客」。
5. 幂等：同一 `Idempotency-Key` 与同一请求体返回同一个讨论 id；同一键不同体返回 409 `idempotency_conflict`。创建频道同样：同键同体返回同一个频道 id，不产生第二条。
6. 文件：上传后的 id 放进 file 块，下载字节与上传一致；引用不存在的 file id 返回 400 `file_not_found`。笔记种子导入后，`GET /v1/files/file_terms` 的字节等于 `术语.txt` 的 UTF-8。分享 HTML 中，标题含 `<b>` 时响应里是转义后的文本，不是可解析的 `<b>` 标签。无 Range 为 200 且带 `Accept-Ranges: bytes`；`Range: bytes=0-3` 为 206 且正文 4 字节；越界为 416 `range_not_satisfiable`。超过 `maxFileBytes` 为 413，`files/` 无新正式 id、无 `.part`。
7. 软删除：删除后默认列表不包含；`include_deleted=true` 且 `updated_since` 早于删除时间时能看到 `deleted_at`。对已删除频道发讨论返回 409 `deleted`。
8. TypeScript SDK 与 Python SDK 各对运行中的笔记提供方执行：列表、更新正文（带正确 `base_revision`）、创建讨论（请求体不含 `author`、不含 `id`）。断言修订 id 已变化，讨论作者是令牌 actor。另发一条夹带 `author` 或 `id` 的创建请求，得到 400 `validation_error`，且讨论条数不增加。
9. 融合聚合函数：把其中一个 `baseUrl` 指到未监听的端口时，响应仍包含另外两个提供方的频道，失败来源带「不可用」状态，而不是整次请求失败。
10. 融合台页面：三个种子标题「发布小组」「首页文案」「接口草案」都可见；打开「接口草案」能看见种子正文中的句子；发送一条讨论后该句出现在讨论区；创建分享后页面出现含 `/s/` 的 URL。用本机 Chrome 真实点击和输入（`locator.click` / `locator.fill` / `locator.press`），不用改 DOM value 冒充。
11. 链接 `type`：对 `ch_proj`，`direction=in&type=parent` 含 `ch_task_copy` 与 `ch_task_img`；`type=blocks` 不含它们。对 `ch_draft`，`direction=out&type=references` 指向术语表。无 `type` 时出边条数与加过滤前一致。
12. 自定义字段与 SCIM `filter`：schema 允许 `ext` 数字，嵌套对象与非法键名不通过。创建后 GET 仍为 number。`filter=ext.artist eq "林可"` 命中；AND / 同键 OR / 跨键括号 OR / `ne`（缺键不命中）/ `co` / `duration_ms gt` 按 SPEC。非法比较字面量、过长或过深 `filter`、查询参数名 `ext.*` 为 400。PATCH `ext: {}` 后 `eq` 与 `pr` 不命中。SDK 把 `filter` 发到查询串。讨论列表 `filter=type eq "comment"`、链接列表 `filter=title co "所属"` 在服务端过滤。非法种子 `ext` 导入失败且不写 `store.json`。融合台筛选「首页」走提供方 `title co`，可见「首页文案」、不见「发布小组」。打开「首页文案」可见「撰写中」。

SDK 的 `resolveShare` 发送 `Accept: application/json`。

`AGENTS.md` 写明：改协议必须同时改 SPEC、schema、两份 SDK 和测试；不发布到公网；界面中文用行业用语。

融合台写讨论的输入框放在讨论区内随页面滚动，不 `position: fixed` 贴在视口底边。

视觉：页面底 `#f4f5f7`，列表与主区白底，分区标题条 `#eef1f4`，主按钮 `#1d4e89`，圆角 6px，系统字体。输入框白底、1px `#c5cad3` 边框，并重置 `appearance`。

禁止的薄路径（测试要当负例挡住，或实现审查时视为未完成）：

- 不支持的能力返回空列表或 200
- 修订只覆盖最新正文，旧 revision id 取不回
- 分享只提供 JSON
- 融合台使用写死的频道数组而不请求三个端口
- 融合台筛选只在已拉回的列表上再筛，不把条件交给提供方 `filter`
- SDK 方法不发 HTTP
- 客户端在 API 请求体里指定 `author` 或 `id` 并被接受

## 实现顺序

1. Schema 与 fixtures，schema 测试先红再绿。
2. 服务端与第 2–7 条测试。
3. 两份 SDK 与第 8 条。
4. 三个提供方入口、种子、融合台、第 9–10 条。
5. README：怎么启动、怎么测、资源模型一页纸、明确写不发布。

## 非目标

联邦、WebSocket、表情回应、已读、OAuth、协同编辑、实时光标、npm 发布、公网部署。

不把 OCP 改成对局同步：不平行再做一份低延迟版的频道、讨论、链接、修订；不把节拍、操作码、序号写进 `ocp.v1.schema.json`；不实现匹配池、区域目录、服务器舰队。大厅与对局的切法见 `docs/LIVE.md`。
