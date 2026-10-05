# Open Channel Protocol（本地参考实现）

Open Channel Protocol（OCP）用统一的资源模型描述**单个提供方**上的频道、讨论、链接、分享与修订。跨提供方的汇合由客户端完成（本仓库的融合台即一例）。

本仓库为**本地可运行**的协议参考实现与示例，**不发布**到 npm 或公网。

## 启动

```bash
npm install
npm run dev          # 同时启动会话(8781)、任务(8782)、笔记(8783)、融合台(8780)
```

也可分别启动：

```bash
npm run dev:chat
npm run dev:tasks
npm run dev:notes
npm run dev:console
```

浏览器只访问融合台：`http://127.0.0.1:8780`。三个提供方令牌均为 `demo-token`。局域网访问可设 `HOST=0.0.0.0`（默认仍只绑回环）。文件下载支持 `Range`；参考实现默认单文件上限 64MiB。

## 测试

```bash
npm test
npm run test:python
npm run test:e2e
```

`npm test` 使用临时数据目录与系统分配端口，不依赖 8781–8783 已有进程。E2E 使用本机 Chrome（Playwright `channel: 'chrome'`）。

## 资源模型（一页纸）

| 资源 | 含义 |
| --- | --- |
| **频道 channel** | 可寻址容器（私聊、群组、项目、任务、笔记等用 `type` 区分） |
| **块 block** | 正文由 `text` / `file` / `embed` 块组成 |
| **讨论 entry** | 附在频道上的记录（消息、评论、批注等用 `type` 区分） |
| **链接 link** | 同提供方频道之间的有向边，或指向外部 URL。层级用子→父的 `parent` 边（项目←任务、曲库←单曲）；网络用 `references` 等。子项是带正文的频道，不是讨论 |
| **分享 share** | 免登录只读或留言链接；浏览器默认打开 HTML |
| **修订 revision** | 标题或正文每次成功写入后的快照（需 `capabilities.revisions`） |

能力（`body`、`entries`、`entry_threads`、`links`、`shares`、`revisions`）写在发现文档与频道上；不支持的路由返回 `capability_unsupported`，不用空列表冒充。

协议细节见 `docs/SPEC.md`，JSON Schema 见 `schema/ocp.v1.schema.json`。

## 包结构

- `@open-channel/server` — 参考服务端 `createApp(options)`
- `@open-channel/sdk` — TypeScript 客户端
- `sdk/python/openchannel` — Python 客户端（标准库 `urllib`）
- `examples/*` — 三个提供方与融合台
