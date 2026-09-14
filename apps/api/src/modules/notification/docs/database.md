# Notification 数据库设计

本模块独占 `notifications`、`notification_recipients`，登记于 `scripts/api-data-ownership.mjs`。物理结构由追加 migration `202609140001-notifications` 创建。遵守[公共数据库规则](../../../../../../docs/database-conventions.md)，不拥有审批或 Identity 表。

## notifications：不可变消息事实

| 字段 | 物理定义 |
| --- | --- |
| id | BIGINT UNSIGNED、自增主键 |
| event_key | VARCHAR(150)、ascii/ascii_bin、非空；永久唯一稳定事件键 |
| event_type | VARCHAR(50)、非空；代码登记的可扩展事件类型 |
| source_type / source_id | VARCHAR(50) / BIGINT UNSIGNED、均可空 |
| target_type / target_id | VARCHAR(50) / BIGINT UNSIGNED、均可空 |
| title / body | VARCHAR(255) / TEXT、非空，应用限制正文 4000 字符 |
| created_by | BIGINT UNSIGNED、非空、FK users.id |
| created_at | DATETIME、非空、默认 CURRENT_TIMESTAMP |

唯一键 `uk_notifications_event(event_key)`；source、target 各有独立 CHECK，保证每对同时 null 或同时非空且 ID > 0。扩展事件/来源/目标代码由共享常量及调用用例校验，不使用封闭 CHECK 或多态 FK。真实来源/目标引用由业务所有者在发布事务中确定。消息不修改、不软删除、不清理。

并发发布发生唯一键冲突后，通过 `FOR SHARE` 当前读核对已提交的消息及固定收件集合，不使用旧快照，也不将重复 INSERT 的共享锁升级为排他锁；此路径不修改消息和收件集合。首次已读仍使用本人收件记录的 `FOR UPDATE` 排他锁。

## notification_recipients：收件及首次阅读

| 字段 | 物理定义 |
| --- | --- |
| id | BIGINT UNSIGNED、自增主键 |
| notification_id | BIGINT UNSIGNED、非空、FK notifications.id |
| user_id | BIGINT UNSIGNED、非空、FK users.id |
| read_at | DATETIME、可空；首次阅读时间 |
| created_by | BIGINT UNSIGNED、非空、FK users.id；沿用消息发布人 |
| created_at | DATETIME、非空、默认 CURRENT_TIMESTAMP |
| updated_by | BIGINT UNSIGNED、可空、FK users.id；阅读时填本人 |
| updated_at | DATETIME、非空、默认 CURRENT_TIMESTAMP、ON UPDATE CURRENT_TIMESTAMP |
| version | INT、非空、默认 0、CHECK >= 0 |

唯一键 `uk_notification_recipients_user(notification_id,user_id)` 固定收件集合。查询索引为 `idx_notification_recipients_unread(user_id,read_at,created_at,id)` 和 `idx_notification_recipients_list(user_id,created_at,id)`。外键均使用默认 RESTRICT，不级联删除用户或通知历史。

阅读 CHECK 要求未读时 `read_at IS NULL AND version=0 AND updated_by IS NULL`，已读时 `read_at IS NOT NULL AND version=1 AND updated_by IS NOT NULL AND updated_by=user_id`。应用只支持单向首次更新，不覆写首次时间、不改回未读、不手工增删收件。并发命令锁本人记录再核对版本，重复已读短路成功；接口语义见[模块 README](../README.md)。

ID 在 SQL 中 CAST 为字符串传输，时间经公共转换输出 `+08:00`。消息创建与收件创建、业务和成功审计同事务；阅读更新与其成功审计同事务。列表、计数和历史展示不读取业务详情或 Identity 状态，不随成员变更重算收件。

## 迁移与保留

新表不会回填之前的审批动作；新业务动作产生通知，历史审批资格仍由 Approval 决定。数据长期保留，无用户删除、年度清理或归档任务。down 在任何永久 DDL 前检查两表为空，非空时拒绝回滚，不能静默丢弃历史。升级只增加本模块两表，无权限目录新增和业务数据改写；MySQL DDL 非事务性，失败应检查实际结构再恢复。

开发环境允许完全重置数据库；统一执行 migration/seed 后恢复结构与基础数据，不依赖历史数据，不制作双写或影子表。
