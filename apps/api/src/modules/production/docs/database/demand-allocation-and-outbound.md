# 生产需求、分配与领料出库

> [返回 Production 数据库设计](README.md)。

本章所有单位用量快照、计划产量快照、需求、补料、分配和出库数量均使用 `INT` 保存正整数，数据库 `CHECK` 保证正负边界和上限。正常需求使用整数乘法 `need_number = quantity_per_unit_snapshot × planned_output_quantity_snapshot`；结果超过 业务允许的最大整数 `99999999` 时必须拒绝，禁止浮点计算、舍入或截断。

## 3.5 生产物料需求与分配表

> `demand_type` 已从历史数字迁移为字符串。当前设计使用 `normal/manual_additional/scrap_supplement/material_loss_supplement` 四种产生规则；工序报废补料和生产领料损耗补料均由补料单直接生成新需求，不修改原需求，也不再维护与需求重复的补料明细。工序报废批准时写入不可变补产授权，只有对应补料单的全部当前有效要求满足并进入 `fulfilled` 后，该授权才成为可执行额度；生产领料损耗补料只恢复实物，不产生或增加产品补产额度。

核心设计原则：系统将“生产授权上限”与“现场物料可用量”解耦。授权只控制生产批次允许生产的产品数量，不因确认领料后的现场损耗动态回收额度；实际物料损耗通过“损耗报废 → 损耗补料 → 物料需求 → 分配与出库”独立闭环处理。该取舍用于控制轻量 MES 的状态维护成本：系统不建立授权额度与每一份现场物料的实时占用、回收或消费映射，也不得为了物料损耗修改 `authorized_quantity`、回退已齐套工序报废补料单或收缩已经形成的产品可报上限。现场缺料由实物条件和待完成损耗补料物流约束，不能通过重复申请产品补产授权解决。

同一原则适用于短批开工：部分领料后的管理授权只表示允许承担当前缺料风险开始生产，不形成精确的物料可生产数量，也不增加基于物料的报工上限。系统必须持续展示活动需求缺口，并允许开工后继续分配和领用；报工仍只受产品流转额度约束。如果未来要把已领物料作为报工硬门槛，必须先建立可审计的现场物料事务、余额和自动耗料/冲销模型，禁止直接以仓库出库量近似现场可用量。短批授权还必须保存批次当前 `material_plan_version`；只有需求计划变化才通过版本使旧授权失效，继续确认出库只改善缺口。余料退回不改变需求、履约数量或计划版本，不作废授权；短批授权与开工完全不考虑退料，既不扣减领料事实，也不以净领用量作为门槛或需求余额。该字段只属于批次授权并发控制，不能下沉为需求版本；需求是否有效仍由 `business_status` 和 `remaining_number` 判断。

短批开工不得造成物料待办丢失：批次进入 `doing` 后，普通 `active` 需求仍必须出现在仓库待分配、待出库和生产缺料查询中，并继续接受分配与确认出库。生产执行完工必须阻断仍有活动需求的批次；个别录入错误通过更正审批关闭／替代，停止生产则进入逐项收尾与结案审批，禁止因达到报工数量自动关闭。

普通任务保持原有门禁：部分分配可以分多次保存，但必须全部活动需求完成分配后才能制领料出库单。只有当前 `material_plan_version` 上的有效短批授权可以在 `material_pending` 放开该门禁。首笔部分出库确认后批次进入 `material_partially_outbound`；该状态是物料事实，不是授权状态。该状态下需求计划变化会使旧授权失效：若当前全部活动需求（含正常、人工追加、工序报废补料和生产领料损耗补料）已经完成分配，则缺料风险已经消失，可以按普通齐套模式继续制单且新单不关联短批授权；若仍有任一分配缺口，则必须先对当前计划版本重新授权。

短批授权必须发生在未齐套制单之前，并按需求固化 `authorized_remaining_quantity`，即管理员明确批准的开工时最大允许缺口。首次授权尚未形成确认领料时，必须至少存在一笔当前预计可出库分配；需求计划变化后的重新授权或调整授权如果批次仍有大于零的已确认领料，则不要求当前活动需求必须已有分配。已确认领料按全批次 `outbound_order.status = completed` 的出库明细累计计算，不扣除退料；已满足需求的历史出库仍是已履约事实。开工事务必须重新断言：授权仍处于 `active`、授权版本等于批次 `material_plan_version`、已确认领料量大于零，且每条当前活动需求的 `remaining_number` 不大于对应授权缺口。新增或取消需求必须递增 `material_plan_version`，使旧授权自动失效；继续确认出库只改善缺口，不改变该版本。

查询层不得用授权版本条件把异常批次静默过滤掉。出库批次候选必须返回显式 `outboundEligibility`：可操作时给出 `normal/short_batch` 制单模式；不可操作时给出稳定阻断码和说明。至少区分“尚未形成分配”“短批授权缺失”“需求计划变化导致授权失效”和“分配已被待出库单占用”。管理端只允许选择可制单批次，同时把待处理批次及原因展示给操作员。该投影只用于交互，制单与确认事务仍必须在锁内重新校验全部活动需求、有效分配和授权版本。

候选集合必须先要求存在活动需求，再只统计这些活动需求关联的分配事实。`has_active_allocation`、`has_orderable_allocation` 和 `has_orderable_additional_allocation` 均不得包含 `fulfilled/cancelled/closed` 或更正审批中需求的历史分配。`has_active_allocation` 还必须要求分配数量扣除已确认出库后仍有余额，已被确认出库耗尽但状态仍为 `active` 的分配行不得伪装成待出库占用。活动需求不存在时批次直接退出候选；活动需求存在但尚无剩余有效分配时返回 `allocation_incomplete`；活动需求已有剩余有效分配但可制单数量被待出库单占满时返回 `no_orderable_allocation`。`doing` 只继续承载已消费短批授权的普通剩余需求或活动人工追加、补料需求；`material_outbound` 因后续活动人工追加、补料需求重新进入候选。

---

`manual_additional`、`scrap_supplement`、`material_loss_supplement` 共用后续领料资格，由领域规则统一列举，候选 SQL 使用同一集合。`material_outbound` 和普通开工后的 `doing` 批次允许这些活动需求继续分配、释放未出库分配、制单及确认出库；短批开工后的 `doing` 批次凭已消费授权还允许普通剩余需求继续领用。释放仍要求分配未确认出库且未被待出库单占用。候选批次、候选明细与写事务均遵守上述类型边界；确认出库必须在批次锁内按当前状态与本单需求类型重新校验，不得只依赖制单时的资格。

人工追加保留 `production_manual_demand_addition` 和 `production_item_demand` 来源，不创建 `item_scrap`、`production_material_supplement` 或产品补产授权，也不增加计划产量或工序目标。后续出库复用库存流水、需求剩余量扣减及履约事务，执行中批次保持 `doing`；尚有活动追加需求时仍禁止完工。未开工的短批仍遵守当前物料计划版本和齐套门禁，人工追加不能绕过重新授权。

工单类型、工单级版本锁与并发锁定顺序统一遵守[工单物料版本规则](work-orders-and-batches.md)。批量单每个 BOM 行只读继承工单已经保存的一个版本，配置缺项不得生成需求，也不得由首次需求隐式写工单选版；研发单可以拆分多个版本，各版本数量之和仍须等于该 BOM 行应需量。所有补需求入口同样遵守工单类型，不能借补料绕过批量单版本锁。

### 9. `production_material_requirement_basis`

职责：保存某个生产批次完整确认需求配置时，从 Product 公共  快照得到的各行基础物料公式。它是“该 BOM 行本批次BOM。（最终目的服务于，bom 修改流程不会影响，当时在产工单）
应配置多少”的冻结分母，不是可分配需求，也不替代 `production_item_demand` 事实。

