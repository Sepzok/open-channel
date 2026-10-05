# Open Channel Protocol 1

**Canonical:** [../SPEC.md](../SPEC.md)

Media type `application/vnd.ocp+json`. Errors use `application/problem+json`. Times are UTC ISO-8601 with `Z`. Request bodies that include fields not defined in the schema return 400 `validation_error` (fields are not ignored). When `title`, `body`, or `members` appear in a PATCH, they replace as a whole—no per-block or per-member merge.

This protocol describes resources on **one provider**. Aggregating providers is a client concern and is outside the protocol.

## 1. Resources

### 1.1 Channel

An addressable container. Sessions, projects, tasks, notes, libraries, and tracks are all channels. Children (tasks, tracks, single notes) are channels with bodies, not discussion entries.

| Field | Meaning |
| --- | --- |
| `id` | Server-assigned, prefix `ch_` |
| `type` | See §2 |
| `title` | 1–200 Unicode code points, counted after trimming ends |
| `body` | Block array. Always `[]` when body capability is off |
| `capabilities` | Channel capabilities; in v1 same as provider discovery |
| `members` | `{ id, display_name, role }[]`. `role` is `owner`, `member`, or `guest`. `id` must be an existing account on this provider. Provider `guest` must not be set as channel `owner` |
| `ext` | Optional. Custom scalar bag, at most 16 entries. Keys match §2 `type` (`^[a-z][a-z0-9._-]{0,63}$`). Values are JSON string, finite number, or boolean. Strings 1–256 code points; empty string disallowed. No `null`, arrays, or objects. The protocol does not interpret industry meaning of keys and does not provide field discovery. `PATCH` / create replace the whole bag; omit to leave unchanged; after `ext: {}` the reference implementation omits the field |
| `created_at` `updated_at` | Times |
| `deleted_at` | `null` when not deleted |
| `revision` | `null` without revisions capability; otherwise current revision id |

`capabilities` keys (boolean; missing key is false):

- `body` — channel has editable body
- `entries` — may have discussion
- `entry_threads` — discussion may use `parent_id`
- `links` — may have links
- `shares` — may create shares
- `revisions` — each successful title/body write produces a revision
- `live` — may issue match admissions. Default false. If off, `POST .../admissions` returns `capability_unsupported`. The credential itself carries no coordinates, opcodes, or ticks

In v1 every channel of a provider shares one capability set. Clients cannot turn on capabilities the provider does not advertise at create time.

### 1.2 Block

| `type` | Fields |
| --- | --- |
| `text` | `text` string, 1–100000 code points; `format` is `plain` or `markdown`, default `plain` |
| `file` | `file`: `{ id, name, media_type, size }`. No bytes, no download URL |
| `embed` | `embed`: `{ url, title }`. `url` must be absolute `http` or `https` |

Resource ids (including block, session, grant, admission ids) match `^(ch|en|ln|sh|rev|file|blk|se|gr|ad)_[a-z0-9_]{1,40}$`. Account `id` uses actor syntax `^[a-z][a-z0-9_]{0,63}$`, not a prefixed resource id. Block ids are unique within one `body`. Clients omit block `id` on create; the server assigns (prefix plus 12 hex digits). Seed import may supply ids matching the syntax. At most 200 blocks per body. On HTTP create of channel, entry, link, share, session, grant, or admission, the body must not include a resource `id`. Account create bodies must include account `id`.

### 1.3 Entry (discussion)

One record attached to a channel. Chat messages, task comments, and note annotations are all entries.

| Field | Meaning |
| --- | --- |
| `id` | Prefix `en_` |
| `channel_id` | |
| `type` | See §2 |
| `body` | At least one block |
| `parent_id` | Parent entry id or `null` |
| `anchor` | `null` or `{ block_id, quote }`. `quote` optional, max 500 code points |
| `author` | `{ id, display_name }` |
| `created_at` `updated_at` `deleted_at` | |
| `ext` | Same as channel |

Author rules:

- Entries created via HTTP API always take the current token’s identity. Session tokens use that account; grant tokens are fixed `{ "id": "grant", "display_name": "临时访问" }`. An `author` field in the body is treated as undefined and rejected as validation error (schema forbids it).
- Seed import may write historical authors. Seeds are not an HTTP endpoint.
- Entries created via share with `scope=comment` use fixed author `{ "id": "share", "display_name": "访客" }`.

