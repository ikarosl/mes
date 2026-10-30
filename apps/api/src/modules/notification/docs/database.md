# Notification 数据库设计

Notification 独占 `notifications` 和 `notification_recipients`；结构由 [202609140001 migration](../../../../../../packages/database/migrations/202609140001-notifications.up.sql)创建并与本章同步。公共类型及审计见[数据库约定](../../../../../../docs/database-conventions.md)，发布、阅读和保留规则见[模块契约](../README.md)。

## notifications：不可变消息事实

一条记录保存一次业务事件的固定消息内容；收件人的阅读状态独立存放，避免为每个收件人复制消息。下表未写默认值的非空列无数据库默认值，可空列默认 `NULL`。

| 字段 | 类型、空值与默认值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键 |
| `event_key` | `VARCHAR(150) NOT NULL`，`ascii/ascii_bin` | 区分大小写的稳定事件键 |
| `event_type` | `VARCHAR(50) NOT NULL` | 可扩展事件类型 |
| `source_type` / `source_id` | `VARCHAR(50) NULL` / `BIGINT UNSIGNED NULL` | 触发动作的来源 |
| `target_type` / `target_id` | `VARCHAR(50) NULL` / `BIGINT UNSIGNED NULL` | 详情跳转对象 |
| `title` / `body` | `VARCHAR(255) NOT NULL` / `TEXT NOT NULL` | 标题与正文 |
| `created_by` | `BIGINT UNSIGNED NOT NULL` | 发布操作者 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 发布时间 |

主键 `id`；唯一键 `uk_notifications_event(event_key)`；外键 `created_by → users.id`。`chk_notifications_source`、`chk_notifications_target` 分别保证类型与 ID 同为空，或同非空且 ID 大于 `0`。

事件键用稳定业务动作去重。事件与引用类型可扩展，不设置封闭值域 CHECK 或多态外键；真实来源／目标归属由调用方在发布事务内核验。消息不可改写。

唯一键竞争后以当前共享读核对消息与固定收件集合，避免旧事务快照，也不把重复 INSERT 的共享锁升级为排他锁；复用路径不修改内容或收件人。

## notification_recipients：收件及首次阅读

每行固定一条消息的一名收件人，并保存其首次阅读事实；后续角色成员变化不重算历史收件集合。

| 字段 | 类型、空值与默认值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键 |
| `notification_id` | `BIGINT UNSIGNED NOT NULL` | 消息 |
| `user_id` | `BIGINT UNSIGNED NOT NULL` | 收件人 |
| `read_at` | `DATETIME NULL` | 首次阅读时间 |
| `created_by` | `BIGINT UNSIGNED NOT NULL` | 沿用消息发布人 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 收件记录建立时间 |
| `updated_by` | `BIGINT UNSIGNED NULL` | 阅读时填收件人本人 |
| `updated_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最近更新时间 |
| `version` | `INT NOT NULL DEFAULT 0` | 未读为 `0`，首次已读为 `1` |

主键 `id`；唯一键 `uk_notification_recipients_user(notification_id,user_id)`；查询索引 `idx_notification_recipients_unread(user_id,read_at,created_at,id)`、`idx_notification_recipients_list(user_id,created_at,id)`。`notification_id → notifications.id`；`user_id/created_by/updated_by → users.id`。两表外键均限制删除，MySQL 为外键维护支撑索引。

`chk_notification_recipients_version` 保证版本非负；`chk_notification_recipients_read` 要求未读时 `read_at IS NULL AND version=0 AND updated_by IS NULL`，已读时 `read_at IS NOT NULL AND version=1 AND updated_by=user_id` 且修改人非空。

阅读只允许首次单向更新，不能覆盖时间或改回未读；本人记录锁串行化并发阅读。重复已读的旧版本容错由接口定义。接口并发与重复请求语义见[阅读契约](../README.md#接口及权限登记)。

列表、未读计数和历史展示只读收件事实，不重查业务资格。

## 迁移与保留

新表不回填旧审批动作。消息及收件长期保留；down 在永久 DDL 前要求两表为空，不能借回滚丢弃历史。升级不新增权限目录或改写业务数据；DDL 中断恢复遵守[迁移安全](../../../../../../packages/database/docs/migration-safety.md)。
