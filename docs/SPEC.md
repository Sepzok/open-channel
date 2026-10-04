# Open Channel Protocol 1

媒体类型 `application/vnd.ocp+json`。错误用 `application/problem+json`。时间是 UTC 的 ISO-8601，含 `Z`。请求体出现 schema 未定义的字段时，返回 400 `validation_error`，不忽略。`title`、`body`、`members` 在 PATCH 里出现时整体替换，不按块、不按成员合并。

本协议描述**一个提供方**上的资源。汇合多个提供方是客户端的工作，不在协议内。

## 1. 资源

### 1.1 频道 channel

可寻址容器。会话、项目、任务、笔记都是频道。

| 字段 | 说明 |
| --- | --- |
| `id` | 服务端分配，前缀 `ch_` |
| `type` | 见第 2 节 |
| `title` | 1–200 个 Unicode 码位，首尾空白去掉后计算 |
| `body` | 块数组。无正文能力时恒为 `[]` |
| `capabilities` | 该频道能力，v1 与提供方发现文档相同 |
| `members` | `{ id, display_name, role }[]`。`role` 为 `owner` 或 `member` 或符合 type 语法的扩展 |
| `ext` | 可选，键值都是字符串，各最多 64 / 256 码位，最多 16 项 |
| `created_at` `updated_at` | 时间 |
| `deleted_at` | 未删除为 `null` |
| `revision` | 无修订能力时为 `null`；有则为当前修订 id |

`capabilities` 键（布尔，缺键视为 false）：

- `body` 频道有可编辑正文
- `entries` 可以有讨论
- `entry_threads` 讨论可以带 `parent_id`
- `links` 可以有链接
- `shares` 可以创建分享
- `revisions` 正文和标题的每次成功修改产生修订

v1 一个提供方的全部频道使用同一份能力。客户端不能在创建时打开提供方没有的能力。

### 1.2 块 block

| `type` | 字段 |
| --- | --- |
| `text` | `text` 字符串，1–100000 码位；`format` 为 `plain` 或 `markdown`，默认 `plain` |
| `file` | `file`: `{ id, name, media_type, size }`。不含字节、不含下载 URL |
| `embed` | `embed`: `{ url, title }`。`url` 须为绝对 `http` 或 `https` |

资源 id（含块 id）符合 `^(ch|en|ln|sh|rev|file|blk)_[a-z0-9_]{1,40}$`。同一 `body` 内块 id 唯一。创建时客户端不传块 `id`，由服务端分配（前缀加 12 位十六进制）。种子导入可以指定符合该语法的 id。一个 body 最多 200 块。HTTP 创建频道、讨论、链接、分享时，请求体不得包含资源 `id`。

### 1.3 讨论 entry

附在频道上的一条记录。会话消息、任务评论、笔记批注都是讨论。

| 字段 | 说明 |
| --- | --- |
| `id` | 前缀 `en_` |
| `channel_id` | |
| `type` | 见第 2 节 |
| `body` | 至少 1 块 |
| `parent_id` | 父讨论 id 或 `null` |
| `anchor` | `null` 或 `{ block_id, quote }`。`quote` 可选，最长 500 码位 |
| `author` | `{ id, display_name }` |
| `created_at` `updated_at` `deleted_at` | |
| `ext` | 同频道 |

作者规则：

- HTTP API 创建的讨论，作者一律是当前令牌的 actor。请求体里的 `author` 字段视为未定义字段，按校验错误拒绝（schema 不允许）。
- 种子导入可以写入历史作者。种子不是 HTTP 端点。
- 经分享、scope 为 `comment` 创建的讨论，作者固定为 `{ "id": "share", "display_name": "访客" }`。

`anchor` 仅当频道 `capabilities.body` 为真，且 `block_id` 属于该频道**当前**正文。否则 400 `anchor_unsupported`。

`parent_id` 仅当 `entry_threads` 为真，且父讨论属于同一频道、未删除。否则 400 `threads_unsupported`（能力关闭）或 400 `validation_error`（父条不存在）。

### 1.4 链接 link

同一提供方内的有向边，或指向外部 URL 的边。二者互斥。

