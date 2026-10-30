# Identity 数据库设计

> [返回 Identity 文档](../README.md)。

`departments/users/roles/permissions` 适用[公共审计列规则中的例外](../../../../../../docs/database-conventions.md#统一审计规则)；新增人员配置使用完整配置审计列，不扩大例外范围。人工管理命令的事务日志要求见[认证与管理边界](../README.md#认证与管理边界)。

下表描述当前结构，与 migration 同步维护。未写 `DEFAULT` 的非空列没有数据库默认值；可空列默认 `NULL`。外键未另注时均限制物理删除；外键所需支撑索引由 MySQL 保证，以下另列显式查询索引。表使用 InnoDB、`utf8mb4_0900_ai_ci`。

`departments/users/roles/permissions` 共用时间列 T：

| 字段 | 类型、空值与默认值 | 含义 |
| --- | --- | --- |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 创建时间 |
| `updated_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最近修改时间 |
| `deleted_at` | `DATETIME NULL` | 删除时间，空表示未删除 |

## 1.1 `departments`

维护组织部门及父子关系，用户通过 `department_id` 归属部门，不把组织层级当作权限继承。

| 字段 | 类型、空值与默认值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键 |
| `parent_id` | `BIGINT UNSIGNED NULL` | 父部门；顶级为空 |
| `name` | `VARCHAR(64) NOT NULL` | 部门名称 |
| `code` | `VARCHAR(64) NOT NULL` | 唯一部门编码 |
| `sort_order` | `INT NOT NULL DEFAULT 0` | 排序 |
| `status` | `TINYINT NOT NULL DEFAULT 1` | 启用 `1`／停用 `0` |
| 时间列 T | 见上表 | 创建、修改和软删除时间 |

主键 `id`；唯一键 `uk_departments_code(code)`；索引 `idx_departments_parent(parent_id)`；外键 `parent_id → departments.id`。当前无状态值域 CHECK。

## 1.2 `users`

维护登录账号、凭证、显示身份和部门归属；角色授权另存 `user_roles`，不把角色固定在账号主表。

| 字段 | 类型、空值与默认值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键 |
| `department_id` | `BIGINT UNSIGNED NULL` | 所属部门 |
| `username` | `VARCHAR(64) NOT NULL` | 唯一登录名 |
| `password_hash` | `VARCHAR(255) NOT NULL` | 密码哈希，不保存明文 |
| `display_name` | `VARCHAR(64) NOT NULL` | 显示姓名 |
| `email` | `VARCHAR(128) NULL` | 邮箱 |
| `mobile` | `VARCHAR(32) NULL` | 手机号 |
| `status` | `TINYINT NOT NULL DEFAULT 1` | 启用 `1`／停用 `0` |
| `last_login_at` | `DATETIME NULL` | 最近登录时间 |
| 时间列 T | 见上表 | 创建、修改和软删除时间 |

主键 `id`；唯一键 `uk_users_username(username)`；索引 `idx_users_department(department_id)`、`idx_users_status_deleted(status,deleted_at)`；外键 `department_id → departments.id`。当前无状态值域 CHECK。

## 1.3 `roles`

保存可分配的角色身份；用户成员与权限集合分别由两张关联表表达，同一角色可供多个账号使用。

| 字段 | 类型、空值与默认值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键 |
| `name` | `VARCHAR(64) NOT NULL` | 角色名称 |
| `code` | `VARCHAR(64) NOT NULL` | 唯一角色编码 |
| `description` | `VARCHAR(255) NULL` | 说明 |
| `status` | `TINYINT NOT NULL DEFAULT 1` | 启用 `1`／停用 `0` |
| 时间列 T | 见上表 | 创建、修改和软删除时间 |

主键 `id`；唯一键 `uk_roles_code(code)`；索引 `idx_roles_status_deleted(status,deleted_at)`。当前无状态值域 CHECK。

## 1.4 `permissions`

职责：发布菜单分组、页面／宿主读取和独立业务动作的权限目录。业务权限编码通常使用 `module:resource:action`，模块分组使用 `module:view`；权限归属表示办理职责，不改变 HTTP 路径、业务模块或表所有权。

| 字段 | 类型、空值与默认值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键 |
| `parent_id` | `BIGINT UNSIGNED NULL` | 父权限目录节点 |
| `name` | `VARCHAR(64) NOT NULL` | 展示名称 |
| `code` | `VARCHAR(128) NOT NULL` | 永久唯一权限编码 |
| `type` | `VARCHAR(32) NOT NULL` | `menu/page/button/api` |
| `route_path` | `VARCHAR(255) NULL` | 前端路由，不是 API 地址 |
| `api_method` | `VARCHAR(16) NULL` | HTTP 方法说明 |
| `api_path` | `VARCHAR(255) NULL` | 接口路径说明 |
| `sort_order` | `INT NOT NULL DEFAULT 0` | 目录排序 |
| `status` | `TINYINT NOT NULL DEFAULT 1` | 启用 `1`／停用 `0` |
| 时间列 T | 见上表 | 创建、修改和软删除时间 |

主键 `id`；唯一键 `uk_permissions_code(code)`；索引 `idx_permissions_parent(parent_id)`、`idx_permissions_status_deleted(status,deleted_at)`；外键 `parent_id → permissions.id`。`chk_permissions_type` 限定 `type IN ('menu','page','button','api')`，当前无 `status` 值域 CHECK。父级只表达目录关系，授权含义见下文。

### 目录来源与发布

[`PERMISSION_CATALOG`](../../../../../../packages/constants/src/permission-catalog.ts) 是当前可分配业务权限的显式清单，以及中文展示名、父级、类型、页面路由、排序及 API 元数据的唯一源码来源；[`PERMISSIONS`](../../../../../../packages/constants/src/permissions.ts) 提供运行代码引用的稳定编码。前后端需要权限名称时消费 catalog，不建立另一份中文映射。Identity 的只读查询返回数据库已发布目录；角色授权通过 `role_permissions.permission_id` 关联目录，不由运行时根据常量自动改库。

目录随版本化 migration 发布静态快照，回退不读取当前 TypeScript catalog，也不修改已执行文件。目录发布不自动授予已有角色；系统 seed 负责初始化，演示 seed 只保证显式配置的演示角色。具体切换与回退见[迁移安全](../../../../../../packages/database/docs/migration-safety.md#202610150001显式权限目录与仓储职责)。

`*` 是系统 seed 管理的全权限例外，不属于业务 catalog 的模块树。授权匹配复用共享 `permissionMatches`：具体编码命中自身，合法的 `:*` 编码按前缀匹配，`*` 命中全部；模块分组的 `:view` 不是通配符。

### 分组、页面与逐接口授权

`parent_id` 只表达目录分组及角色配置界面的层级。授予模块、页面或宿主节点不会在后端继承其子权限；选择子权限也不会隐式授予父节点。管理端菜单、路由和整页读取按各自页面权限控制，页面内动作仍由每个后端接口的 `RequirePermission` 独立鉴权。跨页面共用的只读接口可以声明精确的 any-of，合法消费者和授权集由最近的接口所有者文档维护；不把动作权限扩成整页读取或分配能力。

写入口需要多个独立能力时使用 `RequireAllPermissions`，逐项复用相同权限匹配规则，全部命中才放行；与 `RequirePermission` 同时声明时两组条件也须同时成立。既有 `RequirePermission` 数组继续表示 any-of，不能用它表达主数据写入与文件绑定同时授权。

`route_path`（共享条目中的 `routePath`）只用于定位前端页面；内嵌功能和独立动作允许为空，不伪造并不存在的页面。`api_method/api_path` 是可空的目录说明元数据，不是路径匹配鉴权规则，也不能表达一个权限覆盖的全部端点；当前 catalog 均为 `null`，实际授权以 Controller 声明为准。

到货办理、库存查看、采购／成品入库确认和生产领料出库归属 `warehouse`；正式需求、分配及需求更正归属 `production`；供应商和采购订单归属 `procurement`；检验归属 `quality`。例如到货办理仍由 Procurement Controller 和业务事实所有者执行，`warehouse` 编码不授权跨模块写表。

采购／成品入库共用 `warehouse:inbound:view`，生产领料出库独立使用 `warehouse:outbound:view`。其他入库／出库分类继续分别使用 `warehouse:other-inbounds:view`／`warehouse:other-outbounds:view`，各写动作独立授权。同一方向页面的菜单可进入不代表取得所有分类或接口权限。实际读取与写入边界见 [Production 领料接口](../../production/docs/database/demand-allocation-and-outbound.md#http-权限与消费者)、[入库读取](../../production/docs/database/inventory-ledger-and-inbound.md)、[到货查询](../../procurement/docs/receipt-queries.md)和[到货处置](../../procurement/docs/receipts.md)。

生产任务与生产报工记录使用独立页面权限，报工读取与员工范围见 [Production 接口矩阵](../../production/docs/database/execution-traceability-quality.md#http-读取权限与消费者)。报工新权限不复制任务查看授权，已有环境须明确分配；迁移和演示授权边界见[迁移安全](../../../../../../packages/database/docs/migration-safety.md#202610190001独立生产报工记录查看)。

## 1.5 `user_roles`

保存账号与角色的多对多成员关系；角色及其权限不复制到每个用户。

| 字段 | 类型、空值与默认值 | 含义 |
| --- | --- | --- |
| `user_id` | `BIGINT UNSIGNED NOT NULL` | 用户 |
| `role_id` | `BIGINT UNSIGNED NOT NULL` | 所属角色 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 分配时间 |

复合主键 `(user_id,role_id)`；索引 `idx_user_roles_role(role_id)`；外键 `user_id → users.id`、`role_id → roles.id` 均为 `ON DELETE CASCADE`，只级联清理关联行。

## 1.6 `role_permissions`

保存角色实际获授的目录权限；目录父子关系不代替这里的授权记录。

| 字段 | 类型、空值与默认值 | 含义 |
| --- | --- | --- |
| `role_id` | `BIGINT UNSIGNED NOT NULL` | 获授角色 |
| `permission_id` | `BIGINT UNSIGNED NOT NULL` | 权限目录项 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 分配时间 |

复合主键 `(role_id,permission_id)`；索引 `idx_role_permissions_permission(permission_id)`；外键 `role_id → roles.id`、`permission_id → permissions.id` 均为 `ON DELETE CASCADE`。

## 1.7 `refresh_tokens`

职责：保存刷新令牌族的服务端状态，只保存 `jti`，不保存明文 Token。

| 字段 | 类型、空值与默认值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键 |
| `user_id` | `BIGINT UNSIGNED NOT NULL` | 所属账号 |
| `jti` | `CHAR(36) NOT NULL` | 唯一令牌标识 |
| `expires_at` | `DATETIME NOT NULL` | 过期时间 |
| `revoked_at` | `DATETIME NULL` | 撤销时间 |
| `replaced_by_jti` | `CHAR(36) NULL` | 轮换后的令牌标识；非外键 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 创建时间 |

主键 `id`；唯一键 `uk_refresh_tokens_jti(jti)`；索引 `idx_refresh_tokens_user_active(user_id,revoked_at,expires_at)`；外键 `user_id → users.id ON DELETE CASCADE`。轮换保留前后标识，过期与主动撤销分别记录。

## 1.8 `user_candidate_configs`

职责：保存受控业务场景的当前候选角色集合根；场景与资格语义由[业务人员候选](user-candidates.md)所有。

| 字段 | 类型、空值与默认值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键 |
| `scene_code` | `VARCHAR(100) NOT NULL` | 场景稳定自然键 |
| `version` | `INT NOT NULL DEFAULT 0` | 编辑并发版本；API 首次保存为 `1` |
| `created_by` / `updated_by` / `deleted_by` | `BIGINT UNSIGNED NULL` | 创建、修改、删除人，各自引用 `users.id` |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 创建时间 |
| `updated_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最近修改时间 |
| `is_deleted` | `TINYINT NOT NULL DEFAULT 0` | 软删除标志 |
| `deleted_at` | `DATETIME NULL` | 删除时间 |

主键 `id`；唯一键 `uk_user_candidate_configs_scene(scene_code)`。`chk_user_candidate_configs_version` 保证 `version >= 0`；`chk_user_candidate_configs_deleted` 要求未删除时删除人／时间均空，删除时标志为 `1` 且二者均非空。三个操作者外键均指向 `users.id`。场景代码可扩展，不设置封闭值域 CHECK。

场景编码删除后也不释放占用；当前不开放配置删除。场景仅来自受控代码目录，管理接口不能创建新场景。

## 1.9 `user_candidate_config_roles`

保存一个场景选中的角色集合；按当前角色成员求候选，不固化用户名单。

| 字段 | 类型、空值与默认值 | 含义 |
| --- | --- | --- |
| `config_id` | `BIGINT UNSIGNED NOT NULL` | 配置根 |
| `role_id` | `BIGINT UNSIGNED NOT NULL` | 候选角色 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 关联建立时间 |

复合主键 `(config_id,role_id)`；索引 `idx_user_candidate_config_roles_role(role_id,config_id)`；外键 `config_id → user_candidate_configs.id ON DELETE CASCADE`、`role_id → roles.id`（限制删除）。

被候选配置引用的角色不得删除；软删除同样在写事务内检查引用，不能只靠物理外键。关联不保存用户名单或另一份角色条件，前后集合由审计追溯。