`anchor` only when channel `capabilities.body` is true and `block_id` belongs to the channel’s **current** body. Otherwise 400 `anchor_unsupported`.

`parent_id` only when `entry_threads` is true and the parent belongs to the same channel and is not deleted. Otherwise 400 `threads_unsupported` (capability off) or 400 `validation_error` (parent missing).

### 1.4 Link

A directed edge within one provider, or an edge to an external URL. The two are mutually exclusive.

| Field | Meaning |
| --- | --- |
| `id` | Prefix `ln_` |
| `type` | Relation; see §2 |
| `source_id` | Source channel |
| `target_id` | Target channel, XOR with `target_url` |
| `target_url` | Absolute http(s) URL, XOR with `target_id` |
| `title` | Optional, max 200 |
| `created_at` `deleted_at` | |
| `ext` | Same as channel |

No automatic reverse edge. `direction=in` means edges whose `target_id` equals that channel. `target_url` edges have no inbound side.

`target_id` must be an undeleted channel on this provider, else 400 `validation_error`.

`target_url` must be an absolute `http` or `https` URL (with host; relative paths forbidden), else 400 `validation_error`.

**Channel resource URL** (use this for cross-provider association, not `target_id`):

`{origin}/v1/channels/{id}`

`origin` is the caller-configured provider root (scheme + host + port, no trailing slash); `id` is the channel id. Query string and fragment are not part of the resource URL. A channel in another process must not be written as this provider’s `target_id`. Write a link with `type` `references` (or another network relation) and `target_url` set to that URL. `target_url` edges have no inbound side: the other provider does not get an automatic reverse record. Clients match `origin` against their provider list; if matched, open that provider’s channel; otherwise treat as a normal external link. Parsing: SDK `parseChannelResourceUrl`.

There is no second hierarchy resource and no `parent_id` on channels. Hierarchy and networks both use links:

- **Hierarchy:** edge from child channel, `type` `parent`, `target_id` parent. List children: on the parent `GET .../links?direction=in&type=parent`. Same convention for project←task, library←track, notebook←note.
- **Network:** `references`, `related`, `blocks`, `blocked_by`, etc. No automatic path materialization, no recursive tree expansion.
- Child bodies live on the child channel’s `body` (e.g. audio `file` blocks on a track). Discussion is only comments or annotations—not track or subtask lists.

### 1.5 Share

| Field | Meaning |
| --- | --- |
| `id` | Prefix `sh_` |
| `channel_id` | |
| `token` | Unguessable URL-safe string, at least 128 bits of entropy |
| `scope` | `view` or `comment` |
| `url` | `{publicOrigin}/s/{token}` |
| `expires_at` | `null` or a future time. If in the past at create → 400 |
| `created_at` | |
| `revoked_at` | `null` when not revoked |

### 1.6 Revision

Snapshot after each successful title or body write, including the initial snapshot at create. Channel `revision` matches current title and body. Member changes do not produce revisions.

| Field | Meaning |
| --- | --- |
| `id` | Prefix `rev_` |
| `channel_id` | |
| `title` | Title at that snapshot |
| `body` | Body at that snapshot |
| `created_at` | |
| `author` | Actor who made the change; seed import uses seed author, else provider actor |

Channel `revision` points at the latest. History is not rewritten.

Restore: write the chosen revision’s `title` and `body` back onto the channel and **append** a new revision (content equals the restored title and body). Old revisions remain readable.

Without `revisions`, channel `revision` is `null` and all revision routes return the capability error in §4.

### 1.7 Account

Accounts are managed by **the provider that issues them**. The fusion console and other clients do not keep a global directory across providers. The same person name is three accounts across the three examples.

| Field | Meaning |
| --- | --- |
| `id` | Actor syntax; login name |
| `display_name` | 1–80 code points |
| `provider_role` | `owner`, `member`, or `guest` |
| `created_at` | |

Passwords are stored only as scrypt hashes. No JSON response, discovery document, channel, or entry may contain `password` or `password_hash`.

`POST /v1/accounts` is provider `owner` only. Body `{ "id", "display_name", "provider_role", "password" }`. `password` 8–128 code points. Existing id → 409 `conflict`.

`GET /v1/accounts` is provider `owner` only; returns `{ "data": [accounts…] }` with no password fields.

### 1.8 Session

