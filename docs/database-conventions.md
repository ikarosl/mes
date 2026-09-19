# 数据库公共规则

> [返回数据库设计总览](../README.md)。本章是总览所引用的权威规范组成部分，不是独立副本。

本章定义所有数据库领域共同遵守的基础规则，并完成以下统一：

- 物料和成品共用 `item_categories` 分类，以 `item_kind` 区分；不另建第二套分类表。
- 成品主数据使用 `products`，基础物料使用 `materials`，精确物料版本使用 `material_variants`；不恢复 `item_info`。
- `product_bom` 统一为 `product_materials`，不保留第二套 BOM 表。
- RBAC 与认证字段以新项目已落地迁移为准。
- 工序主数据只保留 `process_steps`，不再创建职责重复的 `processes`。
- 数量事实保存在业务明细或库存流水；允许为已批准的高频查询建立由事实同事务维护、可全量重建和对账的余额投影，但不得创建可由业务接口随意覆盖的累计字段。
- 当前轻量 MES 不引入项目模型，也不提供项目级主数据、业务单据或库存隔离；界面中的业务入口不得被解释为项目隔离能力。

## 统一审计规则

- 主数据和配置表使用：`created_by`、`created_at`、`updated_by`、`updated_at`、`is_deleted`、`deleted_by`、`deleted_at`。
- 可变业务单据使用：`created_by`、`created_at`、`updated_by`、`updated_at`、`version`；取消通过状态表达，不物理删除。
- 库存流水等不可变事实使用：`created_by`、`created_at`；错误通过反向冲销流水修正，不更新、不删除。
- 纯关联表使用复合主键并至少保留 `created_at`；当前 RBAC 关联表的操作者通过 `operation_logs` 追溯。
- 所有冗余 ID 必须由组合外键或事务校验保证一致，不能成为第二事实来源。
- MES 主数据编码和配置自然键永久不复用，唯一约束不包含布尔 `is_deleted`；软删除后需要再次使用时恢复原记录，不创建相同编码或自然键的新记录。

## 基础物料名称与历史身份

基础物料名称是当前展示属性：需求基础、需求、库存批次和入库明细不保存名称快照，按稳定 ID 读取 Product 当前 `materials.material_name`，展示、名称搜索和排序保持一致；停用或软删除不丢失历史引用。编码、单位、精确物料版本和数量仍按所属模块约束固化。此规则不改变工单成品名称、工序/SOP 快照、不可变审计前后值及 HTTP 幂等响应重放。跨模块读取按[架构登记规则](architecture.md)执行，写入资格继续通过所属模块业务能力校验。

## 统一类型与状态规则

- 所有主键和外键统一使用 `BIGINT UNSIGNED`。
- 数据库时间统一使用 `DATETIME` 保存北京时间（`Asia/Shanghai` / UTC+08:00）；MySQL 服务默认时区、应用连接会话 `time_zone` 和数据库驱动序列化时区必须统一为 `+08:00`。外部带时区的时间在持久化时由驱动转换为北京时间；所有对人可见的接口时间统一使用带 `+08:00` 偏移的 ISO 8601 字符串。不得混用 UTC 字面值与北京时间的 `NOW()`、`CURRENT_TIMESTAMP` 进行比较，也不得在各业务模块自行加减小时。
- 业务数量统一使用整数物理类型：单条数量采用 `INT`，汇总余额按容量使用 `BIGINT`；禁止使用 `DECIMAL/FLOAT/DOUBLE` 保存业务数量。单条数量上限保持 `99999999`，由数据库范围 `CHECK` 和应用校验共同保证。库存流水、盘点差额使用有符号整数，其他数量按业务约束限制正数或非负数。数据库整数转换可能舍入输入，不能代替应用层在写入前拒绝小数。
- 所有参与数量加减、比较和乘法的输入、快照、事实及汇总投影都遵守整数口径：正数量最小为 `1`，允许“尚无数量”的拆分字段可以为 `0`，库存流水和盘点差异可以为负整数。应用层不得通过四舍五入、截断或误差容忍把小数转换成整数；遇到小数或业务数量上限溢出必须拒绝。
- 产品规格参数等仅作为 JSON 原样记录、且不参与业务数量计算的内容不受整数数量规则约束；该例外不得扩展到 BOM 单位用量、计划量、需求、库存、报工、损耗或盘点数量。
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
| 库存来源 `source_type`          | `self_made`、`production_extra`、`purchased`、`outsourced`、`return_inbound`、`stock_check_generated`、`other`                                                                                                                                           |
| 库存状态 `stock_status`         | `available`、`pending_inspection`、`frozen`、`defective`                                                                                                                                                                             |
| 库存批次状态 `batch_status`     | `available`、`frozen`、`disabled`                                                                                                                                                                                                    |
| 库存流水类型 `transaction_type` | `purchase_inbound`、`production_inbound`、`outsourced_inbound`、`production_material_outbound`、`sales_outbound`、`material_return_inbound`、`scrap_outbound`、`stock_check_adjustment`、`status_transfer_in`、`status_transfer_out` |

