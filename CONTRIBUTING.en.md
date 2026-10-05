# Contributing

[中文](CONTRIBUTING.md)

Source is MIT-licensed. Read `docs/SPEC.md` (or `docs/en/SPEC.md`) and `docs/ADAPT.md` before changing code.

## Protocol

When changing behavior or fields, update together:

- `docs/SPEC.md` and its English mirror `docs/en/SPEC.md`
- `schema/ocp.v1.schema.json` and `schema/fixtures/`
- TypeScript SDK and Python SDK
- Related tests

Shapes follow the schema; HTTP semantics follow SPEC (Chinese canonical).

## Tests

```bash
npm test
npm run test:python
```

For console or browser paths also run `npm run test:e2e` (local Chrome). Tests must start their own processes and temp data dirs; do not occupy fixed ports 8781–8783.

Node version: root `package.json` `engines`.

## Do not

- Run `npm publish` or publish to PyPI
- Bind a public service with demo credentials `demo-token` / `demo-pass` on a non-loopback address
- Copy revisions, shares, or SCIM from `examples/native` (the ticket adapter does not have those capabilities)
