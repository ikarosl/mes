# 数据库公共规则

> [返回数据库设计总览](README.md)。本章是总览所引用的权威规范组成部分，不是独立副本。

本章定义所有数据库领域共同遵守的基础规则，并完成以下统一：

- `item_type` 统一为 `product_categories`。
- `item_info` 统一为 `products`。
- `product_bom` 统一为 `product_materials`，不保留第二套 BOM 表。
- RBAC 与认证字段以新项目已落地迁移为准。
- 工序主数据只保留 `process_steps`，不再创建职责重复的 `processes`。
- 数量事实保存在业务明细或库存流水；为历史追溯补充必要快照，不创建可随意写回的累计缓存字段。
- 当前轻量 MES 不引入项目模型，也不提供项目级主数据、业务单据或库存隔离；界面中的业务入口不得被解释为项目隔离能力。

## 统一审计规则

- 主数据和配置表使用：`created_by`、`created_at`、`updated_by`、`updated_at`、`is_deleted`、`deleted_by`、`deleted_at`。
- 可变业务单据使用：`created_by`、`created_at`、`updated_by`、`updated_at`、`version`；取消通过状态表达，不物理删除。
- 库存流水等不可变事实使用：`created_by`、`created_at`；错误通过反向冲销流水修正，不更新、不删除。
- 纯关联表使用复合主键并至少保留 `created_at`；当前 RBAC 关联表的操作者通过 `operation_logs` 追溯。
- 所有冗余 ID 必须由组合外键或事务校验保证一致，不能成为第二事实来源。
- MES 主数据编码和配置自然键永久不复用，唯一约束不包含布尔 `is_deleted`；软删除后需要再次使用时恢复原记录，不创建相同编码或自然键的新记录。

## 统一类型与状态规则

- 所有主键和外键统一使用 `BIGINT UNSIGNED`。
- 数据库时间统一使用 `DATETIME` 保存北京时间（`Asia/Shanghai` / UTC+08:00）；MySQL 服务默认时区、应用连接会话 `time_zone` 和数据库驱动序列化时区必须统一为 `+08:00`。外部带时区的时间在持久化时由驱动转换为北京时间；所有对人可见的接口时间统一使用带 `+08:00` 偏移的 ISO 8601 字符串。不得混用 UTC 字面值与北京时间的 `NOW()`、`CURRENT_TIMESTAMP` 进行比较，也不得在各业务模块自行加减小时。
- 业务数量统一使用 `DECIMAL(12,4)`；禁止使用浮点数保存数量。
- 业务状态、类型和结果代码继续使用 `VARCHAR`，不使用 MySQL `ENUM`；这样新增代码值时只需追加迁移调整 `CHECK`，不把数据库枚举定义变成发布耦合点。
- 持久化值统一使用小写英文 `snake_case` 稳定编码；中文只作为前端展示标签，不得写入业务字段。
- 所有封闭值集合必须同时具备数据库 `CHECK`、共享常量和 TypeScript 字符串联合类型；不得在页面或 Repository 中散落魔法字符串。
- 数据库 `CHECK` 只保证值域合法，状态转换是否合法由领域层状态机校验；Controller 不得直接把客户端提交的任意状态写入数据库。
- 状态变更必须使用乐观锁并写操作日志；取消、确认和完成等动作使用明确的应用服务方法，不提供通用“修改状态”接口。
- `reference_type`、`reason_type`、`file_type` 等明确允许扩展的代码字段可以不建立封闭 `CHECK`，但必须由共享常量、来源存在性校验和契约测试控制。
- 不为低选择性的状态列单独滥建索引；只按照查询入口建立组合索引，例如 `(status, created_at)`、`(production_batch_id, status)`。
- 单据编号和幂等键必须唯一；所有确认类动作必须在同一事务内写业务明细、库存流水和操作日志。

### 统一库存代码字典

| 字段                            | 稳定代码                                                                                                                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 库存来源 `source_type`          | `self_made`、`purchased`、`outsourced`、`return_inbound`、`stock_check_generated`、`other`                                                                                                                                           |
| 库存状态 `stock_status`         | `available`、`pending_inspection`、`frozen`、`defective`                                                                                                                                                                             |
| 库存批次状态 `batch_status`     | `available`、`frozen`、`disabled`                                                                                                                                                                                                    |
| 库存流水类型 `transaction_type` | `purchase_inbound`、`production_inbound`、`outsourced_inbound`、`production_material_outbound`、`sales_outbound`、`material_return_inbound`、`scrap_outbound`、`stock_check_adjustment`、`status_transfer_in`、`status_transfer_out` |

前端分别映射为“自产/外购/委外/退货入库/盘点生成/其他”、“可用/待检/冻结/不良”等中文标签。接口请求、响应、数据库记录、幂等键和日志结构化字段始终使用英文稳定代码。

### 核心状态转换矩阵

| 聚合     | 允许转换                                                                                                                                                                                                                                             |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 工艺路线 | `draft -> enabled/archived`；`enabled -> disabled/archived`；`disabled -> enabled/archived`；`archived` 为终态                                                                                                                                       |
| 生产工单 | `draft -> released/cancelled`；`released -> doing/closed`；`doing -> completed/closed`；`completed -> closed`；`closed/cancelled` 为终态                                                                                                                |
| 生产批次 | `pending -> material_pending/cancelled`；`material_pending -> material_assigned/cancelled`；`material_assigned -> material_outbound/cancelled`；`material_outbound -> doing/cancelled`；`doing -> completed/cancelled`；`completed/cancelled` 为终态 |
| 工序执行 | `pending -> assigned`；`assigned -> pending/doing`；`doing -> completed`；报工更正导致数量不足或下游报废补产提高目标时 `completed -> doing`。`assigned -> doing` 只由员工显式开工触发；必报工工序数量达标时自动完工；普通物料状态不得驱动工序状态 |
| 入库单   | `pending -> completed/cancelled`                                                                                                                                                                                                                     |
| 出库单   | `pending_picking -> picked/cancelled`；`picked -> partially_outbound/completed/cancelled`；`partially_outbound -> completed/cancelled`                                                                                                               |
| 退料单   | `pending -> returned/scrapped/cancelled`                                                                                                                                                                                                             |
| 报废单   | `pending -> confirmed/cancelled`                                                                                                                                                                                                                     |
| 盘点单   | `pending -> counting/cancelled`；`counting -> completed/cancelled`                                                                                                                                                                                   |
| 返工单   | `pending -> doing/cancelled`；`doing -> completed/cancelled`                                                                                                                                                                                         |

矩阵之外的转换必须拒绝。终态不得恢复；若未来确需恢复，必须增加独立业务动作、权限、审计和追加迁移评审，不得通过通用更新接口绕过。
