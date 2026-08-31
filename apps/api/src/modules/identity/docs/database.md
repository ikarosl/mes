# Identity 数据库设计

> [返回 Identity 文档](../README.md)。

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

职责：统一维护菜单、页面、按钮和后端接口权限点；权限编码使用 `module:resource:action`。

| 字段         | 类型              | 说明                            |
| ------------ | ----------------- | ------------------------------- |
| `id`         | `BIGINT UNSIGNED` | 主键，自增                      |
| `parent_id`  | `BIGINT UNSIGNED` | 父权限 ID，可为空，自关联       |
| `name`       | `VARCHAR(64)`     | 权限名称                        |
| `code`       | `VARCHAR(128)`    | 权限编码，唯一                  |
| `type`       | `VARCHAR(32)`     | `menu`、`page`、`button`、`api` |
| `route_path` | `VARCHAR(255)`    | 前端路由，可为空                |
| `api_method` | `VARCHAR(16)`     | HTTP 方法，可为空               |
| `api_path`   | `VARCHAR(255)`    | 接口路径，可为空                |
| `sort_order` | `INT`             | 排序，默认 `0`                  |
| `status`     | `TINYINT`         | `1` 启用、`0` 停用              |
| `created_at` | `DATETIME`        | 创建时间                        |
| `updated_at` | `DATETIME`        | 更新时间                        |
| `deleted_at` | `DATETIME`        | 删除时间                        |

约束：`UNIQUE (code)`；`parent_id -> permissions.id`；`CHECK (type IN ('menu', 'page', 'button', 'api'))`。

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
