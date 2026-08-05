# Company MES Next

当前已落地范围：RBAC、认证、操作日志、管理端权限控制、多标签页路由缓存、产品主数据、技术文件、工序和工艺路线。Production 正在分阶段迁移：生产工单、生产批次、工序报工追溯，以及其依赖的生产物料需求、分配和领料出库链路。通用库存、入库、退料、报废、盘点、质量和全链路追溯后端尚未迁移。

## 快速开始

1. 复制 `.env.example` 为 `.env`，设置数据库和长度不少于 32 位的 JWT 密钥。
2. 启动基础设施：`pnpm infra:up`。该命令显式读取仓库根目录唯一的 `.env`。
3. 安装依赖：`pnpm install --frozen-lockfile`。
4. 执行迁移：`pnpm db:migrate`。
5. 创建管理员：设置 `ADMIN_PASSWORD` 后运行 `pnpm db:bootstrap-admin`。
6. 启动 API：`pnpm dev:api`。
7. 启动管理端：`pnpm dev:admin`。

## 验证

```text
pnpm verify
```

项目使用 pnpm workspace 管理依赖，并由 Turborepo 编排 `dev`、`build`、`typecheck` 和 `test`。构建与测试任务可缓存；数据库迁移、迁移状态检查和管理员初始化明确禁止缓存。

Access Token 只存在页面内存；刷新页面或打开新浏览器标签时，前端通过 HttpOnly Refresh Cookie 恢复会话。应用内部多标签页由 Pinia 维护，并使用 Vue KeepAlive 缓存页面实例。

## 项目规范

- 执行规则：[agents.md](agents.md)
- 代码架构：[docs/architecture.md](docs/architecture.md)
- 前端架构：[docs/frontend-architecture.md](docs/frontend-architecture.md)
- HTTP 接口：[docs/api-conventions.md](docs/api-conventions.md)
- 并发与幂等规则：[docs/concurrency-and-idempotency.md](docs/concurrency-and-idempotency.md)
- HTTP 幂等实施方案：[docs/http-idempotency-implementation-plan.md](docs/http-idempotency-implementation-plan.md)
- 编码规范：[docs/coding-standards.md](docs/coding-standards.md)
- 数据库设计：[docs/new.md](docs/new.md)
- 管理端设计：[design.md](design.md)
- 测试策略：[docs/testing-strategy.md](docs/testing-strategy.md)
