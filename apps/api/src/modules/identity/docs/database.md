# Identity 数据库设计

> [返回 Identity 文档](../README.md)。

当前字段按既有 migration 与代码记录。Identity 主数据审计字段与根公共规范的差异尚未明确为例外，保留双方证据见[冲突 CO-02](../../../../../../docs/documentation-conflicts.md#co-02)；本文不把缺少的操作者字段描述成已实现。

## 1.1 `departments`

职责：维护组织部门和用户归属。

| 字段         | 类型              | 说明                        |
| ------------ | ----------------- | --------------------------- |
| `id`         | `BIGINT UNSIGNED` | 主键，自增                  |
| `parent_id`  | `BIGINT UNSIGNED` | 父部门 ID，顶级为空，自关联 |
| `name`       | `VARCHAR(64)`     | 部门名称                    |
| `code`       | `VARCHAR(64)`     | 部门编码，唯一              |
| `sort_order` | `INT`             | 排序，默认 `0`              |
| `status`     | `TINYINT`         | `1` 启用、`0` 停用          |
| `created_at` | `DATETIME`        | 创建时间                    |
| `updated_at` | `DATETIME`        | 更新时间                    |
| `deleted_at` | `DATETIME`        | 删除时间，空表示未删除      |

约束：`UNIQUE (code)`；`parent_id -> departments.id`。

## 1.2 `users`

职责：维护账号、登录凭证、部门归属和账号状态。

| 字段            | 类型              | 说明                 |
| --------------- | ----------------- | -------------------- |
| `id`            | `BIGINT UNSIGNED` | 主键，自增           |
| `department_id` | `BIGINT UNSIGNED` | 部门 ID，可为空      |
| `username`      | `VARCHAR(64)`     | 登录名，唯一         |
| `password_hash` | `VARCHAR(255)`    | 密码哈希，不保存明文 |
| `display_name`  | `VARCHAR(64)`     | 显示名称             |
| `email`         | `VARCHAR(128)`    | 邮箱，可为空         |
| `mobile`        | `VARCHAR(32)`     | 手机号，可为空       |
| `status`        | `TINYINT`         | `1` 启用、`0` 停用   |
| `last_login_at` | `DATETIME`        | 最近登录时间         |
| `created_at`    | `DATETIME`        | 创建时间             |
| `updated_at`    | `DATETIME`        | 更新时间             |
| `deleted_at`    | `DATETIME`        | 删除时间             |

约束：`UNIQUE (username)`；`department_id -> departments.id`；索引 `(status, deleted_at)`。

## 1.3 `roles`

| 字段          | 类型              | 说明               |
| ------------- | ----------------- | ------------------ |
| `id`          | `BIGINT UNSIGNED` | 主键，自增         |
| `name`        | `VARCHAR(64)`     | 角色名称           |
| `code`        | `VARCHAR(64)`     | 角色编码，唯一     |
| `description` | `VARCHAR(255)`    | 说明               |
| `status`      | `TINYINT`         | `1` 启用、`0` 停用 |
| `created_at`  | `DATETIME`        | 创建时间           |
| `updated_at`  | `DATETIME`        | 更新时间           |
| `deleted_at`  | `DATETIME`        | 删除时间           |

约束：`UNIQUE (code)`；索引 `(status, deleted_at)`。

## 1.4 `permissions`

职责：发布菜单分组、页面／宿主读取和独立业务动作的权限目录。业务权限编码通常使用 `module:resource:action`，模块分组使用 `module:view`；权限归属表示办理职责，不改变 HTTP 路径、业务模块或表所有权。

| 字段         | 类型              | 说明                            |
| ------------ | ----------------- | ------------------------------- |
| `id`         | `BIGINT UNSIGNED` | 主键，自增                      |
| `parent_id`  | `BIGINT UNSIGNED` | 父权限 ID，可为空，自关联       |
| `name`       | `VARCHAR(64)`     | 权限名称                        |
| `code`       | `VARCHAR(128)`    | 权限编码，唯一                  |
| `type`       | `VARCHAR(32)`     | `menu`、`page`、`button`、`api` |
| `route_path` | `VARCHAR(255)`    | 前端页面路由，可为空；不是 API 地址 |
| `api_method` | `VARCHAR(16)`     | HTTP 方法，可为空               |
| `api_path`   | `VARCHAR(255)`    | 接口路径，可为空                |
| `sort_order` | `INT`             | 排序，默认 `0`                  |
| `status`     | `TINYINT`         | `1` 启用、`0` 停用              |
| `created_at` | `DATETIME`        | 创建时间                        |
| `updated_at` | `DATETIME`        | 更新时间                        |
| `deleted_at` | `DATETIME`        | 删除时间                        |

约束：`UNIQUE (code)`；`parent_id -> permissions.id`；`CHECK (type IN ('menu', 'page', 'button', 'api'))`。

### 目录来源与发布

[`PERMISSION_CATALOG`](../../../../../../packages/constants/src/permission-catalog.ts) 是当前可分配业务权限的显式清单，以及中文展示名、父级、类型、页面路由、排序及 API 元数据的唯一源码来源；[`PERMISSIONS`](../../../../../../packages/constants/src/permissions.ts) 提供运行代码引用的稳定编码。前后端需要权限名称时消费 catalog，不建立另一份中文映射。Identity 的只读查询返回数据库已发布目录；角色授权通过 `role_permissions.permission_id` 关联目录，不由运行时根据常量自动改库。

目录随成对版本化 migration 发布静态 SQL 快照；快照包含当时所需全部目录元数据，不在回滚时导入当前 TypeScript catalog，也不修改已执行的 migration。`202610150001-permission-catalog-alignment` 发布当前职责归属：既有能力原位更新编码和元数据，新增 Quality 分组及独立仓储出库查看，移除未开放的技术文件删除和采购入库草稿创建／取消目录项。迁移仅修改权限目录及被移除项的角色关联，不新增业务表、不提供旧编码别名或双目录；系统 seed 管理初始化，演示 seed 只保证明确配置的演示角色基础。

`*` 是系统 seed 管理的全权限例外，不属于业务 catalog 的模块树。授权匹配复用共享 `permissionMatches`：具体编码命中自身，合法的 `:*` 编码按前缀匹配，`*` 命中全部；模块分组的 `:view` 不是通配符。

### 分组、页面与逐接口授权

`parent_id` 只表达目录分组及角色配置界面的层级。授予模块、页面或宿主节点不会在后端继承其子权限；选择子权限也不会隐式授予父节点。管理端菜单、路由和整页读取按各自页面权限控制，页面内动作仍由每个后端接口的 `RequirePermission` 独立鉴权。跨页面共用的只读接口可以声明精确的 any-of，合法消费者和授权集由最近的接口所有者文档维护；不把动作权限扩成整页读取或分配能力。

`route_path`（共享条目中的 `routePath`）只用于定位前端页面；内嵌功能和独立动作允许为空，不伪造并不存在的页面。`api_method/api_path` 是可空的目录说明元数据，不是路径匹配鉴权规则，也不能表达一个权限覆盖的全部端点；当前 catalog 均为 `null`，实际授权以 Controller 声明为准。

到货办理、库存查看、采购／成品入库确认和生产领料出库归属 `warehouse`；正式需求、分配及需求更正归属 `production`；供应商和采购订单归属 `procurement`；检验归属 `quality`。例如到货办理仍由 Procurement Controller 和业务事实所有者执行，`warehouse` 编码不授权跨模块写表。

采购／成品入库共用 `warehouse:inbound:view`，生产领料出库独立使用 `warehouse:outbound:view`。其他入库／出库分类继续分别使用 `warehouse:other-inbounds:view`／`warehouse:other-outbounds:view`，各写动作独立授权。同一方向页面的菜单可进入不代表取得所有分类或接口权限。实际读取与写入边界见 [Production 领料接口](../../production/docs/database/demand-allocation-and-outbound.md#http-权限与消费者)、[入库读取](../../production/docs/database/inventory-ledger-and-inbound.md)、[到货查询](../../procurement/docs/receipt-queries.md)和[到货处置](../../procurement/docs/receipts.md)。

## 1.5 `user_roles`

| 字段         | 类型              | 说明     |
| ------------ | ----------------- | -------- |
| `user_id`    | `BIGINT UNSIGNED` | 用户 ID  |
| `role_id`    | `BIGINT UNSIGNED` | 角色 ID  |
| `created_at` | `DATETIME`        | 分配时间 |

约束：`PRIMARY KEY (user_id, role_id)`；两侧外键删除时级联删除关联行。

## 1.6 `role_permissions`

| 字段            | 类型              | 说明     |
| --------------- | ----------------- | -------- |
| `role_id`       | `BIGINT UNSIGNED` | 角色 ID  |
| `permission_id` | `BIGINT UNSIGNED` | 权限 ID  |
| `created_at`    | `DATETIME`        | 分配时间 |

约束：`PRIMARY KEY (role_id, permission_id)`；两侧外键删除时级联删除关联行。

## 1.7 `refresh_tokens`

职责：保存刷新令牌族的服务端状态，只保存 `jti`，不保存明文 Token。

| 字段              | 类型              | 说明                  |
| ----------------- | ----------------- | --------------------- |
| `id`              | `BIGINT UNSIGNED` | 主键，自增            |
| `user_id`         | `BIGINT UNSIGNED` | 用户 ID               |
| `jti`             | `CHAR(36)`        | Token 唯一标识，唯一  |
| `expires_at`      | `DATETIME`        | 过期时间              |
| `revoked_at`      | `DATETIME`        | 撤销时间              |
| `replaced_by_jti` | `CHAR(36)`        | 轮换后的新 Token 标识 |
| `created_at`      | `DATETIME`        | 创建时间              |

约束：`UNIQUE (jti)`；索引 `(user_id, revoked_at, expires_at)`；`user_id -> users.id ON DELETE CASCADE`。
