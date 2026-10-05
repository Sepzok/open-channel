# Open Channel Protocol（本地参考实现）

[English](README.en.md)

Open Channel Protocol（OCP）用统一的资源模型描述**单个提供方**上的频道、讨论、链接、分享与修订。跨提供方的汇合由客户端完成（本仓库的融合台即一例）。

本仓库为本地可运行的协议参考实现与示例，以 MIT 许可证公开源码。不执行 `npm publish`，不向 PyPI 上传，不提供公网 OCP API。GitHub Pages（https://sepzok.github.io/open-channel/ ）与镜像仓 https://sepzok.github.io/ocp/ 用于浏览器内静态演示；若 GitHub Pages 构建延迟，可先用 jsDelivr：https://cdn.jsdelivr.net/gh/Sepzok/open-channel@gh-pages/index.html 。完整协议与对局仍以本机 `npm run dev` 为准。

## 启动

```bash
npm install
npm run dev          # 汇总入口(8779) + 会话/任务/笔记/工单/走动/融合台
```

浏览器先开汇总入口：`http://127.0.0.1:8779`。页上列出各品类展示页与融合台，并显示是否已启动。

也可分别启动：

```bash
npm run dev:hub
npm run dev:chat
npm run dev:tasks
npm run dev:notes
npm run dev:console
npm run dev:native
npm run dev:walk
```

各进程地址：

- 汇总入口 `http://127.0.0.1:8779`
- 融合台 `http://127.0.0.1:8780`
- 会话 `http://127.0.0.1:8781`
- 任务 `http://127.0.0.1:8782`
- 笔记 `http://127.0.0.1:8783`
- 工单适配 `http://127.0.0.1:8784`
- 走动房间 `http://127.0.0.1:8785`

三个提供方令牌均为 `demo-token`（提供方所有者「融合台」）。种子账号口令均为 `demo-pass`；账号由各提供方自己签发，融合台不建总目录。例子展示页用会话口令进入，不把 `demo-token` 写进页面。`demo-token` 与 `demo-pass` 只用于本机回环。不要在 `HOST=0.0.0.0` 或任何非回环地址上使用这两份值；对外换成提供方自己签发的令牌和口令。默认仍只绑回环；局域网访问可设 `HOST=0.0.0.0`，同时必须换掉示例令牌和口令。文件下载支持 `Range`；参考实现默认单文件上限 64MiB。

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
| **频道 channel** | 可寻址容器（私聊、群组、项目、任务、笔记等用 `type` 区分）。可选 `ext` 自定义标量；列表用 SCIM `filter` 检索 |
| **块 block** | 正文由 `text` / `file` / `embed` 块组成 |
| **讨论 entry** | 附在频道上的记录（消息、评论、批注等用 `type` 区分） |
| **链接 link** | 同提供方频道之间的有向边，或指向外部 URL。层级用子→父的 `parent` 边（项目←任务、曲库←单曲）；网络用 `references` 等。子项是带正文的频道，不是讨论 |
| **分享 share** | 免登录只读或留言链接；浏览器默认打开 HTML |
| **修订 revision** | 标题或正文每次成功写入后的快照（需 `capabilities.revisions`） |

能力（`body`、`entries`、`entry_threads`、`links`、`shares`、`revisions`、`live`）写在发现文档与频道上；不支持的路由返回 `capability_unsupported`，不用空列表冒充。

协议细节见 `docs/SPEC.md`（[English](docs/en/SPEC.md)），JSON Schema 见 `schema/ocp.v1.schema.json`。游戏房间可映射为频道；对局同步见 `docs/LIVE.md` 与 `docs/MATCH.md`。

## 包结构

- `@open-channel/server` — 参考服务端 `createApp(options)`（可选用；第三方不必依赖它）
- `@open-channel/match` — 权威对局进程（调用方提供 `reduce` / `encode`）
- `@open-channel/sdk` — TypeScript 客户端（单 origin；跨提供方用多个 `Client` + `target_url`）
- `sdk/python/openchannel` — Python 客户端（标准库 `urllib`）
- `examples/hub` — 本地例子汇总入口（默认先开这一页）
- `examples/chat|tasks|notes` — 三个参考提供方
- `examples/walk` — 对局调用方薄例子（两人走动）；不要从这里抄玩法进内核
- `examples/native` — 不引用 `createApp` 的工单适配（第三方服务端起点）
- `examples/console` — 融合台：多 origin 汇合，并把各方频道用链接关联

把已有产品暴露为 OCP、以及客户端如何对接多个服务端，见 `docs/ADAPT.md`。修订、分享页、列表 `filter` 的实现入口也在该文档：native 示范「产品没有这些能力」；有这些能力时看笔记例子与可拷模块，不要从 native 开这三项。

许可证见 `LICENSE`（MIT）。贡献见 `CONTRIBUTING.md` / `CONTRIBUTING.en.md`。Agent 约定见 `AGENTS.md` / `AGENTS.en.md`。

界面语言：融合台与分享 HTML 支持中/英（`?lang=`、`Accept-Language`、融合台切换器）。种子落盘仍为中文；英文界面用对照表显示已知样例字符串。
