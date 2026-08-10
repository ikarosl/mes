# 系统、RBAC 与认证

> [返回数据库设计总览](README.md)。本章是总览所引用的权威规范组成部分，不是独立副本。

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

## 1.8 `operation_logs`

职责：作为项目级平台审计基础设施，记录认证、权限和业务操作审计，不归属任何业务模块；不得记录
密码、Token、Cookie 或其他密钥。跨模块写入与唯一 Writer 规则以 `docs/architecture.md` 为准。

| 字段          | 类型                 | 说明                              |
| ------------- | -------------------- | --------------------------------- |
| `id`          | `BIGINT UNSIGNED`    | 主键，自增                        |
| `log_type`    | `VARCHAR(32)`        | 日志类型                          |
| `module`      | `VARCHAR(64)`        | 模块                              |
| `action`      | `VARCHAR(128)`       | 动作                              |
| `user_id`     | `BIGINT UNSIGNED`    | 操作用户，可为空                  |
| `target_id`   | `BIGINT UNSIGNED`    | 目标 ID，可为空                   |
| `target_type` | `VARCHAR(64)`        | 目标类型                          |
| `result`      | `VARCHAR(32)`        | 默认 `success`                    |
| `before_data` | `JSON`               | 操作前数据，已脱敏                |
| `after_data`  | `JSON`               | 操作后数据，已脱敏                |
| `ip`          | `VARCHAR(64)`        | 来源 IP                           |
| `request_id`  | `VARCHAR(128)`       | 请求关联 ID，历史记录可为空       |
| `http_method` | `VARCHAR(16)`        | HTTP 方法，可为空                 |
| `route`       | `VARCHAR(255)`       | 脱敏后的路由模板，可为空          |
| `http_status` | `SMALLINT UNSIGNED`  | HTTP 状态码，可为空               |
| `duration_ms` | `INT UNSIGNED`       | 请求耗时毫秒，可为空              |
| `user_agent`  | `VARCHAR(512)`       | 截断后的客户端标识，可为空        |
| `error_code`  | `VARCHAR(64)`        | 稳定错误码，可为空                |
| `remark`      | `VARCHAR(255)`       | 说明或脱敏后的错误摘要            |
| `created_at`  | `DATETIME`           | 创建时间                          |

约束：`CHECK (result IN ('success', 'failed'))`。索引：`(user_id, created_at)`、`(module, action, created_at)`、`(request_id)`。

## 1.9 `http_idempotency_records`（已迁移，平台闭环）

职责：作为项目级 HTTP 幂等基础设施，原子登记一次已认证业务意图的请求指纹和成功业务结果；不归属
Identity/System、Product、Production 或 `common`。唯一写入口和事务规则以 `docs/architecture.md` 与
`docs/http-idempotency-implementation-plan.md` 为准。

| 字段                  | 类型                                        | 说明                                               |
| --------------------- | ------------------------------------------- | -------------------------------------------------- |
| `id`                  | `BIGINT UNSIGNED`                           | 主键，自增                                         |
| `scope`               | `VARCHAR(128) COLLATE utf8mb4_bin`          | 稳定命令范围，包含契约版本，例如 `*.v1`            |
| `idempotency_key`     | `VARCHAR(150) COLLATE utf8mb4_bin`          | 客户端业务意图键，区分大小写                       |
| `request_fingerprint` | `CHAR(64) CHARACTER SET ascii COLLATE ascii_bin` | 规范化请求的 SHA-256 小写十六进制摘要          |
| `actor_id`            | `BIGINT UNSIGNED`                           | 已认证操作用户，不为空                             |
| `initial_request_id`  | `VARCHAR(128)`                              | 首次登记请求 ID，用于关联首次成功审计              |
| `status`              | `VARCHAR(16)`                               | `processing`、`completed`                          |
| `result_json`         | `JSON`                                      | 可重放的成功业务结果；处理中为空                   |
| `created_at`          | `DATETIME`                                  | 首次登记时间                                       |
| `completed_at`        | `DATETIME`                                  | 成功结果保存时间；处理中为空                       |
| `expires_at`          | `DATETIME`                                  | 允许清理时间；第一阶段成功后至少保留 12 小时         |

约束与规则：

- `UNIQUE (scope, idempotency_key)`；索引 `(expires_at)`、`(initial_request_id)`；外键 `actor_id -> users.id`；
- `CHECK (status IN ('processing', 'completed'))`；completed 必须同时具有 `result_json`、
  `completed_at` 和 `expires_at`，processing 时三者必须为空；
- 请求指纹包含 actorId；不同用户复用同一 scope/key 时只能得到指纹冲突，不得重放其他用户结果；
- 不保存原始请求体、Authorization、Cookie、Token、签名、IP、User-Agent 或任意 HTTP headers；
- `result_json` 只保存经评审可重放的成功业务结果，不得包含临时下载签名、凭证或短期密钥；
- `result_json` 写入前必须通过递归 JSON value 校验；不得隐式保存 `undefined`、`bigint`、循环引用、`Date`
  或其他类实例；
- 幂等记录、业务写入和成功审计在同一事务中提交；失败整体回滚，不持久化失败响应；
- 首次成功审计使用与 `initial_request_id` 相同的 `operation_logs.request_id`；原始幂等键不重复写入
  `operation_logs`，成功重放不新增业务成功审计；
- 到期清理是运维回收，不改变 12 小时内的协议保证。具体接口如需更长重试窗口，必须在接入时声明并延长；
- 到达 `expires_at` 但记录尚未物理删除时仍然重放；清理器实际删除后，相同 scope/key 才按新请求处理；
- 表结构已由 `202608050001-http-idempotency-records` 迁移落地，唯一写入口是
  `infrastructure/idempotency/mysql-idempotency.executor`；createBatch 是首个已启用端点（scope
  `production.batch.create.v1`），契约见 `docs/concurrency-and-idempotency.md`。
