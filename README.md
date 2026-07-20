# Company MES Next

当前已落地范围：RBAC、认证、操作日志、管理端权限控制和多标签页路由缓存。未迁移产品、库存、生产、质量等业务模块。

## 快速开始

1. 复制 `.env.example` 为 `.env`，设置数据库和长度不少于 32 位的 JWT 密钥。
2. 启动 MySQL：`docker compose -f infra/compose/compose.dev.yml up -d mysql`。
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

详细边界见 `agents.md` 和 `docs/rbac-auth-migration.md`。