管理员从生产任务行进入配置弹窗，一次完整确认全部 BOM 行的精确 `material_variant_id` 与数量。
服务端要求命令覆盖全部 BOM 行，并在同一事务写入所有需求基础和初始需求；任一行不完整时不产生
部分事实。成功后批次从待配置状态进入 `material_pending`。BOM 基础和启用版本在写事务内重新读取
并锁定，避免版本停用与选择校验之间的竞态。

| 字段                               | 类型              | 说明                                      |
| ---------------------------------- | ----------------- | ----------------------------------------- |
| `id`                               | `BIGINT UNSIGNED` | 主键                                      |
| `production_batch_id`              | `BIGINT UNSIGNED` | 生产批次 ID                               |
| `product_material_id`              | `BIGINT UNSIGNED` | 冻结的产品 BOM 行                         |
| `material_id`              | `BIGINT UNSIGNED` | 基础物料 ID                               |
| `material_code_snapshot`           | `VARCHAR(100)`    | 基础物料编码快照                          |
| `unit_snapshot`                    | `VARCHAR(20)`     | BOM 用量单位快照                          |
| `quantity_per_unit_snapshot`       | `INT`   | 单件 BOM 用量快照                         |
| `planned_output_quantity_snapshot` | `INT`   | 批次计划产量快照                          |
| `required_number`                  | `INT`   | 该 BOM 行在本批次的初始应需量，各版本初始正常需求合计必须等于此值 |
| `created_by` | `BIGINT UNSIGNED NOT NULL` | 确认需求配置并创建基础记录的操作者，引用 `users.id` |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 基础记录创建时间 |

本表采用根数据库规范中不可变事实的创建审计约定，明确保存 `created_by/created_at`，不包含更新、软删除审计字段或 `version`。这是一组字段约定，不是数据库表继承，也不是自动补充字段。表内其余业务字段同样为 `NOT NULL`，主键 `id` 自增。基础表由 Production 拥有，BOM 业务字段只经 Product 公共快照读取。

#### 键、索引与引用关系

| 名称 | 物理定义 / 引用目标 |
| ---- | ------------------ |
| `PRIMARY` | `PRIMARY KEY (id)` |
| `uk_material_requirement_basis_batch_bom` | `UNIQUE (production_batch_id, product_material_id)`，同批次同 BOM 行只有一个基础 |
| `uk_material_requirement_basis_reference` | `UNIQUE (id, production_batch_id, product_material_id, material_id)`，供下游组合外键引用 |
| `idx_material_requirement_basis_material` | `INDEX (material_id, production_batch_id, id)` |
| `fk_material_requirement_basis_batch` | `(production_batch_id) → production_batches(id)` |
| `fk_material_requirement_basis_bom` | `(product_material_id, material_id) → product_materials(id, material_id)` |
| `fk_material_requirement_basis_material` | `(material_id) → materials(id)` |
| `fk_material_requirement_basis_created_by` | `(created_by) → users(id)` |

下游已经存在的组合外键如下，均要求四个引用值同时匹配基础表的同一行；不是分别判断各个 ID 是否存在，也不要求基础 ID 与物料 ID 相等。

| 引用表 / 外键名称 | 引用字段 | 基础表目标字段 |
| ---------------- | -------- | -------------- |
| `production_item_demand` / `fk_production_item_demand_basis` | `(requirement_basis_id, production_batch_id, product_material_id, item_id)` | `(id, production_batch_id, product_material_id, material_id)` |
| `production_scrap_supplement_plan_line` / `fk_scrap_supplement_plan_line_basis` | `(requirement_basis_id, production_batch_id, product_material_id, item_id)` | `(id, production_batch_id, product_material_id, material_id)` |

例如基础记录为 `(100, 20, 30, 40)`，需求的上述四个字段就必须引用 `(100, 20, 30, 40)`；写成 `(100, 20, 30, 41)` 会被数据库拒绝。其中 `100` 是本表 `id`，`40` 才是 `materials.id`。在正常启用外键检查的连接中，插入和修改引用字段都受约束；这些外键未配置级联更新或删除。

#### CHECK 与冻结规则

| CHECK 名称 | 物理校验 |
| ---------- | -------- |
| `chk_material_requirement_basis_quantity` | `quantity_per_unit_snapshot > 0 AND planned_output_quantity_snapshot > 0 AND required_number > 0` |
| `chk_material_requirement_basis_integer` | 上述三个数量字段各自满足 `字段 = TRUNCATE(字段, 0)`，禁止小数 |

数量公式和跨需求行合计由应用写事务保证，不应把它们描述成上述 CHECK 已覆盖的约束：

- `required_number = quantity_per_unit_snapshot × planned_output_quantity_snapshot`，保存确认时的初始计划基准。
- 批量单和研发单都保存基础；初始正常需求必须一次覆盖全部 BOM 行。研发单允许同一基础拆为多个精确版本，初始拆分数量合计必须等于 `required_number`；批量单只允许一个版本并遵守工单版本锁。
- 人工追加只能使用任务已冻结的 BOM 基础；后续补料保留基础引用。追加或补料可使累计需求超过 `required_number`，但不改大原始基准。库存分配按各条精确版本需求执行，不按基础表跨版本凑数。
- 确认后不修改基础的批次、BOM、物料引用、公式、编码、单位、追溯标志及创建审计；当前应用没有更新或删除基础的业务入口。本表没有阻止任意 UPDATE/DELETE 的不可变触发器，不得把应用冻结规则表述为数据库全面防篡改。
- 物料名称不在本表保存快照，展示读取当前名称；不可变基础不代表名称也被冻结。


### 9.1 `production_manual_demand_addition`

职责：记录管理员针对一个生产任务发起的一次人工追加动作。它是生成分组的单头，可在同一事务中
产生多个冻结 BOM 基础物料、多个具体版本的 `production_item_demand`；不表示审批单，也不关联
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

该表保存不可变需求数量，并保存由确认出库事务同步维护、可从确认出库明细重建的剩余需求投影；不保存累计分配、退料或报废数量。物料基础、精确版本编码和单位随需求冻结；名称不保存快照，展示与搜索通过已登记的专用查询目录读取 `materials.id/material_name`，不以此替代 Product 的业务校验能力。正常需求从批次基础取得 BOM 快照，补料需求继承原需求的 BOM/基础物料快照；批量单必须复用整个工单已锁定版本，研发单可由管理员重新选择同一基础物料下的启用版本。

