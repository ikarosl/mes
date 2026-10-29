# Template 数据库设计

Template 唯一拥有 `business_templates`；migration 集中存放于 `packages/database/migrations`，不改变所有权。通用审计、时间和 ID 规则见[数据库公共约定](../../../../../../docs/database-conventions.md)，内容和权限语义见[公开契约](template-scenes.md)。

## `business_templates`

| 字段 | 类型与默认值 | 语义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED`，自增主键 | 稳定模板 ID |
| `name` | `VARCHAR(100) NOT NULL` | 系统内唯一的可编辑名称 |
| `content` | `JSON NOT NULL` | 共享 `JsonTableData`，含列定义及行数据 |
| `status` | `VARCHAR(32) NOT NULL DEFAULT 'enabled'` | `enabled`、`disabled` |
| `version` | `INT NOT NULL DEFAULT 0` | 非负编辑并发版本，每次修改递增 |
| `created_by`、`updated_by`、`deleted_by` | `BIGINT UNSIGNED NULL` | 关联 `users.id` 的完整主数据操作者审计 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 创建时间 |
| `updated_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最近更新时间 |
| `is_deleted` | `TINYINT NOT NULL DEFAULT 0` | 软删除标记；当前无删除命令 |
| `deleted_at` | `DATETIME NULL` | 删除时间 |

约束：主键 `id` 是稳定身份；唯一键 `(name)` 约束当前名称，不包含 `is_deleted`，改名不保留旧名占用。排序规则为 `utf8mb4_0900_ai_ci`；组合索引 `(is_deleted,status,name,id)` 服务分页与状态筛选。CHECK 保证名称非空、内容根为只含 `columns/rows` 的对象、列数组为 1 至 20 项、行数组不超过 200 项、状态值域、非负版本，以及删除标记与删除人／时间成套。列与单元格的完整结构由共享规范化函数校验，见 [utils JSON 表格](../../../../../../packages/utils/README.md#json-表格)。三项操作者字段均为 `users.id` 外键。

Template 不读写 Product 或其他业务模块的表；应用模板直接复制完整 JSON，不建立模板与资料的关系表、模板版本历史表或派生资料表。成功命令直接调用平台事务审计 Writer，版本更新和前后值审计原子提交。

## 迁移边界

`202610280002-business-templates` 创建模板主数据表，`202610280005-business-templates-json-table` 将其内容统一为轻量表格、移除场景字段及约束，并替换名称唯一键与查询索引。up 先验证旧内容可无损转换，再按原顺序把旧名称／单位预设转换为参数名称、参数值、单位三列，参数值为空；保留 ID、名称、启停、版本及原审计字段。非法旧内容在永久 DDL 前拒绝，不裁剪或猜造文本。

通用表格无法还原为旧名称／单位预设，005 down 在永久 DDL 前拒绝任何模板记录，包括停用或软删除记录；守卫通过后只恢复旧空表结构。002 down 同样要求空模板表后才删除。升级与回滚均须暂停模板写入并同步切换应用；数据更新和 DDL 不能整体回滚，失败恢复遵守[迁移安全](../../../../../../packages/database/docs/migration-safety.md)。
