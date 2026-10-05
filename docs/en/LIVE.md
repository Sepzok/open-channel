# Lobby and match

**Canonical:** [../LIVE.md](../LIVE.md)

This file is the boundary contract, not a second OCP resource set. Shapes still follow `schema/ocp.v1.schema.json`; HTTP semantics still follow `docs/SPEC.md`. Match frames are in `docs/MATCH.md` and do not enter the schema.

## Conclusion

Extract shared identity. Do not build a parallel low-latency copy of channels, discussion, links, and revisions. Mature multiplayer backends keep slow APIs on request–response and match state in a separate in-memory process—not the same JSON resources over another transport.

## Mature backend split (reference only; no product names as dependencies)

Public architectures such as Nakama, Photon Realtime, and Epic Online Services session APIs:

- Accounts, storage, groups, and lobby lists stay request–response.
- Authoritative match state lives only in one process’s memory: collect inputs on a tick, validate, then broadcast. When everyone leaves or the match ends, drop it; do not persist as storage objects.
- Matchmaking or party success only yields a match id or connect address; the client then connects to the match process.
- Payloads are opcodes plus short binary, marked reliable vs unreliable. When reliable messages stall, movement should still get through (independent sequence numbers).
- Lobby chat and match sync are not the same stream. Dedicated servers put the connect address into the session; the client joins the session first, then uses that address for the game process.

What the three share as handoff: **identity, room id, short-lived ticket, connect address**. Shared match model: **in-memory, tick-based, opcodes, reliable vs droppable, discard on end**.

## In this repository

```text
Client ── HTTP /v1 ──► existing provider (channels, discussion, links, shares, revisions, admissions)
     └── datagram frames ──► match process (memory, caller reduce, independent seq)
              ▲
              └── admission: short-lived credential + connect address from POST .../admissions
```

### HTTP (OCP)

Corresponds to lobby and documents. The only addition is admissions—no coordinates, opcodes, or ticks:

| Existing resource | Role in online play |
| --- | --- |
| Channel | Lobby, party, room roster |
| Discussion | Chat that should persist. No coordinates |
| Share | Invite page for humans. Not a match ticket |
| Revisions and `store.json` | Document history. Not in-match state |
| Link `target_url` | May point at a match process address; carries no admission |
| Admission | Issued when `capabilities.live` is on; see SPEC §8.7 |

During a match the client **keeps** the HTTP session to edit the room and leave chat. Do not disconnect the lobby when entering a match: document channels are still needed mid-match.

### Match process (`@open-channel/match`)

Corresponds to authoritative match / game process:

- Separate process. State in memory. Does not take the reference server’s `store.json` write lock.
- Caller supplies `reduce` and `encode`. The process verifies tickets, collects inputs on a fixed tick, calls `reduce`, broadcasts snapshots.
- Frames: header with channel id, participant, sequence, kind. Kinds are only `join`, `input`, `event`, `snapshot`.
- At least two independent sequence spaces: droppable inputs; must-arrive critical events. When reliable packets stall, this tick’s inputs still enter `reduce`.
- When everyone leaves or the match ends, drop memory. To keep a record, write an HTTP discussion or patch the channel body. Do not write a revision per tick.

Details and framing: `docs/MATCH.md` / `docs/en/MATCH.md`.

### Shared identity

- Channel id: the room is still an existing channel.
- Participant: existing actor. Who may enter is decided by HTTP membership and tokens.
- Short-lived admission: `POST /v1/channels/{id}/admissions`. Bound to channel, participant, expiry. The signed ticket appears once.

Admission credentials **must not** reuse share tokens or grant `gr_`. Shares open pages for humans, last longer, and allow view or comment. Grants are HTTP permissions on a channel. Admission credentials go to the match process and last about 60 seconds.

## Transport

Frames are defined with datagram semantics; carriage may vary:

- Native clients use UDP (`MatchHost.address`).
- Browsers have no raw UDP: this repo’s match process exposes a **WebSocket binary entry** (`MatchHost.wsAddress`); after decode, the same `reduce` runs. Accept the cost that everything becomes reliable and ordered.
- Closer to droppable datagrams, third parties may put the same frames on an unreliable WebRTC data channel; this repo does not implement WebRTC.
- This is not an OCP capability, and WebSocket / WebRTC are not written into `/v1`. Admission remains `POST .../admissions`; providers configure `url` as `udp://` or `ws://`.

The reference host listens on both UDP and WebSocket; the walk example’s `liveUrl` still uses UDP; process logs print `wsAddress` for browser wiring.

## Forbidden (thin paths)

- A parallel “same resources over UDP” OCP
- Discussion as an input stream, or high-frequency coordinates in `ext`
- Revisions as match snapshots (one `rev_` per tick)
- Share tokens or grant tokens as match tickets
- Adding ticks or binary bodies to `GET/PATCH /v1/channels`
- Putting opcodes, ticks, or sequence numbers into `ocp.v1.schema.json`
- Non-authoritative client-to-client relay as this repo’s reference model (reference is authoritative: server validates then broadcasts)
- Copying grid movement from `examples/walk` into the kernel or protocol

## Explicitly not copied

Matchmaking pools, region directories, server fleets, and relay forwarding are the next product layer—not missing protocol fields. This repo does not implement a full game server.