| 字段 | 说明 |
| --- | --- |
| `id` | 前缀 `ln_` |
| `type` | 关系，见第 2 节 |
| `source_id` | 源频道 |
| `target_id` | 目标频道，与 `target_url` 二选一 |
| `target_url` | 绝对 http(s) URL，与 `target_id` 二选一 |
| `title` | 可选，最长 200 |
| `created_at` `deleted_at` | |
| `ext` | 同频道 |

不自动创建反向边。`direction=in` 表示 `target_id` 等于该频道的边。`target_url` 边没有入边。

`target_id` 必须是本提供方未删除的频道，否则 400 `validation_error`。

### 1.5 分享 share

| 字段 | 说明 |
| --- | --- |
| `id` | 前缀 `sh_` |
| `channel_id` | |
| `token` | 至少 128 位熵的不可猜测字符串，URL 安全 |
| `scope` | `view` 或 `comment` |
| `url` | `{publicOrigin}/s/{token}` |
| `expires_at` | `null` 或未来时间。创建时若早于现在，400 |
| `created_at` | |
| `revoked_at` | 未撤销为 `null` |

### 1.6 修订 revision

标题或正文每次成功写入之后的快照，包括创建时的初始快照。频道上的 `revision` 与当前标题、正文一致。成员变化不产生修订。

| 字段 | 说明 |
| --- | --- |
| `id` | 前缀 `rev_` |
| `channel_id` | |
| `title` | 该次快照的标题 |
| `body` | 该次快照的正文 |
| `created_at` | |
| `author` | 执行这次修改的 actor；种子导入用种子里的作者，缺省则用提供方 actor |

频道上的 `revision` 指向最新一条。历史不改写。

恢复：把指定修订的 `title` 和 `body` 写回频道，并**新**增一条修订（内容等于恢复后的标题和正文）。旧修订仍可读取。

无 `revisions` 能力时，频道 `revision` 为 `null`，所有修订路由返回第 4 节的能力错误。

## 2. type

语法：`^[a-z][a-z0-9._-]{0,63}$`。不符合为 400 `validation_error`。符合语法但不在下表的值**必须接受**（扩展点）。

频道常见值：`dm` `group` `room` `project` `task` `note`。

讨论常见值：`message` `comment` `annotation`。

链接常见值：`related` `parent` `child` `blocks` `blocked_by` `references` `mentions`。

不设第二套 category。

## 3. 认证与发现

除下列路由外，请求头 `Authorization: Bearer <token>` 必须与提供方配置一致。

免认证：

- `GET /v1`
- `GET /s/{token}`
- `POST /s/{token}/entries`

失败：401，`code` 为 `unauthorized`。不要返回 403 来表示缺少令牌。

若带 `OCP-Version` 且值不是 `1`：400 `unsupported_version`。不带该头则按 v1 处理。

`GET /v1` 响应：

```json
{
  "protocol": "ocp",
  "version": "1",
  "provider": { "id": "chat", "name": "示例会话" },
  "actor": { "id": "u_fuse", "display_name": "融合台" },
  "capabilities": {
    "body": false,
    "entries": true,
    "entry_threads": true,
    "links": true,
    "shares": true,
    "revisions": false
  }
}
```

## 4. 错误

HTTP 状态与下列 body 同时成立。`Content-Type: application/problem+json`。

```json
{
  "type": "urn:ocp:problem:capability-unsupported",
  "title": "Capability unsupported",
  "status": 404,
  "code": "capability_unsupported",
  "capability": "revisions"
}
```

| code | status | 何时 |
| --- | --- | --- |
| `unauthorized` | 401 | 令牌缺失或不匹配 |
| `unsupported_version` | 400 | `OCP-Version` 不是 1 |
| `validation_error` | 400 | 字段不合法。可加 `errors: [{ "path", "message" }]` |
| `capability_unsupported` | 404 | 路由所需能力为 false。必须带 `capability` |
| `not_found` | 404 | id 不存在（从未存在） |
| `conflict` | 409 | `base_revision` 与当前不一致。必须带 `current_revision` |
| `deleted` | 409 | 目标已软删除，不能再写入 |
| `idempotency_conflict` | 409 | 同一幂等键，请求体摘要不同 |
| `file_not_found` | 400 | 块引用的文件 id 不存在 |
| `file_too_large` | 413 | 超过 `maxFileBytes` |
| `anchor_unsupported` | 400 | |
| `threads_unsupported` | 400 | |
| `share_unavailable` | 404 | 令牌不存在、已撤销或已过期 |
| `share_forbidden` | 403 | 分享 scope 不允许这次写 |