Long-lived login. Body `{ "id", "password" }`. Success 201; body includes `id` (`se_`), `account` (no password), `token` (once only). Sessions do not expire until `DELETE /v1/sessions/{id}`. Wrong account id or password: 401 `unauthorized` without saying which failed.

### 1.9 Grant

Time-limited Bearer for callers—not a share link. Shares still use `/s/{token}` without login.

| Field | Meaning |
| --- | --- |
| `id` | Prefix `gr_` |
| `channel_id` | |
| `scope` | `view`, `comment`, or `edit` |
| `expires_at` | Must be a future time. Omit or past → 400 `validation_error` |
| `created_at` | |
| `revoked_at` | |
| `token` | Only in the create response |

`POST /v1/grants` requires channel `owner` or provider `owner`. `view` is read-only for that channel’s channel, discussion, links, and files referenced by that channel. `comment` may also post discussion. `edit` may also change title and body, restore revisions, upload files, create/delete links. Grants cannot change members, create shares, delete channels, or create accounts. Discussion authors: §1.3.

`DELETE /v1/grants/{id}` is revoked by the creating account, channel `owner`, or provider `owner`.

## 2. type

Syntax: `^[a-z][a-z0-9._-]{0,63}$`. Non-matching → 400 `validation_error`. Values that match syntax but are not in the tables below **must be accepted** (extension point).

Common channel values: `dm` `group` `room` `project` `task` `note` `library` `track`.

Common entry values: `message` `comment` `annotation`.

Common link values: `related` `parent` `child` `blocks` `blocked_by` `references` `mentions`.

No second category axis.

## 3. Auth and discovery

Accounts live inside the provider. Three Bearer kinds, not merged into one:

1. **Bootstrap token:** constant configured in the reference implementation (examples use `demo-token`), mapped to provider `owner` 「融合台」`u_fuse`. The fusion console keeps using it without logging in first.
2. **Session:** issued by `POST /v1/sessions`, represents one account.
3. **Grant:** issued by `POST /v1/grants`, covers one channel and must have an expiry.

Share links remain Bearer-free; semantics unchanged.

Unauthenticated:

- `GET /v1`
- `POST /v1/sessions`
- `GET /s/{token}`
- `GET /s/{token}/files/{fileId}` and corresponding `HEAD`
- `POST /s/{token}/entries`

Other routes with missing token, mismatch, revoked session, or revoked/expired grant: 401 `unauthorized`. Authenticated but insufficient role: 403 `forbidden`. Channel exists but current identity cannot see it: 403, not 404.

`GET /v1` does not require a token. With a valid Bearer, `actor` is that identity; without a token or with an invalid token, `actor` is the bootstrap account 「融合台」.

If `OCP-Version` is present and not `1`: 400 `unsupported_version`. Without the header, treat as v1.

