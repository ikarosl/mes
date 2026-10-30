# 生产需求、分配与领料出库

> [返回 Production 数据库设计](README.md)。

> 补料齐套只激活已有补产授权并刷新数量投影，不自动重开普通工序；执行与数量规则由[执行专题](execution-traceability-quality.md#cp-01-报工整改边界)维护，验证与验收见[路线图](../../../../../../../docs/roadmap.md#cp-01报工数量解耦与管理员批量冲销整改)。

公共字段、审计与数量遵守[数据库约定](../../../../../../../docs/database-conventions.md)。正常需求按 `need_number = quantity_per_unit_snapshot × planned_output_quantity_snapshot` 生成；乘积超过单条数量上限时拒绝。

## 3.5 生产物料需求与分配表

> `demand_type` 为 `normal/manual_additional/scrap_supplement`：批量初始 BOM 需求、手工提需、工序报废补料。研发初次与后续均为手工提需。领料损坏只登记真实损耗，不自动生成需求；更多用料由管理员独立提出。

核心设计原则：产品补产授权、正式物料需求和实际领料分别表达。工序报废补产授权按既有补料齐套闭环生效；实际领料损坏不修改原需求履约或补产额度、不再扣库存。人工新提需决定后续用料，批量保持本任务版本锁，研发可选择其他有效物料与版本。

### 物料办理资格

任务处于 `material_pending/material_assigned/material_partially_outbound/material_outbound/doing` 时，所有类型的有效活动需求均可分次分配、释放尚未出库预留、制单和确认领料；不要求全部需求齐套，不设置短批授权。需求更正在审、关闭、取消或已经履约时，继续按自身资格保护；库存批次、启用精确版本、可用库存、有效预留、待出库占用、数量及版本在事务内重新校验。

仓库候选与写入使用相同资格。普通剩余需求在任务执行中继续可见，不按需求类型或历史授权过滤。`outboundEligibility` 只返回可办理与阻断原因：尚无剩余有效分配为 `allocation_incomplete`，剩余分配全部被待出库单占用为 `no_orderable_allocation`；没有活动需求的任务退出候选。该投影不替代确认事务的锁内校验。

领料不决定任务开工。管理员开工的配置前提、缺料提示及存证见[任务开工](work-orders-and-batches.md#管理员任务开工与物料阶段)。批量与研发都可以先结束执行，剩余需求在收尾送审前履约、关闭或更正。停止办理后发现缺失操作，由管理员[撤回结束](production-termination.md#撤回结束与再次收尾)，再使用原有提需、分配和出库能力；不自动恢复已关闭需求。

首笔非全量确认领料将尚未开工的 `material_pending/material_assigned` 推进为 `material_partially_outbound`，当前活动需求全部完成确认领用后进入 `material_outbound`。任务已为 `doing` 时保持执行中。部分领料只是物流阶段，不构成精确物料产能；开工及报工不按领料减退料推算现场余额。

人工追加保留 `production_manual_demand_addition` 和 `production_item_demand` 来源，不创建损耗、补料单或产品补产授权，不增加计划与报工上限。确认出库复用同事务库存和需求履约，任务保持执行中；未满足追加需求在结案送审前处理。

工单类型、任务版本锁及并发顺序见[任务用料规则](work-orders-and-batches.md)。批量初配在任务内选版并冻结，不继承工单选版；后续追加和工序补料必须保持本任务版本。研发不依赖 BOM，不保存需求基础，每次手工提需明确有效物料、版本、数量及可选供应商提示。

### 9. `production_material_requirement_basis`

职责：保存批量任务确认初始需求时从 Product 获得的 BOM 公式，并冻结该任务的精确版本与供应商提示。它是数量基准和用料配置，不是可分配需求，不替代 `production_item_demand`；研发不写本表。

管理员一次确认全部 BOM 行的精确 `material_variant_id` 与数量；服务端要求命令完整覆盖，并在同一事务写入所有需求基础和初始需求；任一行不完整时不产生
部分事实。成功后批次从待配置状态进入 `material_pending`。创建任务或打开配置页面不会提前写需求基础；未确认行的展示 ID `${batchId}:${productMaterialId}` 不是基础表主键，此时 `requirementBasisId` 为空。BOM 基础和启用版本在写事务内重新读取
并锁定，避免版本停用与选择校验之间的竞态。

基础同时冻结物料编码、BOM 用量单位、单耗及任务计划量。

本表为不可变事实；BOM 内容只经 Product 公共快照取得。

**`production_material_requirement_basis` 字段定义**

| 字段 | SQL 定义 | 业务含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键，自增 |
| `production_batch_id` | `BIGINT UNSIGNED NOT NULL` | 生产批次 ID |
| `product_material_id` | `BIGINT UNSIGNED NOT NULL` | 冻结的产品 BOM 行 |
| `material_id` | `BIGINT UNSIGNED NOT NULL` | 基础物料 ID |
| `locked_material_variant_id` | `BIGINT UNSIGNED NOT NULL` | 本任务本物料唯一精确版本 |
| `supplier_hint` | `VARCHAR(500) NULL` | 随初配冻结的供应商或采购要求提示 |
| `material_code_snapshot` | `VARCHAR(100) NOT NULL` | 基础物料编码快照 |
| `unit_snapshot` | `VARCHAR(20) NOT NULL` | BOM 用量单位快照 |
| `quantity_per_unit_snapshot` | `INT NOT NULL` | 单件 BOM 用量快照 |
| `planned_output_quantity_snapshot` | `INT NOT NULL` | 批次计划产量快照 |
| `required_number` | `INT NOT NULL` | 该 BOM 行在本批次的初始应需量，锁定版本的初始正常需求量必须等于此值 |
| `created_by` | `BIGINT UNSIGNED NOT NULL` | 确认需求配置并创建基础记录的操作者，引用 `users.id` |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 基础记录创建时间 |

**`production_material_requirement_basis` 键、索引与检查约束**

| 类别 | 定义 |
| --- | --- |
| 主键 | `PRIMARY KEY (id)` |
| 外键 | `CONSTRAINT fk_material_requirement_basis_batch FOREIGN KEY (production_batch_id) REFERENCES production_batches(id)` |
| 外键 | `CONSTRAINT fk_material_requirement_basis_created_by FOREIGN KEY (created_by) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_material_requirement_basis_material FOREIGN KEY (material_id) REFERENCES materials(id)` |
| 外键 | `CONSTRAINT fk_material_requirement_basis_bom FOREIGN KEY (product_material_id, material_id) REFERENCES product_materials(id, material_id)` |
| 外键 | `CONSTRAINT fk_requirement_basis_locked_variant FOREIGN KEY (locked_material_variant_id,material_id) REFERENCES material_variants(id,material_id)` |
| 唯一键 | `UNIQUE KEY uk_material_requirement_basis_batch_bom ( production_batch_id, product_material_id )` |
| 唯一键 | `UNIQUE KEY uk_material_requirement_basis_reference ( id, production_batch_id, product_material_id, material_id )` |
| 唯一键 | `UNIQUE KEY uk_requirement_basis_batch_material (production_batch_id,material_id)` |
| 唯一键 | `UNIQUE KEY uk_requirement_basis_locked_reference (id,production_batch_id,product_material_id,material_id,locked_material_variant_id)` |
| 索引 | `KEY idx_material_requirement_basis_material ( material_id, production_batch_id, id )` |
| CHECK | `CONSTRAINT chk_material_requirement_basis_quantity CHECK ( quantity_per_unit_snapshot > 0 AND planned_output_quantity_snapshot > 0 AND required_number > 0 )` |
| CHECK | `CONSTRAINT chk_material_requirement_basis_integer CHECK ( quantity_per_unit_snapshot = TRUNCATE(quantity_per_unit_snapshot, 0) AND planned_output_quantity_snapshot = TRUNCATE(planned_output_quantity_snapshot, 0) AND required_number = TRUNCATE(required_number, 0) )` |
| CHECK | `CONSTRAINT chk_integer_storage_production_material_requirement_basis CHECK ( quantity_per_unit_snapshot BETWEEN 0 AND 99999999 AND planned_output_quantity_snapshot BETWEEN 0 AND 99999999 AND required_number BETWEEN 0 AND 99999999 )` |

**`production_material_requirement_basis` 数据库触发器**

| 触发器 | 时机 | 保护或维护范围 |
| --- | --- | --- |
| [trg_requirement_basis_mass_insert](../../../../../../../packages/database/migrations/202609200001-task-material-policy.up.sql) | `BEFORE INSERT` | 仅批量任务可建立 BOM 需求基础 |
| [trg_requirement_basis_immutable_update](../../../../../../../packages/database/migrations/202609200001-task-material-policy.up.sql) | `BEFORE UPDATE` | 需求基础全部字段不可改写 |
| [trg_requirement_basis_immutable_delete](../../../../../../../packages/database/migrations/202609200001-task-material-policy.up.sql) | `BEFORE DELETE` | 需求基础不可删除 |

#### 键、索引与引用关系

同任务的每个 BOM 行、每个基础物料各只有一份基础，锁定版本必须属于该物料。需求同时引用任务、BOM 行、基础物料和锁定版本；工序补料方案引用同一基础行。组合引用要求这些值来自同一行，不是分别判断 ID 存在，也不要求基础 ID 与物料 ID 相等。

例如某任务的基础行锁定物料 M 的版本 V1，则初始、人工追加、工序补料及更正创建的需求都只能引用 V1。研发的基础及 BOM 字段成组为空，不引用这条基础 FK；实际物料与版本组合 FK 始终有效。

#### CHECK 与冻结规则

数量公式和跨需求行合计由应用写事务保证，普通字段范围不能替代以下规则：

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

每次追加必须填写原因，明细与追加动作属于同一任务，共用该动作的稳定生成分组。

**`production_manual_demand_addition` 字段定义**

| 字段 | SQL 定义 | 业务含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键，自增 |
| `addition_no` | `VARCHAR(100) NOT NULL` | 追加单号，全局唯一 |
| `production_batch_id` | `BIGINT UNSIGNED NOT NULL` | 本次追加所属生产任务 |
| `reason` | `TEXT NOT NULL` | 非空人工追加原因 |
| `created_by` | `BIGINT UNSIGNED NOT NULL` | 操作人 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 操作时间 |

**`production_manual_demand_addition` 键、索引与检查约束**

| 类别 | 定义 |
| --- | --- |
| 主键 | `PRIMARY KEY (id)` |
| 外键 | `CONSTRAINT fk_manual_demand_addition_batch FOREIGN KEY (production_batch_id) REFERENCES production_batches(id)` |
| 外键 | `CONSTRAINT fk_manual_demand_addition_created_by FOREIGN KEY (created_by) REFERENCES users(id)` |
| 唯一键 | `UNIQUE KEY uk_production_manual_demand_addition_no (addition_no)` |
| 唯一键 | `UNIQUE KEY uk_production_manual_demand_addition_batch (id, production_batch_id)` |
| 索引 | `KEY idx_manual_demand_addition_batch_created ( production_batch_id, created_at, id )` |
| CHECK | `CONSTRAINT chk_production_manual_demand_addition_reason CHECK ( CHAR_LENGTH(TRIM(reason)) > 0 )` |

### 10. `production_item_demand`

职责：记住每个生产任务需要领什么、总共要多少、现在还差多少，是分配、出库和缺料预警共同使用的唯一需求清单。

该表保存不可变需求数量，并保存由确认出库事务同步维护、可从确认出库明细重建的剩余需求投影；不保存累计分配、退料或报废数量。物料基础、精确版本编码和单位随需求冻结；名称不保存快照，展示与搜索通过已登记的专用查询目录读取 `materials.id/material_name`，不以此替代 Product 的业务校验能力。正常需求从批次基础取得 BOM 快照，补料需求继承原需求的 BOM/基础物料快照；批量必须复用本任务锁定版本；研发不依赖 BOM，每次可选择任意有效物料及启用版本，BOM 专属字段全部为空。

`demand_type` 唯一区分生成原因。来源说明留在原单据，不能复制后分别修改。`need_number` 是原始需求事实，`remaining_number` 是确认出库维护的未领投影；退料、损耗不改写二者。`parent_demand_id` 表示补料的原始需求，不是更正链；更正链使用 `replaces_demand_id`。

约束：

- 需求、冻结基础、精确物料版本、补料父需求及补料单须保持同任务、同 BOM／物料来源；版本停用不抹除历史事实。
- `0 <= remaining_number <= need_number`；active 剩余大于零，fulfilled 剩余为零且完成事实齐全。取消状态必须有受控来源、原因、操作人和时间，其他状态不得填写取消字段。
- 正常需求没有补料父需求或补料单，BOM 数量快照须齐全且为正；人工追加只有追加动作来源；工序报废补料必须同时引用父需求和补料单。
- 每条需求的稳定幂等身份唯一且属于其生成分组，分组类型与生成原因一致；具体生成规则见下文。
- 原始补料需求按“补料单＋父需求”唯一；替代需求保留相同来源但不占此唯一槽位。直接前驱唯一以防更正分叉，同任务、物料、精确版本、单位及无环由更正事务核验。
- `pending_correction_id` 非空时需求仍须 active，当前与关闭更正指针均引用本需求的申请；实际在审、冻结版本和当前指针由 Approval 与 Production 同事务核验。
- closed 保留正的历史剩余，关闭原因、说明、操作人和时间齐全；更正／单条关闭只引用对应更正申请，收尾关闭只引用同任务结案根；非关闭状态不填这些字段。

以下累计数量通过查询计算，不作为需求表字段持久化：

| 查询数量             | 事实来源                                             |
| -------------------- | ---------------------------------------------------- |
| `allocated_quantity` | 由 `production_item_allocation.assigned_number` 汇总 |
| `outbound_quantity`  | 由 Inventory 已完成 `production_material` 公共出库事实汇总            |
| `returned_quantity`  | 由 Inventory `return_inbound` 的公共入库事实汇总                |
| `scrapped_quantity`  | 由 `item_scrap.scrap_number` 汇总                    |

说明：

- 物料版本是需求的精确库存身份；基础物料 `item_id` 只用于 BOM 归属、汇总和兼容校验。
- 正式需求的 `need_number` 和已确认来源快照保持不变；补料新增需求，纠错采用审批后的关闭与替代，不原位改量。替代入口与事务规则见下文。
- 正常需求的 `need_number = quantity_per_unit_snapshot * planned_output_quantity_snapshot`；结果生成后作为事实保存，不随 BOM 或批次计划变化自动回写。
- 正常需求仅用于批量任务，必须一次覆盖全部 BOM 基础，每物料一个版本且数量等于 `required_number`；任一行不完整时整单回滚。研发 pending 阶段首次手工提需后进入 `material_pending`，后续沿同一手工入口追加。
- 同一配置命令由 `IdempotencyExecutor` 保护；重复提交只返回既有结果，不重新读取已确认事实或恢复旧的一键生成入口。补料和人工追加也必须走对应幂等命令。
- 正常需求按任务分组，工序报废补料按补料单分组，人工追加按任务和本次稳定动作身份分组；键格式由[领域构造器](../../domain/production-demand-generation-group.ts)维护。
- 逐条幂等键在分组键后追加稳定行来源：正常需求追加 `requirement_basis_id + material_variant_id`，工序报废补料追加 `parent_demand_id`，人工提需追加 `item_id + material_variant_id`。
- `business_action_no` 必须是一次人工追加动作的稳定唯一编号；相同幂等键重复提交时返回既有需求，不插入新记录，也不得修改既有 `need_number`。
- 人工追加以 `production_manual_demand_addition` 记录一次任务级动作，可包含多条需求；批量需求关联同任务冻结基础，研发不关联 BOM；人工需求均不填写 `parent_demand_id`。工序报废补料校验父需求属于同一批次，BOM 明细、物料及版本一致。
- 报废补料必须校验补料单、授权、原需求和新增需求属于同一生产批次，且 BOM 明细与物料一致。
- 需求事实与成功审计同事务写入。新增、关闭、取消及替代统一经过需求 Writer，并推进任务 `version`；每次确认出库按需求版本履约并推进任务版本，即使任务仍为部分领料或执行中，旧开工预览也须重新核对，不改写原需求量。
- 分配写命令一次只能处理一个需求，但允许同一需求在一个命令内拆分到多个库存批次；后端必须拒绝混合不同 `demand_id` 的聚合分配。需求列表按 `id ASC` 返回，管理端按 `generation_group_key` 分组，默认选中最早未完成组中的最早可分配需求，但不强制只能处理最早组或最早需求。
- 全部活动需求完成分配时批次从 `material_pending` 进入 `material_assigned`；释放尚未出库的有效分配并重新产生缺口时允许从 `material_assigned` 回到 `material_pending`。该回退只表达分配齐套状态变化，不得回到初始 `pending`，也不得重新开放正常需求生成。
- 确认出库在写出库明细、负库存流水和单据终态的同一事务中扣减涉及需求的 `remaining_number`；扣至 `0` 时写入 fulfilled 及最后一笔确认领料的人和时间。部分出库继续保持 `active`。
- `fulfilled` 属于需求持久化业务状态；需求列表的 `demandProgressStatus` 将其统一投影为 `outbound`。取消需求投影为 `cancelled`，活动需求才按分配量和已确认出库量计算其余进度。
- 生产退料只表示余料回仓，不创建或恢复需求，不改变 `remaining_number`、履约终态或任务阶段。损耗独立记录，额外用料通过手工提需。
- 物料供需预警只汇总 `active.remaining_number`，不扫描已满足需求的历史出库明细。
- 供需预警每行对应一个精确版本，只汇总该版本的活动需求。关键词命中该版本任一活动需求的物料编码、名称或版本编码后，应保留同版本全部活动需求；编码和单位取同版本 ID 最大的活动需求快照，名称使用当前物料名称。
- 供需缺口按精确版本计算，不同版本库存不能抵扣；分页按版本计数，具体公式和接口参数见[库存查询与可分配量](../../../inventory/docs/database/inventory-ledger-and-inbound.md#75-库存查询与可分配量)。
- 预警下钻同时限定基础物料和精确版本，返回活动需求的版本 ID、编码、需求类型、需求 ID、所属工单、生产任务、原始需求及工序补料/异常处置单据编号；来源身份、数量与业务资格读取 Production 事实；物料名称按已登记的展示查询读取当前名称，不以名称替代身份或资格。

**`production_item_demand` 字段定义**

| 字段 | SQL 定义 | 业务含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键，自增 |
| `production_batch_id` | `BIGINT UNSIGNED NOT NULL` | 生产批次 ID，关联 `production_batches.id` |
| `requirement_basis_id` | `BIGINT UNSIGNED NULL` | 批量冻结的 BOM 基础 ID，研发为空 |
| `product_material_id` | `BIGINT UNSIGNED NULL` | 批量 BOM 明细，研发为空 |
| `item_id` | `BIGINT UNSIGNED NOT NULL` | 需求对象 ID，关联 `materials.id` |
| `material_variant_id` | `BIGINT UNSIGNED NOT NULL` | 需求选中的精确物料版本 ID |
| `item_code_snapshot` | `VARCHAR(100) NOT NULL` | 生成需求时的物料编码快照 |
| `material_variant_code_snapshot` | `VARCHAR(180) NOT NULL` | 需求选中的版本编码快照 |
| `quantity_per_unit_snapshot` | `INT NULL` | 批量 BOM 单件用量快照，研发为空 |
| `unit_snapshot` | `VARCHAR(20) NOT NULL` | 生成需求时的用量单位快照 |
| `planned_output_quantity_snapshot` | `INT NULL` | 批量计算所用计划产量快照，研发为空 |
| `supplier_hint` | `VARCHAR(500) NULL` | 研发本次需求提示；批量为空，展示读取基础提示 |
| `need_number` | `INT NOT NULL` | 需求数量 |
| `remaining_number` | `BIGINT NOT NULL` | 尚未确认领用的整数数量，可从出库事实重建 |
| `demand_type` | `VARCHAR(30) NOT NULL DEFAULT 'normal'` | 需求类型，默认 `normal` |
| `generation_group_key` | `VARCHAR(150) NOT NULL` | 同一次需求生成动作的稳定分组键 |
| `idempotency_key` | `VARCHAR(150) NOT NULL` | 幂等键，同一键重复提交返回既有结果 |
| `parent_demand_id` | `BIGINT UNSIGNED NULL` | 工序报废补料关联的原始需求；人工追加为空 |
| `manual_addition_id` | `BIGINT UNSIGNED NULL` | 人工追加记录 ID；其他类型为空 |
| `supplement_id` | `BIGINT UNSIGNED NULL` | 补料物流单 ID，仅工序报废补料需求填写 |
| `business_status` | `VARCHAR(30) NOT NULL DEFAULT 'active'` | 业务状态，默认 `active` |
| `fulfilled_by` | `BIGINT UNSIGNED NULL` | 最后一笔确认领用操作人；未满足时为空 |
| `fulfilled_at` | `DATETIME NULL` | 需求全部确认领用时间；未满足时为空 |
| `cancel_source` | `VARCHAR(40) NULL` | 仅 `production_batch`，未执行任务取消 |
| `cancel_reason` | `TEXT NULL` | 未执行任务取消原因 |
| `cancelled_by` | `BIGINT UNSIGNED NULL` | 取消操作人 |
| `cancelled_at` | `DATETIME NULL` | 取消时间 |
| `pending_correction_id` | `BIGINT UNSIGNED NULL` | 当前在审申请指针，终态为空 |
| `replaces_demand_id` | `BIGINT UNSIGNED NULL` | 新需求的直接前驱，永久保留 |
| `close_cause` | `VARCHAR(30) NULL` | correction_replaced、correction_exhausted、single_close、batch_closeout |
| `close_reason` | `TEXT NULL` | 需求关闭说明 |
| `closed_by` | `BIGINT UNSIGNED NULL` | 需求关闭人，关联用户 |
| `closed_at` | `DATETIME NULL` | 需求关闭时间 |
| `close_correction_id` | `BIGINT UNSIGNED NULL` | 因正式需求更正而关闭的依据；与收尾依据互斥 |
| `closeout_id` | `BIGINT UNSIGNED NULL` | 因任务收尾而关闭的依据；与需求更正依据互斥 |
| `original_supplement_parent` | `BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN replaces_demand_id IS NULL THEN parent_demand_id ELSE NULL END) STORED` | 仅原始需求保留补料父需求唯一性 |
| `version` | `INT NOT NULL DEFAULT 0` | 乐观锁版本号，默认 `0` |
| `created_by` | `BIGINT UNSIGNED NOT NULL` | 创建人 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 创建时间 |
| `updated_by` | `BIGINT UNSIGNED NOT NULL` | 最近修改人 |
| `updated_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最近修改时间 |

**`production_item_demand` 键、索引与检查约束**

| 类别 | 定义 |
| --- | --- |
| 主键 | `PRIMARY KEY (id)` |
| 外键 | `CONSTRAINT fk_production_item_demand_batch FOREIGN KEY (production_batch_id) REFERENCES production_batches(id)` |
| 外键 | `CONSTRAINT fk_production_item_demand_parent FOREIGN KEY ( parent_demand_id, production_batch_id, product_material_id, item_id ) REFERENCES production_item_demand ( id, production_batch_id, product_material_id, item_id )` |
| 外键 | `CONSTRAINT fk_production_item_demand_supplement FOREIGN KEY ( supplement_id, production_batch_id ) REFERENCES production_material_supplement (id, production_batch_id)` |
| 外键 | `CONSTRAINT fk_production_item_demand_created_by FOREIGN KEY (created_by) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_production_item_demand_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_production_item_demand_fulfilled_by FOREIGN KEY (fulfilled_by) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_production_item_demand_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_production_item_demand_variant FOREIGN KEY (material_variant_id, item_id) REFERENCES material_variants(id, material_id)` |
| 外键 | `CONSTRAINT fk_production_item_demand_item FOREIGN KEY (item_id) REFERENCES materials(id)` |
| 外键 | `CONSTRAINT fk_production_item_demand_manual_addition FOREIGN KEY ( manual_addition_id, production_batch_id ) REFERENCES production_manual_demand_addition (id, production_batch_id)` |
| 外键 | `CONSTRAINT fk_demand_pending_correction FOREIGN KEY (pending_correction_id,id) REFERENCES production_demand_correction(id,old_demand_id)` |
| 外键 | `CONSTRAINT fk_demand_close_correction FOREIGN KEY (close_correction_id,id) REFERENCES production_demand_correction(id,old_demand_id)` |
| 外键 | `CONSTRAINT fk_demand_closeout FOREIGN KEY (closeout_id,production_batch_id) REFERENCES production_batch_closeout(id,production_batch_id)` |
| 外键 | `CONSTRAINT fk_demand_replacement FOREIGN KEY (replaces_demand_id) REFERENCES production_item_demand(id)` |
| 外键 | `CONSTRAINT fk_demand_closer FOREIGN KEY (closed_by) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_production_item_demand_material FOREIGN KEY (product_material_id,item_id) REFERENCES product_materials(id,material_id)` |
| 外键 | `CONSTRAINT fk_production_item_demand_basis FOREIGN KEY (requirement_basis_id,production_batch_id,product_material_id,item_id,material_variant_id) REFERENCES production_material_requirement_basis(id,production_batch_id,product_material_id,material_id,locked_material_variant_id)` |
| 唯一键 | `UNIQUE KEY uk_production_item_demand_idempotency (idempotency_key)` |
| 唯一键 | `UNIQUE KEY uk_production_item_demand_item_reference (id, item_id)` |
| 唯一键 | `UNIQUE KEY uk_production_item_demand_batch_reference (id, production_batch_id)` |
| 唯一键 | `UNIQUE KEY uk_production_item_demand_parent_reference ( id, production_batch_id, product_material_id, item_id )` |
| 唯一键 | `UNIQUE KEY uk_production_item_demand_variant_reference ( id, item_id, material_variant_id )` |
| 唯一键 | `UNIQUE KEY uk_production_item_demand_basis_reference ( id, production_batch_id, requirement_basis_id )` |
| 唯一键 | `UNIQUE KEY uk_demand_replacement (replaces_demand_id)` |
| 唯一键 | `UNIQUE KEY uk_demand_supplement_original (supplement_id,original_supplement_parent)` |
| 唯一键 | `UNIQUE KEY uk_production_item_demand_group_variant (generation_group_key,item_id,material_variant_id)` |
| 索引 | `KEY idx_production_item_demand_batch_status (production_batch_id, business_status)` |
| 索引 | `KEY idx_production_item_demand_parent (parent_demand_id)` |
| 索引 | `KEY idx_production_item_demand_supplement (supplement_id, business_status)` |
| 索引 | `KEY idx_production_item_demand_status_item (business_status,item_id,id)` |
| 索引 | `KEY idx_production_item_demand_cancelled_by (cancelled_by)` |
| 索引 | `KEY idx_production_item_demand_generation_group (production_batch_id, generation_group_key, id)` |
| 索引 | `KEY idx_production_item_demand_manual_addition (manual_addition_id)` |
| 索引 | `KEY idx_demand_pending (pending_correction_id,id)` |
| 索引 | `KEY idx_demand_close_correction (close_correction_id,id)` |
| 索引 | `KEY idx_demand_closeout (closeout_id,production_batch_id)` |
| CHECK | `CONSTRAINT chk_production_item_demand_version CHECK (version >= 0)` |
| CHECK | `CONSTRAINT chk_production_item_demand_quantities_integer CHECK ( quantity_per_unit_snapshot = TRUNCATE(quantity_per_unit_snapshot, 0) AND planned_output_quantity_snapshot = TRUNCATE(planned_output_quantity_snapshot, 0) AND need_number = TRUNCATE(need_number, 0) )` |
| CHECK | `CONSTRAINT chk_production_item_demand_remaining CHECK ( remaining_number>=0 AND remaining_number<=need_number )` |
| CHECK | `CONSTRAINT chk_production_item_demand_status CHECK (business_status IN ('active','fulfilled','cancelled','closed'))` |
| CHECK | `CONSTRAINT chk_production_item_demand_terminal CHECK ( (business_status='active' AND remaining_number>0 AND fulfilled_by IS NULL AND fulfilled_at IS NULL) OR (business_status='fulfilled' AND remaining_number=0 AND fulfilled_by IS NOT NULL AND fulfilled_at IS NOT NULL) OR (business_status IN ('cancelled','closed') AND fulfilled_by IS NULL AND fulfilled_at IS NULL) )` |
| CHECK | `CONSTRAINT chk_production_item_demand_cancel_facts CHECK ( (business_status='cancelled' AND cancel_source='production_batch' AND cancel_reason IS NOT NULL AND CHAR_LENGTH(TRIM(cancel_reason))>0 AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL) OR (business_status<>'cancelled' AND cancel_source IS NULL AND cancel_reason IS NULL AND cancelled_by IS NULL AND cancelled_at IS NULL) )` |
| CHECK | `CONSTRAINT chk_demand_pending CHECK (pending_correction_id IS NULL OR business_status='active')` |
| CHECK | `CONSTRAINT chk_demand_replacement CHECK (replaces_demand_id IS NULL OR demand_type IN ('manual_additional','scrap_supplement'))` |
| CHECK | `CONSTRAINT chk_demand_close CHECK ( (business_status='closed' AND remaining_number>0 AND close_cause IS NOT NULL AND close_reason IS NOT NULL AND CHAR_LENGTH(TRIM(close_reason))>0 AND closed_by IS NOT NULL AND closed_at IS NOT NULL AND ((close_cause IN ('correction_replaced','correction_exhausted','single_close') AND close_correction_id IS NOT NULL AND closeout_id IS NULL) OR (close_cause='batch_closeout' AND close_correction_id IS NULL AND closeout_id IS NOT NULL))) OR (business_status<>'closed' AND close_cause IS NULL AND close_reason IS NULL AND closed_by IS NULL AND closed_at IS NULL AND close_correction_id IS NULL AND closeout_id IS NULL) )` |
| CHECK | `CONSTRAINT chk_integer_storage_production_item_demand CHECK ( quantity_per_unit_snapshot BETWEEN 0 AND 99999999 AND planned_output_quantity_snapshot BETWEEN 0 AND 99999999 AND need_number BETWEEN 0 AND 99999999 )` |
| CHECK | `CONSTRAINT chk_production_item_demand_quantity CHECK (need_number>0)` |
| CHECK | `CONSTRAINT chk_demand_bom_source CHECK ( (requirement_basis_id IS NOT NULL AND product_material_id IS NOT NULL AND quantity_per_unit_snapshot IS NOT NULL AND planned_output_quantity_snapshot IS NOT NULL AND quantity_per_unit_snapshot>0 AND planned_output_quantity_snapshot>0 AND supplier_hint IS NULL) OR (requirement_basis_id IS NULL AND product_material_id IS NULL AND quantity_per_unit_snapshot IS NULL AND planned_output_quantity_snapshot IS NULL AND demand_type='manual_additional') )` |
| CHECK | `CONSTRAINT chk_production_item_demand_type CHECK (demand_type IN ('normal','manual_additional','scrap_supplement'))` |
| CHECK | `CONSTRAINT chk_production_item_demand_source CHECK ( (demand_type='normal' AND parent_demand_id IS NULL AND manual_addition_id IS NULL AND supplement_id IS NULL) OR (demand_type='manual_additional' AND parent_demand_id IS NULL AND manual_addition_id IS NOT NULL AND supplement_id IS NULL) OR (demand_type='scrap_supplement' AND parent_demand_id IS NOT NULL AND manual_addition_id IS NULL AND supplement_id IS NOT NULL) )` |
| CHECK | `CONSTRAINT chk_production_item_demand_generation_group_key CHECK ( idempotency_key LIKE CONCAT(generation_group_key, ':%') AND ((demand_type='normal' AND generation_group_key LIKE 'NORMAL:%') OR (demand_type='manual_additional' AND generation_group_key LIKE 'ADDITIONAL:%') OR (demand_type='scrap_supplement' AND generation_group_key LIKE 'SCRAPSUP:%')) )` |

**`production_item_demand` 数据库触发器**

| 触发器 | 时机 | 保护或维护范围 |
| --- | --- | --- |
| [trg_demand_task_policy_insert](../../../../../../../packages/database/migrations/202609200001-task-material-policy.up.sql) | `BEFORE INSERT` | BOM 来源字段组须匹配实际工单类型 |
| [trg_demand_material_facts_update](../../../../../../../packages/database/migrations/202609200001-task-material-policy.up.sql) | `BEFORE UPDATE` | 冻结来源、版本、原始数量、公式、单位及提示；履约状态仍由命令更新 |

#### 正式需求更正与替代

长期决策见 [ADR-0010](../../../../../../../docs/adr/0010-demand-correction-by-replacement.md)。Production 通过 `production.demand.correct` 场景接入通用 Approval，末级批准后统一改变需求和补料履约。

**提交更正申请 → 审批通过 → 关闭原需求未履约部分 → 创建有关联的替代需求。** 未确认的补料方案主单与明细仍可编辑；正式确认后的原方案、原需求数量及 BOM/单位/版本快照不回改。关闭只改变原需求的受控业务状态和关闭事实，不把原 `remaining_number` 清零伪装成已满足。

这里的补料更正资格按领料履约判断，不以“是否分配库存”判断：工序报废补料需求须仍为 `active`，且原补料单仍为 `approved`。普通已分配、部分已领料不单独阻断更正；在途出库、冻结／异常分配、待确认损耗及批次状态另行检查。界面分别说明需求类型、是否已领完及原补料单是否结束，不用“未齐套”笼统代替这些条件。

**关闭终态与审批中间态**

需求 `closed` 终态，表示主动结束剩余履约要求；`cancelled` 保留给未执行任务取消。关闭原因必须区分“更正并替代”“更正后无剩余”“单条关闭”和“随批次终止关闭”，页面不能全部只显示“人为关闭”。即使旧需求尚未领料，因录入错误被替代仍按更正原因关闭；不能只按已领量是否为零区分取消和关闭。

`replaces_demand_id` 位于新需求上，指向因同一生效更正而关闭的旧需求。因“更正并替代”关闭的需求须有且仅有一个有效后继；单条关闭、批次终止及更正后无剩余可以没有后继。连续更正时，中间需求保留自己原有的替代指针，同时可再次关闭并被后继替代；因此 `closed` 不等价于该行 `replaces_demand_id IS NOT NULL`。

仅冻结被更正的旧需求，不暂停整个生产任务。页面显示“更正审批中”，持久化履约状态仍为 `active`；可空的 `pending_correction_id` 指向 Production 所有的当前在审更正申请，由该申请关联通用审批实例。只保留一份当前在审关联，不另加可任意修改的冻结布尔值，也不把通用审批节点状态复制到需求表。

`pending_correction_id` 默认空，弹窗草稿不落库、不设置；正式送审时与创建/绑定审批实例同事务设置，要求旧需求仍为 `active` 且原指针为空。最终批准在关闭旧需求、生成可选替代需求的同一事务清空；驳回/撤回只在该字段仍指向本次申请时清空，不改变原剩余需求。非空指针必须关联同一旧需求的有效在审申请，关闭/履约等终态不得残留该指针。清空当前指针不删除历史：更正申请中的旧需求、可选新需求、审批实例和生效记录永久保留；`replaces_demand_id` 也不随审批结束清除。

| 场景 | 对审批中旧需求的处理 |
| --- | --- |
| 分配、释放、制单、确认出库、再次更正、普通关闭 | 禁止；候选查询及后端写入共同检查 `active` 且无在审更正，再叠加各入口原有资格条件 |
| 补料履约与对应补产授权生效 | 在审要求仍是未解决需求，不能因为它退出可操作候选就视为已满足或激活对应补产额度 |
| 任务开工、结束执行与结案送审 | 未解决需求不构成开工或结束执行的齐套门禁；结案送审前仍须处理在途更正及剩余物料事项 |
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

齐套须核对本单全部需求及生效更正关系，不能只检查“没有活动需求”或跳过所有 `cancelled/closed` 记录。

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

工序开始、报工、完成与重开各有资格，补料齐套不驱动工序状态；完整规则见[生产执行](execution-traceability-quality.md#423-数量与并发约束)。

旧需求关闭、新需求生成、补料齐套重算及其授权激活影响必须包含在同一批准事务内，沿统一锁序重新校验；禁止先提交关闭再异步创建替代需求，避免中间状态误放行或并发领料改变审批依据。更正不重建报废事实或补产授权，只处理满足批准履约条件的既有授权。更正预览对新剩余为零的情形模拟本单齐套、激活授权量和统一上限；新剩余为正时必须先领齐。预览与实际推进共用 `calculateRouteStepQuantities` 及统一补料履约能力。

追溯保留全部原方案、旧/新需求、逐次审批及真实领退料；当前缺口继续按活动需求的精确版本计算。业务汇总识别替代链的当前要求和历史履约，不能把各历史版本的总需求重复计入。替代需求继承 `manual_addition_id` 或原 `supplement_id/parent_demand_id`，生成分组以原来源键追加 `:CORRECTION:<申请ID>`，逐行幂等键同时包含更正动作；不回写已确认人工追加单或补料方案。

#### `production_demand_correction`

批准证据记录授权激活量与统一上限，不包含重开工序结果；结构版本由[审批快照契约](../../application/production-approval-snapshot.schema.ts)维护，历史证据不得猜测转换。

一行是一次正式更正送审及其生效结果。不保存可任意修改的执行需求副本，也不复制 Approval 节点状态。页面草稿只在本地；提交事务内创建记录并绑定审批，未配置流程或提交失败整体回滚，不留下游离草稿。

每份更正与审批一对一，同一原需求同时至多一份未结束申请。证据冻结来源、原方案、需求链、预留、已领和补产影响，并保存核对指纹；结果只记录本次实际齐套的补料单，不保存工序重开结果。驳回／撤回只记录流程结束，不产生生效人、时间或新需求。

未生效时新需求、生效人／时间和结果全空；生效时审批、结束时间、结果必填，新剩余为零则无新需求，否则必须有新需求。行内 CHECK、外键和唯一键防止结构冲突；来源同身份、审批真实在审、旧关闭与后继一致、无环及不可改写来源由受控事务共同保证。

接口前缀 `/api/production/material-demands/:demandId`：GET `/correction-check` 返回最新依据、版本和令牌；GET `/corrections` 沿前后继返回完整申请历史；POST `/corrections` 要求 `production:materials:correct-demand`、`Idempotency-Key` 及版本、令牌、处理方式、目标总量、原因。读取接受需求查看、物料查看或任务查看权限之一。写结果仅包含申请对象 ID 与审批 ID；scope 与结果定义见[应用幂等契约](../../application/idempotency/)。

审批绑定／解除只推进需求及更正记录版本；末级批准推进任务版本。先锁工单、任务、申请和旧需求，再读取来源及物流事实；最终核对排除本次绑定的版本变化，其余依据变化要求重新送审。批准、关闭／替代、补料履约、审计及通知同事务，原库存流水不变。

更正依据中的预留批号通过 Inventory 公开 `materialBatchReferences` 批量读取，仅用于展示及冻结原有证据；分配和损耗资格读取并锁定 Production 自有事实，已领与退料事实通过 Inventory 公开当前读取得。更正查询不得通过跨库存 JOIN 的 `FOR SHARE` 锁住 `item_batch`，也不使用该公开展示返回的余额或批次状态替代更正业务校验。

**`production_demand_correction` 字段定义**

| 字段 | SQL 定义 | 业务含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY` | 主键，自增 |
| `old_demand_id` | `BIGINT UNSIGNED NOT NULL` | 本次被更正的原需求 |
| `production_batch_id` | `BIGINT UNSIGNED NOT NULL` | 原需求所属任务 |
| `correction_kind` | `VARCHAR(20) NOT NULL` | 仅人工追加开放普通关闭；补料以数量更正明确解除剩余 |
| `target_total_quantity` | `BIGINT UNSIGNED NOT NULL` | 更正后的目标总量，不小于替代链已领量 |
| `issued_quantity` | `BIGINT UNSIGNED NOT NULL` | 替代链累计实际已领量 |
| `old_remaining_quantity` | `BIGINT UNSIGNED NOT NULL` | 更正前的正剩余量 |
| `new_remaining_quantity` | `BIGINT UNSIGNED NOT NULL` | 目标总量减替代链已领量 |
| `reason` | `TEXT NOT NULL` | 更正／关闭说明 |
| `evidence` | `JSON NOT NULL` | 冻结的来源、需求链、预留、已领及补产影响 |
| `evidence_hash` | `CHAR(64) NOT NULL` | 冻结证据的 SHA-256 核对指纹 |
| `approval_instance_id` | `BIGINT UNSIGNED NULL` | 一次申请对应一次审批 |
| `new_demand_id` | `BIGINT UNSIGNED NULL` | 有剩余时的唯一后继 |
| `applied_by` | `BIGINT UNSIGNED NULL` | 实际生效人，未生效时为空 |
| `applied_at` | `DATETIME NULL` | 实际生效时间，未生效时为空 |
| `ended_at` | `DATETIME NULL` | 申请结束时间，驳回／撤回也填写 |
| `result_snapshot` | `JSON NULL` | 本次实际齐套的补料单 IDs；不保存重开工序 |
| `active_slot` | `TINYINT GENERATED ALWAYS AS (CASE WHEN ended_at IS NULL THEN 1 ELSE NULL END) STORED` | ended_at 为空时为 1，UNIQUE(old_demand_id,active_slot) 防冲突申请 |
| `created_by` | `BIGINT UNSIGNED NOT NULL` | 创建人 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 创建时间 |
| `updated_by` | `BIGINT UNSIGNED NULL` | 最近修改人 |
| `updated_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最近修改时间 |
| `version` | `INT NOT NULL DEFAULT 0` | 乐观锁版本 |

**`production_demand_correction` 键、索引与检查约束**

| 类别 | 定义 |
| --- | --- |
| 主键 | `PRIMARY KEY (id)` |
| 外键 | `CONSTRAINT fk_correction_demand FOREIGN KEY (old_demand_id,production_batch_id) REFERENCES production_item_demand(id,production_batch_id)` |
| 外键 | `CONSTRAINT fk_correction_successor FOREIGN KEY (new_demand_id,production_batch_id) REFERENCES production_item_demand(id,production_batch_id)` |
| 外键 | `CONSTRAINT fk_correction_approval FOREIGN KEY (approval_instance_id) REFERENCES approval_instances(id)` |
| 外键 | `CONSTRAINT fk_correction_creator FOREIGN KEY (created_by) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_correction_updater FOREIGN KEY (updated_by) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_correction_applier FOREIGN KEY (applied_by) REFERENCES users(id)` |
| 唯一键 | `UNIQUE KEY uk_correction_active (old_demand_id,active_slot)` |
| 唯一键 | `UNIQUE KEY uk_correction_reference (id,old_demand_id)` |
| 唯一键 | `UNIQUE KEY uk_correction_approval (approval_instance_id)` |
| 唯一键 | `UNIQUE KEY uk_correction_successor (new_demand_id)` |
| 索引 | `KEY idx_correction_batch (production_batch_id,id)` |
| CHECK | `CONSTRAINT chk_correction_kind CHECK (correction_kind IN ('quantity','close'))` |
| CHECK | `CONSTRAINT chk_correction_quantities CHECK (target_total_quantity<=99999999 AND old_remaining_quantity>0 AND target_total_quantity>=issued_quantity AND new_remaining_quantity=target_total_quantity-issued_quantity AND (correction_kind<>'close' OR new_remaining_quantity=0))` |
| CHECK | `CONSTRAINT chk_correction_reason CHECK (CHAR_LENGTH(TRIM(reason))>0)` |
| CHECK | `CONSTRAINT chk_correction_version CHECK (version>=0)` |
| CHECK | `CONSTRAINT chk_correction_effect CHECK ( (applied_at IS NULL AND applied_by IS NULL AND new_demand_id IS NULL AND result_snapshot IS NULL) OR (applied_at IS NOT NULL AND applied_by IS NOT NULL AND ended_at IS NOT NULL AND approval_instance_id IS NOT NULL AND result_snapshot IS NOT NULL AND ((new_remaining_quantity=0 AND new_demand_id IS NULL) OR (new_remaining_quantity>0 AND new_demand_id IS NOT NULL))) )` |

#### 需求数量与进度查询

数量按 `demand_id` 及精确物料版本计算，不把同任务不同需求折叠成一个进度状态。实际领料来自 Inventory 公共事实。

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

工序报废的产品补产授权独立保存，关联补料要求全部有效履约后才生效；分配、部分领料或关闭需求均不能代替补料履约。

### 10.3 `production_scrap_supplement_plan` / `production_scrap_supplement_plan_line`

设计类型：可变业务方案主表及其可变明细。

职责：承载管理员在异常正式批准报废前暂存、重开和复核的补料方案。方案不是正式物料需求，不得进入分配、出库或库存计算；只有最终确认事务才把方案明细复制为 `production_item_demand(scrap_supplement)`，并同时生成报废事实、补产授权和补料物流单。

方案保存本次复核及最终审批说明，明细单位沿用原始正常需求。

数据库约束与应用规则：

- 方案与异常处置一对一，不用新增方案覆盖旧方案。
- 方案、处置、任务和工序保持同源；报工来源另匹配原报工，专检来源不填写报工 ID。
- `draft` 要求 `confirmed_supplement_id IS NULL`；`confirmed` 要求其非空且指向同批次 `production_material_supplement`。
- 每份方案的原始需求只出现一次，任务、BOM 明细及物料须与原需求一致。
- 草稿可整体替换明细，`confirmed` 后冻结。
- 草稿保存同时提交 `planVersion` 和 `dispositionVersion`，分别防止覆盖旧方案和基于过期异常暂存；保存不改变异常处置状态。保存与最终确认均在锁内通过任务用料能力校验每条物料必须使用本任务初配冻结版本，且版本仍启用；其他启用版本也不能暂存。最终确认命令及内部持久化端口仅接受方案 `version` 和 `dispositionVersion`，锁内读取已保存的方案明细和说明，不接收再次提交的批准明细；只有复核后的最终确认才生成正式事实，不提供绕过方案复核的直接批准入口。
- 草稿行不是需求事实，因此不写 `production_item_demand`、不产生幂等需求键，也不允许分配和出库。
- 最终确认必须锁定待处置异常及方案版本，重新校验处置来源有效（报工有效或已正式承接的专检量）、完整 BOM 需求基础、启用物料版本和数量；同一事务批准异常、创建工序报废事实、补产授权、补料单、正式需求，将方案转为 `confirmed` 并关联补料单，同时提交成功审计和 HTTP 幂等结果。
- 当前不计算或保存推荐补料数量。候选来自批次完整 BOM 基础，`planned_quantity` 完全由管理员填写；工序级定量 BOM 未定稿前不得用产品 BOM 总用量或异常数量自动推算。

补料候选契约 `ProductionSupplementCandidateItem` 的 `lockedMaterialVariantId` 明确读取 `production_material_requirement_basis.locked_material_variant_id`；`lockedMaterialVariantCode` 使用对应初始正常需求的版本编码快照，其含版本组合外键保证与冻结版本一致。`variants` 保留该物料当前完整启用版本目录供资格核验；目录包含其他版本不授予换版资格，冻结版本不在目录中表示当前不能补料，不自动选择替代版本。

状态机：

```text
draft -> confirmed
```

**`production_scrap_supplement_plan` 字段定义**

| 字段 | SQL 定义 | 业务含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键，自增 |
| `plan_no` | `VARCHAR(100) NOT NULL` | 方案编号，唯一 |
| `abnormal_disposition_id` | `BIGINT UNSIGNED NOT NULL` | 来源待处置异常 ID，唯一；同一异常只有一个当前方案 |
| `production_batch_id` | `BIGINT UNSIGNED NOT NULL` | 生产批次 ID |
| `batch_step_record_id` | `BIGINT UNSIGNED NOT NULL` | 异常上报工序执行节点 ID |
| `source_report_id` | `BIGINT UNSIGNED NULL` | 可空；报工来源关联异常报工，专检来源通过处置单追溯 |
| `status` | `VARCHAR(20) NOT NULL DEFAULT 'draft'` | `draft`、`confirmed` |
| `confirmed_supplement_id` | `BIGINT UNSIGNED NULL` | 最终确认后生成的补料物流单 ID；草稿为空 |
| `remark` | `TEXT NULL` | 方案及最终审批说明 |
| `version` | `INT NOT NULL DEFAULT 0` | 乐观锁版本号，默认 `0` |
| `created_by` | `BIGINT UNSIGNED NOT NULL` | 创建人 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 创建时间 |
| `updated_by` | `BIGINT UNSIGNED NOT NULL` | 最近修改人 |
| `updated_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最近修改时间 |

**`production_scrap_supplement_plan` 键、索引与检查约束**

| 类别 | 定义 |
| --- | --- |
| 主键 | `PRIMARY KEY (id)` |
| 外键 | `CONSTRAINT fk_production_scrap_supplement_plan_supplement FOREIGN KEY ( confirmed_supplement_id, production_batch_id ) REFERENCES production_material_supplement (id, production_batch_id)` |
| 外键 | `CONSTRAINT fk_production_scrap_supplement_plan_created_by FOREIGN KEY (created_by) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_production_scrap_supplement_plan_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_production_scrap_supplement_plan_disposition FOREIGN KEY(abnormal_disposition_id,production_batch_id,batch_step_record_id,source_report_id) REFERENCES batch_step_abnormal_dispositions(id,production_batch_id,batch_step_record_id,batch_step_report_id)` |
| 外键 | `CONSTRAINT fk_scrap_plan_disposition_step FOREIGN KEY(abnormal_disposition_id,production_batch_id,batch_step_record_id) REFERENCES batch_step_abnormal_dispositions(id,production_batch_id,batch_step_record_id)` |
| 唯一键 | `UNIQUE KEY uk_production_scrap_supplement_plan_no (plan_no)` |
| 唯一键 | `UNIQUE KEY uk_production_scrap_supplement_plan_disposition (abnormal_disposition_id)` |
| 唯一键 | `UNIQUE KEY uk_production_scrap_supplement_plan_supplement (confirmed_supplement_id)` |
| 唯一键 | `UNIQUE KEY uk_production_scrap_supplement_plan_batch_reference (id, production_batch_id)` |
| 索引 | `KEY idx_production_scrap_supplement_plan_batch_status ( production_batch_id, status, updated_at )` |
| CHECK | `CONSTRAINT chk_production_scrap_supplement_plan_status CHECK ( ( status = 'draft' AND confirmed_supplement_id IS NULL ) OR ( status = 'confirmed' AND confirmed_supplement_id IS NOT NULL ) )` |
| CHECK | `CONSTRAINT chk_production_scrap_supplement_plan_version CHECK (version >= 0)` |

**`production_scrap_supplement_plan_line` 字段定义**

| 字段 | SQL 定义 | 业务含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键，自增 |
| `plan_id` | `BIGINT UNSIGNED NOT NULL` | 所属方案 ID |
| `production_batch_id` | `BIGINT UNSIGNED NOT NULL` | 所属生产批次 ID |
| `original_demand_id` | `BIGINT UNSIGNED NOT NULL` | 选中的原始正常需求 ID |
| `requirement_basis_id` | `BIGINT UNSIGNED NOT NULL` | 当前批次冻结的 BOM 需求基础 ID |
| `product_material_id` | `BIGINT UNSIGNED NOT NULL` | BOM 明细 ID |
| `item_id` | `BIGINT UNSIGNED NOT NULL` | 物料 ID |
| `material_variant_id` | `BIGINT UNSIGNED NOT NULL` | 管理员确认的任务冻结精确物料版本 ID |
| `planned_quantity` | `INT NOT NULL` | 管理员填写并暂存的补料数量，必须大于 `0` |
| `unit_snapshot` | `VARCHAR(20) NOT NULL` | 原始正常需求的单位快照 |
| `created_by` | `BIGINT UNSIGNED NOT NULL` | 创建人 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 创建时间 |
| `updated_by` | `BIGINT UNSIGNED NOT NULL` | 最近修改人 |
| `updated_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最近修改时间 |

**`production_scrap_supplement_plan_line` 键、索引与检查约束**

| 类别 | 定义 |
| --- | --- |
| 主键 | `PRIMARY KEY (id)` |
| 外键 | `CONSTRAINT fk_production_scrap_supplement_plan_line_plan FOREIGN KEY ( plan_id, production_batch_id ) REFERENCES production_scrap_supplement_plan (id, production_batch_id)` |
| 外键 | `CONSTRAINT fk_production_scrap_supplement_plan_line_demand FOREIGN KEY ( original_demand_id, production_batch_id, product_material_id, item_id ) REFERENCES production_item_demand ( id, production_batch_id, product_material_id, item_id )` |
| 外键 | `CONSTRAINT fk_production_scrap_supplement_plan_line_created_by FOREIGN KEY (created_by) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_production_scrap_supplement_plan_line_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_scrap_supplement_plan_line_basis FOREIGN KEY (requirement_basis_id, production_batch_id, product_material_id, item_id) REFERENCES production_material_requirement_basis(id, production_batch_id, product_material_id, material_id)` |
| 外键 | `CONSTRAINT fk_scrap_supplement_plan_line_variant FOREIGN KEY (material_variant_id, item_id) REFERENCES material_variants(id, material_id)` |
| 外键 | `CONSTRAINT fk_scrap_supplement_plan_line_basis_demand FOREIGN KEY (original_demand_id,production_batch_id,requirement_basis_id) REFERENCES production_item_demand(id,production_batch_id,requirement_basis_id)` |
| 唯一键 | `UNIQUE KEY uk_production_scrap_supplement_plan_line_demand ( plan_id, original_demand_id )` |
| 索引 | `KEY idx_production_scrap_supplement_plan_line_batch ( production_batch_id, plan_id )` |
| CHECK | `CONSTRAINT chk_production_scrap_supplement_plan_line_quantity CHECK ( planned_quantity > 0 )` |
| CHECK | `CONSTRAINT chk_scrap_supplement_plan_line_quantity_integer CHECK (planned_quantity = TRUNCATE(planned_quantity, 0))` |
| CHECK | `CONSTRAINT chk_integer_storage_production_scrap_supplement_plan_line CHECK ( planned_quantity BETWEEN 0 AND 99999999 )` |

### 10.4 `production_material_supplement`

设计类型：可变业务单据。

职责：作为生产补料的统一物流主单，表达补料因何产生、属于哪个生产批次，以及其直接拥有的补料需求是否已经全部确认领用。它不重复保存物料、数量和单位明细；这些需求事实只保存在 `production_item_demand`。本表只承接工序报废补料；领料损坏独立登记，不生成补料单。

全部直接补料需求实际领齐时，由最后一笔确认领料记录齐套人和时间。

数据库约束：

- 一条工序报废事实只对应一张补料单；任务和工序必须与原报废事实一致。
- 只有 fulfilled 保存齐套人和时间；approved、cancelled 不填写完成事实。

状态机与来源规则：

```text
approved -> fulfilled / cancelled（仅批次结束）
```

- 本表状态只表达补料物流是否齐套，不表达异常审批结果、报废事实是否成立或产品补产授权是否存在。状态转换由最后一项补料确认领用事务触发，必须递增 `version`；终态不得通过通用更新接口恢复为 `approved`。
- `source_type = 'step_scrap_reproduction'`：管理员批准工序异常为报废时，同一事务创建工序报废事实、产品补产授权、本补料单以及一到多条 `scrap_supplement` 需求。候选来自当前批次冻结的完整 BOM 需求基础，不按发生报废的工序裁剪；管理员选择基础物料，确认本任务冻结版本仍启用并填写补料数量。
- 每张补料单创建时必须至少拥有一条 `business_status = 'active'` 且类型与 `source_type` 匹配的直接需求；后续齐套须按前述生效更正链判断全部当前要求。最后一项直接需求的已确认出库累计达到 `need_number` 时，同一事务把补料单转为 `fulfilled`，写入 `fulfilled_by/fulfilled_at`、递增 `version` 并记录成功审计。
- 工序报废补料单进入 `fulfilled` 后，对应 `batch_step_scrap_reproduction_authorization.authorized_quantity` 才进入路线数量公式，刷新各工序统一上限，不改变工序状态。

**`production_material_supplement` 字段定义**

| 字段 | SQL 定义 | 业务含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键，自增 |
| `supplement_no` | `VARCHAR(100) NOT NULL` | 补料单号，唯一 |
| `source_type` | `VARCHAR(40) NOT NULL DEFAULT 'step_scrap_reproduction'` | 来源类型：仅 `step_scrap_reproduction` |
| `step_scrap_record_id` | `BIGINT UNSIGNED NOT NULL` | 工序报废事实 ID；仅工序报废补产填写 |
| `production_batch_id` | `BIGINT UNSIGNED NOT NULL` | 所属生产批次 ID |
| `batch_step_record_id` | `BIGINT UNSIGNED NOT NULL` | 工序报废来源工序执行节点 ID |
| `status` | `VARCHAR(30) NOT NULL DEFAULT 'approved'` | 物流状态：`approved`、`fulfilled`、`cancelled` |
| `fulfilled_by` | `BIGINT UNSIGNED NULL` | 最后一项需求完成确认领用的操作人；未齐套时为空 |
| `fulfilled_at` | `DATETIME NULL` | 全部直接补料需求完成确认领用时间；未齐套时为空 |
| `remark` | `TEXT NULL` | 工序报废来源说明 |
| `version` | `INT NOT NULL DEFAULT 0` | 乐观锁版本号，默认 `0` |
| `created_by` | `BIGINT UNSIGNED NOT NULL` | 创建人 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 创建时间 |
| `updated_by` | `BIGINT UNSIGNED NOT NULL` | 最近修改人 |
| `updated_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最近修改时间 |

**`production_material_supplement` 键、索引与检查约束**

| 类别 | 定义 |
| --- | --- |
| 主键 | `PRIMARY KEY (id)` |
| 外键 | `CONSTRAINT fk_production_material_supplement_created_by FOREIGN KEY (created_by) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_production_material_supplement_fulfilled_by FOREIGN KEY (fulfilled_by) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_production_material_supplement_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_production_material_supplement_step_scrap FOREIGN KEY ( step_scrap_record_id,production_batch_id,batch_step_record_id ) REFERENCES batch_step_scrap_records(id,production_batch_id,batch_step_record_id)` |
| 唯一键 | `UNIQUE KEY uk_production_material_supplement_no (supplement_no)` |
| 唯一键 | `UNIQUE KEY uk_production_material_supplement_batch_reference (id, production_batch_id)` |
| 唯一键 | `UNIQUE KEY uk_production_material_supplement_step_scrap (step_scrap_record_id)` |
| 索引 | `KEY idx_production_material_supplement_batch_created (production_batch_id, created_at)` |
| 索引 | `KEY idx_production_material_supplement_fulfillment ( production_batch_id, status, batch_step_record_id )` |
| 索引 | `KEY idx_production_material_supplement_source_status (source_type, status, created_at)` |
| CHECK | `CONSTRAINT chk_production_material_supplement_version CHECK (version >= 0)` |
| CHECK | `CONSTRAINT chk_production_material_supplement_status CHECK ( (status IN ('approved','cancelled') AND fulfilled_at IS NULL AND fulfilled_by IS NULL) OR (status='fulfilled' AND fulfilled_at IS NOT NULL AND fulfilled_by IS NOT NULL) )` |
| CHECK | `CONSTRAINT chk_production_material_supplement_source CHECK ( source_type='step_scrap_reproduction' AND step_scrap_record_id IS NOT NULL AND batch_step_record_id IS NOT NULL )` |

### `batch_step_scrap_records` 与半自动补料

报废事实、产品补产授权及固定首工序起点由[执行专题](execution-traceability-quality.md#441-工序报废与补产授权)维护；本章维护[补料草稿](#103-production_scrap_supplement_plan--production_scrap_supplement_plan_line)、[物流主单](#104-production_material_supplement)及[有效履约](#正式需求更正与替代)。

物料候选取本任务完整 BOM 基础，不按异常工序裁剪，也不以异常数量乘 BOM 推算补料。管理员填写的是物料需求，产品补产量取独立授权。报废补料批准仅限执行中（`doing`）任务，须一次提交报废事实、授权、补料单与正式需求；全部有效需求领齐后只激活原授权，不重复创建授权、不重开工序。

---

### 11. `production_item_allocation`

职责：维护生产批次的物料分配明细，记录某条需求分配到了哪个库存批次以及分配数量。

分配代表业务预留。已分配但未出库的数量，应从可分配库存中扣除，避免其他生产批次抢占。

`active` 表示分配关系有效，不代表仍有库存预留；实际预留为 `max(assigned_number − 已确认出库量, 0)`。全部出库后分配仍可为 `active`，预留为零。`released` 表示主动解除分配，释放未出库部分并禁止继续沿该分配制单领料，不是“已领完”状态；原分配量、已确认出库及库存流水保持不变。普通释放入口要求尚未领料且无待出库单；受控需求更正、批次收尾可在处理待出库单后释放部分已领分配的剩余预留。收尾不要求释放已全部领料的正常有效分配，冻结或异常分配仍须核对处理。

分配时固定原需求的单位。

分配的任务、物料及精确版本必须与需求一致，库存批次身份也须匹配。Inventory 领退料明细通过完整组合引用固定该分配的需求、任务、基础物料、精确版本和原库批，不能分别拼接存在但不同源的 ID。

以下累计数量通过查询计算，不作为分配表字段持久化：

| 查询数量            | 事实来源                  |
| ------------------- | ------------------------- |
| `outbound_quantity` | 由 Inventory 已完成 `production_material` 公共出库事实汇总 |
| `returned_quantity` | 由 Inventory `return_inbound` 公共入库事实汇总 |
| `scrapped_quantity` | 由 `item_scrap` 汇总      |

说明：

- `assigned_number` 是分配事实，不是缓存字段，应保留。
- `allocation_status = released` 或 `cancelled` 时，不应继续占用可分配库存。

**`production_item_allocation` 字段定义**

| 字段 | SQL 定义 | 业务含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键，自增 |
| `demand_id` | `BIGINT UNSIGNED NOT NULL` | 需求 ID，关联 `production_item_demand.id` |
| `production_batch_id` | `BIGINT UNSIGNED NOT NULL` | 生产批次 ID，冗余保存，便于查询和约束 |
| `item_id` | `BIGINT UNSIGNED NOT NULL` | 库存对象 ID，冗余保存，用于约束需求对象与批次对象一致（materials 表） |
| `material_variant_id` | `BIGINT UNSIGNED NOT NULL` | 精确物料版本 ID，必须与需求和库存批次一致 |
| `batch_id` | `BIGINT UNSIGNED NOT NULL` | 分配的库存批次 ID，关联 `item_batch.id` |
| `assigned_number` | `INT NOT NULL` | 分配数量 |
| `unit_snapshot` | `VARCHAR(20) NOT NULL` | 分配时单位快照 |
| `allocation_status` | `VARCHAR(30) NOT NULL DEFAULT 'active'` | 分配业务状态，默认 `active` |
| `version` | `INT NOT NULL DEFAULT 0` | 乐观锁版本号，默认 `0` |
| `remark` | `TEXT NULL` | 备注 |
| `created_by` | `BIGINT UNSIGNED NULL` | 创建人 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 创建时间 |
| `updated_by` | `BIGINT UNSIGNED NULL` | 最近修改人 |
| `updated_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最近修改时间 |

**`production_item_allocation` 键、索引与检查约束**

| 类别 | 定义 |
| --- | --- |
| 主键 | `PRIMARY KEY (id)` |
| 外键 | `CONSTRAINT fk_production_item_allocation_demand_item FOREIGN KEY (demand_id, item_id) REFERENCES production_item_demand(id, item_id)` |
| 外键 | `CONSTRAINT fk_production_item_allocation_demand_batch FOREIGN KEY (demand_id, production_batch_id) REFERENCES production_item_demand(id, production_batch_id)` |
| 外键 | `CONSTRAINT fk_production_item_allocation_created_by FOREIGN KEY (created_by) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_production_item_allocation_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_production_item_allocation_demand_variant FOREIGN KEY ( demand_id, item_id, material_variant_id ) REFERENCES production_item_demand(id, item_id, material_variant_id)` |
| 外键 | `CONSTRAINT fk_production_item_allocation_stock_batch FOREIGN KEY (batch_id,item_id) REFERENCES item_batch(id,item_id)` |
| 外键 | `CONSTRAINT fk_production_item_allocation_batch_variant FOREIGN KEY (batch_id,item_id,material_variant_id) REFERENCES item_batch(id,item_id,material_variant_id)` |
| 唯一键 | `UNIQUE KEY uk_production_item_allocation_id_demand (id, demand_id)` |
| 唯一键 | `UNIQUE KEY uk_production_item_allocation_id_batch (id, production_batch_id)` |
| 唯一键 | `UNIQUE KEY uk_production_item_allocation_id_item (id, item_id)` |
| 唯一键 | `UNIQUE KEY uk_production_item_allocation_reference (id, demand_id, production_batch_id, item_id, batch_id)` |
| 唯一键 | `UNIQUE KEY uk_production_item_allocation_variant_reference ( id, demand_id, production_batch_id, item_id, batch_id, material_variant_id )` |
| 索引 | `KEY idx_production_item_allocation_batch_status (production_batch_id, allocation_status)` |
| 索引 | `KEY idx_production_item_allocation_stock_batch (batch_id, allocation_status)` |
| CHECK | `CONSTRAINT chk_production_item_allocation_quantity CHECK (assigned_number > 0)` |
| CHECK | `CONSTRAINT chk_production_item_allocation_status CHECK (allocation_status IN ('active','released','cancelled','frozen','abnormal'))` |
| CHECK | `CONSTRAINT chk_production_item_allocation_version CHECK (version >= 0)` |
| CHECK | `CONSTRAINT chk_production_item_allocation_quantity_integer CHECK (assigned_number = TRUNCATE(assigned_number, 0))` |
| CHECK | `CONSTRAINT chk_integer_storage_production_item_allocation CHECK ( assigned_number BETWEEN 0 AND 99999999 )` |

#### 分配数量查询

实际领料与待出库占用均来自 Inventory 公共单据：

- 已出库量：只汇总主单为 `completed` 的出库明细。
- 待出库占用：只汇总 `production_material` 主单为 `pending_picking` 的有效明细；人工其他出库不参与分配履约。
- `remainingOutboundQuantity = max(assigned_number - 已出库量, 0)`。
- `availableToOrderQuantity = max(assigned_number - 已出库量 - 待出库占用, 0)`。
- 当前退料全部释放到公共库存，不加回原分配的可制单量；已领物料损耗也不再次扣减原分配可制单量，新增用料通过独立人工提需。

上述数量不替代需求、分配、库存批次状态的写入校验。分配已释放或取消时，即使历史数量计算仍有余额，也不得据此制单。库存预留口径见[库存查询与可分配量](../../../inventory/docs/database/inventory-ledger-and-inbound.md#75-库存查询与可分配量)。

---

## 3.6 生产领料出库表

`outbound_order/detail` 由 Inventory 唯一拥有；生产领料限定 `source_type=production_material`，公共字段、外键、审计及不可变守卫见 [Inventory 数据库](../../../inventory/docs/database.md)。Production 拥有任务、需求和分配来源资格，并编排制单、确认、取消及履约；不能直接写入或锁定公共主从。

一单一个任务及工单，可以包含该任务多个生成组、需求、物料和原库存批次，每分配同单一行。按生成组展示候选但允许跨组，整单确认／取消；不同时间交接的物料另行制单。需求组类型、分组键及补料单号从 `demand_id` 追溯，不在公共明细复制。

制单与确认按[物料办理资格](#物料办理资格)校验启用精确版本、有效需求及分配、任务阶段与数量。创建仅 `pending_picking`，占可制单量但不写流水；整单确认 `pending_picking → completed`，每条有效明细生成匹配的负数 `production_material_outbound` 流水，引用 `outbound_detail.id`。取消仅 `pending_picking → cancelled`，无流水；来源 `manual/production_batch/production_termination` 分别表达人工、任务取消和收尾取消，并保存原因、人和时间。不保留 `picked/partially_outbound` 或部分确认状态。

Production 先锁任务、需求和分配，经 `InventoryProductionDocumentCommand` 锁内读取、创建／确认／取消公共单据；Inventory 核对自有身份、库存状态及余额，追加流水并完成父单。涉及需求的 `remaining_number` 扣减、履约终态、任务状态与版本、补料齐套、来源成功审计及已启用 HTTP 幂等结果仍一起提交。失败整体回滚，不把库存确认与需求履约拆成两次提交。

已完成量只计 `production_material+completed`，待确认占用只计 `production_material+pending_picking`，取消不占用。可制单量为 `assigned_number − 已完成量 − 待确认占用`，剩余可领量为 `assigned_number − 已完成量`；退料和人工其他出入库均不恢复原履约。只读列表、详情、打印和追溯由已登记展示查询访问公共单据，不能用于后续写资格。

批次取消及收尾只经 Inventory 取消未完成生产领料，保留原明细及已领事实；阶段和前置条件见[批次结束设计](production-termination.md)。

### HTTP 权限与消费者

以下路径省略 `/api/production`。权限目录的来源、分组和发布规则见 [Identity](../../../identity/docs/database.md#14-permissions)；页面／宿主读取与写动作分别鉴权。

| 接口 | 权限（多项为 any-of） | 消费者与边界 |
| --- | --- | --- |
| `GET /batches/:batchId/material-demands` | `production:materials:view`、`production:tasks:view`、`production:material-demands:view` | 生产任务的需求总览、分配与领料弹窗、需求变更追溯；需求查看为任务内嵌能力，不提供独立需求管理页 |
| `GET /material-demands`、`GET /material-demands/material-options` | `production:material-demands:view`、`production:tasks:view` | 生产任务内嵌的初配、手工提需及研发候选；分页查询可按任务过滤，不因内嵌入口改为浏览器全量筛选 |
| `GET /material-demands/:demandId/available-item-batches` | `production:materials:view`、`production:tasks:view` | 任务分配弹窗的库批参考，不是独立库存页读取，也不授予分配写入 |
| `GET /batches/:batchId/material-outbounds` | `production:materials:view`、`production:tasks:view` | 生产任务内嵌领料记录，不作为仓储出库列表 |
| `GET /material-outbounds`、`GET /material-outbounds/:outboundId` | `warehouse:outbound:view` | 仓储生产领料列表、详情与打印；无需生产任务或需求页面权限 |
| `GET /material-outbounds/batch-options`、`GET /batches/:batchId/material-outbound-candidates` | `warehouse:outbound:view` | 仓储制单的任务候选及该任务可制单分配；不调用任务详情、需求列表或分配命令补齐数据 |
| `POST /batches/:batchId/material-allocations`、`POST /batches/:batchId/material-allocations/:allocationId/actions/release` | `production:materials:allocate` | 创建分配／释放未出库预留；仓储出库查看与动作不包含本能力 |
| `POST /batches/:batchId/material-outbounds` | `warehouse:outbound:create` | 仓储制单和生产任务内嵌制单共用；来源校验和履约仍由 Production 编排 |
| `POST /material-outbounds/:outboundId/actions/confirm` | `warehouse:outbound:confirm` | 整单确认出库 |
| `POST /material-outbounds/:outboundId/actions/cancel` | `warehouse:outbound:cancel` | 取消待出库单，不释放来源分配 |

需求更正的读取和写入权限由[正式需求更正](#正式需求更正与替代)维护；初配与手工提需写命令继续分别要求 `production:material-demands:configure` 与 `production:material-demands:add-manual`。只读 any-of 不授予任一写动作，仓管只需仓储出库查看及对应动作即可办理有效分配的制单、确认和取消；查看缺口或处理分配须独立取得生产能力。查看采购、库存或质检详情的导航继续校验目标页面权限，不由出库查看隐式授权。

### 当前有效预留公开能力

`ProductionReservationQuery.currentAllocations(batchIds)` 是其他出库取得预留事实的唯一运行时入口，返回有效分配的 `id/batchId/assignedNumber/allocationStatus`，排除 `released/cancelled`。要求调用者活跃同池事务，按分配 ID 排序，以 `FOR SHARE NOWAIT` 只锁 Production 自有分配，不读取或锁定公共出库，不验证来源任务办理资格，也不修改分配。

Inventory 经 API 组合根适配器取得这些值，再用自己当前已完成生产领料计算逐分配 `max(assigned−issued,0)` 并汇总库批预留。新增或增量分配先持目标库存批次锁；跨任务预留与公共出库余额当前读同样使用 NOWAIT，冲突整体回滚。运行时反向协作仅限这些只读值，完整事务、锁序与有限重试由[库存协作协议](../../../../../../../docs/inventory-extraction-design.md#7-事务与锁序)维护。

## 采购来源公开能力

`ProductionProcurementQuery` 是 Procurement 读取需求来源的唯一业务入口；需求事实和精确版本仍归 Production，采购不回写数量、关闭状态或履约。按需求采购接受全部需求类型，现有库存、有效分配和已关联采购均不作为候选门禁。每张按需采购固定单一工单，可选其多个任务的正式需求；无需先有生产产出。每条需求来源保持独立映射，采购行数量不分摊给需求。

- `listCandidates` 接收分页、关键词、工单 ID、任务 ID、物料 ID 与需求类型；按工单、任务、需求 ID 倒序返回平铺叶子。候选限定工单 `released/doing`，任务 `material_pending/material_assigned/material_partially_outbound/material_outbound/doing`，需求 `active`、剩余量大于零、无在审更正。通过 Product `listPurchasableByMaterials` 在计数和分页之前过滤基础物料／分类停用、软删除及已删除版本，精确版本停用仍可采购。
- `resolveDemands` 最多解析 100 个已选需求，按传入顺序返回 `{demandId,demand,eligible,blockedReason}`。历史工单、任务或需求已结束时仍返回原身份、需求快照及当前状态，只有不存在的 ID 才返回 `demand=null`；不能因翻页、筛选或新下单资格失效而丢掉已有选择。
- `requirePurchasableDemands` 要求调用方已有活跃同池事务。先普通读取来源定位，再按数字 ID 升序依次对工单、任务、需求做共享锁当前读，锁后复核父子归属及生产资格；归属变化返回 `concurrent-modification`，资格失效返回 `not-purchasable`。该步骤不提前取得 Product 资格锁；采购在锁定自身根和行后再独立调用 Product 采购资格能力，所有来源复核和下单仍在同一事务。

公开结果包含工单／任务编号和状态、需求 ID／类型／业务状态／在审指针、物料与精确版本 ID、编码和单位快照、需求量与尚未领用量。数量保持整数字符串；物料名称只按稳定物料 ID 读取当前名称，不新增名称快照。`supplierHint` 按批量基础或研发需求行读取，采购展示逐条来源，不将提示当供应商限制。展示查询只读 `infrastructure/queries/procurement-demand.query.ts` 内已登记的 `materials.id/material_name`，锁定资格查询只读 Production 自有表。

跨模块失败采用 `ProductionProcurementResult` 稳定结果联合，成功为 `success/value`，失败为 `invalid-input/not-found/not-purchasable/concurrent-modification` 加消息及可选需求 ID；不导出内部领域错误。相关采购行、数量和采购单数由 Procurement 公开投影另行提供，本能力不直接查询采购表。

### 研发手工提需与候选

`GET /production/material-demands/material-options` 按关键词窗口返回 50 个存在启用版本的有效基础物料，并解析最多 100 个 `includeIds`；实际版本通过 Product 的启用版本公开能力读取。管理端候选归属手工提需弹窗，关键词与下拉刷新不覆盖已有输入，未知提交结果保留原请求及幂等键。

批量初配 `configurations` 完整提交 BOM 行及单一版本、数量、可选提示。手工 `additions` 按物料提交版本拆分、正整数数量及研发可选提示；两类命令均使用 HTTP 幂等。研发 pending 可首次提需，后续按活动任务规则办理，不改原始需求事实。换版先按需要独立关闭旧剩余，再另提新需求；同身份数量更正继续复用原审批替代链。

采购工单候选由 `ProductionProcurementQuery.listWorkOrders` 分页返回有当前合资格需求的工单；`listCandidates` 必须指定单一 `workOrderId`，`batchId` 非该工单任务时拒绝。锁内来源复核返回供应商提示但不修改需求；实际供应商与采购量仍归 Procurement。