能力不支持时**禁止**用 200 和空 `data` 代替。

## 5. 分页与过滤

列表响应：

```json
{ "data": [], "next_cursor": null }
```

`limit` 默认 50，最大 100，超出最大则 400。`cursor` 不透明，客户端不得解析。排序稳定：主字段相同则按 `id` 升序。

频道列表查询：

- `type`
- `updated_since`：返回 `updated_at` 严格大于该时间的项（删除会更新 `updated_at`）
- `include_deleted`：`true` 才包含已删除。默认 false
- `order`：`updated`（默认，`updated_at` 降序）或 `created`（`created_at` 升序）

讨论列表查询：`order` 为 `asc`（默认）或 `desc`，按 `created_at`；`parent_id` 若给出则只返回该父的直接子条（不含父条本身）。

链接列表查询：`direction` 为 `out`（默认）、`in`、`both`。

`GET` 单个资源：已软删除仍返回该资源（带 `deleted_at`），以便同步。从未存在才是 `not_found`。

## 6. 条件写入

仅当 `capabilities.revisions` 为真，且本次 PATCH 含 `title` 或 `body`：

- 请求体必须含 `base_revision`，否则 400 `validation_error`
- 值必须等于频道当前 `revision`，否则 409 `conflict`，body 含 `current_revision`，频道不变
- 成功后追加修订，频道 `revision` 改为新 id，`updated_at` 更新

只改 `members` 或 `ext` 时不需要 `base_revision`，也不新修订。无修订能力时，请求里的 `base_revision` 忽略；带 `body` 则能力错误；只改 `title`、`members`、`ext` 允许。

创建频道时若有修订能力，写入初始修订（与创建完成后的 title/body 相同），频道 `revision` 指向它。

## 7. 幂等

`POST` 创建讨论、频道、链接、分享可以带 `Idempotency-Key`（1–128 个可见 ASCII）。

服务端保存键、请求体的 SHA-256、响应状态与响应体，至少保留到进程退出（参考实现放内存，不保证 24 小时磁盘持久）。

- 同键同摘要：返回第一次的状态码和 body，不新建资源
- 同键不同摘要：409 `idempotency_conflict`

## 8. 路由

前缀 `/v1`。JSON 请求 `Content-Type: application/json`。成功响应带 `Content-Type: application/vnd.ocp+json; charset=utf-8`。列表也使用该类型。

### 8.1 频道

`GET /v1/channels`

`POST /v1/channels`

```json
{ "type": "note", "title": "周会记录", "body": [{ "type": "text", "text": "记录", "format": "plain" }], "members": [] }
```

无 `body` 能力时请求不得含非空 `body`，否则 `capability_unsupported`（`capability` 为 `body`）。`members` 省略时，成员为当前 actor 一人，`role` 为 `owner`。

`GET /v1/channels/{id}`

`PATCH /v1/channels/{id}`

```json
{ "title": "新标题", "body": [], "base_revision": "rev_abc", "members": [] }
```

字段都可选，但至少出现一个可写字段。

`DELETE /v1/channels/{id}` 软删除，响应为删除后的频道。讨论与链接的删除同样返回删除后的资源。创建类 `POST` 成功为 201；幂等重放返回第一次的状态码和 body。

### 8.2 讨论

`GET /v1/channels/{id}/entries`

`POST /v1/channels/{id}/entries`

```json
{
  "type": "message",
  "body": [{ "type": "text", "text": "收到", "format": "plain" }],
  "parent_id": null,
  "anchor": null
}
```

无 `entries` 能力：`capability_unsupported`。

`GET /v1/entries/{id}`

`DELETE /v1/entries/{id}` 软删除。

### 8.3 链接

`GET /v1/channels/{id}/links`

`POST /v1/channels/{id}/links`

```json
{ "type": "parent", "target_id": "ch_proj", "title": "所属项目" }
```

或 `{ "type": "references", "target_url": "https://example.com/spec", "title": "外部" }`。

