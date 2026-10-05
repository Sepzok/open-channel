# Agent conventions (Open Channel)

[中文](AGENTS.md)

## Protocol changes

When changing behavior or fields, update **together**:

- `docs/SPEC.md` (status codes and capability semantics) and `docs/en/SPEC.md`
- `schema/ocp.v1.schema.json` and `schema/fixtures/`
- `@open-channel/sdk` (TypeScript) and `sdk/python/openchannel`
- Related tests (`test/`, `server/test/`, `sdk/**/test*`, `e2e/`)

Shapes follow the schema; HTTP semantics follow SPEC (Chinese path is canonical).

## Adapting another product

Read `docs/SPEC.md`, `schema/ocp.v1.schema.json`, and `docs/ADAPT.md` first. One client per origin. Cross-provider association uses link `target_url` (channel resource URL) only—never put another provider’s channel id in `target_id`. Missing capabilities are `false` on discovery; those routes return `capability_unsupported`; if list `filter` is unimplemented, a request with `filter` must be 400. Do not copy revisions, shares, or SCIM from `examples/native`. When the product already has those features, follow `docs/ADAPT.md` and the notes example / copyable modules.

## Lobby and match

OCP describes HTTP document resources only. Match state does not enter channel body, discussion, revisions, or shares. Split: `docs/LIVE.md`. Admission routes: SPEC §8.7; frames and `reduce` contract: `docs/MATCH.md`. Forbidden: using discussion as an input stream, revisions as match snapshots, share tokens as match tickets, adding ticks or binary channel bodies to `/v1`. Do not copy gameplay from `examples/walk` into the protocol or process kernel. Providers without realtime match keep `live` false.

## Release

Source is MIT-licensed. Do not run `npm publish`, upload to PyPI, or deploy a public service. Root `package.json` is `private: true`.

## Copy

User-facing UI follows the active locale. Chinese uses industry two-character terms (频道、讨论、链接、修订、分享); English uses matching industry terms (channel, discussion, link, revision, share). Console labels follow `docs/PLAN.md` / `docs/en/PLAN.md`. Buttons and section bands use two-or-more-character (or multi-word English) industry labels—not single Chinese characters as labels.

Implementation plans and Agent “out of scope” lists are not user intent; the user’s own sentences win. Extra prohibitions or narrowed scope in a plan must be changed, then reported in the reply.

## Tests

After server or SDK changes run `npm test`; Python SDK: `npm run test:python`; console/E2E: `npm run test:e2e`. Tests self-start processes and temp `dataDir`; do not occupy 8781–8783. E2E uses local Chrome (`channel: 'chrome'`); do not put E2E in default CI.

## Dependencies

Server and example runtimes use Node builtins only. Root devDependencies are limited to `typescript`, `tsx`, `playwright`, `ajv`, `ajv-formats`. Python uses the standard library only. Node version: root `package.json` `engines`.
