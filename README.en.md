# Open Channel Protocol (local reference implementation)

[中文](README.md)

Open Channel Protocol (OCP) describes channels, discussion, links, shares, and revisions on a **single provider** with one resource model. Aggregating providers is a client concern (this repo’s fusion console is one example).

This repository is a locally runnable reference implementation and examples, published under the MIT license. It does not run `npm publish`, upload to PyPI, or deploy a public service. Landing page: https://sepzok.github.io/open-channel/ .

## Start

```bash
npm install
npm run dev          # hub(8779) + chat/tasks/notes/native/walk/console
```

Open the hub first: `http://127.0.0.1:8779`. It lists each genre surface and the fusion console, and shows whether each process is up.

Or start separately:

```bash
npm run dev:hub
npm run dev:chat
npm run dev:tasks
npm run dev:notes
npm run dev:console
npm run dev:native
npm run dev:walk
```

Addresses:

- Hub `http://127.0.0.1:8779`
- Fusion console `http://127.0.0.1:8780`
- Chat `http://127.0.0.1:8781`
- Tasks `http://127.0.0.1:8782`
- Notes `http://127.0.0.1:8783`
- Ticket adapter `http://127.0.0.1:8784`
- Walk room `http://127.0.0.1:8785`

All three provider tokens are `demo-token` (provider owner “融合台”). Seed account passwords are `demo-pass`; accounts are issued per provider—the console does not keep a global directory. Example surfaces sign in with the session password and must not embed `demo-token`. `demo-token` and `demo-pass` are for loopback only. Do not use them with `HOST=0.0.0.0` or any non-loopback bind; replace them with tokens and passwords you issue. Default bind is loopback; for LAN set `HOST=0.0.0.0` and change the demo credentials. File downloads support `Range`; the reference default max file size is 64MiB.

## Tests

```bash
npm test
npm run test:python
npm run test:e2e
```

`npm test` uses temp data dirs and OS-assigned ports; it does not need processes on 8781–8783. E2E uses local Chrome (Playwright `channel: 'chrome'`).

## Resource model (one page)

| Resource | Meaning |
| --- | --- |
| **channel** | Addressable container (DM, group, project, task, note, … via `type`). Optional `ext` scalars; list with SCIM `filter` |
| **block** | Body is `text` / `file` / `embed` blocks |
| **entry** | Record on a channel (message, comment, annotation via `type`) |
| **link** | Directed edge within a provider, or external URL. Hierarchy uses child→parent `parent` edges; networks use `references`, etc. Children are channels with bodies, not entries |
| **share** | Anonymous view/comment link; browsers get HTML by default |
| **revision** | Snapshot after each successful title/body write (needs `capabilities.revisions`) |

Capabilities (`body`, `entries`, `entry_threads`, `links`, `shares`, `revisions`, `live`) appear on discovery and channels; unsupported routes return `capability_unsupported`, never empty lists pretending support.

Protocol: [docs/SPEC.md](docs/SPEC.md) (canonical Chinese) / [docs/en/SPEC.md](docs/en/SPEC.md). Schema: `schema/ocp.v1.schema.json`. Game rooms can map to channels; match sync is in [docs/LIVE.md](docs/LIVE.md) / [docs/en/LIVE.md](docs/en/LIVE.md) and [docs/MATCH.md](docs/MATCH.md).

## Packages

- `@open-channel/server` — reference server `createApp(options)` (optional; third parties need not use it)
- `@open-channel/match` — authoritative match process (caller supplies `reduce` / `encode`)
- `@open-channel/sdk` — TypeScript client (one origin; multi-provider via multiple `Client`s + `target_url`)
- `sdk/python/openchannel` — Python client (stdlib `urllib`)
- `examples/hub` — local examples directory (open this first)
- `examples/chat|tasks|notes` — three reference providers
- `examples/walk` — thin match caller (two players walk); do not copy gameplay into the kernel
- `examples/native` — ticket adapter without `createApp` (third-party server starting point)
- `examples/console` — fusion console: multi-origin aggregate and cross-provider links

Adapting an existing product and linking multiple servers: [docs/ADAPT.md](docs/ADAPT.md) / [docs/en/ADAPT.md](docs/en/ADAPT.md). Revisions, share pages, and list `filter` entry points are there: native shows “product lacks these capabilities”; when you have them, follow the notes example and copyable modules—do not enable them from native.

License: `LICENSE` (MIT). Contributing: [CONTRIBUTING.md](CONTRIBUTING.md) / [CONTRIBUTING.en.md](CONTRIBUTING.en.md). Agent rules: [AGENTS.md](AGENTS.md) / [AGENTS.en.md](AGENTS.en.md).

UI language: fusion console and share HTML support `zh` / `en` (`?lang=`, `Accept-Language`, console switcher). Seed data stays Chinese on disk; the English locale shows known sample strings via a display map.