`GET /v1` response:

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
    "revisions": false,
    "live": false
  }
}
```

Roles:

- Provider `owner`: see and operate all channels; may create accounts and grants.
- Provider `member`: may create channels; may only access channels whose roster includes them. Channel `owner` may edit body and members, create shares and grants, delete the channel. Channel `member` may read, post discussion, and edit body when body capability is on; may not change members or create shares.
- Provider `guest`: may not create channels or be set as channel `owner`. May only access channels whose roster includes them, with channel `guest` rights: read and post discussion; may not edit body, members, or shares.

`GET /v1/channels` returns only undeleted channels visible to the current identity (`include_deleted` only applies to identities that can see that channel).

## 4. Errors

HTTP status and the following body both apply. `Content-Type: application/problem+json`.

```json
{
  "type": "urn:ocp:problem:capability-unsupported",
  "title": "Capability unsupported",
  "status": 404,
  "code": "capability_unsupported",
  "capability": "revisions"
}
```

| code | status | When |
| --- | --- | --- |
| `unauthorized` | 401 | Missing, mismatched, revoked, or expired token; wrong login account or password |
| `forbidden` | 403 | Authenticated but role insufficient, or channel exists but invisible to current identity |
| `unsupported_version` | 400 | `OCP-Version` is not 1 |
| `validation_error` | 400 | Illegal field. May add `errors: [{ "path", "message" }]` |
| `capability_unsupported` | 404 | Route needs a capability that is false. Must include `capability` |
| `not_found` | 404 | Id never existed |
| `conflict` | 409 | `base_revision` does not match current. Must include `current_revision` |
| `deleted` | 409 | Target soft-deleted; no further writes |
| `idempotency_conflict` | 409 | Same idempotency key, different body digest |
| `file_not_found` | 400 | File id referenced by a block does not exist |
| `file_too_large` | 413 | Over `maxFileBytes` |
| `range_not_satisfiable` | 416 | `Range` out of bounds. Response includes `Content-Range: bytes */{size}` |
| `anchor_unsupported` | 400 | |
| `threads_unsupported` | 400 | |
| `share_unavailable` | 404 | Token missing, revoked, or expired |
| `share_forbidden` | 403 | Share scope forbids this write |

When a capability is unsupported, **do not** substitute 200 and empty `data`.

## 5. Pagination and filtering

List responses:

```json
{ "data": [], "next_cursor": null }
```

`limit` defaults to 50, max 100; over max → 400. `cursor` is opaque; clients must not parse it. Sort is stable: equal primary field → ascending `id`.

Channel list query:

- `type`
- `updated_since`: items with `updated_at` strictly greater than this time (delete updates `updated_at`)
- `include_deleted`: include deleted only when `true`. Default false
- `order`: `updated` (default, `updated_at` desc) or `created` (`created_at` asc)
- `filter`: optional. Subset of IETF SCIM ([RFC 7644 §3.4.2.2](https://datatracker.ietf.org/doc/html/rfc7644#section-3.4.2.2)) filter expressions. **AND** with `type`, `updated_since`, `include_deleted`. Omit to skip. v1 reference implementation scans linearly; no inverted index.

`filter` attribute paths: channels `id`, `type`, `title`, `ext.<key>`; entries `id`, `type`, `ext.<key>`; links `id`, `type`, `title`, `ext.<key>`. `<key>` uses type syntax. Other paths → 400 `validation_error`. Seed-imported `ext` uses the same validation as HTTP writes; illegal values fail import and do not persist.

Operators (RFC names):

| Operator | Stored types | Meaning |
| --- | --- | --- |
| `eq` `ne` | string / number / boolean | Same-type equal / not equal |
| `co` `sw` `ew` | string only | Contains / prefix / suffix; Unicode code points; not regex |
| `gt` `ge` `lt` `le` | finite number only | Numeric compare |
| `pr` | any | Attribute is set. For `ext.<key>`: key present in the bag |

Logic: `and` `or` `not`, parentheses. Precedence matches the RFC: parentheses, then `not`, then `and`, then `or`. Cross-key OR needs parentheses, e.g. `(ext.artist eq "林可" or ext.album eq "周刊")`.

Literals: double-quoted strings (only `\"` and `\\` escapes); bare `true`/`false`; decimal JSON numbers. When query type and stored type disagree the predicate is false (not 400). Right-hand side of `gt` / `ge` / `lt` / `le` must be a number literal else 400. Right-hand side of `co` / `sw` / `ew` must be a string literal else 400. No `null` literal.

Missing key: `eq` / `co` / `sw` / `ew` / compares → false; `ne` → false (no value to differ from); `pr` → false.

Limits: `filter` source text max 1024 Unicode code points; paren depth max 4; atomic predicates max 16. Over limit, illegal syntax, or a **query parameter name** starting with `ext.` (homemade `ext.artist.eq=` etc.): 400 `validation_error`. Do not accept a JSON tree or Lucene / Elasticsearch query as `filter`.

Example: `GET /v1/channels?filter=ext.artist eq "林可" and ext.duration_ms gt 180000`

Entry list query: `order` is `asc` (default) or `desc` by `created_at`; if `parent_id` is given, only direct children of that parent (not the parent itself); `filter` is the same SCIM subset, **AND** with `parent_id` / `include_deleted`. Query names `ext.*` likewise 400.

Link list query:

- `direction` is `out` (default), `in`, or `both`
- `type`: optional, same syntax as §2. When present, only that relation type. Server must filter; clients must not be expected to filter a full dump
- `filter`: as above, **AND** with `direction` / `type` / `include_deleted`. Links without `title` treat `title` predicates as missing key. Query names `ext.*` likewise 400.

`GET` single resource: soft-deleted resources still return (with `deleted_at`) for sync. Never-existed → `not_found`.

## 6. Conditional write

Only when `capabilities.revisions` is true and the PATCH includes `title` or `body`:

- Body must include `base_revision`, else 400 `validation_error`
- Value must equal the channel’s current `revision`, else 409 `conflict` with `current_revision` in the body; channel unchanged
- On success append a revision, set channel `revision` to the new id, update `updated_at`

Changing only `members` or `ext` needs no `base_revision` and creates no revision. Without revisions capability, ignore `base_revision` in the request; a `body` yields the capability error; changing only `title`, `members`, or `ext` is allowed.

When creating a channel with revisions capability, write an initial revision (same title/body as after create); channel `revision` points at it.

## 7. Idempotency

`POST` create of entry, channel, link, or share may carry `Idempotency-Key` (1–128 printable ASCII).

The server stores the key, SHA-256 of the body, response status, and response body, at least until process exit (reference implementation is in-memory; no 24-hour disk guarantee).

- Same key, same digest: return the first status and body; do not create again
- Same key, different digest: 409 `idempotency_conflict`

## 8. Routes

Prefix `/v1`. JSON requests use `Content-Type: application/json`. Successful responses use `Content-Type: application/vnd.ocp+json; charset=utf-8`. Lists use the same type.

### 8.1 Channels

`GET /v1/channels`

`POST /v1/channels`

```json
{ "type": "note", "title": "周会记录", "body": [{ "type": "text", "text": "记录", "format": "plain" }], "members": [] }
```

Without `body` capability the request must not include a non-empty `body`, else `capability_unsupported` (`capability` `body`). When `members` is omitted, the sole member is the current account with `role` `owner` (grant tokens cannot create channels). Provider `guest` creating a channel → 403 `forbidden`.

`GET /v1/channels/{id}`

`PATCH /v1/channels/{id}`

```json
{ "title": "新标题", "body": [], "base_revision": "rev_abc", "members": [] }
```

All fields optional, but at least one writable field must appear.

`DELETE /v1/channels/{id}` soft-deletes; response is the deleted channel. Soft-delete of entries and links likewise returns the deleted resource. Successful create `POST` is 201; idempotent replay returns the first status and body.

### 8.2 Discussion

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

Without `entries`: `capability_unsupported`.

`GET /v1/entries/{id}`

`DELETE /v1/entries/{id}` soft-delete.

### 8.3 Links

`GET /v1/channels/{id}/links`

In the tasks seed appendix, `direction=in&type=parent` on `ch_proj` yields the two edges 「首页文案」 and 「配图导出」. That is the hierarchy convention—not another resource.

`POST /v1/channels/{id}/links`

```json
{ "type": "parent", "target_id": "ch_proj", "title": "所属项目" }
```

Or `{ "type": "references", "target_url": "https://example.com/spec", "title": "外部" }`.

Cross-provider example: `{ "type": "references", "target_url": "http://127.0.0.1:8782/v1/channels/ch_proj", "title": "首页文案" }`. This is not this provider’s `target_id`.

Without `links`: `capability_unsupported`.

`DELETE /v1/links/{id}` soft-delete. No `GET /v1/links/{id}`.

### 8.4 Shares

`POST /v1/channels/{id}/shares`

```json
{ "scope": "view", "expires_at": null }
```

`GET /v1/shares/{id}` requires auth; returns the share resource (including token and url).

`DELETE /v1/shares/{id}` sets `revoked_at`; afterward it cannot be opened.

`GET /s/{token}`

- When `Accept` includes `application/json` (and ranks it ahead of `text/html`, or there is no `text/html`), return JSON:

```json
{
  "share": { "scope": "view", "expires_at": null },
  "channel": {
    "id": "ch_draft",
    "type": "note",
    "title": "接口草案",
    "body": [],
    "updated_at": "2026-01-01T00:00:00.000Z",
    "ext": { "status": "撰写中" }
  },
  "entries": []
}
```

JSON view omits `capabilities`, `members`, `revision`, revision lists, and share token. Include channel `ext` when present. Entries are undeleted only; fields `id` `type` `body` `parent_id` `anchor` `author` `created_at`.

- Otherwise (including browser default Accept and `*/*`) return `text/html; charset=utf-8`. The page includes channel title, body text, and each entry’s text; when the channel has `ext`, show keys and values. Any text written into the page (title, body, author, file name, `ext` keys and values) must be escaped—never inserted as raw HTML. Style is light. `input` and `button` must reset appearance (`appearance: none`, border, background, font)—no system chrome. `scope=view` pages have no discussion form. `scope=comment` pages have a text field and a Send button posting to `POST /s/{token}/entries`. UI language follows `?lang=` and `Accept-Language` (see reference `uiLocale`).

