# 跨模块测试

这里放不能由单一 workspace 或源码模块独立拥有的测试。测试分层、目录约定和门禁以[全局测试策略](../docs/testing-strategy.md)为准。

## 当前内容

`integration/` 使用真实 MySQL 验证 migration、Repository、事务、并发和完整 HTTP/application 闭环。运行时必须显式设置 `RUN_MYSQL_INTEGRATION=1`，并确保 `TEST_DB_*` 与 `DB_*` 指向同一个以 `_test` 结尾的专用数据库。

仓库当前没有 Contract、E2E 或 Performance 测试实现，因此不保留对应占位子目录文档。形成可运行测试及独立配置后，再创建相应目录和 README。

## 验证

```text
corepack pnpm typecheck:integration
corepack pnpm test:production:mysql
```