| 字段                               | 类型              | 说明                                      |
| ---------------------------------- | ----------------- | ----------------------------------------- |
| `id`                               | `BIGINT UNSIGNED` | 主键                                      |
| `production_batch_id`              | `BIGINT UNSIGNED` | 生产批次 ID，关联 `production_batches.id` |
| `requirement_basis_id`             | `BIGINT UNSIGNED` | 批次冻结的 BOM 基础 ID                   |
| `product_material_id`              | `BIGINT UNSIGNED` | 统一 BOM 明细 ID；正常需求必须保存        |
| `item_id`                          | `BIGINT UNSIGNED` | 需求对象 ID，关联 `materials.id`           |
| `material_variant_id`               | `BIGINT UNSIGNED` | 需求选中的精确物料版本 ID                 |
| `item_code_snapshot`               | `VARCHAR(100)`    | 生成需求时的物料编码快照                  |
| `material_variant_code_snapshot`    | `VARCHAR(180)`    | 需求选中的版本编码快照                    |
| `quantity_per_unit_snapshot`       | `INT`   | 生成需求时的 BOM 单件用量快照             |
| `unit_snapshot`                    | `VARCHAR(20)`     | 生成需求时的用量单位快照                  |
| `planned_output_quantity_snapshot` | `INT`   | 生成需求时的批次计划产量快照              |
| `need_number`                      | `INT`   | 需求数量                                  |
| `remaining_number`                 | `BIGINT`          | 尚未确认领用的整数数量，可从出库事实重建  |
| `demand_type`                      | `VARCHAR(30)`     | 需求类型，默认 `normal`                   |
| `generation_group_key`             | `VARCHAR(150)`    | 同一次需求生成动作的稳定分组键            |
| `idempotency_key`                  | `VARCHAR(150)`    | 幂等键，同一键重复提交返回既有结果        |
| `parent_demand_id`                 | `BIGINT UNSIGNED` | 报废或损耗补料关联的原始需求；人工追加为空 |
| `manual_addition_id`               | `BIGINT UNSIGNED` | 人工追加记录 ID；其他类型为空             |
| `supplement_id`                    | `BIGINT UNSIGNED` | 补料物流单 ID，仅两类补料需求填写         |
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
| `requirement_basis_id`                         | 受组合外键保护的批次 BOM 基础，正常/补料均必须保存 |
| `product_material_id`                          | 受组合外键保护的来源 BOM 明细                   |
| `item_id`                                      | 受组合外键保护的基础物料冗余，便于查询和约束     |
| `material_variant_id`                          | 需求实际选择的精确库存版本；新需求必须明确填写   |
| `quantity_per_unit_snapshot` / `unit_snapshot` | 保证 BOM 修改后仍可还原需求计算口径              |
| `need_number`                                  | 需求事实，不应因为出库、退料、报废而直接修改     |
| `demand_type`                                  | `normal` 正常需求、`manual_additional` 人工追加、`scrap_supplement` 工序报废补料、`material_loss_supplement` 生产领料损耗补料 |
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
- 组合外键：`(requirement_basis_id, production_batch_id, product_material_id, item_id) -> production_material_requirement_basis(id, production_batch_id, product_material_id, material_id)`
- 组合外键：`(material_variant_id, item_id) -> material_variants(id, material_id)`；版本停用不影响历史事实
- 组合外键：`(parent_demand_id, production_batch_id, product_material_id, item_id) -> production_item_demand(id, production_batch_id, product_material_id, item_id)`
- 组合外键：`(supplement_id, production_batch_id) -> production_material_supplement(id, production_batch_id)`
- 检查约束：`CHECK (need_number > 0)`
- 检查约束：`CHECK (demand_type IN ('normal', 'manual_additional', 'scrap_supplement', 'material_loss_supplement'))`
- 检查约束：`CHECK (business_status IN ('active', 'fulfilled', 'cancelled', 'closed'))`
- 检查约束：`0 <= remaining_number <= need_number`；`active` 必须大于 `0`，`fulfilled` 必须等于 `0` 并填写完成事实
- 检查约束：`cancelled` 必须同时填写受控 `cancel_source`、非空原因、操作人和时间；非取消状态这些字段必须全部为空
- 组合索引：`INDEX (production_batch_id, business_status)`，用于查询批次有效需求
- 组合索引：`INDEX (production_batch_id, generation_group_key, id)`，用于按生成先后稳定分组展示
- 组合索引：`INDEX (business_status, item_id, id)`，用于从活动需求出发按物料汇总供需预警
- 检查约束：正常需求要求 `parent_demand_id IS NULL AND supplement_id IS NULL`
- 检查约束：人工追加需求要求 `parent_demand_id IS NULL AND manual_addition_id IS NOT NULL AND supplement_id IS NULL`
- 检查约束：报废补料要求 `parent_demand_id IS NOT NULL AND supplement_id IS NOT NULL`
- 检查约束：生产领料损耗补料要求 `parent_demand_id IS NOT NULL AND supplement_id IS NOT NULL`
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

