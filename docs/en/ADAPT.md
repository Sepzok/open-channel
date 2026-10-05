# Adapting an existing product to Open Channel

**Canonical:** [../ADAPT.md](../ADAPT.md)

This protocol describes HTTP resources on **one provider process**. Aggregating multiple servers and relating business objects is done by the **client**, not by federation inside a provider.

## Server (third-party implementation)

You do not need this repo’s `@open-channel/server`. Compare against:

- Behavior: `docs/SPEC.md` / `docs/en/SPEC.md`
- JSON shapes: `schema/ocp.v1.schema.json`
- Black box: against your `baseUrl` + Bearer, run the same discovery and link assertions as `test/conformance.test.ts`

Minimum set the fusion console can read:

1. `GET /v1`: `protocol`, `version`, `provider`, `actor`, `capabilities`
2. Channel / discussion / link routes enabled by capabilities. `GET /v1` sets missing capabilities to `false`. Those routes return `capability_unsupported` (including `.../revisions/{id}` and restore)—not empty lists, and not a plain `not_found` pretending “no history.” If discussion threads are off, `parent_id` yields `threads_unsupported`; if there is no body, anchors yield `anchor_unsupported`. If SCIM is unimplemented, a list request with `filter` must be 400—do not ignore the parameter and still return 200.
3. Bearer (bootstrap token, session, or grant; see SPEC §3)
4. Errors as `application/problem+json` with `code`

Mapping:

| Existing object | OCP |
| --- | --- |
| Session, group, project, task, note, ticket | Channel; distinguish with `type` |
| Message, comment, annotation | Discussion `entry` |
| Parent/child, blocks, references | Links; same process uses `target_id`, other processes use `target_url` |
| Native primary key | `ext.native_id` (string scalar). The protocol does not interpret the key; adapters use it to write back |

Channel ids must match the schema `ch_…` form. Do not use an external `T-100` as `id`; put it in `ext.native_id`.

`examples/native` maps in-memory tickets to channels and does not import `createApp`. It has **no** revisions, shares, SCIM, or live match, because the ticket adapter lacks those product capabilities: discovery keys are `false`, routes return problem responses. Do not copy those four from native.

When the product **already has** document history, public links, or field search, follow below. The contract remains SPEC; the full-capability reference is `examples/notes` (`NOTES_CAPS`). TypeScript may copy standalone modules without depending on `createApp`.

## Revisions

See SPEC §1.6, §6, §8.5. Turn on `capabilities.revisions`.

Required:

- Append a snapshot on channel create and on successful PATCH of `title` or `body`; channel `revision` points at the latest
- PATCH must send `base_revision` equal to the current value, else 400; mismatch → 409 `conflict` with `current_revision` in the body; channel unchanged
- Restore: write that snapshot’s title and body back and **append** another revision; old ids still return old bodies
- Changing only `members` / `ext` does not create a revision

TypeScript: see `addRevision` in `server/src/store.ts` (deep-copy `body`). Do not mutate history records. Behavior is locked in notes revision cases in `server/test/server.test.ts`.

## Share pages

See SPEC §1.5, §8.4. Turn on `capabilities.shares`.

Required:

- `POST .../shares` issues an unguessable token; `url` is `{publicOrigin}/s/{token}`
- `GET /s/{token}`: when `Accept` prefers JSON, return channel and discussion (no revisions, no token leakage); otherwise light HTML
- Escape titles, bodies, authors, file names, and `ext` written into the page
- `scope=view` forbids `POST /s/{token}/entries` (403 `share_forbidden`); `comment` allows it with author display name “Guest” / 「访客」
- After revoke: `share_unavailable`; share file Range rules match authenticated download but only for files referenced by that channel

TypeScript may copy `sharePageHtml` from `server/src/html.ts` (depends on `escapeHtml`). Wire routes and auth yourself per SPEC. Behavior is locked in share server tests.

## List filter (SCIM subset)

See SPEC §5. This is not a capabilities key: once you accept a `filter` query parameter, you must filter by the subset—you cannot pretend you did not see it.

Required: path, `eq`/`ne`/`co`/`pr`/`gt`, etc., AND/OR/`not`, length and depth limits; illegal → 400. AND with `type`, `updated_since`, `include_deleted`.

TypeScript may use `parseListFilterQuery` from `server/src/scimFilter.ts` as-is (no `createApp`). Other languages reimplement per SPEC §5 and treat `server/test/ext-filter.test.ts` as acceptance. Without an engine, list + `filter` must be 400 (see native).

## Live match

See SPEC §8.7, `docs/LIVE.md`, `docs/MATCH.md`. Turn on `capabilities.live` only when the product **already has** an authoritative match process. Otherwise discovery is `false` and `POST .../admissions` returns `capability_unsupported`.

Required:

- Issue a short-lived HMAC ticket bound to channel, participant, ~60s expiry; `url` is the match address
- Match process enters the caller’s `reduce` only after `verify`
- Frames and ticks do not enter the OCP schema; if a record should remain, write discussion over HTTP

Third parties implement their own `reduce` / `encode`; clients frame per `docs/MATCH.md`; admission only calls `createAdmission`. Do not copy gameplay from `examples/walk`. Chat, tasks, notes, and native keep `live: false`.

## Client (multiple servers)

One `Client({ baseUrl, token })` per origin. Tokens are issued by that provider (API key, session, or grant); the fusion console does not unify login.

Relating business across providers:

1. Build the other channel’s resource URL with `channelResourceUrl(other.baseUrl, channelId)`
2. On the source provider `createLink({ type: 'references', target_url, title })`
3. In lists use `parseChannelResourceUrl` / `matchProvider` to see if a configured other side can open

Forbidden: putting the other provider’s channel id into this provider’s `target_id` (400 or wrong object).

Same-provider hierarchy still uses `type=parent` + `target_id`.

Reference: `examples/console` (browser hits only the console; provider tokens stay in the console process).
