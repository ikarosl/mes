# 操作日志与事务审计

`operation_logs` 是项目级平台审计表，不属于 Identity、Product、Production 或 `common` 的业务数据。Identity 只提供当前查询入口；所有业务成功审计统一通过 `common/audit/transactional-audit-writer` 写入。

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

核心业务写入和成功审计必须在同一事务提交；通用请求、失败和安全拒绝日志为 best-effort。日志不得记录密码、Token、Cookie、签名、原始幂等键或凭证。
