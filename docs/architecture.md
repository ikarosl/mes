# 目标架构

## 1. 架构风格

采用“模块化单体 + 端口适配器”。一个 NestJS API 进程承载一期模块，但禁止模块绕过公开应用服务直接访问其他模块的表或 Repository。这样适合 50 人规模，也为以后拆分独立服务保留边界。

## 2. Monorepo 目录

```text
apps/
  api/                    NestJS 组合根，只负责装配模块与进程启动
  admin-web/              Vue 3 管理端主线
  workstation-web/        轻量员工/检测测试入口
packages/
  contracts/              OpenAPI 派生类型、运行时 schema、事件契约
  database/               DataSource、迁移、迁移 CLI；不放业务 Repository
  config/                 配置 schema 与环境加载
  observability/          logger、trace、metrics、request-id
  storage/                StoragePort 及 local/S3 adapter
  cache/                  Cache/Lock/RateLimit 端口及 memory/Redis adapter
  testing/                test builders、容器辅助、fixtures
  ui/                     符合 design.md 的通用 Modal/Table/Form 组件
  eslint-config/          共享 lint 规则
  tsconfig/               共享 TypeScript 配置
tests/
  contract/               API / event 契约兼容性测试
  e2e/                    核心用户旅程
  performance/            容量基线，不作为每次 PR 的快速任务
infra/
  compose/                本地依赖
  docker/                 多阶段镜像
  nginx/                  反向代理与静态资源
  k8s/                    真正需要编排时再启用
ops/
  runbooks/               发布、回滚、备份恢复、故障处理
docs/
  adr/                    不可隐式改变的重要架构决策
  diagrams/               上下文、容器、模块依赖图
```

## 3. NestJS 模块内部模板

```text
modules/<module>/
  domain/
    entities/
    value-objects/
    events/
    services/
  application/
    commands/
    queries/
    dto/
    ports/
  infrastructure/
    persistence/
    cache/
    storage/
  presentation/
    http/
  <module>.module.ts
```

推荐领域模块：identity、product、process、production、inventory、quality、traceability。traceability 只做跨模块只读投影或查询编排，不能成为新的“万能模块”。

## 4. 依赖规则

```text
presentation -> application -> domain
infrastructure -> application ports + domain
domain -> 不依赖 NestJS、ORM、HTTP、Redis、S3
module A -> module B 的公开 application facade / contract
```

通过 ESLint boundaries 或 dependency-cruiser 在 CI 阻止反向依赖与跨模块深层 import。

## 5. 关键基础设施端口

- StoragePort：put/get/delete/presign/head；业务只保存 objectKey、版本、校验和和元数据，不保存供应商 URL。
- CachePort：get/set/delete；默认 Noop/Memory，按配置启用 Redis。
- LockPort：关键库存和状态操作使用数据库行锁优先；跨实例协调时使用 Redis 实现。
- Clock / IdGenerator：便于测试状态流转和审计时间。
- UnitOfWork：统一事务边界，禁止 Controller 开启事务。
- AuditPort：业务动作在同一事务写审计/outbox，避免 fire-and-forget 丢失。

## 6. 不建议现在做

- 不拆微服务、不上 Kafka、不引入 Kubernetes 作为一期前提。
- 不把 Redis 当主数据源或库存真相源。
- 不为“完整 MES”预建大量空模块。
- 不在业务模块中直接使用具体 S3 SDK 或 Redis client。
