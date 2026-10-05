# Open Channel implementation plan

**Canonical:** [../PLAN.md](../PLAN.md)

This file is the implementation contract. Behavior follows `docs/SPEC.md`; shapes follow `schema/ocp.v1.schema.json`. On conflict: field shapes follow the schema; status codes and capability semantics follow SPEC. Implementations must not invent another set of resource names.

## Goals

Ship a locally runnable product that reads and writes sessions, tasks, and notes as one resource model:

- One protocol (SPEC + JSON Schema)
- Two client SDKs (TypeScript, Python)
- One reference server
- Three provider examples (chat, tasks, notes)
- One fusion console that reads all three, writes discussion, and creates shares
- Tests that prove mechanisms, not merely that files exist

Source is MIT-licensed. Do not run `npm publish`, upload to PyPI, or deploy a public service. Root `package.json` is `private: true`.

## Why this shape

The user’s nouns (channel, comment, link, share, version, plus type/category) point the right way; copying them literally fights in the implementation:

- Chat body is a message stream; note body is a document; task body is a description. One “channel content string” forces one kind to forever accommodate the others.
- IM messages are not comments. Naming the resource `comment` keeps chat adapters wrong. Discussion records are `entry`, distinguished by `type` as `message` / `comment` / `annotation`.
- “Version” means both protocol version and document history. Document history is `revision`; protocol version appears only in URL `/v1` and discovery.
- Separate type and category axes drift. Channels, discussion, and links each have one extensible `type`. Link `type` is the relation (`parent`, `blocks`, `references`, …).
- Capabilities a product cannot offer must not return empty lists. Declare them in capabilities; unsupported routes return `capability_unsupported`.
- This is not a federation protocol. One process is one provider. Cross-provider aggregation is a client concern. Link `target_id` points only at channels in the same provider; external addresses use `target_url`.

Bodies use blocks (`text` / `file` / `embed`); do not stuff file bytes into JSON. File bytes use separate upload and download.

Sync uses soft delete plus `updated_since`, not a separate event bus. Identity is not expanded in the protocol: one Bearer token maps to one actor on discovery; the server stamps authors; clients cannot supply authors. Seed data is in-process import and may keep historical authors.

Share links must open in a browser: default `Accept: text/html` returns a page; `Accept: application/json` returns JSON.

## Repository layout

```
docs/SPEC.md
docs/PLAN.md
docs/LIVE.md               Lobby HTTP vs match process boundary; does not change OCP resources
docs/MATCH.md              Frames, ticks, reduce contract
docs/en/                   English mirrors of the above
schema/ocp.v1.schema.json
schema/fixtures/valid/*.json
schema/fixtures/invalid/*.json
sdk/typescript/          package @open-channel/sdk
sdk/python/              distribution name openchannel; stdlib HTTP only
server/                  package @open-channel/server
examples/chat/           port 8781; seeds in SPEC appendix A
examples/tasks/          port 8782
examples/notes/          port 8783
examples/console/        port 8780; fusion console
examples/walk/           port 8785; thin match caller example
examples/native/         standalone adapter example; no createApp
match/                   package @open-channel/match; authoritative match process
examples/providers.json
docs/ADAPT.md            How existing products expose OCP; how multi-provider clients associate
e2e/console.mjs
README.md
README.en.md
AGENTS.md
AGENTS.en.md
```

Root `package.json` uses npm workspaces: `sdk/typescript`, `server`, `match`, `examples/chat`, `examples/tasks`, `examples/notes`, `examples/console`, `examples/walk`.

Runtime dependencies may use Node builtins only. Root devDependencies: `typescript`, `tsx`, `playwright`, `ajv`, `ajv-formats`. Schema `date-time` needs ajv-formats—do not hand-wave. Python uses only the standard library (`urllib`, `unittest`)—no pytest or httpx. Browser acceptance uses local Chrome (`channel: 'chrome'`). Playwright appears only in root devDependencies and `e2e/`, not in SDK or server dependencies.

## Reference server

`createApp(options)` returns a Node `http.Server`.

Options:

- `providerId`, `providerName`
- `capabilities`: shared by all channels of that provider (v1 does not toggle per channel)
- `actor`: `{ id, display_name }` stamped as author on new discussion via API
- `token`: Bearer compared with constant time
- `seed`: see SPEC appendix; imported only when data files are missing
- `dataDir`: `store.json` and `files/` live here
- `publicOrigin`: builds share URLs, e.g. `http://127.0.0.1:8781`
- `maxFileBytes`: default `64 * 1024 * 1024`
- `liveUrl`, `liveSecret`: issue admissions only when `capabilities.live` is true; tickets verified by the match process

Storage is a single JSON file; writes go to a temp file then rename. Idempotency keys are memory-only and lost on restart (SPEC already says so).

The three examples are thin entry points: read their `seed.json`, call `createApp`, listen on fixed ports. Business rules must not be copied into examples; capability differences come only from the capabilities passed in.

## SDK surface

Methods correspond one-to-one on both sides.

TypeScript:

- `new Client({ baseUrl, token })`
- `listChannels` `createChannel` `getChannel` `updateChannel` `deleteChannel` (list queries include SCIM `filter` strings identical to SPEC; the SDK does not invent a JSON query DSL)
- `listEntries` `createEntry` `getEntry` `deleteEntry`
- `listLinks` `createLink` `deleteLink`
- `createShare` `getShare` `revokeShare` `resolveShare` (resolve without token)
- `createAdmission`
- `listRevisions` `getRevision` `restoreRevision`
- `uploadFile` `downloadFile`
- `getDiscovery` `listAccounts` `deleteSession` (`createSession` / `createAccount` / `createGrant` / `revokeGrant` already exist)
- `channelResourceUrl`, `parseChannelResourceUrl`, `matchProvider`: build and parse `{origin}/v1/channels/{id}`; `https://example.com/spec` parses to `null`
- Error type `OcpError` with `status`, `code`, `body`

Python uses the same names in snake_case. Query parameters, paths, and bodies match SPEC; the SDK does not rename them. Cross-provider association: `createLink` on the source provider with `target_url` from the other’s `channelResourceUrl`—never put the other id in `target_id`.

## Fusion console

The browser only talks to 8780. Tokens stay on the server.

- `GET /api/channels` aggregates three providers. If one origin fails to connect, that origin is marked unavailable and the others still return. Explicit state—not silent cache fallback.
- `GET /api/channels/:provider/:id` returns channel, discussion, links; revision list is requested only when `capabilities.revisions` is true, else response `revisions: null` (distinct from empty array “no history”).
- `POST .../entries` body is plain text. Type mapping: `dm|group|room` → `message`; `project|task|note` → `comment`.
- `POST .../shares` fixed `scope: view`; hand the provider’s `url` to the page.
- `POST .../revisions/:rev/restore` button only when revision capability exists.
- `POST .../links` writes the other channel as `target_url` (`channelResourceUrl`), not `target_id`. Detail attaches `resolved` per link (matched provider + channel id, or `null`).
- Files are proxied through the console; the page never holds provider tokens. Same-provider `target_id` and resolved `target_url` open the corresponding channel in the UI.

The UI is a light ops console with custom buttons and inputs—not browser default chrome. Sections use full-width title bands (body, discussion, links, revisions, shares), not card stacks. Missing capabilities do not render that section.

### Labels (zh / en)

| zh | en |
| --- | --- |
| 私聊 | Direct message |
| 群组 | Group |
| 聊天室 | Room |
| 项目 | Project |
| 任务 | Task |
| 笔记 | Note |
| 正文 | Body |
| 讨论 | Discussion |
| 链接 | Links |
| 上级 | Parent |
| 下级 | Children |
| 其它 | Other |
| 修订 | Revisions |
| 分享 | Shares |
| 发送 | Send |
| 创建分享 | Create share |
| 恢复 | Restore |
| 关联 | Link |
| 来源不可用 | Source unavailable |

UI follows the active locale (`?lang=`, `Accept-Language`, console switcher). Channel titles in `seed.json` and the SPEC appendix stay Chinese on disk; the fusion console and share pages show English labels by channel id when locale is `en` (e.g. Release team / Home page copy / API draft). Seed body and discussion text are not translated. English filters map to Chinese `title co` needles (e.g. Home → 首页文案).

## Seeds

Contents of the three `seed.json` files follow SPEC appendix A verbatim—do not rewrite the story. Import must go through the server create path: note `edits` must produce two readable revisions, not a hand-written “looks like history” array that `GET revision` cannot read.

## Tests and acceptance

Root scripts:

