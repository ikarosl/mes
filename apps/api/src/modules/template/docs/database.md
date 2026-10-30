# Template 数据库设计

Template 唯一拥有 `business_templates`；结构由[版本化 migration](../../../../../../packages/database/migrations/)落实，公共类型与主数据审计见[数据库约定](../../../../../../docs/database-conventions.md)。内容、复制与权限由[公开契约](template-scenes.md)维护。

## `business_templates`

独立保存可复制的表格模板，消费者保存自己的 JSON 内容，不建立模板与业务资料的引用或联动关系。下表未写默认值的非空列无数据库默认值，可空列默认 `NULL`。

| 字段 | 类型、空值与默认值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 稳定模板 ID，主键 |
| `name` | `VARCHAR(100) NOT NULL` | 系统内唯一的可编辑名称 |
| `content` | `JSON NOT NULL` | 独立 `JsonTableData`，含列定义和行数据 |
| `status` | `VARCHAR(32) NOT NULL DEFAULT 'enabled'` | 启用／停用 |
| `version` | `INT NOT NULL DEFAULT 0` | 编辑并发版本 |
| `created_by` / `updated_by` / `deleted_by` | `BIGINT UNSIGNED NULL` | 创建、修改、删除人，各自引用 `users.id` |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 创建时间 |
| `updated_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最近修改时间 |
| `is_deleted` | `TINYINT NOT NULL DEFAULT 0` | 软删除标记，当前无删除命令 |
| `deleted_at` | `DATETIME NULL` | 删除时间 |

表使用 InnoDB、`utf8mb4_0900_ai_ci`。主键 `id`；唯一键 `uk_business_templates_name(name)`；索引 `idx_business_templates_status_name(is_deleted,status,name,id)`。三项操作者外键均指向 `users.id` 并限制删除，MySQL 维护外键支撑索引。

CHECK：名称去空白后非空；状态仅 `enabled/disabled`；版本非负；未删除时删除人／时间均空，删除时标志为 `1` 且二者均非空。`chk_business_templates_content` 限定内容根为只含 `columns/rows` 的对象，两项均为数组，列数 `1–20`、行数不超过 `200`；列与单元格的完整校验仍由共享规范化承担。

稳定身份是模板 ID。名称在系统内唯一，包含软删除记录，按数据库排序规则比较；改名不继续占用旧名。编辑版本用于并发更新，不代表发布历史。当前无删除命令。

完整列与单元格结构由[共享规范化](../../../../../../packages/utils/README.md#json-表格)校验。不建消费者关系、模板历史版本或派生资料表。

## 迁移边界

旧名称／单位预设转换成参数名称、参数值、单位三列，参数值为空；保留原行序、身份、状态、版本和审计。非法旧内容拒绝转换，通用表格不能猜造为旧预设。

表创建回退要求空表；JSON 表格切换、包含停用／软删除记录的空表回退门禁及失败恢复见[迁移安全](../../../../../../packages/database/docs/migration-safety.md#202610280005独立-json-表格模板)。
