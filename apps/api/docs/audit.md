# 操作日志与事务审计

`operation_logs` 属于平台审计，Identity 只提供查询入口。唯一成功审计写入口为 [transactional-audit-writer](../src/common/audit/transactional-audit-writer.ts)，与业务共用事务；通用请求、失败和安全拒绝日志为 best-effort，跨模块规则见[项目架构](../../../docs/architecture.md)。

## 1.8 `operation_logs`

职责：记录谁在何时对哪个对象执行了什么动作及其结果，关联请求诊断和必要的前后依据。审计独立于业务事实，不能用日志重建单据状态或代替库存、需求等业务账本。

结构由[初始建表](../../../packages/database/migrations/202607200001-rbac-auth.up.sql)、[结果约束](../../../packages/database/migrations/202607230002-status-code-constraints.up.sql)和[请求上下文字段](../../../packages/database/migrations/202607280001-operation-log-request-context.up.sql)共同形成。使用 InnoDB、`utf8mb4_0900_ai_ci`；不使用修改审计、乐观版本或软删除列。表中可空列默认 SQL `NULL`。

| 字段 | 类型 | 可空／默认 | 含义 |
| --- | --- | --- | --- |
| `id` | `BIGINT UNSIGNED` | 非空，自增 | 日志身份 |
| `log_type` | `VARCHAR(32)` | 非空，无默认 | 认证、权限或业务等日志类型 |
| `module` | `VARCHAR(64)` | 非空，无默认 | 动作所属模块 |
| `action` | `VARCHAR(128)` | 非空，无默认 | 稳定动作标识 |
| `user_id` | `BIGINT UNSIGNED` | 可空 | 操作者；匿名或历史账号删除后可为空 |
| `target_id` | `BIGINT UNSIGNED` | 可空 | 被操作对象 ID |
| `target_type` | `VARCHAR(64)` | 可空 | 对象类型，与 ID 一起定位目标 |
| `result` | `VARCHAR(32)` | 非空，默认 `success` | `success/failed` |
| `before_data` | `JSON` | 可空 | 脱敏后的操作前依据 |
| `after_data` | `JSON` | 可空 | 脱敏后的操作后依据 |
| `ip` | `VARCHAR(64)` | 可空 | 来源 IP |
| `request_id` | `VARCHAR(128)` | 可空 | 请求诊断关联 ID |
| `http_method` | `VARCHAR(16)` | 可空 | HTTP 方法 |
| `route` | `VARCHAR(255)` | 可空 | 脱敏后的路由模板 |
| `http_status` | `SMALLINT UNSIGNED` | 可空 | 响应状态码 |
| `duration_ms` | `INT UNSIGNED` | 可空 | 请求耗时毫秒 |
| `user_agent` | `VARCHAR(512)` | 可空 | 截断后的客户端标识 |
| `error_code` | `VARCHAR(64)` | 可空 | 稳定错误码 |
| `remark` | `VARCHAR(255)` | 可空 | 说明或脱敏错误摘要 |
| `created_at` | `DATETIME` | 非空，默认 `CURRENT_TIMESTAMP` | 记录时间 |

| 约束／索引 | 定义与用途 |
| --- | --- |
| 主键 | `(id)` |
| `fk_operation_logs_user` | `user_id → users.id`，`ON DELETE SET NULL`，用户删除后保留日志 |
| `chk_operation_logs_result` | 只接受 `success/failed` |
| `idx_operation_logs_user_time` | `(user_id, created_at)`，按人员回查 |
| `idx_operation_logs_module_action_time` | `(module, action, created_at)`，按模块和动作排查 |
| `idx_operation_logs_request_id` | `(request_id)`，关联同次请求 |

目标为跨模块多态引用，不建立指向多张业务表的伪外键。前后数据只保存已脱敏的业务依据，不复制原始请求体；写入形状见[审计类型](../src/common/audit/audit.types.ts)。

历史 `request_id` 可空；新请求通过它关联诊断与成功动作，首次请求及幂等重放规则见[命令上下文](command-context.md)。HTTP 路径只保存路由模板，User-Agent 截断后保存；不得写入密码、Token、Cookie、签名、凭证或原始幂等键。