无 `links` 能力：`capability_unsupported`。

`DELETE /v1/links/{id}` 软删除。不提供 `GET /v1/links/{id}`。

### 8.4 分享

`POST /v1/channels/{id}/shares`

```json
{ "scope": "view", "expires_at": null }
```

`GET /v1/shares/{id}` 要认证，返回分享资源（含 token 与 url）。

`DELETE /v1/shares/{id}` 设置 `revoked_at`，之后不可再打开。

`GET /s/{token}`

- 请求头 `Accept` 含 `application/json`（且比 `text/html` 更靠前，或没有 `text/html`）时返回 JSON：

```json
{
  "share": { "scope": "view", "expires_at": null },
  "channel": {
    "id": "ch_draft",
    "type": "note",
    "title": "接口草案",
    "body": [],
    "updated_at": "2026-01-01T00:00:00.000Z"
  },
  "entries": []
}
```

JSON 视图不含 `capabilities`、`members`、`revision`、修订列表、分享 token。讨论只含未删除项，字段为 `id` `type` `body` `parent_id` `anchor` `author` `created_at`。

- 其它情况（含浏览器默认 Accept，以及 `*/*`）返回 `text/html; charset=utf-8`。页面包含频道标题、正文文本、每条讨论的文本。写入页面的任何文本（标题、正文、作者、文件名）必须转义，不能按原始 HTML 插入。样式为浅色。`input` 与 `button` 必须重置外观（`appearance: none`、边框、背景、字体），不能呈现系统控件。`scope=view` 的页面没有写讨论的表单。`scope=comment` 的页面有一个文本框和「发送」按钮，提交到 `POST /s/{token}/entries`。

`POST /s/{token}/entries` 请求体：

```json
{ "body": [{ "type": "text", "text": "补充一句", "format": "plain" }] }
```

服务端写入的讨论 `type`：频道 type 为 `dm` `group` `room` 时为 `message`，否则为 `comment`。不接受 `parent_id` 与 `anchor`。`scope=view` 时 403 `share_forbidden`。

过期在读取和写入时判断。

### 8.5 修订

`GET /v1/channels/{id}/revisions` 按 `created_at` 升序，不分页（v1 参考实现若超过 100 条仍全部返回；例子数据远小于此）。

`GET /v1/channels/{id}/revisions/{rev}`

`POST /v1/channels/{id}/revisions/{rev}/restore` 请求体 `{}`。响应为更新后的频道。

无能力：上述全部为 `capability_unsupported`，`capability` 为 `revisions`。

### 8.6 文件

`POST /v1/files`

- 请求体为原始字节，不是 JSON，也不是 multipart
- `Content-Type` 为媒体类型
- `X-File-Name` 为百分号编码的文件名

响应 201 与文件元数据 `{ "id", "name", "media_type", "size" }`，`id` 前缀 `file_`。

`GET /v1/files/{id}` 返回原始字节，`Content-Type` 为上传时的媒体类型，`X-File-Name` 为编码后的文件名。要认证。

分享页面里的文件块使用分享令牌下载：`GET /s/{token}/files/{fileId}`，免 Bearer，但文件必须被该频道当前正文或未删除讨论引用，否则 404 `not_found`。HTML 页里的文件块渲染为指向该 URL 的链接，链接文字为文件名。

## 9. 三个提供方的能力

| 提供方 | id | 端口 | body | entries | entry_threads | links | shares | revisions |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 示例会话 | `chat` | 8781 | false | true | true | true | true | false |
| 示例任务 | `tasks` | 8782 | true | true | false | true | true | true |
| 示例笔记 | `notes` | 8783 | true | true | false | true | true | true |

令牌都是 `demo-token`。actor 都是 `{ "id": "u_fuse", "display_name": "融合台" }`。`publicOrigin` 为 `http://127.0.0.1:{port}`。

## 10. 参考实现约束

这些约束只约束本仓库的参考服务端，不是互操作的必选项：