- `npm test`: schema, server, TypeScript SDK. Each case `listen(0)`, temp `dataDir`, then close. Must not depend on processes already on 8781–8783.
- `npm run test:python`: `python3 -m unittest discover -s sdk/python`. Cases start the notes provider with `node --import tsx`, print the port, temp dir, kill on exit.
- `npm run test:e2e`: `node e2e/console.mjs`. Starts three providers and the console on OS-assigned ports, passes addresses via env, kills on exit. Playwright in root devDependencies with `channel: 'chrome'`; do not download Chromium.

`.gitignore` ignores `data/`, `**/store.json`, `examples/**/files/`, `node_modules/`.

Mechanisms that must appear (each with assertions—not only HTTP 200):

1. Schema: Ajv validates full resources in `schema/fixtures` (not seed files). Valid channel, discussion, internal link, external link pass; channel missing `type`, entry with empty `body`, link with both `target_id` and `target_url` fail. Seed importability is covered by items 3 and 6.
2. Chat provider: `GET /v1/channels/:id/revisions` JSON `code` is `capability_unsupported` and `capability` is `revisions`. Body is not `{ data: [] }`. `PATCH` with `body` is likewise `capability_unsupported`. `parent_id` can build threads; child lists recover by `parent_id`.
3. Notes provider: mismatched `base_revision` → 409 `conflict`, channel body unchanged; match → `revision` becomes a new id and the old id still returns the old body. Seed “接口草案” first revision body contains “频道是可寻址的容器，讨论附在频道上。” and not “外部可打开的地址”; current body contains the latter. Anchor discussion recovers by `anchor.block_id`. `direction=in` on “术语表” shows the link from “接口草案”.
4. Share: unauthenticated `GET /s/:token` with `Accept: text/html` includes the channel title; with `Accept: application/json` includes `channel` and `entries` and no `revisions` field. After revoke, `code` is `share_unavailable`. `scope=view` → `POST /s/:token/entries` is 403 `share_forbidden`. `scope=comment` → that POST succeeds with author `display_name` 「访客」 / Guest depending on share-page locale.
5. Idempotency: same `Idempotency-Key` and body return the same entry id; same key different body → 409 `idempotency_conflict`. Same for channel create: same key and body return the same channel id, no second row.
6. Files: uploaded id goes into a file block; download bytes match upload; unknown file id → 400 `file_not_found`. After notes seed import, `GET /v1/files/file_terms` bytes equal UTF-8 of `术语.txt`. In share HTML, a title containing `<b>` is escaped text, not a parseable `<b>` tag. No Range → 200 with `Accept-Ranges: bytes`; `Range: bytes=0-3` → 206 and 4 body bytes; out of range → 416 `range_not_satisfiable`. Over `maxFileBytes` → 413; no new formal id or `.part` under `files/`.
7. Soft delete: deleted items leave the default list; with `include_deleted=true` and `updated_since` before delete time, `deleted_at` is visible. Discussion on a deleted channel → 409 `deleted`.
8. TypeScript and Python SDKs each against a running notes provider: list, update body (correct `base_revision`), create discussion (body without `author` or `id`). Assert revision id changed and entry author is the token actor. A create that smuggles `author` or `id` → 400 `validation_error` and entry count unchanged.
9. Fusion aggregate: when one `baseUrl` points at an unlistening port, the response still includes channels from the other two; the failed origin carries unavailable state (not a hard-coded Chinese title string—render via locale)—not a whole-request failure.
10. Fusion console page: seed titles 「发布小组」「首页文案」「接口草案」 are all visible; opening 「接口草案」 shows a seed body sentence; after sending discussion that sentence appears in the discussion area; after create share a URL containing `/s/` appears. Real clicks and typing in local Chrome (`locator.click` / `locator.fill` / `locator.press`)—do not fake by setting DOM `value`.
11. Link `type`: for `ch_proj`, `direction=in&type=parent` includes `ch_task_copy` and `ch_task_img`; `type=blocks` does not. For `ch_draft`, `direction=out&type=references` points at the glossary. Without `type`, outbound count matches unfiltered.
12. Custom fields and SCIM `filter`: schema allows numeric `ext`; nested objects and illegal keys fail. After create, GET still returns number. `filter=ext.artist eq "林可"` hits; AND / same-key OR / cross-key parenthesized OR / `ne` (missing key does not hit) / `co` / `duration_ms gt` per SPEC. Illegal compare literals, oversized or over-deep `filter`, query name `ext.*` → 400. After PATCH `ext: {}`, `eq` and `pr` miss. SDK sends `filter` on the query string. Entry list `filter=type eq "comment"` and link list `filter=title co "所属"` filter on the server. Illegal seed `ext` fails import and does not write `store.json`. Console filter 「首页」 uses provider `title co`; 「首页文案」 visible, 「发布小组」 not. Opening 「首页文案」 shows 「撰写中」.
13. Cross-provider association and standalone adapter: `parseChannelResourceUrl('https://example.com/spec')` is `null`; `http://127.0.0.1:9/v1/channels/ch_proj` yields origin and `ch_proj`. On notes `ch_draft`, `POST` `type=references` with `target_url` = tasks provider channel resource URL; subsequent `GET` still has `target_url` and no `target_id`. `ftp://x` create link → 400. Console opens 「接口草案」, 「关联」 picks 「首页文案」, 「其它」 shows that title; after refresh it remains; clicking enters the tasks provider channel and shows 「撰写中」. `examples/native` source has no `createApp` or `@open-channel/server`; `GET /v1` capabilities and channel `ext.native_id` round-trip; same discovery + link-shape black box against native and notes. Undeclared revisions on native (including nested id and restore), PATCH body, and share collections must not return `{ data: [] }`; `parent_id` → `threads_unsupported`; list `filter` → 400 not unfiltered 200; `GET /s/{token}` → `share_unavailable`.
14. **Bilingual UI:** default path stays Chinese (existing assertions). With `?lang=en` (or `Accept-Language: en` on share), shell copy is English (e.g. Send / Create share) and seed channel titles show English labels (e.g. Release team, API draft); `seed.json` stays Chinese. `resolveLocale` prefers `?lang=`, then stored locale (browser), then `Accept-Language`, else `zh`. Unavailable aggregate rows use a stable type (e.g. `unavailable`) and empty title; the page renders the localized “Source unavailable” label—do not hard-code the Chinese title in the aggregate payload. English filter “Home” must hit the channel whose Chinese title is 首页文案.

