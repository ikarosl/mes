# Attachment 数据库设计

Attachment 唯一拥有 `attachments` 和 `attachment_references`。公共审计、时间和 ID 规则遵守[数据库公共规则](../../../../../../docs/database-conventions.md)；引用和状态转换由[生命周期](lifecycle.md)维护。表使用 InnoDB、`utf8mb4_0900_ai_ci`。

结构核验入口为[原技术文件基线](../../../../../../packages/database/migrations/202611020105-baseline-product-tables.up.sql)、[原操作者外键](../../../../../../packages/database/migrations/202611020205-baseline-product-foreign-keys.up.sql)和[统一附件迁移](../../../../../../packages/database/migrations/202611160020-unified-attachments.up.sql)。后者将 `technical_files` 原位改名并追加清理字段及引用表，不维护旧表兼容层；MySQL 同步调整既有业务外键指向，原约束名称继续保留。

## `attachments`

职责：保存每次上传的不可覆盖对象身份、用途元数据和可并发恢复的清理状态。对象内容留在 S3；清理后仍保留本行及审计，不把物理清理误当作删除历史身份。

| 字段 | 类型、空值与默认 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 附件永久身份 |
| `file_name` | `VARCHAR(255) NOT NULL` | 显示名，上传原始文件名 |
| `original_name` | `VARCHAR(255) NOT NULL` | 原始文件名 |
| `storage_provider` | `VARCHAR(32) NOT NULL` | 当前为 `s3` |
| `bucket` | `VARCHAR(128) NULL` | 稳定存储桶；当前 S3 写入必填 |
| `object_key` | `VARCHAR(500) NOT NULL` | 稳定对象键，不存临时 URL |
| `mime_type` | `VARCHAR(128) NOT NULL` | 内容 MIME |
| `size_bytes` | `BIGINT UNSIGNED NOT NULL` | 内容字节数 |
| `checksum_sha256` | `CHAR(64) NOT NULL` | 内容摘要 |
| `file_type` | `VARCHAR(64) NOT NULL` | 当前 `sop/specification` |
| `version_no` | `VARCHAR(64) NULL` | 业务用途版本，SOP 必填、规格书为空 |
| `status` | `TINYINT NOT NULL DEFAULT 1` | 既有启用标志 `0/1`，不表示清理状态 |
| `remark` | `VARCHAR(255) NULL` | 备注 |
| `version` | `INT UNSIGNED NOT NULL DEFAULT 0` | 生命周期乐观版本，同时作为清理尝试令牌 |
| `cleanup_status` | `VARCHAR(16) NOT NULL DEFAULT 'retained'` | `retained/processing/failed/completed` |
| `cleanup_started_at` | `DATETIME NULL` | 最近清理尝试开始时间与租期依据 |
| `cleanup_completed_at` | `DATETIME NULL` | 物理清理完成时间 |
| `cleanup_error_code` | `VARCHAR(64) NULL` | 稳定安全失败码，不保存 SDK 原始消息 |
| `created_by/updated_by/deleted_by` | `BIGINT UNSIGNED NULL` | 公共主数据操作者审计组 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 上传元数据登记时间 |
| `updated_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最近元数据修改时间 |
| `is_deleted` | `TINYINT NOT NULL DEFAULT 0` | 回收站标志 |
| `deleted_at` | `DATETIME NULL` | 移入回收站时间 |

| 约束／索引 | 定义与用途 |
| --- | --- |
| 主键 | `(id)` |
| `uk_technical_files_object` | 唯一 `(storage_provider,bucket,object_key)`，对象身份不复用 |
| `fk_technical_files_created_by/updated_by/deleted_by` | 分别引用 `users.id`，保留原操作者外键及支撑索引 |
| `idx_attachments_lifecycle` | `(is_deleted,cleanup_status,id)`，生命周期筛选 |
| `idx_attachments_type` | `(file_type,id)`，用途目录筛选 |
| 既有 `chk_technical_files_*` | 大小非负；启用、软删标志为 `0/1`；文件用途为 SOP 或规格书；SOP 版本非空、规格书版本为空 |
| `chk_attachments_cleanup` | `retained` 的清理时间与错误均空；其他状态必须已软删除且开始时间非空。`processing` 无完成时间及错误；`failed` 错误非空、完成时间空；`completed` 完成时间非空、错误为空 |

Bucket 的物理可空性是历史结构，不提供新上传省略入口，也不能依赖含 NULL 的联合唯一键完成去重。大小、用途、版本和清理字段组合由数据库约束；状态转换、零引用、版本比较及引用并发由应用事务保证。

Product 的工序、路线步骤、成品、精确物料版本，以及 Production 任务步骤仍可通过既有文件 ID 外键保存自身配置或快照。其业务字段由各模块拥有；`attachment_references` 统一表达哪些对象仍需保留，附件模块不跨表扫描并猜测业务绑定是否有效。

## `attachment_references`

职责：保存“此业务对象的此用途仍需要此附件”的保留关系。它不复制对象 locator、业务状态或名称，也不承担生产事实。引用解除物理删除本表关联，同事务 `operation_logs` 留存操作依据。

| 字段 | 类型、空值与默认 | 含义 |
| --- | --- | --- |
| `attachment_id` | `BIGINT UNSIGNED NOT NULL` | 被保留附件 |
| `owner_type` | `VARCHAR(64) NOT NULL` | 已登记业务所有者类型 |
| `owner_id` | `BIGINT UNSIGNED NOT NULL` | 业务对象稳定 ID |
| `slot` | `VARCHAR(64) NOT NULL` | 已登记用途 |
| `created_by` | `BIGINT UNSIGNED NULL` | 引用登记操作者，迁移历史登记时为空 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 引用登记时间，不声称为原业务绑定发生时间 |

| 约束／索引 | 定义与用途 |
| --- | --- |
| 主键 | `(owner_type,owner_id,slot,attachment_id)`，同一保留关系只登记一次，生产历史允许同用途保留多个文件 |
| `idx_attachment_references_file` | `(attachment_id)`，零引用判断和引用分页 |
| `idx_attachment_references_created_by` | `(created_by)`，支撑操作者外键 |
| `fk_attachment_references_file` | `attachment_id → attachments.id ON DELETE RESTRICT` |
| `fk_attachment_references_creator` | `created_by → users.id` |
| `chk_attachment_references_identity` | 附件／业务对象 ID 为正，owner／slot 非空 |

本表采用纯关联审计，不添加软删除、修改审计或版本列。多态 owner 不建立跨表伪外键；有效对象存在、命令权限、业务根锁及允许解除时点由所属模块在同事务内验证，owner／slot 组合由附件公开能力白名单校验。

迁移只从已有外键及一致的对象键快照登记可证明的引用，保留停用和软删除业务对象；开始前拒绝文件 ID 与历史 locator 不一致的快照。迁移登记人置空、登记时间取迁移执行时间，不重建未知历史操作者或绑定时刻。down 只允许本来就没有附件及引用的空环境；有记录时使用匹配的数据库与对象备份恢复，不通过清空附件或修改既有迁移登记回退。
