# 数据库公共规则

本章维护跨模块的审计、类型、时间、数量和历史身份约定。具体表结构、状态和业务资格由[模块所有者](README.md#应用与模块)维护。

- 数量事实保存在业务明细或库存流水；批准的高频查询可使用同事务维护、可重建和对账的投影，不允许业务接口覆盖派生累计值。
- 当前轻量 MES 不提供项目模型或项目级主数据、单据、库存隔离。

## 采购表命名边界

业务表按所有者命名。Procurement 使用 `procurement_` 前缀，Quality／Inventory 表不因参与采购而改归属；HTTP 路径和既有外键列名不随表名机械替换。现行结构见[采购数据库](../apps/api/src/modules/procurement/docs/database.md)，不再维护旧新表名转换清单。

## 统一审计规则

Identity现行主数据与以下公共列约定的差异尚未裁决，见[CO-02](documentation-conflicts.md#co-02)；不据此默认为其豁免。

- 主数据和配置表使用：`created_by`、`created_at`、`updated_by`、`updated_at`、`is_deleted`、`deleted_by`、`deleted_at`。
- 可变业务单据使用：`created_by`、`created_at`、`updated_by`、`updated_at`、`version`；取消通过状态表达，不物理删除。
- 库存流水等不可变事实使用：`created_by`、`created_at`；错误通过反向冲销流水修正，不更新、不删除。
- 纯关联表使用复合主键并至少保留 `created_at`；当前 RBAC 关联表的操作者通过 `operation_logs` 追溯。
- 所有冗余 ID 必须由组合外键或事务校验保证一致，不能成为第二事实来源。
- MES 主数据编码和配置自然键永久不复用，唯一约束不包含布尔 `is_deleted`；软删除后需要再次使用时恢复原记录，不创建相同编码或自然键的新记录。

## 基础物料名称与历史身份

本节是物料名称展示、搜索和快照策略的主要维护位置；各模块表设计及查询文档引用本节，跨模块访问授权仍遵守[架构登记规则](architecture.md#展示查询的跨模块读取)。

- 基础物料名称仅是当前展示属性：按稳定物料ID读取 `materials.material_name`，展示、名称搜索和排序使用同一来源；历史展示不因物料停用或软删除而丢失。
- 任务需求基础 `production_material_requirement_basis`、正式需求 `production_item_demand`、库存批次 `item_batch` 和入库明细 `inbound_detail` 不持久化物料名称快照，也不从旧业务快照恢复历史名称。
- 当前批准 Production、Procurement 与 Inventory 的 `infrastructure/queries/` 只读使用 `materials.id/material_name`；库存和生产来源展示字段以 `scripts/api-data-ownership.mjs` 的逐字段登记为准。SQL可在本模块查询中组合复用，但不得将展示名称作为物料身份、精确版本替代条件或写入资格，业务校验仍通过所属模块公开能力。
- 物料编码、单位、精确版本与业务数量继续按各所有者规则固化；工单成品名称、工序／SOP快照不属于本节物料名称策略，审计前后值和HTTP幂等结果重放也保持各自语义；重放保留原结果，更名后需要当前名称时重新读取查询接口，不改写旧审计或重放响应。
- 物料改名审批尚未实现，待决策事项统一见[路线图](roadmap.md#待决策)；当前名称编辑和历史展示不代表审批已落地。

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

工单编号目前显式采用数据库UTC＋8日期，与上述统一时间职责约束的例外关系尚待确认，见[CO-05](documentation-conflicts.md#co-05)。

### 统一库存代码字典

稳定代码与中文映射由 [constants](../packages/constants/README.md) 提供，含义与已开放场景由 [Inventory](../apps/api/src/modules/inventory/docs/database.md) 维护。数据库保留的值域不代表相关业务命令已实现；接口、存储、幂等和结构化日志使用稳定代码，中文只用于展示。

### 核心状态转换矩阵

各模块维护自己的状态与转换条件：[Product](../apps/api/src/modules/product/docs/database.md)、[Production 工单／任务](../apps/api/src/modules/production/docs/database/work-orders-and-batches.md)、[工序执行](../apps/api/src/modules/production/docs/database/execution-traceability-quality.md)、[领料](../apps/api/src/modules/production/docs/database/demand-allocation-and-outbound.md)、[退料／损耗](../apps/api/src/modules/production/docs/database/return-scrap-and-stocktake.md)、[Inventory](../apps/api/src/modules/inventory/docs/database.md)。

状态边不能替代命令数量、权限、授权和版本校验；同状态幂等重试不构成新转换。未登记转换必须拒绝，终态不能通过通用更新恢复；新增恢复能力须明确业务动作、权限、审计和迁移评审。
