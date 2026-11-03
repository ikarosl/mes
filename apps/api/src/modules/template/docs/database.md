# Template 数据库设计

Template 唯一拥有 `business_templates` 与 `business_template_defaults`；结构由[版本化 migration](../../../../../../packages/database/migrations/)落实，公共类型与主数据审计见[数据库约定](../../../../../../docs/database-conventions.md)。内容、填写、场景及权限由[公开契约](template-scenes.md)维护。两表均使用 InnoDB、`utf8mb4_0900_ai_ci`。

## `business_templates`

独立保存表格设计与列填写规则，消费者保存自己的完整 JSON 内容，不建立模板与已存业务资料的引用或联动关系。下表未写默认值的非空列无数据库默认值，可空列默认 `NULL`。

| 字段 | 类型、空值与默认值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 稳定模板 ID，主键 |
| `name` | `VARCHAR(100) NOT NULL` | 系统内唯一的可编辑名称 |
| `content` | `JSON NOT NULL` | 独立 `JsonTableData`，含列定义和行数据 |
| `column_rules` | `JSON NULL DEFAULT NULL` | 列 key 到 `fixed/required/optional` 的完整映射；SQL NULL 表示自由复制模板 |
| `status` | `VARCHAR(32) NOT NULL DEFAULT 'enabled'` | 启用／停用 |
| `version` | `INT NOT NULL DEFAULT 0` | 编辑并发版本 |
| `created_by` / `updated_by` / `deleted_by` | `BIGINT UNSIGNED NULL` | 创建、修改、删除人，各自引用 `users.id` |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 创建时间 |
| `updated_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最近修改时间 |
| `is_deleted` | `TINYINT NOT NULL DEFAULT 0` | 软删除标记，当前无删除命令 |
| `deleted_at` | `DATETIME NULL` | 删除时间 |

主键 `id`；唯一键 `uk_business_templates_name(name)`；索引 `idx_business_templates_status_name(is_deleted,status,name,id)`。三项操作者外键均指向 `users.id` 并限制删除，MySQL 维护外键支撑索引。

CHECK：名称去空白后非空；状态仅 `enabled/disabled`；版本非负；未删除时删除人／时间均空，删除时标志为 `1` 且二者均非空。`chk_business_templates_content` 限定内容根为只含 `columns/rows` 的对象，两项均为数组，列数 `1–20`、行数不超过 `200`；列与单元格的完整校验仍由共享规范化承担。`chk_business_templates_column_rules` 通过 `JSON_SCHEMA_VALID` 保证规则为 SQL NULL 或 JSON 对象，全部值限定为 `fixed/required/optional`；完整列 key 对应、至少一行及一列可填写由应用校验，不以数据库 JSON 类型检查代替。

稳定身份是模板 ID。名称在系统内唯一，包含软删除记录，按数据库排序规则比较；改名不继续占用旧名。编辑版本用于并发更新，不代表发布历史。当前无删除命令。

完整列与单元格结构由[共享规范化](../../../../../../packages/utils/README.md#json-表格)校验。不建消费者关系、模板历史版本或派生资料表。

## `business_template_defaults`

保存已登记场景的当前默认绑定，避免在模板上设置多个互相竞争的默认标记，也不把场景配置写入业务结果。场景是稳定自然键，一场景一行；当前只登记来料检验，不建立通用业务场景管理功能。未写默认值的非空列无数据库默认值，可空列默认 SQL NULL。

| 字段 | 类型、空值与默认值 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 配置身份，主键 |
| `scene_code` | `VARCHAR(64) NOT NULL` | 永久唯一场景编码，当前为 `quality_incoming_inspection` |
| `template_id` | `BIGINT UNSIGNED NULL` | FK `business_templates.id`，当前默认目标；NULL 可表达尚未配置 |
| `version` | `INT NOT NULL DEFAULT 0` | 默认配置的编辑并发版本，与模板版本独立 |
| `created_by` / `updated_by` / `deleted_by` | `BIGINT UNSIGNED NULL` | 创建、修改、删除人，各自 FK `users.id`；migration 初始化无人工操作者 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 创建时间 |
| `updated_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最近修改时间 |
| `is_deleted` | `TINYINT NOT NULL DEFAULT 0` | 软删除标记，当前无删除命令 |
| `deleted_at` | `DATETIME NULL` | 删除时间 |

主键为 `id`；唯一键 `uk_business_template_defaults_scene(scene_code)` 包含软删除记录，场景编码不复用。`fk_business_template_defaults_template(template_id)` 及三个操作者字段各有同名支撑索引与外键，目标分别为模板及 `users.id`，均采用默认 RESTRICT。场景按唯一键读取，不另建低选择性的状态索引。

`chk_business_template_defaults_scene` 限定唯一已登记编码；`chk_business_template_defaults_version` 保证版本非负；`chk_business_template_defaults_deleted` 保证未删除时删除人／时间为空，删除时标志为 `1` 且二者非空。外键只保证模板存在；目标启用、有规则及可填写等资格由 Template 事务校验，具体锁序与保存边界见[公开契约](template-scenes.md#场景默认与公开协作)。配置当前只允许改绑合格模板，不开放清空、创建或删除场景命令。

## 初始化与回退边界

已有库通过增量 migration 保留数据升级；旧模板的 `column_rules` 保持 SQL NULL，不从列名或既有内容猜测填写规则。[初始化基线](../../../../../../packages/database/docs/90-migration-order.md#初始化基线)只用于空库，不自动接纳或重建已有库。停写、迁移前副本和失败恢复见[迁移安全](../../../../../../packages/database/docs/migration-safety.md)。

[增量 up](../../../../../../packages/database/migrations/202611040101-template-scene-defaults.up.sql)添加规则列和默认配置表，创建并绑定独立的四行五列“来料检验初始模板”；固定内容提供项目和检查方式，验收要求与实际检查输入留空，不从历史结果推造。若已有同名模板（含软删除记录），迁移在变更结构前拒绝；须先明确处理名称冲突，不自动接管或覆盖原模板。

[down](../../../../../../packages/database/migrations/202611040101-template-scene-defaults.down.sql)只移除完整且未修改的初始化配置及模板，并要求其他模板的规则全部为 SQL NULL；版本、审计、内容、规则、状态或默认绑定已有变化时拒绝，避免丢失用户配置。已存业务表格是独立结果，不因该回退改写或删除，也不要求 Template 读取消费者表。基线 down 仍只允许空业务库，停用或软删除数据不能绕过守卫；降级须停写并使用与回退后结构匹配的应用。