`POST /s/{token}/entries` body:

```json
{ "body": [{ "type": "text", "text": "补充一句", "format": "plain" }] }
```

Server-written entry `type`: `message` when channel type is `dm` `group` `room`, else `comment`. No `parent_id` or `anchor`. `scope=view` → 403 `share_forbidden`.

Expiry is checked on read and write.

### 8.5 Revisions

`GET /v1/channels/{id}/revisions` ascending by `created_at`, no pagination (v1 reference still returns all if over 100; example data is far smaller).

`GET /v1/channels/{id}/revisions/{rev}`

`POST /v1/channels/{id}/revisions/{rev}/restore` body `{}`. Response is the updated channel.

Without capability: all of the above are `capability_unsupported` with `capability` `revisions`.

### 8.6 Files

`POST /v1/files`

- Body is raw bytes—not JSON, not multipart
- `Content-Type` is the media type
- `X-File-Name` is the percent-encoded file name

Response 201 with file metadata `{ "id", "name", "media_type", "size" }`, `id` prefix `file_`.

`GET /v1/files/{id}` and `HEAD /v1/files/{id}` require auth. Responses include `Accept-Ranges: bytes`, `Content-Length` (bytes sent this time), `Content-Type` (upload media type), `X-File-Name` (percent-encoded name).

- No `Range`: 200, whole file. Clients must not be required to send Range.
- `Range: bytes=start-end`: if valid → 206, `Content-Range: bytes start-end/total`, send only that closed interval. `end` may be omitted (through EOF).
- Out of range (e.g. start ≥ size): 416, `code` `range_not_satisfiable`.
- Multi-range `bytes=0-1,2-3`: 400 `validation_error`.
- `HEAD` matches the corresponding GET headers with no body.

Reference `maxFileBytes` defaults to 64MiB. Over → 413 `file_too_large`; no formal file id and no `.part` left on disk for that upload.

File blocks on share pages download with the share token: `GET` / `HEAD` `/s/{token}/files/{fileId}`, no Bearer; Range rules as above, but the file must be referenced by the channel’s current body or an undeleted entry, else 404 `not_found`. HTML renders file blocks as links to that URL with the file name as link text.

### 8.7 Admissions

`POST /v1/channels/{id}/admissions`

Requires login and that the current identity can see the channel. Body must be empty object `{}`; callers cannot choose expiry. Success 201:

```json
{
  "id": "ad_demo1",
  "token": "只出现这一次的签名票",
  "url": "udp://127.0.0.1:9100",
  "expires_at": "2026-01-01T00:01:00.000Z",
  "channel_id": "ch_walk",
  "actor": { "id": "u_lin", "display_name": "林可" }
}
```

- `id` prefix `ad_`
- `expires_at` set by the server to about 60 seconds from issue
- `url` is the provider-configured match address, not a share URL
- `token` is an HMAC-signed self-contained ticket for the match process; not written into channel body, produces no revision, not stored in `store.json`
- Without `live`: 404 `capability_unsupported`, `capability` `live`; empty lists forbidden
- Channel deleted: 409 `deleted`
- Channel invisible: 403 `forbidden`

Grant tokens and share tokens must not be used as match admissions. Frame format: `docs/MATCH.md` / `docs/en/MATCH.md`; not in this schema.

## 9. Capabilities of the three providers

| Provider | id | Port | body | entries | entry_threads | links | shares | revisions | live |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Sample chat | `chat` | 8781 | false | true | true | true | true | false | false |
| Sample tasks | `tasks` | 8782 | true | true | false | true | true | true | false |
| Sample notes | `notes` | 8783 | true | true | false | true | true | true | false |
| Match room | `walk` | 8785 | false | true | false | true | false | false | true |

Tokens are all `demo-token`. Actors are all `{ "id": "u_fuse", "display_name": "融合台" }`. `publicOrigin` is `http://127.0.0.1:{port}`.

## 10. Reference implementation constraints

These constrain only this repo’s reference server—not required for interoperability:

