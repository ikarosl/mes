# Identity

负责认证、用户、部门、角色、权限关系和 Refresh Token，并提供项目级操作日志的查询入口。Product、Production 和平台审计写入不属于本模块。

跨模块只能使用 [`public.ts`](public.ts) 暴露的用户目录能力，不得直接访问 Identity Repository 或业务表。数据库设计见 [`docs/database.md`](docs/database.md)，事务审计规则见 [API 审计专题](../../../docs/audit.md)。

## 路由与页面权限

| 前端路由              | 稳定路由名           | 组件名            | 页面权限                 |
| --------------------- | -------------------- | ----------------- | ------------------------ |
| `/system/users`       | `system-users`       | `UsersPage`       | `system:user:view`       |
| `/system/roles`       | `system-roles`       | `RolesPage`       | `system:role:view`       |
| `/system/permissions` | `system-permissions` | `PermissionsPage` | `system:permission:view` |
| `/system/logs`        | `system-logs`        | `LogsPage`        | `system:log:view`        |

## HTTP 接口与权限编码

| 方法与路径                              | 用途                         | 后端权限                         |
| --------------------------------------- | ---------------------------- | -------------------------------- |
| `GET /api/system/users`                 | 用户列表                     | `system:user:view`               |
| `GET /api/system/departments/options`   | 启用部门选项                 | `system:user:view`               |
| `GET /api/system/roles/options`         | 启用角色选项                 | `system:user:view`               |
| `POST /api/system/users`                | 新增用户并分配初始角色       | `system:user:create`             |
| `PATCH /api/system/users/:id`           | 编辑用户资料                 | `system:user:update`             |
| `PATCH /api/system/users/:id/status`    | 启停用户                     | `system:user:update`             |
| `PATCH /api/system/users/:id/password`  | 重置密码并撤销 Refresh Token | `system:user:reset-password`     |
| `PUT /api/system/users/:id/roles`       | 重新分配用户角色             | `system:user:assign-roles`       |
| `GET /api/system/roles`                 | 角色列表及关联统计           | `system:role:view`               |
| `POST /api/system/roles`                | 新增角色                     | `system:role:create`             |
| `PATCH /api/system/roles/:id`           | 编辑角色                     | `system:role:update`             |
| `DELETE /api/system/roles/:id`          | 软删除无用户关联的角色       | `system:role:delete`             |
| `GET /api/system/roles/:id/permissions` | 查询角色已分配权限           | `system:role:assign-permissions` |
| `PUT /api/system/roles/:id/permissions` | 覆盖角色权限关系             | `system:role:assign-permissions` |
| `GET /api/system/permissions`           | 只读权限目录                 | `system:permission:view`         |
| `GET /api/system/logs`                  | 筛选、分页查询审计日志       | `system:log:view`                |

写操作均由应用服务构造审计上下文，Repository 在同一数据库事务内写入业务数据和 `operation_logs`。密码只以 bcrypt 哈希写入，审计数据不包含密码、Token 或 Cookie。

用户和角色列表遵守通用 `PageResult<T>` 响应。用户列表支持 `page`、`pageSize`、`keyword`、`username`、`displayName`、`roleId` 和 `status`；角色列表支持 `page`、`pageSize`、`keyword`、`name`、`code` 和 `status`。筛选或每页条数变化时，管理端回到第一页重新请求。

## 数据与平台边界

System 现有 `departments`、`users`、`roles`、`permissions`、`user_roles`、`role_permissions` 和
`refresh_tokens` 已满足业务数据结构，无需新增业务表。`operation_logs` 是项目级平台审计基础设施，
不属于 System 业务数据；System 仅提供当前审计查询入口，业务模块写入时可直接调用唯一事务审计
Writer，无需通过 Identity `public.ts`。`operation_logs` 的字段和唯一写入口由[审计专题](../../../docs/audit.md)维护；业务表字段由[Identity 数据库设计](docs/database.md)维护。

## 验证

运行 `corepack pnpm --filter @company/api typecheck`，并执行 Identity 相邻单元测试、HTTP 契约测试和根架构门禁。