- 数据文件 `store.json`，文件字节在 `files/` 目录，文件名等于 file id
- 种子只在 `store.json` 不存在时导入
- 导入顺序：文件、频道（数组顺序）、`edits`（数组顺序）、讨论（数组顺序）、链接。讨论的 `parent_id` 必须指向已经导入的讨论
- 导入走与 API 相同的校验和修订生成。种子可以指定资源 id 和讨论作者。文件块的 `name`、`media_type`、`size` 以文件记录为准写回；`size` 为 UTF-8 字节长度
- 笔记种子的 `edits` 按顺序作为正文更新执行，因此至少产生「创建」「编辑」两条修订。第一条修订的正文只有创建时的块
- 同一进程内的写操作串行执行，避免并发把 `store.json` 盖乱
- 幂等缓存只在内存
- 监听地址 `127.0.0.1`。测试使用系统分配的端口，不占用附录里的固定端口

## 附录 A 种子

时间由导入时的时钟生成。下面的 id 必须原样使用。

### A.1 会话 `examples/chat/seed.json`

```json
{
  "channels": [
    {
      "id": "ch_dm_lin_zhou",
      "type": "dm",
      "title": "林可、周宁",
      "members": [
        { "id": "u_lin", "display_name": "林可", "role": "member" },
        { "id": "u_zhou", "display_name": "周宁", "role": "member" }
      ]
    },
    {
      "id": "ch_grp_release",
      "type": "group",
      "title": "发布小组",
      "members": [
        { "id": "u_lin", "display_name": "林可", "role": "owner" },
        { "id": "u_zhou", "display_name": "周宁", "role": "member" },
        { "id": "u_xu", "display_name": "许安", "role": "member" }
      ]
    },
    {
      "id": "ch_room_design",
      "type": "room",
      "title": "设计讨论",
      "members": [
        { "id": "u_xu", "display_name": "许安", "role": "owner" }
      ]
    }
  ],
  "entries": [
    {
      "id": "en_dm_1",
      "channel_id": "ch_dm_lin_zhou",
      "type": "message",
      "author": { "id": "u_lin", "display_name": "林可" },
      "body": [{ "id": "blk_dm_1", "type": "text", "text": "下午的稿子我放在笔记里了", "format": "plain" }]
    },
    {
      "id": "en_dm_2",
      "channel_id": "ch_dm_lin_zhou",
      "type": "message",
      "author": { "id": "u_zhou", "display_name": "周宁" },
      "body": [{ "id": "blk_dm_2", "type": "text", "text": "我看完就在任务里标进度", "format": "plain" }]
    },
    {
      "id": "en_grp_1",
      "channel_id": "ch_grp_release",
      "type": "message",
      "author": { "id": "u_xu", "display_name": "许安" },
      "body": [{ "id": "blk_grp_1", "type": "text", "text": "今天把配图导出", "format": "plain" }]
    },
    {
      "id": "en_grp_2",
      "channel_id": "ch_grp_release",
      "type": "message",
      "parent_id": "en_grp_1",
      "author": { "id": "u_lin", "display_name": "林可" },
      "body": [{ "id": "blk_grp_2", "type": "text", "text": "文案以笔记里的口径为准", "format": "plain" }]
    }
  ],
  "links": [
    {
      "id": "ln_grp_room",
      "type": "related",
      "source_id": "ch_grp_release",
      "target_id": "ch_room_design",
      "title": "设计讨论"
    }
  ]
}
```

### A.2 任务 `examples/tasks/seed.json`