前端分别映射为“自产/额外产出/外购/委外/退货入库/盘点生成/其他”、“可用/待检/冻结/不良”等中文标签。接口请求、响应、数据库记录、幂等键和日志结构化字段始终使用英文稳定代码。

### 核心状态转换矩阵

| 聚合     | 允许转换                                                                                                                                                                                                                                             |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 工艺路线 | `draft -> enabled/archived`；`enabled -> disabled/archived`；`disabled -> enabled/archived`；`archived` 为终态                                                                                                                                       |
| 生产工单 | `draft -> released/cancelled`；`released -> doing/completed/closed`；`doing -> completed/closed`；`completed -> closed`；`closed/cancelled` 为终态                                                                                                      |
| 生产批次 | 各状态允许转换见下表；`completed/cancelled/terminated` 为终态，已出库或已开工批次禁止取消。 |
| 工序执行 | `pending -> assigned`；`assigned -> pending/doing`；`doing -> completed`；报工更正导致数量不足或下游报废补产提高目标时 `completed -> doing`。`assigned -> doing` 只由员工显式开工触发；工序数量达标时自动完工；普通物料状态不得驱动工序状态 |
| 入库单   | `pending -> completed/cancelled`                                                                                                                                                                                                                     |
| 出库单 | `pending_picking -> completed/cancelled`；当前确认命令整单出库，不开放 `picked/partially_outbound` 转换。 |
| 退料单 | `pending -> returned/cancelled`；当前只支持退回公共可用库存，不开放退料报废。 |
| 报废单   | `pending -> confirmed/cancelled`                                                                                                                                                                                                                     |
| 盘点单 | `pending -> counting/completed/cancelled`；`counting -> completed/cancelled`。完成命令须全部明细已录入且库存快照未变化，正常流程先保存实盘数量进入 `counting`。 |
| 返工单 | `pending -> doing`；`doing -> completed`；仅批次结束命令允许 `pending/doing -> cancelled`，无独立返工取消入口。 |

生产批次转换与 [production-status.policy.ts](../apps/api/src/modules/production/domain/production-status.policy.ts) 保持一致：

| 当前状态 | 允许的下一状态 |
| --- | --- |
| `pending` | `material_pending`、`cancelled` |
| `material_pending` | `material_assigned`、`material_partially_outbound`、`material_outbound`、`cancelled` |
| `material_assigned` | `material_pending`、`material_outbound`、`cancelled` |
| `material_partially_outbound` | `material_outbound`、`doing`、`closing` |
| `material_outbound` | `doing`、`closing` |
| `doing` | `closing` |
| `closing` | `completed`、`terminated` |
| `completed` | 无，终态 |
| `cancelled`、`terminated` | 无，终态 |

转换表只定义允许的状态边，不能替代命令中的数量、权限、授权和版本校验。释放未出库分配导致不再齐套时，
允许 `material_assigned -> material_pending`；有效短批授权下确认部分领料后进入 `material_partially_outbound`，
首工序开工仍须校验当前授权、累计已确认领料量和缺口，不因退料回写履约。全部活动需求已确认领用时可进入 `material_outbound`；已进入
`doing` 的批次后续补齐物料不回退状态。详细门禁见 [Production 批次规则](../apps/api/src/modules/production/docs/database/work-orders-and-batches.md)。

上表描述当前代码已开放的命令转换；数据库保留的状态值不代表对应命令已实现。同状态重试按各命令幂等或
状态短路规则处理，不构成新的状态转换。

正常执行完成与提前结束都先进入 `closing`，保存收尾和质检产出依据后送审；工单负责人批准才分别进入 `completed` 或 `terminated`。批准清单不写库存，仓管另行确认成品入库。

矩阵之外的转换必须拒绝。终态不得恢复；若未来确需恢复，必须增加独立业务动作、权限、审计和追加迁移评审，不得通过通用更新接口绕过。
