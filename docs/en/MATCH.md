# Match process

**Canonical:** [../MATCH.md](../MATCH.md)

OCP only issues short-lived admissions. Authoritative stepping lives in the separate package `@open-channel/match`, in memory, and does not write `store.json`. The process knows no particular game.

Third parties that want their own game implement `reduce` / `encode`, frame on the client per this document, and call only `createAdmission` for entry. Do not copy gameplay from `examples/walk`. The walk example only proves the seam.

## Handoff with OCP

1. The provider turns on `capabilities.live` and configures match address plus HMAC secret.
2. A member `POST /v1/channels/{id}/admissions` and receives `{ token, url, expires_at, actor }`.
3. The client sends a `join` frame with `token` to `url`.
4. After the match, if a record should remain, write discussion over HTTP. Do not write ticks as revisions.

The ticket is HMAC-SHA256–signed JSON: `id`, `channelId`, `actorId`, `exp`. The match process uses the same secret in `verifyAdmission`. Expired tickets, share tokens, or tickets for another channel: reject `join`; do not enter `reduce`.

## Public API

```ts
createMatchHost({
  secret,
  reduce: (prev, batch) => next,
  encode: (state) => Uint8Array,
  initialState,
  shouldEnd?: (state) => boolean,
  onEnd?: (channelId, snapshot) => void,
  websocket?: boolean, // default true; also opens wsAddress
})
```

The return value includes `address` (`udp://…`) and `wsAddress` (`ws://…`, can be disabled).
`batch` is this tick’s `{ actorId, kind, payload }`. `payload` is opaque bytes. The process does not parse coordinates.

While `reduce` is not called, snapshot bytes stay the last `encode` result. When everyone leaves or `shouldEnd` is true, that match’s memory is dropped; `onEnd` fires once.

## Frames

Magic `OCM1`. Header: kind, sequence, channel id, participant. Payload is the remaining bytes.

| Kind | Byte | Sequence | Droppable |
| --- | --- | --- | --- |
| `join` | 0 | any | no |
| `input` | 1 | input seq | yes |
| `event` | 2 | event seq | no |
| `snapshot` | 3 | host seq | yes |

`input` and `event` use separate sequence spaces. An `event` enters the tick only if it equals that participant’s previous event seq plus one; when numbers are missing, this tick’s `input` still forwards into `reduce`.

`join` payload is the admission `token` as UTF-8. After the host verifies, it registers the participant and replies with the current snapshot.

## Transport

The same frame bytes may enter the **same** `handleFrame` → `reduce` over two carriages:

| Carriage | Address form | Use |
| --- | --- | --- |
| UDP | `udp://host:port` (`MatchHost.address`) | Native clients |
| WebSocket | `ws://host:port` (`MatchHost.wsAddress`) | Browsers; binary frames, payload is a full OCM1 packet |

`createMatchHost` opens UDP and WebSocket by default (`websocket: false` disables WS). OCP admission still has a single `url`: browser-facing providers set `liveUrl` to `wsAddress`; native may keep `address`.

WebSocket is a degraded carriage: reliable and ordered; loss stalls the stream. A browser path closer to UDP is an unreliable WebRTC data channel; this repo does not implement WebRTC (needs native deps). The frame contract is unchanged; third parties may push the same bytes into a DataChannel.

Not implemented: matchmaking pools, regions, fleets, anti-cheat, client prediction.
