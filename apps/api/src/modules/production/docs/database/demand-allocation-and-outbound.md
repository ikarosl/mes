# 生产需求、分配与领料出库

> [返回 Production 数据库设计](README.md)。

> 补料齐套只激活已有补产授权并刷新数量投影，不再自动重开普通工序；执行与数量规则由[执行专题](execution-traceability-quality.md#cp-01-报工整改边界)维护，验证与验收见[路线图](../../../../../../../docs/roadmap.md#cp-01报工数量解耦与管理员批量冲销整改)。

本章所有单位用量快照、计划产量快照、需求、补料、分配和出库数量均使用 `INT` 保存正整数，数据库 `CHECK` 保证正负边界和上限。正常需求使用整数乘法 `need_number = quantity_per_unit_snapshot × planned_output_quantity_snapshot`；结果超过 业务允许的最大整数 `99999999` 时必须拒绝，禁止浮点计算、舍入或截断。

## 3.5 生产物料需求与分配表

> `demand_type` 为 `normal/manual_additional/scrap_supplement`：批量初始 BOM 需求、手工提需、工序报废补料。研发初次与后续均为手工提需。领料损坏只登记真实损耗，不自动生成需求；更多用料由管理员独立提出。

核心设计原则：产品补产授权、正式物料需求和实际领料分别表达。工序报废补产授权按既有补料齐套闭环生效；实际领料损坏不修改原需求履约或补产额度、不再扣库存。人工新提需决定后续用料，批量保持本任务版本锁，研发可选择其他有效物料与版本。

### 物料办理资格

任务处于 `material_pending/material_assigned/material_partially_outbound/material_outbound/doing` 时，所有类型的有效活动需求均可分次分配、释放尚未出库预留、制单和确认领料；不要求全部需求齐套，不再存在短批授权。需求更正在审、关闭、取消或已经履约时，继续按自身资格保护；库存批次、启用精确版本、可用库存、有效预留、待出库占用、数量及版本在事务内重新校验。

仓库候选与写入使用相同资格。普通剩余需求在任务执行中继续可见，不按需求类型或历史授权过滤。`outboundEligibility` 只返回可办理与阻断原因：尚无剩余有效分配为 `allocation_incomplete`，剩余分配全部被待出库单占用为 `no_orderable_allocation`；没有活动需求的任务退出候选。该投影不替代确认事务的锁内校验。

领料不决定任务开工。管理员开工的配置前提、缺料提示及存证见[任务开工](work-orders-and-batches.md#管理员任务开工与物料阶段)。批量与研发都可以先结束执行，剩余需求在收尾送审前履约、关闭或更正。停止办理后发现缺失操作，由管理员[撤回结束](production-termination.md#撤回结束与再次收尾)，再使用原有提需、分配和出库能力；不自动恢复已关闭需求。

首笔非全量确认领料将尚未开工的 `material_pending/material_assigned` 推进为 `material_partially_outbound`，当前活动需求全部完成确认领用后进入 `material_outbound`。任务已为 `doing` 时保持执行中。部分领料只是物流阶段，不构成精确物料产能；开工及报工不按领料减退料推算现场余额。

人工追加保留 `production_manual_demand_addition` 和 `production_item_demand` 来源，不创建损耗、补料单或产品补产授权，不增加计划与报工上限。确认出库复用同事务库存和需求履约，任务保持执行中；未满足追加需求在结案送审前处理。

工单类型、任务版本锁及并发顺序见[任务用料规则](work-orders-and-batches.md)。批量初配在任务内选版并冻结，不继承工单选版；后续追加和工序补料必须保持本任务版本。研发不依赖 BOM，不保存需求基础，每次手工提需明确有效物料、版本、数量及可选供应商提示。

### 9. `production_material_requirement_basis`

职责：保存批量任务确认初始需求时从 Product 获得的 BOM 公式，并冻结该任务的精确版本与供应商提示。它是数量基准和用料配置，不是可分配需求，不替代 `production_item_demand`；研发不写本表。

管理员从生产任务行进入配置弹窗，一次完整确认全部 BOM 行的精确 `material_variant_id` 与数量。
服务端要求命令覆盖全部 BOM 行，并在同一事务写入所有需求基础和初始需求；任一行不完整时不产生
部分事实。成功后批次从待配置状态进入 `material_pending`。创建任务或打开配置页面不会提前写需求基础；未确认行的展示 ID `${batchId}:${productMaterialId}` 不是基础表主键，此时 `requirementBasisId` 为空。BOM 基础和启用版本在写事务内重新读取
并锁定，避免版本停用与选择校验之间的竞态。

| 字段                               | 类型              | 说明                                      |
| ---------------------------------- | ----------------- | ----------------------------------------- |
| `id`                               | `BIGINT UNSIGNED` | 主键                                      |
| `production_batch_id`              | `BIGINT UNSIGNED` | 生产批次 ID                               |
| `product_material_id`              | `BIGINT UNSIGNED` | 冻结的产品 BOM 行                         |
| `material_id`              | `BIGINT UNSIGNED` | 基础物料 ID                               |
| `locked_material_variant_id` | `BIGINT UNSIGNED NOT NULL` | 本任务本物料唯一精确版本 |
| `supplier_hint` | `VARCHAR(500) NULL` | 随初配冻结的供应商或采购要求提示 |
| `material_code_snapshot`           | `VARCHAR(100)`    | 基础物料编码快照                          |
| `unit_snapshot`                    | `VARCHAR(20)`     | BOM 用量单位快照                          |
| `quantity_per_unit_snapshot`       | `INT`   | 单件 BOM 用量快照                         |
| `planned_output_quantity_snapshot` | `INT`   | 批次计划产量快照                          |
| `required_number`                  | `INT`   | 该 BOM 行在本批次的初始应需量，锁定版本的初始正常需求量必须等于此值 |
| `created_by` | `BIGINT UNSIGNED NOT NULL` | 确认需求配置并创建基础记录的操作者，引用 `users.id` |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 基础记录创建时间 |

本表采用根数据库规范中不可变事实的创建审计约定，明确保存 `created_by/created_at`，不包含更新、软删除审计字段或 `version`。这是一组字段约定，不是数据库表继承，也不是自动补充字段。除可空供应商提示外，其余业务字段为 `NOT NULL`，主键 `id` 自增。基础表由 Production 拥有，BOM 业务字段只经 Product 公共快照读取。

#### 键、索引与引用关系

| 名称 | 物理定义 / 引用目标 |
| ---- | ------------------ |
| `PRIMARY` | `PRIMARY KEY (id)` |
| `uk_material_requirement_basis_batch_bom` | `UNIQUE (production_batch_id, product_material_id)`，同批次同 BOM 行只有一个基础 |
| `uk_requirement_basis_batch_material` | `UNIQUE(production_batch_id,material_id)`，直接保证任务内基础物料唯一 |
| `uk_requirement_basis_locked_reference` | `UNIQUE(id,production_batch_id,product_material_id,material_id,locked_material_variant_id)`，供需求引用锁定版本 |
| `fk_requirement_basis_locked_variant` | `(locked_material_variant_id,material_id) → material_variants(id,material_id)` |
| `uk_material_requirement_basis_reference` | `UNIQUE (id, production_batch_id, product_material_id, material_id)`，供下游组合外键引用 |
| `idx_material_requirement_basis_material` | `INDEX (material_id, production_batch_id, id)` |
| `fk_material_requirement_basis_batch` | `(production_batch_id) → production_batches(id)` |
| `fk_material_requirement_basis_bom` | `(product_material_id, material_id) → product_materials(id, material_id)` |
| `fk_material_requirement_basis_material` | `(material_id) → materials(id)` |
| `fk_material_requirement_basis_created_by` | `(created_by) → users(id)` |

下游组合外键如下：需求的五个引用值（含版本）以及工序补料方案的四个引用值分别同时匹配基础表的同一行；不是分别判断各个 ID 是否存在，也不要求基础 ID 与物料 ID 相等。

| 引用表 / 外键名称 | 引用字段 | 基础表目标字段 |
| ---------------- | -------- | -------------- |
| `production_item_demand` / `fk_production_item_demand_basis` | `(requirement_basis_id,production_batch_id,product_material_id,item_id,material_variant_id)` | `(id,production_batch_id,product_material_id,material_id,locked_material_variant_id)` |
| `production_scrap_supplement_plan_line` / `fk_scrap_supplement_plan_line_basis` | `(requirement_basis_id, production_batch_id, product_material_id, item_id)` | `(id, production_batch_id, product_material_id, material_id)` |

例如某任务的基础行锁定物料 M 的版本 V1，则初始、人工追加、工序补料及更正创建的需求都只能引用 V1。研发的基础及 BOM 字段成组为空，不引用这条基础 FK；实际物料与版本组合 FK 始终有效。

#### CHECK 与冻结规则

| CHECK 名称 | 物理校验 |
| ---------- | -------- |
| `chk_material_requirement_basis_quantity` | `quantity_per_unit_snapshot > 0 AND planned_output_quantity_snapshot > 0 AND required_number > 0` |
| `chk_material_requirement_basis_integer` | 上述三个数量字段各自满足 `字段 = TRUNCATE(字段, 0)`，禁止小数 |

数量公式和跨需求行合计由应用写事务保证，不应把它们描述成上述 CHECK 已覆盖的约束：

- `required_number = quantity_per_unit_snapshot × planned_output_quantity_snapshot`，保存确认时的初始计划基准。
- 只有批量任务保存基础；一次覆盖全部 BOM 行，每行一个精确版本，初始需求量等于 `required_number`。研发不按 BOM 计算，全部采用手工需求。
- 批量人工追加只能使用本任务已冻结的 BOM 基础；工序补料保留基础引用。研发人工提需直接选有效物料与版本，不要求既有基础。追加或补料可使累计需求超过 `required_number`，但不改大原始基准。库存分配按各条精确版本需求执行，不按基础表跨版本凑数。
- 确认后基础全部字段冻结，数据库触发器拒绝 UPDATE/DELETE；只允许批量任务插入基础。不能用新基础或更改提示绕过任务版本锁。
- 物料名称不在本表保存快照，展示读取当前名称；不可变基础不代表名称也被冻结。


研发需求的 `requirement_basis_id/product_material_id/quantity_per_unit_snapshot/planned_output_quantity_snapshot` 四字段必须全为空，且类型为 `manual_additional`；批量四字段必须全部存在、公式为正，需求行 `supplier_hint` 为空。`chk_demand_bom_source` 约束字段组合，插入触发器按实际工单类型复核，含版本组合 FK 约束批量选版。确认后任务、物料、版本、原始数量、单位及提示由更新触发器冻结，履约／关闭状态仍通过各自命令更新。

### 9.1 `production_manual_demand_addition`

职责：记录管理员针对一个生产任务发起的一次人工追加动作。它是生成分组的单头，可在同一事务中
产生多条 `production_item_demand`：批量使用冻结基础及版本，研发允许任意有效物料与版本；不表示审批单，也不关联
某条既有父需求。

| 字段                  | 类型              | 说明                         |
| --------------------- | ----------------- | ---------------------------- |
| `id`                  | `BIGINT UNSIGNED` | 主键                         |
| `addition_no`         | `VARCHAR(100)`    | 追加单号，全局唯一           |
| `production_batch_id` | `BIGINT UNSIGNED` | 本次追加所属生产任务         |
| `reason`              | `TEXT`            | 非空人工追加原因             |
| `created_by`          | `BIGINT UNSIGNED` | 操作人                       |
| `created_at`          | `DATETIME`        | 操作时间                     |

需求明细通过 `manual_addition_id + production_batch_id` 组合外键关联单头；同一追加动作的所有明细
共享 `ADDITIONAL:{production_batch_id}:{addition_no}` 生成分组键。

### 10. `production_item_demand`

职责：记住每个生产任务需要领什么、总共要多少、现在还差多少，是分配、出库和缺料预警共同使用的唯一需求清单。

该表保存不可变需求数量，并保存由确认出库事务同步维护、可从确认出库明细重建的剩余需求投影；不保存累计分配、退料或报废数量。物料基础、精确版本编码和单位随需求冻结；名称不保存快照，展示与搜索通过已登记的专用查询目录读取 `materials.id/material_name`，不以此替代 Product 的业务校验能力。正常需求从批次基础取得 BOM 快照，补料需求继承原需求的 BOM/基础物料快照；批量必须复用本任务锁定版本；研发不依赖 BOM，每次可选择任意有效物料及启用版本，BOM 专属字段全部为空。

| 字段                               | 类型              | 说明                                      |
| ---------------------------------- | ----------------- | ----------------------------------------- |
| `id`                               | `BIGINT UNSIGNED` | 主键                                      |
| `production_batch_id`              | `BIGINT UNSIGNED` | 生产批次 ID，关联 `production_batches.id` |
| `requirement_basis_id`             | `BIGINT UNSIGNED NULL` | 批量冻结的 BOM 基础 ID，研发为空                   |
| `product_material_id`              | `BIGINT UNSIGNED NULL` | 批量 BOM 明细，研发为空        |
| `item_id`                          | `BIGINT UNSIGNED` | 需求对象 ID，关联 `materials.id`           |
| `material_variant_id`               | `BIGINT UNSIGNED` | 需求选中的精确物料版本 ID                 |
| `item_code_snapshot`               | `VARCHAR(100)`    | 生成需求时的物料编码快照                  |
| `material_variant_code_snapshot`    | `VARCHAR(180)`    | 需求选中的版本编码快照                    |
| `quantity_per_unit_snapshot`       | `INT NULL`   | 批量 BOM 单件用量快照，研发为空             |
| `unit_snapshot`                    | `VARCHAR(20)`     | 生成需求时的用量单位快照                  |
| `planned_output_quantity_snapshot` | `INT NULL`   | 批量计算所用计划产量快照，研发为空              |
| `supplier_hint` | `VARCHAR(500) NULL` | 研发本次需求提示；批量为空，展示读取基础提示 |
| `need_number`                      | `INT`   | 需求数量                                  |
| `remaining_number`                 | `BIGINT`          | 尚未确认领用的整数数量，可从出库事实重建  |
| `demand_type`                      | `VARCHAR(30)`     | 需求类型，默认 `normal`                   |
| `generation_group_key`             | `VARCHAR(150)`    | 同一次需求生成动作的稳定分组键            |
| `idempotency_key`                  | `VARCHAR(150)`    | 幂等键，同一键重复提交返回既有结果        |
| `parent_demand_id`                 | `BIGINT UNSIGNED` | 工序报废补料关联的原始需求；人工追加为空 |
| `manual_addition_id`               | `BIGINT UNSIGNED` | 人工追加记录 ID；其他类型为空             |
| `supplement_id`                    | `BIGINT UNSIGNED` | 补料物流单 ID，仅工序报废补料需求填写         |
| `business_status`                  | `VARCHAR(30)`     | 业务状态，默认 `active`                   |
| `fulfilled_by`                     | `BIGINT UNSIGNED` | 最后一笔确认领用操作人；未满足时为空      |
| `fulfilled_at`                     | `DATETIME`        | 需求全部确认领用时间；未满足时为空        |
| `cancel_source`                    | `VARCHAR(40)`     | 仅 `production_batch`，未执行任务取消 |
| `cancel_reason`                    | `TEXT`            | 未执行任务取消原因          |
| `cancelled_by`                     | `BIGINT UNSIGNED` | 取消操作人                                |
| `cancelled_at`                     | `DATETIME`        | 取消时间                                  |
| `pending_correction_id` | `BIGINT UNSIGNED NULL` | 当前在审申请指针，终态为空 |
| `replaces_demand_id` | `BIGINT UNSIGNED NULL` | 新需求的直接前驱，永久保留 |
| `close_cause` | `VARCHAR(30) NULL` | correction_replaced、correction_exhausted、single_close、batch_closeout |
| `close_reason / closed_by / closed_at` | `TEXT / BIGINT UNSIGNED / DATETIME`，可空 | 关闭说明、用户 FK、时间 |
| `close_correction_id / closeout_id` | `BIGINT UNSIGNED NULL` | 互斥的更正／收尾依据 |
| `original_supplement_parent` | 可空 STORED 生成列 | 仅原始需求保留补料父需求唯一性 |
| `version`                          | `INT`             | 乐观锁版本号，默认 `0`                    |
| 业务审计字段                       | 见统一规则        | 可变业务单据审计字段                      |

字段说明：
<!-- demand_type = 这条需求如何产生、应该走哪套业务规则 -->

`demand_type` 是唯一的需求原因/业务规则字段，不再另设 `reason_type`。单据说明归补料单等来源单据所有，不复制到每条需求；这样避免同一原因在多列和多表中出现不一致。

| 字段                                           | 说明                                             |
| ---------------------------------------------- | ------------------------------------------------ |
| `requirement_basis_id`                         | 批量必须保存的任务基础；研发为 NULL |
| `product_material_id`                          | 批量来源 BOM 明细；研发为 NULL                   |
| `item_id`                                      | 受组合外键保护的基础物料冗余，便于查询和约束     |
| `material_variant_id`                          | 需求实际选择的精确库存版本；新需求必须明确填写   |
| `quantity_per_unit_snapshot` / `unit_snapshot` | 保证 BOM 修改后仍可还原需求计算口径              |
| `need_number`                                  | 需求事实，不应因为出库、退料、报废而直接修改     |
| `demand_type`                                  | `normal` 正常需求、`manual_additional` 人工追加、`scrap_supplement` 工序报废补料 |
| `generation_group_key`                         | 同一次生成的全部需求共享；只表达生成动作分组，不替代补料来源外键 |
| `parent_demand_id`                             | 补料需求关联的原始需求，不表示纠错时直接被替代的需求 |
| `supplement_id`                                | 补料需求的物流来源单据；具体业务来源由补料单的 `source_type` 和受约束来源外键确定 |
| `idempotency_key`                              | 幂等键，同一键重复提交返回既有结果               |
| `business_status`                              | `active` 未满足、`fulfilled` 已满足、`cancelled` 未执行取消、`closed` 已关闭 |
| `remaining_number`                             | 确认出库时原子扣减；为 `0` 时进入 `fulfilled`    |
| `cancel_source`                                | 仅用于未执行任务取消；关闭由独立关闭字段表达           |

约束：

- 主键：`id`
- 外键：`FOREIGN KEY (production_batch_id) REFERENCES production_batches(id)`
- 外键：`FOREIGN KEY (item_id) REFERENCES materials(id)`
- 外键：`FOREIGN KEY (product_material_id, item_id) REFERENCES product_materials(id, material_id)`
- 组合外键：`(requirement_basis_id,production_batch_id,product_material_id,item_id,material_variant_id) -> production_material_requirement_basis(id,production_batch_id,product_material_id,material_id,locked_material_variant_id)`
- 组合外键：`(material_variant_id, item_id) -> material_variants(id, material_id)`；版本停用不影响历史事实
- 组合外键：`(parent_demand_id, production_batch_id, product_material_id, item_id) -> production_item_demand(id, production_batch_id, product_material_id, item_id)`
- 组合外键：`(supplement_id, production_batch_id) -> production_material_supplement(id, production_batch_id)`
- 检查约束：`CHECK (need_number > 0)`
- 检查约束：`CHECK (demand_type IN ('normal', 'manual_additional', 'scrap_supplement'))`
- 检查约束：`CHECK (business_status IN ('active', 'fulfilled', 'cancelled', 'closed'))`
- 检查约束：`0 <= remaining_number <= need_number`；`active` 必须大于 `0`，`fulfilled` 必须等于 `0` 并填写完成事实
- 检查约束：`cancelled` 必须同时填写受控 `cancel_source`、非空原因、操作人和时间；非取消状态这些字段必须全部为空
- 组合索引：`INDEX (production_batch_id, business_status)`，用于查询批次有效需求
- 组合索引：`INDEX (production_batch_id, generation_group_key, id)`，用于按生成先后稳定分组展示
- 组合索引：`INDEX (business_status, item_id, id)`，用于从活动需求出发按物料汇总供需预警
- 检查约束：正常需求要求 `parent_demand_id IS NULL AND supplement_id IS NULL`
- 检查约束：人工追加需求要求 `parent_demand_id IS NULL AND manual_addition_id IS NOT NULL AND supplement_id IS NULL`
- 检查约束：报废补料要求 `parent_demand_id IS NOT NULL AND supplement_id IS NOT NULL`
- 检查约束：正常需求的 BOM 快照字段不得为空且均大于 `0`
- 唯一约束：`UNIQUE (idempotency_key)`
- 检查约束：`idempotency_key` 必须以 `generation_group_key + ':'` 开头，且分组键前缀必须与 `demand_type` 对应
- 唯一约束：`UNIQUE (id, item_id)`
- 唯一约束：`UNIQUE (id, production_batch_id)`
- 唯一约束：`UNIQUE (supplement_id, original_supplement_parent)`；生成列仅在 `replaces_demand_id IS NULL` 时取 `parent_demand_id`，保持原始补料防重，同时允许历史替代需求保留相同来源。
- 唯一约束：`UNIQUE(replaces_demand_id)` 防分叉；非空直接前驱 FK 指向需求，限人工追加／工序报废补料类型；同批次、物料、精确版本、单位及无环由更正事务核验。
- `pending_correction_id` 非空必须仍为 `active`；`(pending_correction_id,id)` 和 `(close_correction_id,id)` 组合 FK 引用更正申请的 `(id,old_demand_id)`。同一申请实际在审、冻结版本和当前指针由 Approval 与 Production handler 在同一事务核验。
- `closed` 必须有正的历史剩余、关闭原因、说明、操作人、时间；纠错／单条关闭须且仅须 `close_correction_id`，批次收尾须且仅须同批次 `closeout_id`；非关闭状态全部关闭字段为空。
- 索引：`INDEX (supplement_id, business_status)`

以下累计数量通过查询计算，不作为需求表字段持久化：

| 查询数量             | 事实来源                                             |
| -------------------- | ---------------------------------------------------- |
| `allocated_quantity` | 由 `production_item_allocation.assigned_number` 汇总 |
| `outbound_quantity`  | 由 `outbound_detail.outbound_number` 汇总            |
| `returned_quantity`  | 由 `return_detail.return_number` 汇总                |
| `scrapped_quantity`  | 由 `item_scrap.scrap_number` 汇总                    |

说明：

- 物料版本是需求的精确库存身份；基础物料 `item_id` 只用于 BOM 归属、汇总和兼容校验。
- 正式需求的 `need_number` 和已确认来源快照保持不变；补料新增需求，纠错采用审批后的关闭与替代，不原位改量。替代入口与事务规则见下文。
- 正常需求的 `need_number = quantity_per_unit_snapshot * planned_output_quantity_snapshot`；结果生成后作为事实保存，不随 BOM 或批次计划变化自动回写。
- 正常需求仅用于批量任务，必须一次覆盖全部 BOM 基础，每物料一个版本且数量等于 `required_number`；任一行不完整时整单回滚。研发 pending 阶段首次手工提需后进入 `material_pending`，后续沿同一手工入口追加。
- 同一配置命令由 `IdempotencyExecutor` 保护；重复提交只返回既有结果，不重新读取已确认事实或恢复旧的一键生成入口。补料和人工追加也必须走对应幂等命令。
- 分组键使用稳定格式：正常需求为 `NORMAL:{production_batch_id}`，工序报废补料为 `SCRAPSUP:{supplement_id}`，人工追加为 `ADDITIONAL:{production_batch_id}:{business_action_no}`。这些格式由共享类型和领域构造器集中拥有，业务写入路径不得直接拼接。
- 逐条幂等键在分组键后追加稳定行来源：正常需求追加 `requirement_basis_id + material_variant_id`，工序报废补料追加 `parent_demand_id`，人工提需追加 `item_id + material_variant_id`。
- `business_action_no` 必须是一次人工追加动作的稳定唯一编号；相同幂等键重复提交时返回既有需求，不插入新记录，也不得修改既有 `need_number`。
- 人工追加以 `production_manual_demand_addition` 记录一次任务级动作，可包含多条需求；批量需求关联同任务冻结基础，研发不关联 BOM；人工需求均不填写 `parent_demand_id`。工序报废补料校验父需求属于同一批次，BOM 明细、物料及版本一致。
- 报废补料必须校验补料单、授权、原需求和新增需求属于同一生产批次，且 BOM 明细与物料一致。
- 需求事实与成功审计同事务写入。新增、关闭、取消及替代统一经过需求 Writer，并推进任务 `version`；每次确认出库按需求版本履约并推进任务版本，即使任务仍为部分领料或执行中，旧开工预览也须重新核对，不改写原需求量。
- 分配写命令一次只能处理一个需求，但允许同一需求在一个命令内拆分到多个库存批次；后端必须拒绝混合不同 `demand_id` 的聚合分配。需求列表按 `id ASC` 返回，管理端按 `generation_group_key` 分组，默认选中最早未完成组中的最早可分配需求，但不强制只能处理最早组或最早需求。
- 全部活动需求完成分配时批次从 `material_pending` 进入 `material_assigned`；释放尚未出库的有效分配并重新产生缺口时允许从 `material_assigned` 回到 `material_pending`。该回退只表达分配齐套状态变化，不得回到初始 `pending`，也不得重新开放正常需求生成。
- 确认出库在写出库明细、负库存流水和单据终态的同一事务中扣减涉及需求的 `remaining_number`；扣至 `0` 时写入 `fulfilled/fulfilled_by/fulfilled_at`。部分出库继续保持 `active`。
- `fulfilled` 属于需求持久化业务状态；需求列表的 `demandProgressStatus` 将其统一投影为 `outbound`。取消需求投影为 `cancelled`，活动需求才按分配量和已确认出库量计算其余进度。
- 生产退料只表示余料回仓，不创建或恢复需求，不改变 `remaining_number`、履约终态或任务阶段。损耗独立记录，额外用料通过手工提需。
- 物料供需预警只汇总 `active.remaining_number`，不再扫描已满足需求的历史出库明细。
- 供需预警每行对应一个精确版本，只汇总该版本的活动需求。关键词命中该版本任一活动需求的物料编码、名称或版本编码后，应保留同版本全部活动需求；编码和单位取同版本 ID 最大的活动需求快照，名称使用当前物料名称。
- 供需缺口按精确版本计算，不同版本库存不能抵扣；分页按版本计数，具体公式和接口参数见[库存查询与可分配量](../../../inventory/docs/database/inventory-ledger-and-inbound.md#75-库存查询与可分配量)。
- 预警下钻同时限定基础物料和精确版本，返回活动需求的版本 ID、编码、需求类型、需求 ID、所属工单、生产任务、原始需求及工序补料/异常处置单据编号；来源身份、数量与业务资格读取 Production 事实；物料名称按已登记的展示查询读取当前名称，不以名称替代身份或资格。

#### 正式需求更正与替代

长期决策见 [ADR-0010](../../../../../../../docs/adr/0010-demand-correction-by-replacement.md)。Production 通过 `production.demand.correct` 场景接入通用 Approval，末级批准后统一改变需求和补料履约。

**提交更正申请 → 审批通过 → 关闭原需求未履约部分 → 创建有关联的替代需求。** 未确认的补料方案主单与明细仍可编辑；正式确认后的原方案、原需求数量及 BOM/单位/版本快照不回改。关闭只改变原需求的受控业务状态和关闭事实，不把原 `remaining_number` 清零伪装成已满足。

这里的补料更正资格按领料履约判断，不以“是否分配库存”判断：工序报废补料需求须仍为 `active`，且原补料单仍为 `approved`。普通已分配、部分已领料不单独阻断更正；在途出库、冻结／异常分配、待确认损耗及批次状态另行检查。界面分别说明需求类型、是否已领完及原补料单是否结束，不用“未齐套”笼统代替这些条件。

**关闭终态与审批中间态**

需求 `closed` 终态，表示主动结束剩余履约要求；`cancelled` 保留给未执行任务取消。关闭原因必须区分“更正并替代”“更正后无剩余”“单条关闭”和“随批次终止关闭”，页面不能全部只显示“人为关闭”。即使旧需求尚未领料，因录入错误被替代仍按更正原因关闭；不能只按已领量是否为零区分取消和关闭。

`replaces_demand_id` 位于新需求上，指向因同一生效更正而关闭的旧需求。因“更正并替代”关闭的需求须有且仅有一个有效后继；单条关闭、批次终止及更正后无剩余可以没有后继。连续更正时，中间需求保留自己原有的替代指针，同时可再次关闭并被后继替代；因此 `closed` 不等价于该行 `replaces_demand_id IS NOT NULL`。

仅冻结被更正的旧需求，不暂停整个生产任务。页面显示“更正审批中”，持久化履约状态仍为 `active`；需求表的 `pending_correction_id BIGINT UNSIGNED NULL`，指向 Production 所有的当前在审更正申请，由该申请关联通用审批实例。只保留一份当前在审关联，不另加可任意修改的冻结布尔值，也不把通用审批节点状态复制到需求表。

`pending_correction_id` 默认空，弹窗草稿不落库、不设置；正式送审时与创建/绑定审批实例同事务设置，要求旧需求仍为 `active` 且原指针为空。最终批准在关闭旧需求、生成可选替代需求的同一事务清空；驳回/撤回只在该字段仍指向本次申请时清空，不改变原剩余需求。非空指针必须关联同一旧需求的有效在审申请，关闭/履约等终态不得残留该指针。清空当前指针不删除历史：更正申请中的旧需求、可选新需求、审批实例和生效记录永久保留；`replaces_demand_id` 也不随审批结束清除。

| 场景 | 对审批中旧需求的处理 |
| --- | --- |
| 分配、释放、制单、确认出库、再次更正、普通关闭 | 禁止；候选查询及后端写入共同检查 `active` 且无在审更正，再叠加各入口原有资格条件 |
| 补料齐套、需求是否解决、正常完工 | 仍按未解决需求阻断，不能因为它退出可操作候选就视为已满足 |
| 需求总览、缺料与历史追溯 | 继续展示原数量、已领和剩余，明确标注审批中及不可操作原因 |
| 其他需求及原有生产额度 | 按原规则继续；同一补料单的其他需求可领料，但在审要求未解决前该单不能齐套放行 |

送审前处理涉及旧需求的待出库单，并明确混合单据的影响范围。审批绑定和解除在审关联须推进需求版本；单纯冻结不改变需求集合或数量，不因此推进任务版本。最终批准原子关闭旧需求、建立替代关系并解除本申请冻结；驳回/撤回只解除本申请冻结，恢复原需求按原剩余继续办理，不覆盖其他约束。已领部分的退料/损耗仍从原事实追溯并遵守其独立规则，不因冻结删除或移转来源；如改变审批依据，最终批准须要求重新复核。批次终止与在途更正互斥，先按更正流程撤回/驳回在途申请，再关闭旧需求；迟到批准不得在已结束任务中生成替代需求。

来源与更正关系必须区分：

| 关系 | 含义及约束 |
| --- | --- |
| 现有 `parent_demand_id` | 补料追溯其原始需求；人工追加仍为空。不能将此字段复用为纠错链 |
| 现有 `supplement_id` | 替代的补料需求继续归属同一补料物流单，保留原需求类型、原始需求及工序报废来源 |
| `replaces_demand_id` | 新需求明确关联直接被替代的旧需求，不覆盖 `parent_demand_id` |
| `production_demand_correction` 与审批关联 | 关联旧需求、可选的新需求、审批实例和生效版本；纯关闭允许没有新需求，审批不能只写在备注或仅保存最后一次审批编号 |

`supplement_id` 是补料单与需求的一对多归属键，已足够用于按单查需求和判断齐套；`parent_demand_id` 则保留逐条补料需求的原始需求来源，不参与齐套分组。工序报废补料从方案明细的 `original_demand_id` 取得父需求；同一补料单可以包含指向不同原需求的多种物料，补料单主表的报废来源不能代替这些逐行关系。

例如补料需求 D1 的 `supplement_id = M1`、`parent_demand_id = N1`，更正后 D2 仍保存 `supplement_id = M1`、`parent_demand_id = N1`，新增的直接替代关系才指向 D1。M1 表示同一次补料物流，N1 表示原始需求来源，D1 表示本次被纠正的需求；三者不能互相代用。人工追加需求及其替代需求继续保持 `parent_demand_id` 和 `supplement_id` 为空，纠错链单独关联。

首期只处理同批次、同物料、同精确版本、同单位的活动人工追加需求，及尚未齐套的工序报废补料单下活动需求。BOM 正常需求只在批次收尾时按规则结束剩余部分，不开放日常任意改量。已履约/已关闭的需求、已齐套补料不在此入口重新打开；改变物料、版本、单位须另行设计，不把不同身份的历史领料相加为已满足新物料需求。

数量示例（首次更正）：

| 对象 | 批准后的记录 |
| --- | --- |
| 原方案与旧需求 A | 原需求量 10、已确认领料 4 保留；原剩余 6 经更正申请关闭 |
| 更正申请 | 记录原目标 10、新目标总量 7、已领 4、关闭余量 6、新需求量 3，以及原因和版本 |
| 替代需求 B | 新建需求量 3、剩余量 3，关联 A、更正审批及 A 的补料来源（如有） |
| 当前执行口径 | 历史已领 4 加尚需领用 3；不将旧需求 10 与新需求 3 累加成 13 |

连续更正只对当前活动需求进行，按同一替代链全部已确认领料计算新剩余需求，不能只扣最后一条需求的已领量。新目标总量不得少于链上已确认领料；退料另走原来源退料命令，不冲回需求履约。新剩余为 0 时只关闭，不生成零数量需求，也不伪造出库。

审批前展示原始来源、历史更正链、本次旧需求版本、数量差异、关联待出库单与预留，以及补料齐套可能带来的授权激活和统一上限变化。涉及旧需求的待出库单须送审前处理，未出库预留的释放范围纳入批准证据；混合多条需求的出库单不能因其中一条纠错而无提示地取消其他需求的领料安排。送审后冻结证据并限制影响证据的操作；同一旧需求不能并行生效两次更正。

最终批准事务通过统一需求 Writer 完成旧需求关闭与替代需求生成，同步推进任务 `version`，与审批生效、关联单据及成功审计同事务提交；失败回滚，驳回／撤回保留原正式需求事实。

**补料齐套与补产执行资格**

`fulfillReadySupplements` 使用 `evaluateSupplementFulfillment` 核对本单的所有需求及其生效更正关系，不能简单检查“没有活动需求”，也不能一律跳过 `cancelled/closed`。查询与写入使用相同的纯判定，只有写命令推进单据状态。

| 需求情况 | 对该补料单齐套的影响 |
| --- | --- |
| 未更正的需求仍为 `active` | 继续阻断，已分配或部分出库都不等于领齐 |
| 旧需求因已批准且已生效的替代而 `closed` | 保留原数量和已领事实，后续要求沿更正链交由替代需求判断；旧需求本身不伪装成 `fulfilled` |
| 替代需求为 `active` | 继续阻断，必须完成替代需求的实际领料 |
| 当前需求为 `fulfilled`，且关联更正链完整有效 | 该项履约要求已满足；其他来源项仍须逐项满足 |
| 需求被普通关闭/取消，没有生效的替代或批准解除剩余要求的依据 | 不得视为已经领齐，继续阻断 |
| 补料单因批次收尾等原因已 `cancelled` | 不进入齐套激活，既有补产授权不得因此获得执行资格 |

例如旧需求 A 为 10、已领 4，更正为总量 7：批准事务将 A 的剩余 6 关闭并生成 B（需求 3），A 为 `closed`、B 为 `active`，补料单仍为 `approved`（待补料）。B 只领 1 时仍阻断；B 全部领齐且该单其他有效要求均满足后，补料单才进入 `fulfilled`，既有补产授权的相应额度才具备物料条件。连续更正同样沿链判断当前要求，不要求历史关闭行变为已履约。

新剩余为 0 的更正不得靠空集合自动齐套：补料项须在审批中明确解除哪些剩余要求，并核对新目标等于链上累计已确认领料，保存结论及依据；没有这项生效证据仍阻断。首期不开放整张补料单零领料、全部要求被免除后自动放行补产；若不再补产，应走对应收尾/取消处理，无需补料仍继续补产的例外须另行设计。

Production 统一拥有一套补料履约判定与状态推进能力，由需求更正最终批准、出库确认共同调用；详情查询沿用同一有效履约口径。工序及补产额度计算读取补料单的受控履约结果，不各自遍历更正链，也不另存一套可手改的“齐套”标记。依赖顺序为：**当前需求履约 → 补料单齐套 → 既有补产额度具备物料条件 → 结合工序及批次状态决定执行资格**。齐套本身不代替工序前置条件、权限或批次可执行状态；任务开工不免除补产额度的补料生效条件。

上述依赖按一张补料单及其对应授权判断，不要求整个批次的所有补料单同时 `fulfilled`。某张补料单未齐套只使其对应的新增授权量暂不进入路线公式，不冻结原有可执行量及其他已齐套授权量。领料损坏只登记事实，额外用料另行手工提需。

复用应按业务职责拆分，不把每一个判断拆成各自查询数据库、各自提交的命令：

| 判断职责 | 输入与结果 | 复用边界 |
| --- | --- | --- |
| 补料需求履约判定 | 同一补料单的需求、已生效更正关系及履约事实 → 是否满足全部当前要求、阻断需求及原因 | 更正审批预览/最终批准、出库确认及补料详情；不能仅检查不存在 `active` |
| 补产授权的物料条件 | 每条已有授权关联补料单为 `fulfilled` → 该授权可参与路线公式 | 现有 `selectRouteSupplementSources` 派生 `material_ready`；不是授权表的独立状态，不需要再批准一次，不按物料数量换算产品数量 |
| 工序数量计算 | 批次计划、逐工序有效报工、可参与公式的授权 → 各工序目标提示、统一上限及剩余可报量 | 现有 `calculateRouteStepQuantities` 为共享纯函数，供任务展示、普通报工及授权生效预览使用；公式由[执行章节 §4.2.3](execution-traceability-quality.md#423-数量与并发约束)所有 |
| 工序动作资格 | 操作人/权限、批次与工序状态、统一上限和本次报工数量 → 对指定动作是否允许及原因 | 开始工序和提交报工分别组合规则，不用一个通用布尔值代替所有动作校验 |

“开始工序”检查任务执行中、派工与当前办理人，不检查领料或前道实报量。“普通报工”检查当前办理人、阶段及剩余额度；完成、重开独立办理，需求更正不驱动工序状态。

查询可以复用纯判断结果展示按钮与阻断原因，但不能作为后续写入的凭证。写命令必须在同一事务内锁定相关事实、读取最新数量并重新组合校验；共享纯函数本身不查询数据库、不写状态，状态推进仍由所属业务命令统一完成。

旧需求关闭、新需求生成、补料齐套重算及其授权激活影响必须包含在同一批准事务内，沿统一锁序重新校验；禁止先提交关闭再异步创建替代需求，避免中间状态误放行或并发领料改变审批依据。更正不重建报废事实或补产授权，只处理满足批准履约条件的既有授权。更正预览对新剩余为零的情形模拟本单齐套、激活授权量和统一上限；新剩余为正时必须先领齐。预览与实际推进共用 `calculateRouteStepQuantities` 及统一补料履约能力。

追溯保留全部原方案、旧/新需求、逐次审批及真实领退料；当前缺口继续按活动需求的精确版本计算。业务汇总识别替代链的当前要求和历史履约，不能把各历史版本的总需求重复计入。替代需求继承 `manual_addition_id` 或原 `supplement_id/parent_demand_id`，生成分组以原来源键追加 `:CORRECTION:<申请ID>`，逐行幂等键同时包含更正动作；不回写已确认人工追加单或补料方案。

#### `production_demand_correction`

批准证据采用 `schemaVersion = 2`，用授权激活量与统一上限代替旧重开工序结果；升级前须按开发库初始化约定清除旧更正业务，迁移在旧更正记录非空时拒绝执行，不猜测历史证据含义。

一行是一次正式更正送审及其生效结果，单据审计与 `version`，无软删除。不保存可任意修改的执行需求副本，也不复制 Approval 节点状态。页面草稿只在本地；提交事务内创建记录并绑定审批，未配置流程或提交失败整体回滚，不留下游离草稿。

| 字段 | 类型／约束 | 含义 |
| --- | --- | --- |
| `id / old_demand_id / production_batch_id` | 自增主键／非空 BIGINT UNSIGNED | 原需求及同批次组合 FK |
| `correction_kind` | `VARCHAR(20)`，quantity／close | 仅人工追加开放普通关闭；补料以数量更正明确解除剩余 |
| `target_total_quantity / issued_quantity / old_remaining_quantity / new_remaining_quantity` | 非空 BIGINT UNSIGNED | 新目标、替代链累计领料、旧正剩余、新剩余；目标不小于已领，新剩余严格为两者之差，目标不超过 99999999 |
| `reason` | 非空 TEXT，去空白非空 | 更正／关闭说明 |
| `evidence / evidence_hash` | 非空 JSON／CHAR(64) | 来源、原方案、需求链、预留、已领及补产影响与核对 SHA-256 |
| `approval_instance_id` | 可空唯一 Approval FK | 一次申请对应一次审批 |
| `new_demand_id` | 可空唯一需求 FK，并校验同批次 | 有剩余时的唯一后继 |
| `applied_by / applied_at / ended_at` | 可空用户 FK／DATETIME | 生效人／生效时间／流程结束时间；驳回撤回只写 ended_at |
| `result_snapshot` | 可空 JSON | 本次实际齐套的补料单 IDs；不保存重开工序 |
| `active_slot` | STORED 可空生成列 | ended_at 为空时为 1，UNIQUE(old_demand_id,active_slot) 防冲突申请 |

未生效时新需求、生效人／时间和结果全空；生效时审批、结束时间、结果必填，新剩余为零则无新需求，否则必须有新需求。行内 CHECK、外键和唯一键防止结构冲突；来源同身份、审批真实在审、旧关闭与后继一致、无环及不可改写来源由受控事务共同保证。

接口前缀 `/api/production/material-demands/:demandId`：GET `/correction-check` 返回最新依据、版本和令牌；GET `/corrections` 沿前后继返回完整申请历史；POST `/corrections` 要求 `production:materials:correct-demand`、`Idempotency-Key` 及版本、令牌、处理方式、目标总量、原因。读取接受需求查看、物料查看或任务查看权限之一。写 scope `production.demand-correction.submit.v2`，结果仅包含申请对象 ID 与审批 ID，沿用平台幂等事务。

审批绑定／解除只推进需求及更正记录版本；末级批准推进任务版本。先锁工单、任务、申请和旧需求，再读取来源及物流事实；最终核对排除本次绑定的版本变化，其余依据变化要求重新送审。批准、关闭／替代、补料履约、审计及通知同事务，原库存流水不变。

更正依据中的预留批号通过 Inventory 公开 `materialBatchReferences` 批量读取，仅用于展示及冻结原有证据；分配、已领数量、退料和损耗资格仍读取并锁定 Production 自有事实。更正查询不再通过跨库存 JOIN 的 `FOR SHARE` 锁住 `item_batch`，也不使用该公开展示返回的余额或批次状态替代更正业务校验。

#### 需求数量与进度查询

实现位于 [mysql-production-material.mapper.ts](../../infrastructure/mysql-production-material.mapper.ts) 的 `DEMAND_SELECT`、`mapDemand` 与 `progress`，由 [MysqlProductionMaterialRepository.listDemands](../../infrastructure/mysql-production-material.repository.ts) 按需求返回。计算保留 `demand_id` 及精确物料版本，不将同一任务的不同需求折叠成一个进度状态。

```text
有效分配量 = sum(未释放、未取消的分配数量)
已确认出库量 = sum(已完成出库单明细数量)
有效未出库预留 = sum(未释放、未取消的每条分配 max(分配量 - 该分配已确认出库量, 0))
当前未分配缺口 = active 时 max(remaining_number - 有效未出库预留, 0)，终态为 0
```

有效分配只统计 `allocation_status NOT IN ('released','cancelled')`，出库只统计 `completed` 主单。接口 `allocatedQuantity/outboundQuantity/remainingQuantity` 分别对应有效分配量、已确认出库量和当前未分配缺口；余料退回不撤销既有履约，以上数量均不扣除退料。`remainingDemandQuantity` 直接读取需求事实 `remaining_number`，由确认出库扣减，不用净领用量重新推导。新增分配不得超过当前未分配缺口；释放部分已领料的分配只移除其未出库预留，不抹掉已领事实。例：需求 10 已领 4，释放剩余预留后，只可再分配 6，不能再按原需求分配 10。退回库存作为公共余额可供其他需求分配，不再保留给原需求。

`demandProgressStatus` 按以下顺序取首个匹配结果，只是接口计算字段，不写回需求表：

| 优先级 | 条件 | 返回状态 |
| --- | --- | --- |
| 1 | `business_status = fulfilled` | `outbound` |
| 2 | `business_status = cancelled` | `cancelled` |
| 3 | `business_status = closed` | `closed` |
| 4 | `pending_correction_id IS NOT NULL` | `correction_pending` |
| 5 | 已确认出库量 ≥ `need_number` | `outbound` |
| 6 | 已确认出库量 > 0 且当前未分配缺口 > 0 | `shortage` |
| 7 | 已确认出库量 > 0 | `partially_outbound` |
| 8 | 有效未出库预留 ≥ `remaining_number` | `allocated` |
| 9 | 有效未出库预留 > 0 | `partially_allocated` |
| 10 | 其他 | `pending_allocation` |

`shortage` 表示该需求已经领料但仍有未分配缺口，显示为“领料缺口”；`businessStatus` 仍保留持久化业务状态。确认领料与退料只能表达净领用，当前没有现场自动耗料事实，不能将“出库减退料”定义为实际消耗量或据此计算生产成本。补料通过新增需求反映物流缺口，不回写原需求数量。

需求更正在审时禁止该需求继续分配、制单和出库，其他有效需求可以继续办理。个别错误走更正审批，整批停止走收尾；不提供关闭全部剩余需求的旧批量入口。

### 补料与产品补产

短批授权主从表及出库关联已移除。工序报废的产品补产授权仍独立存在，关联补料要求全部有效履约后才生效；分配、部分领料或关闭需求均不能代替补料履约。

### 10.3 `production_scrap_supplement_plan` / `production_scrap_supplement_plan_line`

设计类型：可变业务方案主表及其可变明细。

职责：承载管理员在异常正式批准报废前暂存、重开和复核的补料方案。方案不是正式物料需求，不得进入分配、出库或库存计算；只有最终确认事务才把方案明细复制为 `production_item_demand(scrap_supplement)`，并同时生成报废事实、补产授权和补料物流单。

`production_scrap_supplement_plan` 字段：

| 字段                          | 类型              | 说明                                                         |
| ----------------------------- | ----------------- | ------------------------------------------------------------ |
| `id`                          | `BIGINT UNSIGNED` | 主键，自增                                                   |
| `plan_no`                     | `VARCHAR(100)`    | 方案编号，唯一                                               |
| `abnormal_disposition_id`     | `BIGINT UNSIGNED` | 来源待处置异常 ID，唯一；同一异常只有一个当前方案            |
| `production_batch_id`         | `BIGINT UNSIGNED` | 生产批次 ID                                                  |
| `batch_step_record_id`        | `BIGINT UNSIGNED` | 异常上报工序执行节点 ID                                      |
| `source_report_id`            | `BIGINT UNSIGNED` | 来源异常报工事实 ID                                          |
| `status`                      | `VARCHAR(20)`     | `draft`、`confirmed`                                         |
| `confirmed_supplement_id`     | `BIGINT UNSIGNED` | 最终确认后生成的补料物流单 ID；草稿为空                      |
| `remark`                      | `TEXT`            | 方案及最终审批说明                                           |
| `version`                     | `INT`             | 乐观锁版本号，默认 `0`                                       |
| 业务审计字段                  | 见统一规则        | `created_by/created_at/updated_by/updated_at`                 |

`production_scrap_supplement_plan_line` 字段：

| 字段                  | 类型              | 说明                                                     |
| --------------------- | ----------------- | -------------------------------------------------------- |
| `id`                  | `BIGINT UNSIGNED` | 主键，自增                                               |
| `plan_id`             | `BIGINT UNSIGNED` | 所属方案 ID                                              |
| `production_batch_id` | `BIGINT UNSIGNED` | 所属生产批次 ID                                         |
| `original_demand_id`  | `BIGINT UNSIGNED` | 选中的原始正常需求 ID                                   |
| `requirement_basis_id`| `BIGINT UNSIGNED` | 当前批次冻结的 BOM 需求基础 ID                          |
| `product_material_id` | `BIGINT UNSIGNED` | BOM 明细 ID                                             |
| `item_id`             | `BIGINT UNSIGNED` | 物料 ID                                                 |
| `material_variant_id` | `BIGINT UNSIGNED` | 管理员选择的精确物料版本 ID                             |
| `planned_quantity`    | `INT`   | 管理员填写并暂存的补料数量，必须大于 `0`                |
| `unit_snapshot`       | `VARCHAR(20)`     | 原始正常需求的单位快照                                   |
| 业务审计字段          | 见统一规则        | `created_by/created_at/updated_by/updated_at`             |

数据库约束与应用规则：

- `UNIQUE (abnormal_disposition_id)`；方案与异常处置一对一，不用新增方案覆盖旧方案。
- 来源异常使用 `(abnormal_disposition_id, production_batch_id, batch_step_record_id, source_report_id)` 组合外键，禁止跨批次、跨工序或跨报工暂存。
- `draft` 要求 `confirmed_supplement_id IS NULL`；`confirmed` 要求其非空且指向同批次 `production_material_supplement`。
- 明细使用 `(plan_id, original_demand_id)` 唯一约束；原始需求、批次、BOM 明细和物料使用组合外键保持一致。
- 草稿可通过 `version` 乐观锁反复整体替换明细；每次保存必须记录成功操作日志。`confirmed` 为终态，不得恢复为 `draft` 或继续编辑。
- 草稿保存同时提交 `planVersion` 和 `dispositionVersion`，分别防止覆盖旧方案和基于过期异常暂存；保存不改变异常处置状态。只有复核后的最终确认才生成正式事实，管理端不能调用绕过方案复核的直接批准入口。
- 草稿行不是需求事实，因此不写 `production_item_demand`、不产生幂等需求键，也不允许分配和出库。
- 最终确认必须锁定待处置异常及方案版本，重新校验来源报工有效、完整 BOM 需求基础、启用物料版本和数量；同一事务批准异常、创建工序报废事实、补产授权、补料单、正式需求，将方案转为 `confirmed` 并关联补料单，同时提交成功审计和 HTTP 幂等结果。
- 当前不计算或保存推荐补料数量。候选来自批次完整 BOM 基础，`planned_quantity` 完全由管理员填写；工序级定量 BOM 未定稿前不得用产品 BOM 总用量或异常数量自动推算。

状态机：

```text
draft -> confirmed
```

### 10.4 `production_material_supplement`

设计类型：可变业务单据。

职责：作为生产补料的统一物流主单，表达补料因何产生、属于哪个生产批次，以及其直接拥有的补料需求是否已经全部确认领用。它不重复保存物料、数量和单位明细；这些需求事实只保存在 `production_item_demand`。本表只承接工序报废补料；领料损坏独立登记，不生成补料单。

| 字段                      | 类型              | 说明                                                               |
| ------------------------- | ----------------- | ------------------------------------------------------------------ |
| `id`                      | `BIGINT UNSIGNED` | 主键，自增                                                         |
| `supplement_no`           | `VARCHAR(100)`    | 补料单号，唯一                                                     |
| `source_type`             | `VARCHAR(40)`     | 来源类型：仅 `step_scrap_reproduction`               |
| `step_scrap_record_id`    | `BIGINT UNSIGNED` | 工序报废事实 ID；仅工序报废补产填写                               |
| `production_batch_id`     | `BIGINT UNSIGNED` | 所属生产批次 ID                                                    |
| `batch_step_record_id`    | `BIGINT UNSIGNED` | 工序报废来源工序执行节点 ID                     |
| `status`                  | `VARCHAR(30)`     | 物流状态：`approved`、`fulfilled`、`cancelled`                                  |
| `fulfilled_by`            | `BIGINT UNSIGNED` | 最后一项需求完成确认领用的操作人；未齐套时为空                     |
| `fulfilled_at`            | `DATETIME`        | 全部直接补料需求完成确认领用时间；未齐套时为空                     |
| `remark`                  | `TEXT`            | 工序报废来源说明                                             |
| `version`                 | `INT`             | 乐观锁版本号，默认 `0`                                             |
| 业务审计字段              | 见统一规则        | `created_by/created_at/updated_by/updated_at`                       |

数据库约束：

- 主键：`id`。
- 唯一约束：`UNIQUE (supplement_no)`、`UNIQUE (id, production_batch_id)`。
- 唯一约束：`UNIQUE (step_scrap_record_id)`；工序报废来源保持一对一。
- 组合外键：`(step_scrap_record_id, production_batch_id, batch_step_record_id) -> batch_step_scrap_records(id, production_batch_id, batch_step_record_id)`。
- 外键：`fulfilled_by` 及业务审计操作者字段关联 `users.id`。
- 检查约束：`CHECK (source_type = 'step_scrap_reproduction')`。
- `step_scrap_record_id`、`batch_step_record_id` 为非空工序来源。
- 检查约束：`CHECK 状态只允许 'approved'、'fulfilled'、'cancelled'`。
- 检查约束：`approved/cancelled` 要求 `fulfilled_by/fulfilled_at` 均为空；`fulfilled` 要求二者均非空。
- 检查约束：`CHECK (version >= 0)`。
- 索引：`INDEX (production_batch_id, status, created_at)`、`INDEX (source_type, status, created_at)`。

状态机与来源规则：

```text
approved -> fulfilled / cancelled（仅批次结束）
```

- 本表状态只表达补料物流是否齐套，不表达异常审批结果、报废事实是否成立或产品补产授权是否存在。状态转换由最后一项补料确认领用事务触发，必须递增 `version`；终态不得通过通用更新接口恢复为 `approved`。
- `source_type = 'step_scrap_reproduction'`：管理员批准工序异常为报废时，同一事务创建工序报废事实、产品补产授权、本补料单以及一到多条 `scrap_supplement` 需求。候选来自当前批次冻结的完整 BOM 需求基础，不按发生报废的工序裁剪；管理员选择基础物料下的具体启用版本及补料数量。
- 每张补料单创建时必须至少拥有一条 `business_status = 'active'` 且类型与 `source_type` 匹配的直接需求；后续齐套须按前述生效更正链判断全部当前要求。最后一项直接需求的已确认出库累计达到 `need_number` 时，同一事务把补料单转为 `fulfilled`，写入 `fulfilled_by/fulfilled_at`、递增 `version` 并记录成功审计。
- 工序报废补料单进入 `fulfilled` 后，对应 `batch_step_scrap_reproduction_authorization.authorized_quantity` 才进入路线数量公式，刷新各工序统一上限，不改变工序状态。

### `batch_step_scrap_records` 与半自动补料

- `batch_step_scrap_records` 是已批准不可返工的工序损失事实：对 `abnormal_disposition_id` 唯一，保存批次、工序、来源报工、异常数量和单位快照；只追加、不更新、不删除。
- `batch_step_scrap_reproduction_authorization` 是“工序报废补产授权”的不可变事实。它对报废事实和补料单分别唯一，固定生产批次、首工序入口、补产额度截止工序、授权数量和审批人/时间。物料候选不属于路线授权范围。表名显式包含 `scrap`，避免与返工混淆。
- `production_material_supplement` 是工序报废补料的物流主单；完整字段与约束见上节。状态表示 `approved`（等待补料领用）、`fulfilled`（全部直接需求已确认领用）或 `cancelled`（随本轮结束取消），不承担“是否批准补产”的语义。
- 补料单直接通过 `production_item_demand.supplement_id` 拥有需求：工序报废来源拥有一到多条 `scrap_supplement`；不再设置与需求的物料、数量、单位、原需求重复的 `production_material_supplement_detail`。
- 系统只提供候选物料，不自动计算每种物料的补料数量。管理员选择物料并手工填写数量，系统不得使用工序异常数量乘 BOM 用量推算补料数量。
- 报工异常仍必须说明 `abnormal_origin`，但批准报废补料不再选择物料截止工序；候选物料来自当前批次完整的 BOM 基础，管理员按基础行明确选择启用版本和数量。
- 路线只表达执行顺序，不存在 `route_step_materials` 或按工序范围推导补料候选的旁路语义。
- 系统校验管理员选择的物料属于当前产品与当前候选、补料数量大于 `0`、单位与原需求口径一致；最终选择直接固化为新增需求的 BOM/物料/数量/单位快照和 `parent_demand_id`。
- 批准报废与补料是一个原子命令：处置单批准、工序报废事实、补产授权、补料单、每条 `scrap_supplement` 需求、成功审计和 HTTP 幂等结果同事务提交。
- 工序报废数量与物料补料数量是两个口径。管理员填写的补料需求只决定物料需求；产品补产数量固定取授权的 `authorized_quantity`（批准时复制报废数量），不得按 BOM 或补料需求反推产品数量。
- 补产固定从路线首工序重新投产，补产额度的 `quota_end_step_record_id` 固定为异常上报工序；物料补料选择与路线工序范围无关，不能缩短产品额度的逐道传播。
- 可执行补产额度只读取“授权事实 + 对应补料单 `fulfilled`”。最后一项需求达到全量确认出库时，同一事务只把补料单改为 `fulfilled` 并刷新上限投影，不重开已完成工序；不得再次创建或修改授权。分配、待出库或部分确认领料均不可执行额度。
- 因此当前链路闭合为“工序报废与补产授权 → 人工补料 → 新需求 → 分配 → 确认出库 → 授权可执行 → 首工序重新生产 → 逐工序正常放行 → 来源工序补报”。当前仍不记录某次补报逐笔消费哪张授权；未来需要部分执行、指定来源消费或半成品重入时，再追加额度消费/重入事实和版本化接口。
- 工序报废补料审批只接受 `doing` 任务；已领物料损耗接受 `material_partially_outbound/material_outbound/doing`。损耗只记录真实损坏，不创建需求或补产授权；随后独立提需通过统一 Writer 更新任务版本。普通剩余、人工追加及工序补料均按统一资格继续领用，物流不代替显式开工。

---

### 11. `production_item_allocation`

职责：维护生产批次的物料分配明细，记录某条需求分配到了哪个库存批次以及分配数量。

分配代表业务预留。已分配但未出库的数量，应从可分配库存中扣除，避免其他生产批次抢占。

`active` 表示分配关系有效，不代表仍有库存预留；实际预留为 `max(assigned_number − 已确认出库量, 0)`。全部出库后分配仍可为 `active`，预留为零。`released` 表示主动解除分配，释放未出库部分并禁止继续沿该分配制单领料，不是“已领完”状态；原分配量、已确认出库及库存流水保持不变。普通释放入口要求尚未领料且无待出库单；受控需求更正、批次收尾可在处理待出库单后释放部分已领分配的剩余预留。收尾不要求释放已全部领料的正常有效分配，冻结或异常分配仍须核对处理。

| 字段                  | 类型              | 说明                                                  |
| --------------------- | ----------------- | ----------------------------------------------------- |
| `id`                  | `BIGINT UNSIGNED` | 主键                                                  |
| `demand_id`           | `BIGINT UNSIGNED` | 需求 ID，关联 `production_item_demand.id`             |
| `production_batch_id` | `BIGINT UNSIGNED` | 生产批次 ID，冗余保存，便于查询和约束                 |
| `item_id`             | `BIGINT UNSIGNED` | 库存对象 ID，冗余保存，用于约束需求对象与批次对象一致（materials 表） |
| `material_variant_id` | `BIGINT UNSIGNED` | 精确物料版本 ID，必须与需求和库存批次一致             |
| `batch_id`            | `BIGINT UNSIGNED` | 分配的库存批次 ID，关联 `item_batch.id`               |
| `assigned_number`     | `INT`   | 分配数量                                              |
| `unit_snapshot`       | `VARCHAR(20)`     | 分配时单位快照                                        |
| `allocation_status`   | `VARCHAR(30)`     | 分配业务状态，默认 `active`                           |
| `version`             | `INT`             | 乐观锁版本号，默认 `0`                                |
| `remark`              | `TEXT`            | 备注                                                  |
| 业务审计字段          | 见统一规则        | 可变业务单据审计字段                                  |

约束：

- 主键：`id`
- 外键：`FOREIGN KEY (demand_id, item_id) REFERENCES production_item_demand(id, item_id)`
- 外键：`FOREIGN KEY (demand_id, item_id, material_variant_id) REFERENCES production_item_demand(id, item_id, material_variant_id)`
- 外键：`FOREIGN KEY (demand_id, production_batch_id) REFERENCES production_item_demand(id, production_batch_id)`
- 外键：`FOREIGN KEY (batch_id, item_id) REFERENCES item_batch(id, item_id)`
- 外键：`FOREIGN KEY (batch_id, item_id, material_variant_id) REFERENCES item_batch(id, item_id, material_variant_id)`
- 检查约束：`CHECK (assigned_number > 0)`
- 检查约束：`CHECK (allocation_status IN ('active', 'released', 'cancelled', 'frozen', 'abnormal'))`
- 组合索引：`INDEX (production_batch_id, allocation_status)`，用于汇总批次有效预留
- 唯一约束：`UNIQUE (id, demand_id)`
- 唯一约束：`UNIQUE (id, production_batch_id)`
- 唯一约束：`UNIQUE (id, item_id)`
- 组合候选键：`UNIQUE (id, demand_id, production_batch_id, item_id, batch_id, material_variant_id)` — 供 `outbound_detail` 和 `return_detail` 作为组合外键引用，保证出库/退料与 allocation 的需求、生产批次、基础物料、精确版本和库存批次一致

以下累计数量通过查询计算，不作为分配表字段持久化：

| 查询数量            | 事实来源                  |
| ------------------- | ------------------------- |
| `outbound_quantity` | 由 `outbound_detail` 汇总 |
| `returned_quantity` | 由 `return_detail` 汇总   |
| `scrapped_quantity` | 由 `item_scrap` 汇总      |

说明：

- `assigned_number` 是分配事实，不是缓存字段，应保留。
- 分配创建后，应影响可分配库存。
- 分配不等于出库，库存流水不会因为分配而扣减。
- 分配只代表业务预留，实际库存减少发生在出库时。
- `allocation_status = released` 或 `cancelled` 时，不应继续占用可分配库存。

#### 分配数量查询

实现位于 [mysql-production-material.mapper.ts](../../infrastructure/mysql-production-material.mapper.ts) 的 `ALLOCATION_SELECT` 与 `mapAllocation`，由 [MysqlProductionMaterialRepository](../../infrastructure/mysql-production-material.repository.ts) 读取；返回的是查询结果，不是数据库视图。

- 已出库量：只汇总主单为 `completed` 的出库明细。
- 待出库占用：汇总主单为 `pending_picking/picked/partially_outbound` 的出库明细；后两种状态是数据库保留值，当前不开放对应状态转换命令。
- `remainingOutboundQuantity = max(assigned_number - 已出库量, 0)`。
- `availableToOrderQuantity = max(assigned_number - 已出库量 - 待出库占用, 0)`。
- 当前退料全部释放到公共库存，不加回原分配的可制单量；已领物料损耗也不再次扣减原分配可制单量，新增用料通过独立人工提需。

上述数量不替代需求、分配、库存批次状态的写入校验。分配已释放或取消时，即使历史数量计算仍有余额，也不得据此制单。库存预留口径见[库存查询与可分配量](../../../inventory/docs/database/inventory-ledger-and-inbound.md#75-库存查询与可分配量)。

---

## 3.6 生产领料出库表

---

### 12. `outbound_order`

职责：维护生产领料出库主单，记录库管针对某个生产批次的一次出库动作。

| 字段                  | 类型              | 说明                                      |
| --------------------- | ----------------- | ----------------------------------------- |
| `id`                  | `BIGINT UNSIGNED` | 主键                                      |
| `outbound_no`         | `VARCHAR(100)`    | 出库单号                                  |
| `production_batch_id` | `BIGINT UNSIGNED` | 生产批次 ID，关联 `production_batches.id` |
| `work_order_id`       | `BIGINT UNSIGNED` | 工单 ID，冗余保存，便于查询               |
| `status`              | `VARCHAR(30)`     | 出库单状态，默认 `pending_picking`        |
| `outbound_at`         | `DATETIME`        | 实际出库时间                              |
| `operator_id`         | `BIGINT UNSIGNED` | 操作人 ID                                 |
| `version`             | `INT`             | 乐观锁版本号，默认 `0`                    |
| `remark`              | `TEXT`            | 备注                                      |
| `cancel_source`       | `VARCHAR(30)`     | `manual` 人工取消、`production_batch` 任务取消或 `production_termination` 本轮结束 |
| `cancel_reason`       | `TEXT`            | 取消原因；历史未记录数据可为空            |
| `cancelled_by`        | `BIGINT UNSIGNED` | 取消人；历史未记录数据可为空              |
| `cancelled_at`        | `DATETIME`        | 取消时间；历史未记录数据可为空            |
| 业务审计字段          | 见统一规则        | 可变业务单据审计字段                      |

约束：

- 主键：`id`
- 唯一约束：`UNIQUE (outbound_no)`
- 唯一约束：`UNIQUE (id, production_batch_id)`
- 外键：`FOREIGN KEY (production_batch_id, work_order_id) REFERENCES production_batches(id, work_order_id)`
- 外键：`FOREIGN KEY (operator_id) REFERENCES users(id)`
- 外键：`FOREIGN KEY (cancelled_by) REFERENCES users(id)`
- 检查约束：`CHECK (cancel_source IS NULL OR cancel_source IN ('manual', 'production_batch', 'production_termination'))`
- 检查约束：`CHECK (status IN ('pending_picking', 'picked', 'partially_outbound', 'completed', 'cancelled'))`
- 组合索引：`INDEX (status, created_at)`，用于出库单状态分页

说明：

- `outbound_order` 表示一次出库动作。
- 一张出库单可以包含同一生产批次内的多个需求生成组、多个需求、多个物料和多个库存批次；前提是这些明细属于同一次实际拣货与领料交接。不同时间才能备齐的明细不得只为减少单据而提前并单，因为当前确认和取消均按整单执行。
- 出库单主表建议关联 `production_batch_id`，而不是单个 `demand_id`。
- 具体出了哪些物料、哪些批次、多少数量，由 `outbound_detail` 记录。
- 管理端按 `production_item_demand.generation_group_key` 分组展示候选，但选择可以跨组；提交前显示选中的需求组数和分配明细数。出库详情与打印单通过 `outbound_detail.demand_id` 关联需求和补料单，派生展示需求组类型、分组键及补料单号，不在 `outbound_detail` 冗余保存组字段。
- 人工取消必须填写原因；生产任务级联取消继承任务取消原因，并以 `cancel_source` 明确来源。
- 制单和确认均按本章[物料办理资格](#物料办理资格)校验，可以只领取部分有效分配。主单不再关联短批授权，确认始终按本单明细逐条履约及记账。

---

### 13. `outbound_detail`

职责：维护生产领料出库明细，记录某次出库动作中每个分配行实际出库的库存对象、批次和数量。

| 字段                  | 类型              | 说明                                              |
| --------------------- | ----------------- | ------------------------------------------------- |
| `id`                  | `BIGINT UNSIGNED` | 主键                                              |
| `outbound_id`         | `BIGINT UNSIGNED` | 出库主单 ID，关联 `outbound_order.id`             |
| `production_batch_id` | `BIGINT UNSIGNED` | 生产批次 ID，冗余保存，用于查询和约束             |
| `demand_id`           | `BIGINT UNSIGNED` | 需求 ID，关联 `production_item_demand.id`         |
| `allocation_id`       | `BIGINT UNSIGNED` | 分配明细 ID，关联 `production_item_allocation.id` |
| `item_id`             | `BIGINT UNSIGNED` | 出库对象 ID，冗余保存                             |
| `material_variant_id` | `BIGINT UNSIGNED` | 出库的精确物料版本 ID                             |
| `batch_id`            | `BIGINT UNSIGNED` | 出库库存批次 ID，冗余保存                         |
| `outbound_number`     | `INT`   | 本次出库数量                                      |
| `unit_snapshot`       | `VARCHAR(20)`     | 出库时单位快照                                    |
| `created_by`          | `BIGINT UNSIGNED` | 创建人                                            |
| `created_at`          | `DATETIME`        | 创建时间，默认 `CURRENT_TIMESTAMP`                |

约束：

- 主键：`id`
- 外键：`FOREIGN KEY (outbound_id, production_batch_id) REFERENCES outbound_order(id, production_batch_id)`
- 外键：`FOREIGN KEY (demand_id, production_batch_id) REFERENCES production_item_demand(id, production_batch_id)`
- 外键：`FOREIGN KEY (allocation_id, demand_id, production_batch_id, item_id, batch_id, material_variant_id) REFERENCES production_item_allocation(id, demand_id, production_batch_id, item_id, batch_id, material_variant_id)`
- 外键：`FOREIGN KEY (batch_id, item_id, material_variant_id) REFERENCES item_batch(id, item_id, material_variant_id)`
- 检查约束：`CHECK (outbound_number > 0)`
- 唯一约束：`UNIQUE (outbound_id, allocation_id)`

说明：

- `outbound_detail` 是出库事实明细表。
- 当前明细通过 `batch_id` 关联 `item_batch`，读取建批时的物料编码及版本编码快照；单位使用出库明细自身的 `unit_snapshot`。物料名称通过批次 `item_id` 读取当前主数据，改名后历史出库展示和搜索同步变化。出库明细不重复保存名称、编码快照；精确物料版本仍由既有关系约束。
- `inventory_transaction` 中的生产领料出库流水应引用 `outbound_detail.id`。
- 出库明细用于判断某条分配是否已经出库、某条需求是否已经满足。
- `outbound_id` 用于表达哪些明细属于同一次出库动作。
- `production_batch_id` 是有价值的冗余字段，便于按生产批次查询出库记录。
- `generation_group_key`、需求组类型和补料单号属于查询时追溯投影，必须经 `demand_id` 关联需求事实取得；不得为展示便利在本表复制并双写。

当前 Production 实施口径：创建单据只允许写入 `pending_picking`，不生成库存流水；整单确认执行
`pending_picking -> completed` 并为每条明细生成一条负数 `production_material_outbound` 流水；取消执行
`pending_picking -> cancelled` 且不生成流水。`picked`、`partially_outbound` 只保留在数据库稳定代码集合中，
当前不开放操作入口，也不支持单据分批确认。

数量汇总必须连接父单状态：已确认出库量只汇总 `outbound_order.status = 'completed'` 的明细；
`pending_picking` 明细只占用待制单额度，`cancelled` 明细不占用。可制单数量为“分配数量 - 已确认出库量 -
待确认单据占用量”，仍可实际出库数量为“分配数量 - 已确认出库量”。

---

批次结束将未履约出库、分配、需求和补料一并结束，保留原履约事实；具体状态、锁序和取消来源见[批次结束设计](production-termination.md)。

## 采购来源公开能力

`ProductionProcurementQuery` 是 Procurement 读取需求来源的唯一业务入口；需求事实和精确版本仍归 Production，采购不回写数量、关闭状态或履约。按需求采购接受全部需求类型，现有库存、有效分配和已关联采购均不作为候选门禁。每张按需采购固定单一工单，可选其多个任务的正式需求；无需先有生产产出。每条需求来源保持独立映射，采购行数量不分摊给需求。

- `listCandidates` 接收分页、关键词、工单 ID、任务 ID、物料 ID 与需求类型；按工单、任务、需求 ID 倒序返回平铺叶子。候选限定工单 `released/doing`，任务 `material_pending/material_assigned/material_partially_outbound/material_outbound/doing`，需求 `active`、剩余量大于零、无在审更正。通过 Product `listPurchasableByMaterials` 在计数和分页之前过滤基础物料／分类停用、软删除及已删除版本，精确版本停用仍可采购。
- `resolveDemands` 最多解析 100 个已选需求，按传入顺序返回 `{demandId,demand,eligible,blockedReason}`。历史工单、任务或需求已结束时仍返回原身份、需求快照及当前状态，只有不存在的 ID 才返回 `demand=null`；不能因翻页、筛选或新下单资格失效而丢掉已有选择。
- `requirePurchasableDemands` 要求调用方已有活跃同池事务。先普通读取来源定位，再按数字 ID 升序依次对工单、任务、需求做共享锁当前读，锁后复核父子归属及生产资格；归属变化返回 `concurrent-modification`，资格失效返回 `not-purchasable`。该步骤不提前取得 Product 资格锁；采购在锁定自身根和行后再独立调用 Product 采购资格能力，所有来源复核和下单仍在同一事务。

公开结果包含工单／任务编号和状态、需求 ID／类型／业务状态／在审指针、物料与精确版本 ID、编码和单位快照、需求量与尚未领用量。数量保持整数字符串；物料名称只按稳定物料 ID 读取当前名称，不新增名称快照。`supplierHint` 按批量基础或研发需求行读取，采购展示逐条来源，不将提示当供应商限制。展示查询只读 `infrastructure/queries/procurement-demand.query.ts` 内已登记的 `materials.id/material_name`，锁定资格查询只读 Production 自有表。

跨模块失败采用 `ProductionProcurementResult` 稳定结果联合，成功为 `success/value`，失败为 `invalid-input/not-found/not-purchasable/concurrent-modification` 加消息及可选需求 ID；不导出内部领域错误。相关采购行、数量和采购单数由 Procurement 公开投影另行提供，本能力不直接查询采购表。

### 研发手工提需与候选

`GET /production/material-demands/material-options` 按关键词窗口返回 50 个存在启用版本的有效基础物料，并解析最多 100 个 `includeIds`；实际版本通过 Product 的启用版本公开能力读取。管理端候选归属手工提需弹窗，关键词与下拉刷新不覆盖已有输入，未知提交结果保留原请求及幂等键。

批量初配接口 `configurations` 使用 `production.material-demands.configure.v2`，完整提交 BOM 行及单一版本、数量、可选提示。手工 `additions` 使用 `production.material-demands.add-manual.v3`，每行按 `materialId` 选料、按 splits 提交版本/正整数数量及研发可选提示。研发 pending 可首次提需；后续状态沿活动任务规则，不改原始需求事实。换版先按需要独立关闭旧剩余，再另提新需求；同身份数量更正继续复用原审批替代链。

采购工单候选由 `ProductionProcurementQuery.listWorkOrders` 分页返回有当前合资格需求的工单；`listCandidates` 必须指定单一 `workOrderId`，`batchId` 非该工单任务时拒绝。锁内来源复核返回供应商提示但不修改需求；实际供应商与采购量仍归 Procurement。
