# System 模块联调设计

本文档以管理端 `apps/admin-web/src/views/system` 的用户、角色、权限和操作日志页面为边界。认证仍由既有 `/api/auth/*` 负责；产品、库存、生产和质量模块不在本文档范围内。

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

## 数据库影响

现有 `departments`、`users`、`roles`、`permissions`、`user_roles`、`role_permissions`、`refresh_tokens` 和 `operation_logs` 已满足业务数据结构，无需新增业务表。迁移 `202607220001-system-module-permissions` 仅追加“重置用户密码”和“删除角色”两个权限点；既有迁移保持不变。

当前 `operation_logs` 表未持久化请求 ID、HTTP 方法、路由、状态码和耗时，因此接口为这些展示字段返回 `null`，请求 ID 筛选在当前结构下返回空结果。后续如需这些字段，必须另行追加迁移，不能修改已执行迁移。
