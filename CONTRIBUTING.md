# 贡献

源码以 MIT 许可证公开。改代码前先读 `docs/SPEC.md` 与 `docs/ADAPT.md`。

## 协议

修改行为或字段时同时更新：

- `docs/SPEC.md`
- `schema/ocp.v1.schema.json` 与 `schema/fixtures/`
- TypeScript SDK 与 Python SDK
- 相关测试

形状以 schema 为准；HTTP 语义以 SPEC 为准。

## 测试

```bash
npm test
npm run test:python
```

改融合台或浏览器路径时再跑 `npm run test:e2e`（本机 Chrome）。测试须自起进程、临时数据目录，不占用固定 8781–8783。

Node 版本见根 `package.json` 的 `engines`。

## 不要

- 执行 `npm publish`，或把包发到 PyPI
- 把公网服务或示例令牌 `demo-token` / `demo-pass` 绑到非回环地址
- 从 `examples/native` 抄修订、分享或 SCIM（工单适配没有这些能力）