SDK `resolveShare` sends `Accept: application/json`.

`AGENTS.md` / `AGENTS.en.md` state: protocol changes must update SPEC (zh + en), schema, both SDKs, and tests; source is MIT, no npm publish, no public deploy; UI follows the active locale with industry terms.

The console discussion input sits inside the discussion section and scrolls with the page—not `position: fixed` on the viewport bottom.

Visual: page background `#f4f5f7`, list and main pane white, section bands `#eef1f4`, primary button `#1d4e89`, radius 6px, system fonts. Inputs white with 1px `#c5cad3` border and reset `appearance`.

Forbidden thin paths (tests must block as negative cases, or treat as incomplete in review):

- Unsupported capability returns empty list or 200
- Revisions only overwrite latest body; old revision id cannot be fetched
- Shares only offer JSON
- Console uses a hard-coded channel array instead of requesting three ports
- Console filter only refilters the already-fetched list instead of sending conditions to provider `filter`
- SDK methods do not send HTTP
- Clients supply `author` or `id` in API bodies and are accepted
- Cross-provider association only changes page copy without `POST`ing a link resource
- Other provider’s channel id used as this provider’s `target_id`
- Standalone adapter imports `@open-channel/server` / `createApp`
- Standalone adapter returns empty lists for undeclared capabilities, or ignores `filter` and still 200
- Unavailable rows depend on a hard-coded Chinese title string in the aggregate payload

## Implementation order

1. Schema and fixtures; schema tests red then green.
2. Server and acceptance items 2–7.
3. Both SDKs and item 8.
4. Three provider entry points, seeds, console, items 9–10.
5. README: how to start, how to test, one-page resource model, license and “no npm publish / no public deploy.”

## Non-goals

Federation, WebSocket-as-OCP, reactions, read receipts, OAuth, collaborative editing, live cursors, npm publish, public deploy.

Do not turn OCP into match sync: no parallel low-latency copy of channels, discussion, links, revisions; do not put ticks, opcodes, or sequence numbers into `ocp.v1.schema.json`; do not implement matchmaking pools, region directories, or server fleets. Lobby vs match split: `docs/LIVE.md`; frames and `reduce`: `docs/MATCH.md`. Do not copy gameplay from `examples/walk` into the kernel.