迁移说明：`202608200001-production-scrap-reproduction-authorization` 将既有工序补料明细无损折叠为 `production_item_demand.supplement_id`，删除 `source_scrap_id/source_supplement_detail_id/reason_type/remark`，并把业务状态收紧为 `active/cancelled`。已执行 migration 不修改。

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
- 正常需求命令必须一次覆盖全部 `production_material_requirement_basis`；同一基础行可拆为多个启用版本，所有拆分数量之和必须等于 `required_number`，任一行不完整时整单回滚。
- 同一配置命令由 `IdempotencyExecutor` 保护；重复提交只返回既有结果，不重新读取已确认事实或恢复旧的一键生成入口。补料和人工追加也必须走对应幂等命令。
- 分组键使用稳定格式：正常需求为 `NORMAL:{production_batch_id}`，工序报废补料为 `SCRAPSUP:{supplement_id}`，生产领料损耗补料为 `LOSSSUP:{supplement_id}`，人工追加为 `ADDITIONAL:{production_batch_id}:{business_action_no}`。这些格式由共享类型和领域构造器集中拥有，业务写入路径不得直接拼接。
- 逐条幂等键在分组键后追加稳定行来源：正常需求追加 `requirement_basis_id + material_variant_id`，工序报废补料追加 `parent_demand_id`，生产领料损耗补料追加 `material_loss_scrap_id`，人工追加追加 `requirement_basis_id + material_variant_id`。
- `business_action_no` 必须是一次人工追加动作的稳定唯一编号；相同幂等键重复提交时返回既有需求，不插入新记录，也不得修改既有 `need_number`。
- 人工追加以 `production_manual_demand_addition` 记录一次任务级动作，可包含多条需求；每条需求必须关联同一任务的冻结需求基础，不填写 `parent_demand_id`。报废和损耗补料仍校验父需求属于同一生产批次，且 BOM 明细与物料一致。
- 报废补料必须校验补料单、授权、原需求和新增需求属于同一生产批次，且 BOM 明细与物料一致。
- 生产领料损耗补料必须从损耗事实所指向的需求/分配行取得 BOM、物料、单位和批次关系；`need_number` 固定等于已确认损耗数量，不接受客户端填写，不允许改量或选择不补料。
- 需求事实和对应操作日志必须在同一事务写入。Production infrastructure 中新增或取消需求统一经过事务内需求计划写入器，并在同一事务把 `production_batches.material_plan_version` 和批次 `version` 各递增一次；业务仓储不得直接散落此类 SQL。确认出库扣减既有需求属于履约，不改变需求集合，因此不经过该写入器，也不递增物料计划版本。
- 分配写命令一次只能处理一个需求，但允许同一需求在一个命令内拆分到多个库存批次；后端必须拒绝混合不同 `demand_id` 的聚合分配。需求列表按 `id ASC` 返回，管理端按 `generation_group_key` 分组，默认选中最早未完成组中的最早可分配需求，但不强制只能处理最早组或最早需求。
- 全部活动需求完成分配时批次从 `material_pending` 进入 `material_assigned`；释放尚未出库的有效分配并重新产生缺口时允许从 `material_assigned` 回到 `material_pending`。该回退只表达分配齐套状态变化，不得回到初始 `pending`，也不得重新开放正常需求生成。
- 确认出库在写出库明细、负库存流水和单据终态的同一事务中扣减涉及需求的 `remaining_number`；扣至 `0` 时写入 `fulfilled/fulfilled_by/fulfilled_at`。部分出库继续保持 `active`。
- `fulfilled` 属于需求持久化业务状态；需求列表的 `demandProgressStatus` 将其统一投影为 `outbound`。取消需求投影为 `cancelled`，活动需求才按分配量和已确认出库量计算其余进度。
- 生产退料仅表示余料回仓，在所有批次状态下均不创建或恢复需求，不改变 `remaining_number`、履约终态、批次物料计划版本或短批授权。生产领料损耗通过独立损耗确认创建等量补料需求，额外用料通过人工追加创建需求。
- 历史已满足需求由 `202608250002` 根据 `completed` 出库单一次性回填。物料供需预警只汇总 `active.remaining_number`，不再扫描已满足需求的历史出库明细。
- 供需预警每行对应一个精确版本，只汇总该版本的活动需求。关键词命中该版本任一活动需求的物料编码、名称或版本编码后，应保留同版本全部活动需求；编码和单位取同版本 ID 最大的活动需求快照，名称使用当前物料名称。
- 供需缺口按精确版本计算，不同版本库存不能抵扣；分页按版本计数，具体公式和接口参数见[库存查询与可分配量](inventory-ledger-and-inbound.md#75-库存查询与可分配量)。
- 预警下钻同时限定基础物料和精确版本，返回活动需求的版本 ID、编码、需求类型、需求 ID、所属工单、生产任务、原始需求及补料/异常处置/领料损耗单据编号；来源查询只读取 Production 事实，不反查 Product 当前主数据。

#### 正式需求更正与替代

长期决策见 [ADR-0010](../../../../../../../docs/adr/0010-demand-correction-by-replacement.md)。Production 通过 `production.demand.correct` 场景接入通用 Approval，末级批准后统一改变需求和补料履约。

**提交更正申请 → 审批通过 → 关闭原需求未履约部分 → 创建有关联的替代需求。** 未确认的补料方案主单与明细仍可编辑；正式确认后的原方案、原需求数量及 BOM/单位/版本快照不回改。关闭只改变原需求的受控业务状态和关闭事实，不把原 `remaining_number` 清零伪装成已满足。

这里的补料更正资格按领料履约判断，不以“是否分配库存”判断：工序报废补料需求须仍为 `active`，且原补料单仍为 `approved`。普通已分配、部分已领料不单独阻断更正；在途出库、冻结／异常分配、待确认损耗及批次状态另行检查。界面分别说明需求类型、是否已领完及原补料单是否结束，不用“未齐套”笼统代替这些条件。

**关闭终态与审批中间态**

需求新增 `closed` 终态，表示主动结束剩余履约要求；`cancelled` 保留给未执行任务取消。关闭原因必须区分“更正并替代”“更正后无剩余”“单条关闭”和“随批次终止关闭”，页面不能全部只显示“人为关闭”。即使旧需求尚未领料，因录入错误被替代仍按更正原因关闭；不能只按已领量是否为零区分取消和关闭。

`replaces_demand_id` 位于新需求上，指向因同一生效更正而关闭的旧需求。因“更正并替代”关闭的需求须有且仅有一个有效后继；单条关闭、批次终止及更正后无剩余可以没有后继。连续更正时，中间需求保留自己原有的替代指针，同时可再次关闭并被后继替代；因此 `closed` 不等价于该行 `replaces_demand_id IS NOT NULL`。

仅冻结被更正的旧需求，不暂停整个生产任务。页面显示“更正审批中”，持久化履约状态仍为 `active`；需求表新增 `pending_correction_id BIGINT UNSIGNED NULL`，指向 Production 所有的当前在审更正申请，由该申请关联通用审批实例。只保留一份当前在审关联，不另加可任意修改的冻结布尔值，也不把通用审批节点状态复制到需求表。结构由追加迁移 `202609150001-production-demand-correction-and-closeout` 提供。

`pending_correction_id` 默认空，弹窗草稿不落库、不设置；正式送审时与创建/绑定审批实例同事务设置，要求旧需求仍为 `active` 且原指针为空。最终批准在关闭旧需求、生成可选替代需求的同一事务清空；驳回/撤回只在该字段仍指向本次申请时清空，不改变原剩余需求。非空指针必须关联同一旧需求的有效在审申请，关闭/履约等终态不得残留该指针。清空当前指针不删除历史：更正申请中的旧需求、可选新需求、审批实例和生效记录永久保留；`replaces_demand_id` 也不随审批结束清除。

| 场景 | 对审批中旧需求的处理 |
| --- | --- |
| 分配、释放、制单、确认出库、再次更正、普通关闭 | 禁止；候选查询及后端写入共同检查 `active` 且无在审更正，再叠加各入口原有资格条件 |
| 补料齐套、需求是否解决、正常完工 | 仍按未解决需求阻断，不能因为它退出可操作候选就视为已满足 |
| 需求总览、缺料与历史追溯 | 继续展示原数量、已领和剩余，明确标注审批中及不可操作原因 |
| 其他需求及原有生产额度 | 按原规则继续；同一补料单的其他需求可领料，但在审要求未解决前该单不能齐套放行 |

送审前处理涉及旧需求的待出库单，并明确混合单据的影响范围。审批绑定和解除在审关联须推进需求版本；单纯冻结不改变需求集合或数量，不因此推进物料计划版本。最终批准原子关闭旧需求、建立替代关系并解除本申请冻结；驳回/撤回只解除本申请冻结，恢复原需求按原剩余继续办理，不覆盖其他约束。已领部分的退料/损耗仍从原事实追溯并遵守其独立规则，不因冻结删除或移转来源；如改变审批依据，最终批准须要求重新复核。批次终止与在途更正互斥，先按更正流程撤回/驳回在途申请，再关闭旧需求；迟到批准不得在已结束任务中生成替代需求。

来源与更正关系必须区分：

| 关系 | 含义及约束 |
| --- | --- |
| 现有 `parent_demand_id` | 补料追溯其原始需求；人工追加仍为空。现有损耗补料会沿此字段取得来源根，不能将其复用为纠错链 |
| 现有 `supplement_id` | 替代的补料需求继续归属同一补料物流单，保留原需求类型、原始需求及报废/损耗来源 |
| `replaces_demand_id` | 新需求明确关联直接被替代的旧需求，不覆盖 `parent_demand_id` |
| `production_demand_correction` 与审批关联 | 关联旧需求、可选的新需求、审批实例和生效版本；纯关闭允许没有新需求，审批不能只写在备注或仅保存最后一次审批编号 |

`supplement_id` 是补料单与需求的一对多归属键，已足够用于按单查需求和判断齐套；`parent_demand_id` 则保留逐条补料需求的原始需求来源，不参与齐套分组，也不只用于损耗补料。工序报废补料从方案明细的 `original_demand_id` 取得父需求；同一补料单可以包含指向不同原需求的多种物料，补料单主表的报废来源不能代替这些逐行关系。损耗补料可通过补料单的 `material_loss_scrap_id` 追溯损耗事实及其直接来源 `demand_id/allocation_id`，同时按现有 `sourceDemand.parent_demand_id ?? sourceDemand.id` 保留补料来源根；来源根既可能是正常需求，也可能是人工追加需求，父需求本身不表示已领物料的具体库存批次。

例如补料需求 D1 的 `supplement_id = M1`、`parent_demand_id = N1`，更正后 D2 仍保存 `supplement_id = M1`、`parent_demand_id = N1`，新增的直接替代关系才指向 D1。M1 表示同一次补料物流，N1 表示原始需求来源，D1 表示本次被纠正的需求；三者不能互相代用。人工追加需求及其替代需求继续保持 `parent_demand_id` 和 `supplement_id` 为空，纠错链单独关联。

首期只处理同批次、同物料、同精确版本、同单位的活动人工追加需求，及尚未齐套的工序报废补料单下活动需求。BOM 正常需求只在批次收尾时按规则结束剩余部分，不开放日常任意改量；损耗补料与已确认损耗量相等的规则继续保留，来源错误须另行更正来源业务。已履约/已关闭的需求、已齐套补料不在此入口重新打开；改变物料、版本、单位须另行设计，不把不同身份的历史领料相加为已满足新物料需求。

数量示例（首次更正）：

| 对象 | 批准后的记录 |
| --- | --- |
| 原方案与旧需求 A | 原需求量 10、已确认领料 4 保留；原剩余 6 经更正申请关闭 |
| 更正申请 | 记录原目标 10、新目标总量 7、已领 4、关闭余量 6、新需求量 3，以及原因和版本 |
| 替代需求 B | 新建需求量 3、剩余量 3，关联 A、更正审批及 A 的补料来源（如有） |
| 当前执行口径 | 历史已领 4 加尚需领用 3；不将旧需求 10 与新需求 3 累加成 13 |

连续更正只对当前活动需求进行，按同一替代链全部已确认领料计算新剩余需求，不能只扣最后一条需求的已领量。新目标总量不得少于链上已确认领料；退料另走原来源退料命令，不冲回需求履约。新剩余为 0 时只关闭，不生成零数量需求，也不伪造出库。

审批前展示原始来源、历史更正链、本次旧需求版本、数量差异、关联待出库单与预留，以及补料齐套可能带来的授权激活/工序重开。涉及旧需求的待出库单须送审前处理，未出库预留的释放范围纳入批准证据；混合多条需求的出库单不能因其中一条纠错而无提示地取消其他需求的领料安排。送审后冻结证据并限制影响证据的操作；同一旧需求不能并行生效两次更正。

最终批准事务通过统一需求计划 Writer 完成旧需求关闭与替代需求生成，原计划版本只因该次业务变更统一推进，并与审批生效、关联单据状态及成功审计同事务提交。当前短批授权按计划版本失效规则处理；审批失败回滚，驳回/撤回保留正式需求事实。

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

Production 统一拥有一套补料履约判定与状态推进能力，由需求更正最终批准、出库确认共同调用；详情查询沿用同一有效履约口径。工序及补产额度计算读取补料单的受控履约结果，不各自遍历更正链，也不另存一套可手改的“齐套”标记。依赖顺序为：**当前需求履约 → 补料单齐套 → 既有补产额度具备物料条件 → 结合工序及批次状态决定执行资格**。齐套本身不代替工序前置条件、权限或批次可执行状态；普通短批授权也不能绕过对应补产额度的补料条件。

上述依赖按一张补料单及其对应授权判断，不要求整个批次的所有补料单同时 `fulfilled`。某张补料单未齐套只使其对应的新增授权量暂不进入路线公式，不冻结原有可执行量及其他已齐套授权量。领料损耗补料不关联产品补产授权，即使齐套也不增加产品额度。

复用应按业务职责拆分，不把每一个判断拆成各自查询数据库、各自提交的命令：

| 判断职责 | 输入与结果 | 复用边界 |
| --- | --- | --- |
| 补料需求履约判定 | 同一补料单的需求、已生效更正关系及履约事实 → 是否满足全部当前要求、阻断需求及原因 | 更正审批预览/最终批准、出库确认及补料详情；不能仅检查不存在 `active` |
| 补产授权的物料条件 | 每条已有授权关联补料单为 `fulfilled` → 该授权可参与路线公式 | 现有 `selectRouteSupplementSources` 派生 `material_ready`；不是授权表的独立状态，不需要再批准一次，不按物料数量换算产品数量 |
| 工序数量计算 | 批次计划、逐工序有效报工、可参与公式的授权 → 各工序目标量、放行量及剩余可报量 | 现有 `calculateRouteStepQuantities` 为共享纯函数，供任务展示、普通报工、返工及补产重开使用；公式由[执行章节 §4.2.3](execution-traceability-quality.md#423-数量与并发约束)所有 |
| 工序动作资格 | 操作人/权限、批次与工序状态、前道放行和本次报工数量 → 对指定动作是否允许及原因 | 开始工序和提交报工分别组合规则，不用一个通用布尔值代替所有动作校验 |

“开始工序”检查已派工、当前负责人及允许的批次状态；首工序检查正常领料完成或有效短批许可，后道检查前道已有正常产出，不要求前道整道完工。“普通报工”检查批次与工序均在执行、当前负责人、本次数量不超过剩余可报量，并按当前正常目标判断是否完成；补产导致已完成工序重开时沿用原负责人和首次开工时间。这些已有执行规则不由需求更正重定义。

查询可以复用纯判断结果展示按钮与阻断原因，但不能作为后续写入的凭证。写命令必须在同一事务内锁定相关事实、读取最新数量并重新组合校验；共享纯函数本身不查询数据库、不写状态，状态推进仍由所属业务命令统一完成。

旧需求关闭、新需求生成、补料齐套重算及其工序重开影响必须包含在同一批准事务内，沿统一锁序重新校验；禁止先提交关闭再异步创建替代需求，避免中间状态误放行或并发领料改变审批依据。更正不重建报废事实或补产授权，只处理满足批准履约条件的既有授权。更正预览对新剩余为零的情形模拟本单齐套及工序重开；新剩余为正时必须先领齐。预览与实际推进共用 `calculateRouteStepQuantities` 和 `supplementReopenedStepIds`。

追溯保留全部原方案、旧/新需求、逐次审批及真实领退料；当前缺口继续按活动需求的精确版本计算。业务汇总识别替代链的当前要求和历史履约，不能把各历史版本的总需求重复计入。替代需求继承 `manual_addition_id` 或原 `supplement_id/parent_demand_id`，生成分组以原来源键追加 `:CORRECTION:<申请ID>`，逐行幂等键同时包含更正动作；不回写已确认人工追加单或补料方案。

#### `production_demand_correction`

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
| `result_snapshot` | 可空 JSON | 本次实际齐套补料单及重开工序 IDs |
| `active_slot` | STORED 可空生成列 | ended_at 为空时为 1，UNIQUE(old_demand_id,active_slot) 防冲突申请 |

未生效时新需求、生效人／时间和结果全空；生效时审批、结束时间、结果必填，新剩余为零则无新需求，否则必须有新需求。行内 CHECK、外键和唯一键防止结构冲突；来源同身份、审批真实在审、旧关闭与后继一致、无环及不可改写来源由受控事务共同保证。

接口前缀 `/api/production/material-demands/:demandId`：GET `/correction-check` 返回最新依据、版本和令牌；GET `/corrections` 沿前后继返回完整申请历史；POST `/corrections` 要求 `production:materials:correct-demand`、`Idempotency-Key` 及版本、令牌、处理方式、目标总量、原因。读取接受需求查看、物料查看或任务查看权限之一。写 scope `production.demand-correction.submit.v1`，结果仅包含申请对象 ID 与审批 ID，沿用平台幂等事务。

审批绑定／解除只推进需求及更正记录版本；末级批准一次推进物料计划和批次版本，未消费短批授权失效。先锁工单、批次、申请和旧需求，再读取全部来源／物流／工序事实；最终核对扣除本申请绑定造成的单次需求版本变化，其他领退料、损耗、预留或路线影响变化均拒绝生效并要求重新送审。批准决定、关闭／替代、齐套推进、工序重开、审计及站内通知同事务，原库存流水不变化。

更正依据中的预留批号通过 Inventory 公开 `materialBatchReferences` 批量读取，仅用于展示及冻结原有证据；分配、已领数量、退料和损耗资格仍读取并锁定 Production 自有事实。更正查询不再通过跨库存 JOIN 的 `FOR SHARE` 锁住 `item_batch`，也不使用该公开展示返回的余额或批次状态替代更正业务校验。

#### 需求数量与进度查询

实现位于 [mysql-production-material.mapper.ts](../../infrastructure/mysql-production-material.mapper.ts) 的 `DEMAND_SELECT`、`mapDemand` 与 `progress`，由 [MysqlProductionMaterialRepository.listDemands](../../infrastructure/mysql-production-material.repository.ts) 按需求返回。计算保留 `demand_id` 及精确物料版本，不将同一任务的不同需求折叠成一个进度状态。

```text
有效分配量 = sum(未释放、未取消的分配数量)
已确认出库量 = sum(已完成出库单明细数量)
当前未分配缺口 = active 时 max(need_number - 有效分配量, 0)，终态为 0
```

有效分配只统计 `allocation_status NOT IN ('released','cancelled')`，出库只统计 `completed` 主单。接口 `allocatedQuantity/outboundQuantity/remainingQuantity` 分别对应以上三项；余料退回不撤销既有履约，以上数量均不扣除退料。`remainingDemandQuantity` 直接读取需求事实 `remaining_number`，由确认出库扣减，不用净领用量重新推导。库存预留仍按“分配减已确认出库”计算，退回库存作为公共余额可供其他需求分配，不再保留给原需求。

`demandProgressStatus` 按以下顺序取首个匹配结果，只是接口计算字段，不写回需求表：

| 优先级 | 条件 | 返回状态 |
| --- | --- | --- |
| 1 | `business_status = fulfilled` | `outbound` |
| 2 | `business_status = cancelled` | `cancelled` |
| 3 | `business_status = closed` | `closed` |
| 4 | `pending_correction_id IS NOT NULL` | `correction_pending` |
| 5 | 已确认出库量 ≥ `need_number` | `outbound` |
| 6 | 已确认出库量 > 0 且有效分配量 < `need_number` | `shortage` |
| 7 | 已确认出库量 > 0 | `partially_outbound` |
| 8 | 有效分配量 ≥ `need_number` | `allocated` |
| 9 | 有效分配量 > 0 | `partially_allocated` |
| 10 | 其他 | `pending_allocation` |

`shortage` 表示该需求已经领料但仍有未分配缺口，显示为“短批缺料”；`businessStatus` 仍保留持久化业务状态。确认领料与退料只能表达净领用，当前没有现场自动耗料事实，不能将“出库减退料”定义为实际消耗量或据此计算生产成本。补料通过新增需求反映物流缺口，不回写原需求数量。

普通短批授权不解除需求冻结。预览中在审需求的预计可出库量为零，缺口继续保留；既有有效授权与其他需求按原规则流转，不能因此提前激活补料对应的补产额度。旧“关闭全部剩余需求”入口已停用，个别错误走更正审批，整批停止走收尾。

### 10.1 `production_short_batch_authorization`

职责：记录“谁在看到哪一版缺料计划后，明确批准这个任务可以缺料开工”，是短批开工的管理许可主单。

设计类型：可变许可记录；批准内容创建后不改，状态由重新授权、恢复齐套或开工消费推进，是否仍有效还要比较物料计划版本。

| 字段                    | 类型              | 说明                                                        |
| ----------------------- | ----------------- | ----------------------------------------------------------- |
| `id`                    | `BIGINT UNSIGNED` | 主键，自增                                                  |
| `production_batch_id`   | `BIGINT UNSIGNED` | 被授权的生产批次                                            |
| `material_plan_version` | `INT UNSIGNED`    | 授权时批次的整组物料计划版本                                |
| `status`                | `VARCHAR(20)`     | `active` 尚未消费、`superseded` 已替代、`consumed` 已用于开工 |
| `reason`                | `TEXT`            | 管理员批准缺料开工的原因，不能为空                          |
| `authorized_by`         | `BIGINT UNSIGNED` | 授权人                                                      |
| `authorized_at`         | `DATETIME`        | 授权时间，默认当前时间                                      |
| `used_at`               | `DATETIME`        | 首工序使用该授权成功开工的时间；未消费时为空                |
| `version`               | `INT`             | 许可记录乐观锁版本，默认 `0`                                |

约束与索引：

- 主键：`id`。
- 外键：`production_batch_id -> production_batches.id`、`authorized_by -> users.id`。
- 检查约束：`material_plan_version > 0`、`version >= 0`、`TRIM(reason)` 不能为空。
- 检查约束：`status IN ('active', 'superseded', 'consumed')`。
- 索引：`INDEX (production_batch_id, status, authorized_at)`，用于查找批次当前或最近授权。
- MySQL 没有用部分唯一索引表达“每批只能有一条 active”；应用事务必须先锁定 `production_batches`，把旧 `active` 改为 `superseded` 后再插入新授权。

状态与事务规则：

```text
active -> consumed
active -> superseded
```

- `active -> consumed`：首工序开工事务完成全部短批校验后写入，并同时记录 `used_at`。
- `active -> superseded`：管理员重新授权、普通备料恢复为完整分配或确认全部出库时写入；已替代授权不得恢复。
- 需求计划版本变化可以只递增批次版本，使旧行保留 `active` 但在业务上成为 `stale`，便于保留原批准事实；判断是否可开工不能只看 `status='active'`，还必须要求授权的 `material_plan_version` 等于批次当前版本。
- 授权只表示管理员接受缺料风险，不形成精确物料产能，不增加报工上限。
- 授权预览返回唯一动作：`authorize` 首次授权、`reauthorize` 需求版本变化后重授、`adjust` 当前缺口超过既有授权快照、`view` 既有授权仍覆盖或已经消费、`not_required` 当前无需短批授权。批次既无当前预计可出库分配、也无大于零的已确认领料时，动作仍表达后续应执行的首次授权、重授或调整，同时通过非空 `blockedReason` 禁止当前提交；已存在已确认领料时，即使当前活动需求均无分配，也允许管理员重新复核全部缺口并授权。管理端不得把无分配的待授权情形显示为“物料已齐套”。当前版本且仍覆盖缺口时禁止重复写授权；管理端保留只读查看入口，不再显示可提交表单。
- 授权覆盖关系独立返回 `none/covered/insufficient/stale/consumed`。按钮文字只使用动作字段，不能由前端自行组合批次状态和版本猜测。
- 首次和重新授权预览的每条需求均经 `demand_id` 返回 `generation_group_key`、需求组类型及补料单号；管理端统一展示“初始物料需求”“人工追加需求”“报废补料 {补料单号}”或“损耗补料 {补料单号}”。来源属于需求事实的查询投影，不在短批授权明细重复保存，也不得逐行查询补料单。

### 10.2 `production_short_batch_authorization_detail`

职责：按需求明细记住管理员授权当时所选精确物料版本还缺多少，防止开工时合并不同需求或版本的数量而掩盖缺口变大。

设计类型：授权创建时一次写入、之后不可修改的逐需求快照。

| 字段                                   | 类型              | 说明                                                   |
| -------------------------------------- | ----------------- | ------------------------------------------------------ |
| `id`                                   | `BIGINT UNSIGNED` | 主键，自增                                             |
| `authorization_id`                     | `BIGINT UNSIGNED` | 所属短批授权                                           |
| `demand_id`                            | `BIGINT UNSIGNED` | 授权时对应的物料需求                                   |
| `item_id`                              | `BIGINT UNSIGNED` | 需求物料 ID，用组合外键防止串料                        |
| `material_variant_id`                  | `BIGINT UNSIGNED` | 非空，沿用对应需求的精确物料版本 ID，不在授权时重新选择 |
| `demand_quantity_snapshot`             | `BIGINT`          | 授权时该需求的原始需求量                               |
| `confirmed_outbound_quantity_snapshot` | `BIGINT`          | 授权时已确认领料量                                     |
| `expected_outbound_quantity_snapshot`  | `BIGINT`          | 当时已分配且预计可以继续确认领料的数量                 |
| `authorized_remaining_quantity`        | `BIGINT`          | 管理员批准开工时该需求允许保留的最大缺口               |
| `unit_snapshot`                        | `VARCHAR(20)`     | 授权时需求单位快照                                     |

约束与索引：

- 主键：`id`。
- 唯一约束：`UNIQUE (authorization_id, demand_id)`；一次授权对同一需求只能有一条快照。
- 外键：`authorization_id -> production_short_batch_authorization.id`。
- 组合外键：`(demand_id, item_id) -> production_item_demand(id, item_id)`。
- 组合外键：`(demand_id, item_id, material_variant_id) -> production_item_demand(id, item_id, material_variant_id)`，保证授权明细的基础物料和精确版本均与对应需求一致。
- 检查约束：原始需求量必须大于 `0`，其他三个数量必须大于等于 `0`。
- 索引：`INDEX (demand_id)`，用于从需求追溯相关授权。

授权通过 `demand_id` 追溯需求、冻结 BOM 基础及精确版本，不另建授权到 BOM 的直接关联。
BOM 定义基础物料与用量，管理员在需求配置时确定精确版本；分配、领料出库及对应库存批次必须匹配
该需求版本，入库形成的其他版本库存不得替代或抵扣。授权明细保留 `material_variant_id` 并由上述
组合外键校验，它是既有需求版本的记录，不是一次新的选版。短批授权只允许该需求保留一定数量缺口，
不允许跨版本合并数量来满足授权条件。

允许缺口按授权事务中的锁定数据计算：

```text
预计可继续出库量 = MIN(当前 remaining_number, 已分配但尚未确认出库量)
授权后允许缺口 = MAX(0, 当前 remaining_number - 预计可继续出库量)
```

上述预计量只计入 Product 公开启用版本查询认可的需求；物料版本停用或需求正在更正审批时，预计可继续出库量为零，已确认领料履约仍保留。生产批次列表、详情、工单内批次及报工任务列表统一批量派生授权动作：读取 Production 的需求、分配、确认出库和授权快照，并通过 `MaterialVariantQuery.listEnabledByMaterials` 获取当前启用版本；不得通过展示 SQL 读取 Product 状态，也不得将停用版本的未出库分配显示为齐套。该展示投影不承担写入资格，写事务继续重新校验。

首工序开工时必须逐需求复查：当前活动需求都能在本授权中找到明细，并且当前 `remaining_number <= authorized_remaining_quantity`。实际领料少于授权时预期或需求新增导致缺口超出批准值时必须阻止开工。余料退回不改变需求缺口或授权，全部退回也不影响开工资格；授权预览、员工任务投影和开工写事务均不得读取退料事实。

`202608290001-production-short-batch-authorization` 同时建立上述授权主从表，向 `production_batches` 增加物料计划版本和部分出库状态，并补齐出库授权来源及需求取消事实。该迁移直接建立最终短批模型，不维护旧模型双写。

### 10.3 `production_scrap_supplement_plan` / `production_scrap_supplement_plan_line`

设计类型：可变业务方案主表及其可变明细。

职责：承载管理员在异常正式批准报废前暂存、重开和复核的补料方案。方案不是正式物料需求，不得进入分配、出库或库存计算；只有最终确认事务才把方案明细复制为 `production_item_demand(scrap_supplement)`，并同时生成报废事实、补产授权和补料物流单。

production_scrap_supplement_plan 这是计划 -> production_scrap_supplement_plan_line 这是计划的详细？然后确定时持久化到 需求

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
- 草稿行不是需求事实，因此不写 `production_item_demand`、不产生幂等需求键，也不允许分配和出库。
- 最终确认必须锁定待处置异常及方案版本，重新校验来源报工有效、完整 BOM 需求基础、启用物料版本和数量；同一事务批准异常、创建工序报废事实、补产授权、补料单、正式需求，将方案转为 `confirmed` 并关联补料单，同时提交成功审计和 HTTP 幂等结果。
- 当前不计算或保存推荐补料数量。候选来自批次完整 BOM 基础，`planned_quantity` 完全由管理员填写；工序级定量 BOM 未定稿前不得用产品 BOM 总用量或异常数量自动推算。

状态机：

```text
draft -> confirmed
```

### 10.4 `production_material_supplement`

设计类型：可变业务单据。

职责：作为生产补料的统一物流主单，表达补料因何产生、属于哪个生产批次，以及其直接拥有的补料需求是否已经全部确认领用。它不重复保存物料、数量和单位明细；这些需求事实只保存在 `production_item_demand`。工序报废产品补产与生产领料损耗共用本表及后续分配、出库链路，但只有工序报废来源存在产品补产授权。

| 字段                      | 类型              | 说明                                                               |
| ------------------------- | ----------------- | ------------------------------------------------------------------ |
| `id`                      | `BIGINT UNSIGNED` | 主键，自增                                                         |
| `supplement_no`           | `VARCHAR(100)`    | 补料单号，唯一                                                     |
| `source_type`             | `VARCHAR(40)`     | 来源类型：`step_scrap_reproduction`、`material_loss`               |
| `step_scrap_record_id`    | `BIGINT UNSIGNED` | 工序报废事实 ID；仅工序报废补产填写                               |
| `material_loss_scrap_id`  | `BIGINT UNSIGNED` | 生产领料损耗报废记录 ID；仅生产领料损耗填写                       |
| `production_batch_id`     | `BIGINT UNSIGNED` | 所属生产批次 ID                                                    |
| `batch_step_record_id`    | `BIGINT UNSIGNED` | 工序报废来源工序执行节点 ID；生产领料损耗为空                     |
| `status`                  | `VARCHAR(30)`     | 物流状态：`approved`、`fulfilled`、`cancelled`                                  |
| `fulfilled_by`            | `BIGINT UNSIGNED` | 最后一项需求完成确认领用的操作人；未齐套时为空                     |
| `fulfilled_at`            | `DATETIME`        | 全部直接补料需求完成确认领用时间；未齐套时为空                     |
| `remark`                  | `TEXT`            | 来源审批或损耗确认说明                                             |
| `version`                 | `INT`             | 乐观锁版本号，默认 `0`                                             |
| 业务审计字段              | 见统一规则        | `created_by/created_at/updated_by/updated_at`                       |

数据库约束：

- 主键：`id`。
- 唯一约束：`UNIQUE (supplement_no)`、`UNIQUE (id, production_batch_id)`。
- 唯一约束：`UNIQUE (step_scrap_record_id)`、`UNIQUE (material_loss_scrap_id)`；两个可空来源分别保持一对一。
- 组合外键：`(step_scrap_record_id, production_batch_id, batch_step_record_id) -> batch_step_scrap_records(id, production_batch_id, batch_step_record_id)`。
- 组合外键：`(material_loss_scrap_id, production_batch_id) -> item_scrap(id, production_batch_id)`。
- 外键：`fulfilled_by` 及业务审计操作者字段关联 `users.id`。
- 检查约束：`CHECK (source_type IN ('step_scrap_reproduction', 'material_loss'))`。
- 检查约束：`step_scrap_reproduction` 要求 `step_scrap_record_id`、`batch_step_record_id` 非空且 `material_loss_scrap_id` 为空；`material_loss` 要求 `material_loss_scrap_id` 非空且 `step_scrap_record_id`、`batch_step_record_id` 为空。
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
- `source_type = 'material_loss'`：管理员确认 `item_scrap.scrap_scene = 'production_consumed'` 的生产领料损耗时，同一事务创建本补料单和且仅一条 `material_loss_supplement` 需求；物料、BOM、单位和原始需求关系从损耗记录所引用的分配行复制，需求数量固定等于 `item_scrap.scrap_number`。接口不提供“不补料”或修改补料数量的参数。
- 损耗补料的 `parent_demand_id` 取 `sourceDemand.parent_demand_id ?? sourceDemand.id`：来源为正常或人工追加需求时指向该来源需求，来源已为补料需求时沿用其原始需求指针，不随重复损耗继续嵌套；损耗事实的 `demand_id/allocation_id` 与补料单共同保留本次直接来源。
- 每张补料单必须至少拥有一条 `business_status = 'active'` 且类型与 `source_type` 匹配的直接需求。最后一项直接需求的已确认出库累计达到 `need_number` 时，同一事务把补料单转为 `fulfilled`，写入 `fulfilled_by/fulfilled_at`、递增 `version` 并记录成功审计。
- 工序报废补料单进入 `fulfilled` 后，对应 `batch_step_scrap_reproduction_authorization.authorized_quantity` 才进入路线数量公式，并按既有规则重开受影响工序。生产领料损耗补料单进入 `fulfilled` 只表示替代物料已经领齐，不创建授权、不增加 `authorized_quantity`、不重开工序，也不改变生产批次计划量或首工可报上限。
- `202608200002-production-material-loss-supplement` 已将原持久字段 `scrap_record_id` 语义化重命名为 `step_scrap_record_id`，新增 `source_type/material_loss_scrap_id/version/updated_by/updated_at`，并将历史行全部回填为 `step_scrap_reproduction`；更早已执行 migration 未被修改。

### `batch_step_scrap_records` 与半自动补料

- `batch_step_scrap_records` 是已批准不可返工的工序损失事实：对 `abnormal_disposition_id` 唯一，保存批次、工序、来源报工、异常数量和单位快照；只追加、不更新、不删除。
- `batch_step_scrap_reproduction_authorization` 是“工序报废补产授权”的不可变事实。它对报废事实和补料单分别唯一，固定生产批次、首工序入口、补产额度截止工序、授权数量和审批人/时间。物料候选不属于路线授权范围。表名显式包含 `scrap`，避免与返工混淆。
- `production_material_supplement` 是两类补料共用的物流主单；完整字段与约束见上节。状态表示 `approved`（等待补料领用）、`fulfilled`（全部直接需求已确认领用）或 `cancelled`（随本轮结束取消），不承担“是否批准补产”的语义。
- 补料单直接通过 `production_item_demand.supplement_id` 拥有需求：工序报废来源拥有一到多条 `scrap_supplement`，生产领料损耗来源固定拥有一条 `material_loss_supplement`；不再设置与需求的物料、数量、单位、原需求重复的 `production_material_supplement_detail`。
- 系统只提供候选物料，不自动计算每种物料的补料数量。管理员选择物料并手工填写数量，系统不得使用工序异常数量乘 BOM 用量推算补料数量。
- 报工异常仍必须说明 `abnormal_origin`，但批准报废补料不再选择物料截止工序；候选物料来自当前批次完整的 BOM 基础，管理员按基础行明确选择启用版本和数量。
- 路线只表达执行顺序，不存在 `route_step_materials` 或按工序范围推导补料候选的旁路语义。
- 系统校验管理员选择的物料属于当前产品与当前候选、补料数量大于 `0`、单位与原需求口径一致；最终选择直接固化为新增需求的 BOM/物料/数量/单位快照和 `parent_demand_id`。
- 批准报废与补料是一个原子命令：处置单批准、工序报废事实、补产授权、补料单、每条 `scrap_supplement` 需求、成功审计和 HTTP 幂等结果同事务提交。
- 工序报废数量与物料补料数量是两个口径。管理员填写的补料需求只决定物料需求；产品补产数量固定取授权的 `authorized_quantity`（批准时复制报废数量），不得按 BOM 或补料需求反推产品数量。
- 补产固定从路线首工序重新投产，补产额度的 `quota_end_step_record_id` 固定为异常上报工序；物料补料选择与路线工序范围无关，不能缩短产品额度的逐道传播。
- 可执行补产额度只读取“授权事实 + 对应补料单 `fulfilled`”。最后一项需求达到全量确认出库时，同一事务只把补料单改为 `fulfilled` 并重开受影响已完成工序；不得再次创建或修改授权。分配、待出库或部分确认领料均不可执行额度。
- 因此当前链路闭合为“工序报废与补产授权 → 人工补料 → 新需求 → 分配 → 确认出库 → 授权可执行 → 首工序重新生产 → 逐工序正常放行 → 来源工序补报”。当前仍不记录某次补报逐笔消费哪张授权；未来需要部分执行、指定来源消费或半成品重入时，再追加额度消费/重入事实和版本化接口。
- 工序报废补料审批只接受 `doing` 批次；生产领料损耗申报与确认接受 `material_partially_outbound/material_outbound/doing` 批次。`material_partially_outbound` 已存在确认领料事实，现场暂存或搬运中的已领物料同样可能损耗；确认损耗产生补料需求并推进 `material_plan_version` 后，旧短批授权按版本失效。若当前计划仍有分配缺口，继续短批领料或开工必须重新授权；若正常需求与补料需求均已完全分配，则后续领料按普通齐套模式继续，全部确认出库后进入 `material_outbound` 再正常开工。短批开工后，普通活动需求、人工追加需求和两类补料需求均可继续分配、释放未出库分配、制单和确认出库；任务进入 `doing` 不得隐藏普通剩余需求。物料物流不得代替首工序开工推进为 `doing`。

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
- 当前退料全部释放到公共库存，不加回原分配的可制单量；已领物料损耗也不再次扣减原分配可制单量，损耗补料产生独立需求。

上述数量不替代需求、分配、库存批次状态和短批授权的写入校验。分配已释放或取消时，即使历史数量计算仍有余额，也不得据此制单。库存预留口径见[库存查询与可分配量](inventory-ledger-and-inbound.md#75-库存查询与可分配量)。

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
| `short_batch_authorization_id` | `BIGINT UNSIGNED` | 短批未齐套制单时使用的授权 ID；普通出库为空 |
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
- 外键：`short_batch_authorization_id -> production_short_batch_authorization.id`
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
- 普通齐套出库的 `short_batch_authorization_id` 为空。`material_partially_outbound` 批次在全部活动需求完成分配后也按普通齐套模式创建新单，不关联已经失效或不再需要的短批授权。批次尚未齐套时，只有当前物料计划版本上的有效授权才能制单，且必须把授权 ID 固化到出库单；确认已关联授权的出库单时重新校验该 ID 仍是当前有效授权，防止需求变化后确认旧单。旧授权单失效后必须取消并重新制单，不得改写其授权来源；未开工且处于 `material_pending/material_partially_outbound` 的无授权单确认时，必须重新校验当前全部活动需求仍已完全分配；`material_outbound/doing` 的人工追加与补料领用按前述后续领料资格校验。

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

`ProductionProcurementQuery` 是 Procurement 读取需求来源的唯一业务入口；需求事实和精确版本仍归 Production，采购不回写数量、关闭状态或履约。按需求采购接受全部需求类型，现有库存、有效分配、短批授权和已关联采购均不作为候选门禁。同供应商跨工单合单时，每条需求来源保持独立映射，采购行数量不分摊给需求。

- `listCandidates` 接收分页、关键词、工单 ID、任务 ID、物料 ID 与需求类型；按工单、任务、需求 ID 倒序返回平铺叶子。候选限定工单 `released/doing`，任务 `material_pending/material_assigned/material_partially_outbound/material_outbound/doing`，需求 `active`、剩余量大于零、无在审更正。通过 Product `listPurchasableByMaterials` 在计数和分页之前过滤基础物料／分类停用、软删除及已删除版本，精确版本停用仍可采购。
- `resolveDemands` 最多解析 100 个已选需求，按传入顺序返回 `{demandId,demand,eligible,blockedReason}`。历史工单、任务或需求已结束时仍返回原身份、需求快照及当前状态，只有不存在的 ID 才返回 `demand=null`；不能因翻页、筛选或新下单资格失效而丢掉已有选择。
- `requirePurchasableDemands` 要求调用方已有活跃同池事务。先普通读取来源定位，再按数字 ID 升序依次对工单、任务、需求做共享锁当前读，锁后复核父子归属及生产资格；归属变化返回 `concurrent-modification`，资格失效返回 `not-purchasable`。该步骤不提前取得 Product 资格锁；采购在锁定自身根和行后再独立调用 Product 采购资格能力，所有来源复核和下单仍在同一事务。

公开结果包含工单／任务编号和状态、需求 ID／类型／业务状态／在审指针、物料与精确版本 ID、编码和单位快照、需求量与尚未领用量。数量保持整数字符串；物料名称只按稳定物料 ID 读取当前名称，不新增名称快照。展示查询只读 `infrastructure/queries/procurement-demand.query.ts` 内已登记的 `materials.id/material_name`，锁定资格查询只读 Production 自有表。

跨模块失败采用 `ProductionProcurementResult` 稳定结果联合，成功为 `success/value`，失败为 `invalid-input/not-found/not-purchasable/concurrent-modification` 加消息及可选需求 ID；不导出内部领域错误。相关采购行、数量和采购单数由 Procurement 公开投影另行提供，本能力不直接查询采购表。