- Data file `store.json` holds channels, entries, links, shares, revisions, file metadata, accounts (with password hashes), session hashes, grant hashes. File bytes live only under `files/`, named by file id, not in JSON. Upload writes a temp `.part` then renames to id; download streams without loading the whole file into memory.
- `maxFileBytes` defaults to `64 * 1024 * 1024`, overridable at app create.
- Seeds import only when `store.json` is missing
- Import order: accounts, files, channels (array order), `edits` (array order), entries (array order), links. Entry `parent_id` must point at an already-imported entry. Seed `password` appears only at import and lands as a hash.
- Import uses the same validation and revision generation as the API. Seeds may specify resource ids and entry authors. File-block `name`, `media_type`, `size` are rewritten from the file record; `size` is UTF-8 byte length
- Notes seed `edits` run as sequential body updates, so at least “create” and “edit” revisions exist. The first revision’s body has only the create-time blocks
- Writes within one process are serialized so concurrent writers cannot corrupt `store.json`
- Idempotency cache is memory-only
- Default listen is `127.0.0.1`. Example entry points may set `HOST=0.0.0.0`; then share `publicOrigin` uses the first non-loopback IPv4. Tests leave `HOST` unset and use loopback plus OS-assigned ports—not the fixed appendix ports. A music library may map to a `library` channel plus `track` children (`parent` edges from tracks); this repo does not ship a separate music provider.

## Appendix A — Seeds

Times come from the import clock. The ids below must be used as written.

### A.1 Chat `examples/chat/seed.json`

```json
{
  "accounts": [
    { "id": "u_fuse", "display_name": "融合台", "provider_role": "owner", "password": "demo-pass" },
    { "id": "u_lin", "display_name": "林可", "provider_role": "owner", "password": "demo-pass" },
    { "id": "u_zhou", "display_name": "周宁", "provider_role": "member", "password": "demo-pass" },
    { "id": "u_xu", "display_name": "许安", "provider_role": "guest", "password": "demo-pass" }
  ],
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
        { "id": "u_xu", "display_name": "许安", "role": "guest" }
      ]
    },
    {
      "id": "ch_room_design",
      "type": "room",
      "title": "设计讨论",
      "members": [
        { "id": "u_lin", "display_name": "林可", "role": "owner" }
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

### A.2 Tasks `examples/tasks/seed.json`

```json
{
  "accounts": [
    { "id": "u_fuse", "display_name": "融合台", "provider_role": "owner", "password": "demo-pass" },
    { "id": "u_lin", "display_name": "林可", "provider_role": "owner", "password": "demo-pass" },
    { "id": "u_zhou", "display_name": "周宁", "provider_role": "member", "password": "demo-pass" },
    { "id": "u_xu", "display_name": "许安", "provider_role": "guest", "password": "demo-pass" }
  ],
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
      "ext": { "status": "撰写中" },
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
        { "id": "u_lin", "display_name": "林可", "role": "owner" },
        { "id": "u_xu", "display_name": "许安", "role": "guest" }
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

That is the hierarchy convention: child task channels emit `type=parent` edges. On `ch_proj`, `GET .../links?direction=in&type=parent` yields those two edges. `ln_img_blocks` is a network relation, not parent/child.

### A.3 Notes `examples/notes/seed.json`

```json
{
  "accounts": [
    { "id": "u_fuse", "display_name": "融合台", "provider_role": "owner", "password": "demo-pass" },
    { "id": "u_lin", "display_name": "林可", "provider_role": "owner", "password": "demo-pass" },
    { "id": "u_zhou", "display_name": "周宁", "provider_role": "member", "password": "demo-pass" },
    { "id": "u_xu", "display_name": "许安", "provider_role": "guest", "password": "demo-pass" }
  ],
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

`ln_draft_gloss` is a network relation (`references`), not parent/child hierarchy.

File-block `size` is rewritten at import to UTF-8 byte length; `0` in the seed is only a placeholder. Edits run before entries so annotation anchors still point at existing blocks.

After import, 「接口草案」 has at least two revisions: the first body is only “频道是可寻址的容器，讨论附在频道上。”; the current body also includes “链接把相关频道连起来，分享给出外部可打开的地址。”

### A.4 Provider list `examples/providers.json`

```json
[
  { "id": "chat", "name": "示例会话", "baseUrl": "http://127.0.0.1:8781", "token": "demo-token" },
  { "id": "tasks", "name": "示例任务", "baseUrl": "http://127.0.0.1:8782", "token": "demo-token" },
  { "id": "notes", "name": "示例笔记", "baseUrl": "http://127.0.0.1:8783", "token": "demo-token" }
]

```
