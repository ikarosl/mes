# apps/api

NestJS 组合根。这里只负责启动、全局管道/过滤器/拦截器、模块装配和健康检查，不放业务 SQL。

```text
src/
  common/
  config/
  infrastructure/
  modules/
    identity/
    product/
    production/
  presentation/
  scripts/
  app.module.ts
  main.ts
```

每个领域模块采用 `domain / application / infrastructure / presentation` 四层模板。Controller 只做协议转换，Command/Query handler 负责用例，Repository adapter 负责持久化。

## 相关文档

- [Identity](src/modules/identity/README.md)
- [Product](src/modules/product/README.md)
- [Production](src/modules/production/README.md)
- [命令上下文](docs/command-context.md)
- [事务审计](docs/audit.md)
- [幂等性](docs/idempotency.md)

## 验证

`corepack pnpm --filter @company/api typecheck`，并运行相邻测试和根架构门禁。