```json
{
  "channels": [
    {
      "id": "ch_proj",
      "type": "project",
      "title": "官网改版",
      "members": [
        { "id": "u_lin", "display_name": "林可", "role": "owner" }
      ],
      "body": [
        { "id": "blk_proj", "type": "text", "text": "对外官网的信息架构和首页。", "format": "plain" }
      ]
    },
    {
      "id": "ch_task_copy",
      "type": "task",
      "title": "首页文案",
      "members": [
        { "id": "u_lin", "display_name": "林可", "role": "owner" }
      ],
      "body": [
        { "id": "blk_copy", "type": "text", "text": "按笔记里的口径写首页主标题和副标题。", "format": "plain" }
      ]
    },
    {
      "id": "ch_task_img",
      "type": "task",
      "title": "配图导出",
      "members": [
        { "id": "u_xu", "display_name": "许安", "role": "owner" }
      ],
      "body": [
        { "id": "blk_img", "type": "text", "text": "导出首页用的三张图。", "format": "plain" }
      ]
    }
  ],
  "entries": [
    {
      "id": "en_copy_1",
      "channel_id": "ch_task_copy",
      "type": "comment",
      "author": { "id": "u_zhou", "display_name": "周宁" },
      "body": [{ "id": "blk_copy_c", "type": "text", "text": "主标题先用笔记里的那句。", "format": "plain" }]
    }
  ],
  "links": [
    {
      "id": "ln_copy_parent",
      "type": "parent",
      "source_id": "ch_task_copy",
      "target_id": "ch_proj",
      "title": "所属项目"
    },
    {
      "id": "ln_img_parent",
      "type": "parent",
      "source_id": "ch_task_img",
      "target_id": "ch_proj",
      "title": "所属项目"
    },
    {
      "id": "ln_img_blocks",
      "type": "blocks",
      "source_id": "ch_task_img",
      "target_id": "ch_task_copy",
      "title": "配图未导出前，首页文案先不定稿"
    }
  ]
}
```

### A.3 笔记 `examples/notes/seed.json`

```json
{
  "files": [
    {
      "id": "file_terms",
      "name": "术语.txt",
      "media_type": "text/plain",
      "text": "频道\n讨论\n链接\n"
    }
  ],
  "channels": [
    {
      "id": "ch_draft",
      "type": "note",
      "title": "接口草案",
      "members": [
        { "id": "u_lin", "display_name": "林可", "role": "owner" }
      ],
      "body": [
        {
          "id": "blk_draft_lead",
          "type": "text",
          "text": "频道是可寻址的容器，讨论附在频道上。",
          "format": "plain"
        }
      ]
    },
    {
      "id": "ch_glossary",
      "type": "note",
      "title": "术语表",
      "members": [
        { "id": "u_lin", "display_name": "林可", "role": "owner" }
      ],
      "body": [
        {
          "id": "blk_gloss",
          "type": "text",
          "text": "频道、讨论、链接是三条基本记录。",
          "format": "plain"
        },
        {
          "id": "blk_gloss_file",
          "type": "file",
          "file": { "id": "file_terms", "name": "术语.txt", "media_type": "text/plain", "size": 0 }
        }
      ]
    }
  ],
  "edits": [
    {
      "channel_id": "ch_draft",
      "author": { "id": "u_lin", "display_name": "林可" },
      "body": [
        {
          "id": "blk_draft_lead",
          "type": "text",
          "text": "频道是可寻址的容器，讨论附在频道上。",
          "format": "plain"
        },
        {
          "id": "blk_draft_more",
          "type": "text",
          "text": "链接把相关频道连起来，分享给出外部可打开的地址。",
          "format": "plain"
        }
      ]
    }
  ],
  "entries": [
    {
      "id": "en_draft_ann",
      "channel_id": "ch_draft",
      "type": "annotation",
      "anchor": { "block_id": "blk_draft_lead", "quote": "可寻址的容器" },
      "author": { "id": "u_zhou", "display_name": "周宁" },
      "body": [{ "id": "blk_ann", "type": "text", "text": "这里的容器包括会话、任务和笔记。", "format": "plain" }]
    }
  ],
  "links": [
    {
      "id": "ln_draft_gloss",
      "type": "references",
      "source_id": "ch_draft",
      "target_id": "ch_glossary",
      "title": "术语表"
    }
  ]
}
```

文件块的 `size` 在导入时按 UTF-8 字节长度写回，种子里的 `0` 只是占位。编辑在讨论导入之前执行，这样批注锚点指向的块仍然存在。

导入后「接口草案」至少有两条修订：第一条正文只有「频道是可寻址的容器，讨论附在频道上。」；当前正文还包含「链接把相关频道连起来，分享给出外部可打开的地址。」

### A.4 提供方清单 `examples/providers.json`

```json
[
  { "id": "chat", "name": "示例会话", "baseUrl": "http://127.0.0.1:8781", "token": "demo-token" },
  { "id": "tasks", "name": "示例任务", "baseUrl": "http://127.0.0.1:8782", "token": "demo-token" },
  { "id": "notes", "name": "示例笔记", "baseUrl": "http://127.0.0.1:8783", "token": "demo-token" }
]
```
