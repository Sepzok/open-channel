# 对局进程

[English](en/MATCH.md)

OCP 只签发短时入场。权威步进在独立包 `@open-channel/match`，内存状态，不写 `store.json`。进程不认识任何一种游戏。

第三方要做自己的游戏：实现 `reduce` / `encode`，客户端按本文件组帧，入场只调 `createAdmission`。不要从 `examples/walk` 抄玩法。走动例子只证明接缝。

## 与 OCP 的交接

1. 提供方打开 `capabilities.live`，配置对局地址与 HMAC 密钥。
2. 成员 `POST /v1/channels/{id}/admissions` 得到 `{ token, url, expires_at, actor }`。
3. 客户端用 `token` 发 `join` 帧到 `url`。
4. 对局结束后如需留下记录，再走 HTTP 写讨论。不要把节拍写成修订。

票是 HMAC-SHA256 签名的 JSON：`id`、`channelId`、`actorId`、`exp`。对局进程用同一密钥 `verifyAdmission`。过期、分享 token、别的频道的票：拒绝 `join`，不进入 `reduce`。

## 公开接口

```ts
createMatchHost({
  secret,
  reduce: (prev, batch) => next,
  encode: (state) => Uint8Array,
  initialState,
  shouldEnd?: (state) => boolean,
  onEnd?: (channelId, snapshot) => void,
  websocket?: boolean, // 默认 true，另开 wsAddress
})
```

返回值含 `address`（`udp://…`）与 `wsAddress`（`ws://…`，可关）。
`batch` 是本拍收到的 `{ actorId, kind, payload }`。`payload` 是不透明字节。进程不解析坐标。

`reduce` 没被调用时，快照字节保持上次 `encode` 的结果。人走光或 `shouldEnd` 为真时丢掉该局内存；`onEnd` 只触发一次。

## 帧

魔数 `OCM1`。头：种类、序号、频道 id、参与者。载荷为其余字节。

| 种类 | 字节 | 序号 | 可丢 |
| --- | --- | --- | --- |
| `join` | 0 | 任意 | 否 |
| `input` | 1 | 输入序号 | 是 |
| `event` | 2 | 事件序号 | 否 |
| `snapshot` | 3 | 主机序号 | 是 |

`input` 与 `event` 分两条序号。`event` 必须等于该参与者上一条事件序号加一才进入本拍；缺号时本拍的 `input` 仍转发进 `reduce`。

`join` 的载荷是入场 `token` 的 UTF-8。主机校验通过后登记参与者，并回一条当前快照。

## 传输

同一帧字节可经两种承载进入**同一** `handleFrame` → `reduce`：

| 承载 | 地址形态 | 适用 |
| --- | --- | --- |
| UDP | `udp://host:port`（`MatchHost.address`） | 原生客户端 |
| WebSocket | `ws://host:port`（`MatchHost.wsAddress`） | 浏览器；二进制帧，载荷为完整 OCM1 包 |

`createMatchHost` 默认同时开 UDP 与 WebSocket（`websocket: false` 可关 WS）。OCP 入场仍只有一个 `url`：面向浏览器的提供方把 `liveUrl` 配成 `wsAddress`；原生可继续配 `address`。

WebSocket 是退化承载体：可靠有序，丢包会堵住。浏览器更接近 UDP 的路径是 WebRTC 不可靠数据通道；本仓不实现 WebRTC（需原生依赖），帧合同不变，第三方可自行把同一字节塞进 DataChannel。

不实现：匹配池、区域、舰队、反作弊、客户端预测。
