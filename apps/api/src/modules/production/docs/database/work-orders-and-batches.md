# Production 工单与批次数据库设计

## 工单自动编号

创建工单时由服务端按北京时间（`Asia/Shanghai`，UTC+08:00）生成 `yyyy-MM-dd-N`，例如 `2026-09-17-1`、`2026-09-17-2`。每天序号从 1 开始；创建和编辑请求均不接受 `workOrderNo`，返回详情提供生成的编号。草稿也已正式占用编号，下达、取消、关闭均不回收；编号永久不变，数据库更新触发器同时保护该约束。不承诺序号无缺口。

`work_order_daily_sequence` 是 Production 的技术编号登记，不承载生产计划或库存事实：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `number_date` | `DATE` | 北京时间自然日，主键 |
| `last_sequence` | `BIGINT UNSIGNED` | 本日已分配的最大序号，必须大于 0 |
| `created_at` / `updated_at` | `DATETIME(3)` | 技术计数创建／更新时间 |

应用从数据库 UTC 时钟换算北京时间，原子 upsert 日计数并在同一事务内读取序号。日主键行锁串行化同日并发创建，不使用 `MAX(work_order_no)+1`，不依赖客户端日期。计数、工单、成功审计、HTTP 幂等结果同事务提交；创建失败整体回滚。已提交编号不因业务状态变化回退，计数不提供业务更新或删除入口；不额外复制操作者，创建人由工单与成功审计记录。

`POST /production/work-orders` 必须携带 `Idempotency-Key`，scope 为 `production.work-order.create.v3`。同操作者、同键、同规范化内容在重放窗口内返回首次创建响应，不再次取号；同键不同内容拒绝。产品和负责人资格仅在首次执行时核验，成功重放不受后来主数据变化影响。前端在结果未知时保留原键和输入，修改内容不得自动换键再创建，关闭必须明确放弃该未决意图。

迁移 `202609170003-work-order-auto-number` 在升级前要求 `work_orders` 为空；开发环境按约定统一重置，不转换旧手填号、不推算历史日计数。回滚也先要求工单为空，避免删除计数后重用已存在编号；升级与回滚期间暂停 Production 写入。

## 研发轮次关联与资料带出

`work_orders.previous_research_order_id` 是可空的前序研发工单自引用外键，仅创建时设置，之后永久不变；索引为 `(previous_research_order_id,id)`。关联工单必须保持 `research` 类型，数据库 CHECK 保护该约束；插入触发器拒绝自指，更新触发器拒绝建立、移除或更换已有工单的前序关系。前序删除受外键限制，不级联删除研发历史。

新建续轮事务先锁定前序工单，确认其类型为研发、状态为 `completed` 或 `closed`，且本轮成品 ID 与前序不同，再分配新工单号并创建。旧轮产出可以仍待入库；续轮不改变旧轮结案、批准清单或入库资格。草稿编辑必须再次校验前序关联，不允许通过编辑改为批量单或改回前序成品。前序不能是取消单、草稿、已下达或生产中的单据；不存在“恢复旧轮”入口。

一个前序允许关联多个后续研发方向，不额外维护轮次计数、研发项目表或成功／失败字段。所有前序均在新工单创建前存在，且关系不可改，配合非自指约束形成可逐轮追溯的关系。后续草稿被取消时仍保留关联，不删除历史。

`POST /production/work-orders` 增加可选 `previousResearchOrderId`，同原创建命令使用 HTTP 幂等。列表和详情返回该 ID；详情另含只读 `previousResearchOrder` 摘要与 `nextResearchOrders` 直接后续列表，提供工单号、成品 ID／编码／名称及状态。查询仍按 Production 权限执行，直接前后关系通过现有详情接口逐轮浏览，不新增追溯路由或复制整条链快照。

管理端在终态研发工单的列表菜单及详情提供“开启下一轮研发”，重新读取前序详情后复用新增工单弹窗，预填计划数量、负责人、客户、质量等级、外部订单号、备注；新成品和计划日期清空并要求重选，类型固定为研发。失效负责人仍沿原候选校验处理；预填资料可修改，前序关联只读。

新成品通过 Product 原有入口建立，新 BOM 独立送审，新生产任务仍执行现有 BOM 已批准门禁。续轮只带出可编辑计划资料，不复制或改写旧需求、分配、批次、库存、报工、BOM 批准记录和审批事实；本轮拼版多物料版本配置保持原规则。

迁移 `202609170005-research-work-order-lineage` 直接追加可空关联及约束，旧工单不推测前序。down 在存在任何研发关联时拒绝丢弃历史，开发环境可按统一约定重置后回退；已执行 migration 不修改。

## 工单类型与物料版本规则

`work_orders.order_type` 是必填 `VARCHAR(30)`，只允许 `mass_production`（批量生产）和 `research`（研发任务），不设数据库默认值。草稿可修改类型，下达后永久固定；生产批次沿工单读取类型，不重复维护可变任务类型。

| 规则 | 批量生产 | 研发任务 |
| --- | --- | --- |
| 基础物料候选 | 产品 BOM | 产品 BOM，不开放 BOM 外物料 |
| 同一基础物料版本 | 有效任务和正常完工历史使用同一版本；已取消／已终止任务保留旧版本 | 可选择多个启用版本 |
| 首次正常需求数量 | BOM 单耗 × 批次计划量，选一个版本 | 可按多个版本拆分，合计仍等于 BOM 应需量 |
| 人工追加、报废补料、损耗补料 | 必须使用工单已锁定版本 | 管理员可另选同一基础物料启用版本并输入数量 |
| 父需求 | 同批次、同 BOM 基础；版本遵守工单锁定 | 同批次、同 BOM 基础；允许与父需求版本不同 |

“同物料”按 `materials.id` 判断，不按名称或分类判断。“研发不限版本”不取消基础物料归属、正整数数量、启用状态、审计和幂等校验，也不改变现有 BOM 锁定规则。研发正常需求的超额数量通过人工追加需求表达。

### `work_order_material_versions`

职责：保存管理员在工单管理中完整确认的精确物料版本配置，属于 Production 的可变工单配置。它不保存数量，不替代 `production_item_demand`，不建立影子表。Product BOM 固定基础物料与单耗；精确版本包含 `material_variants.major_version/minor_version`，BOM 本身不固定这两个字段。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `work_order_id` | `BIGINT UNSIGNED` | 所属工单 |
| `material_id` | `BIGINT UNSIGNED` | 已批准 BOM 中的基础物料 |
| `material_variant_id` | `BIGINT UNSIGNED` | 管理员选择的精确版本 |
| `created_by / created_at` | `BIGINT UNSIGNED / DATETIME` | 首次配置人员、时间，永久保留 |
| `updated_by / updated_at` | `BIGINT UNSIGNED / DATETIME` | 最近修改人员、时间 |
| `version` | `INT` | 行版本，默认 0，修改递增；整份配置提交同时校验并推进 `work_orders.version` |

`PRIMARY KEY (work_order_id,material_id)`，版本与基础物料仍由 `(material_variant_id,material_id) -> material_variants(id,material_id)` 组合 FK 校验。工单及创建／修改人保留外键；行版本非负。禁止删除行、改变所属工单、基础物料或创建审计。更新不回写旧需求、已领料事实及库存流水。

只有 `mass_production` 且工单为 `released/doing` 时可配置；通过 Product 的 `getApprovedBomSnapshot` 独立核验 BOM 已批准，不要求路线有效、不新增工单审批。首次配置和修改都必须一次覆盖全部 BOM 基础物料，每种选择一个启用的精确版本，并填写原因。研发工单仍在任务内选择与拆分版本，不写本表。

修改门禁以整个工单为范围：只要任一非 `cancelled/terminated` 任务已经生成过任何类型、任何业务状态的需求，便禁止修改。正常完工 `completed` 的历史同样阻断；`closing` 即使已关闭全部需求，也要等首份收尾清单批准成为 `terminated`。尚未生成需求的待配置任务不阻断，生成时读取当前工单配置。不能仅检查活动需求、未领数量或库存余额。

未出库任务通过取消命令将活动需求置 `cancelled`、释放预留并取消待出库安排；已出库任务先进入 `closing`，逐项关闭剩余需求并完成收尾批准，最终保持 `terminated`，不改成 `cancelled`。已领齐需求保留 `fulfilled`，旧任务、原需求量、版本快照和出入库事实不删除。不存在其他阻断任务后，管理员可以重新配置并创建新任务；正常完工历史不能借此改版。

配置保存、正常需求、人工追加、报废方案确认和损耗补料统一先锁工单，再锁批次。保存事务重新查询阻断任务及需求（当前读）、完整 BOM 和启用候选；更新配置、工单版本、成功审计和 HTTP 幂等结果同事务。数据库插入／更新触发器也锁工单并拒绝被有效任务引用的配置写入。所有需求入口只校验并复用本表，缺项拒绝生成，不能隐式插入选版。事务失败整体回滚。

| API | 契约与权限 |
| --- | --- |
| `GET /production/work-orders/:workOrderId/material-configuration` | `production:orders:view`；返回工单版本、完整 BOM 行、启用候选、已选版本（停用版本保留编码）、可配置性及首个阻断任务 |
| `PUT /production/work-orders/:workOrderId/material-configuration` | `production:orders:update`；body 为 `{ version, reason, selections: [{ materialId, materialVariantId }] }`，最多 200 行；必填 `Idempotency-Key`，scope `production.work-order.material-configuration.save.v1`；返回 `{ workOrderId, version }` |

管理端工单列表用“物料版本配置”替换原“生产批次”按钮，仅在已下达或生产中的批量单显示；任务仍通过生产任务页管理。弹窗展示阻断原因并保留未提交草稿，远端版本变化后要求显式重新加载；未知保存结果保留原内容与幂等键。批量任务的初始需求窗口只读继承工单选版、按 BOM 单耗乘任务计划量显示数量，配置缺项或版本失效时禁止确认；研发拆分继续沿原规则。

迁移 `202609170007-work-order-material-configuration` 追加修改审计与行版本，用带生命周期门禁的触发器替换永久更新禁令。既有配置此前不可变，其修改人／时间取原创建人／时间，不推测历史变更。升级期间暂停 Production 写入；down 要求配置表为空，避免丢弃已经使用的可变配置审计。开发环境允许统一重置，所有 migration 可从空库恢复最新结构，不修改已执行文件。

## 3.2 生产执行表

---

### 4. `work_orders`

职责：维护生产工单，记录某个产品的整体生产计划。

| 字段                    | 类型              | 说明                                                             |
| ----------------------- | ----------------- | ---------------------------------------------------------------- |
| `id`                    | `BIGINT UNSIGNED` | 主键，自增                                                       |
| `work_order_no`         | `VARCHAR(100)`    | 工单编号                                                         |
| `order_type` | `VARCHAR(30)` | 必填：`mass_production` 批量生产、`research` 研发任务 |
| `previous_research_order_id` | `BIGINT UNSIGNED` | 前序研发工单，可空；仅新建时关联，之后不可改 |
| `product_id`            | `BIGINT UNSIGNED` | 计划生产对象 ID                                                  |
| `product_code_snapshot` | `VARCHAR(100)`    | 下达时产品编码快照                                               |
| `product_name_snapshot` | `VARCHAR(200)`    | 下达时产品名称快照                                               |
| `unit_snapshot`         | `VARCHAR(20)`     | 下达时单位快照                                                   |
| `planned_quantity`      | `INT`   | 工单计划生产数量                                                 |
| `customer_name`         | `VARCHAR(255)`    | 客户名称，可为空                                                 |
| `quality_level`         | `VARCHAR(50)`     | 客户自定义质量等级代码，可为空                                   |
| `work_order_owner_id`   | `BIGINT UNSIGNED` | 工单负责人；草稿可为空，下达必须为有效用户                             |
| `plan_start_date`       | `DATE`            | 计划开始日期，可为空                                             |
| `plan_end_date`         | `DATE`            | 计划完工日期，可为空                                             |
| `status`                | `VARCHAR(30)`     | `draft`、`released`、`doing`、`completed`、`cancelled`、`closed` |
| `released_at`           | `DATETIME`        | 下达时间                                                         |
| `cancel_reason`         | `TEXT`            | 草稿工单取消原因；历史未记录数据可为空                           |
| `cancelled_by`          | `BIGINT UNSIGNED` | 草稿工单取消人；历史未记录数据可为空                             |
| `cancelled_at`          | `DATETIME`        | 草稿工单取消时间；历史未记录数据可为空                           |
| `close_type`            | `VARCHAR(30)`     | `unproduced`、`underproduced`、`completed_archive`、`production_terminated`               |
| `close_reason`          | `TEXT`            | 提前关闭原因；正常完工归档及历史未记录数据可为空                 |
| `closed_by`             | `BIGINT UNSIGNED` | 关闭人；历史未记录数据可为空                                     |
| `closed_at`             | `DATETIME`        | 关闭时间；历史未记录数据可为空                                   |
| `external_order_no`     | `VARCHAR(100)`    | 外部订单号，可为空                                               |
| `remark`                | `TEXT`            | 备注                                                             |
| `version`               | `INT`             | 乐观锁版本号，默认 `0`                                           |
| 业务审计字段            | 见统一规则        | 可变业务单据审计字段                                             |

约束：

- 主键：`id`
- 唯一约束：`UNIQUE (work_order_no)`
- 组合引用索引：`UNIQUE (id, product_id)`
- 外键：`FOREIGN KEY (product_id) REFERENCES products(id)`
- 外键：`work_order_owner_id -> users.id`
- 外键：`cancelled_by -> users.id`、`closed_by -> users.id`，删除用户引用时置空
- 检查约束：`CHECK (planned_quantity > 0)`
- 检查约束：`CHECK (status IN ('draft', 'released', 'doing', 'completed', 'cancelled', 'closed'))`
- 检查约束：`CHECK (plan_start_date IS NULL OR plan_end_date IS NULL OR plan_end_date >= plan_start_date)`
- 索引：`INDEX (external_order_no)`
- 索引：`INDEX (work_order_owner_id, status, created_at)`
- 索引：`INDEX (plan_start_date)`
- 组合索引：`INDEX (status, created_at)`，用于工单状态分页

说明：

- 工单表示整体生产计划。
- 一个工单可以拆分为多个生产批次。
- 工单处于 `released` 或 `doing` 且仍有未分配计划量时均可继续创建生产批次；首批次开工不冻结工单剩余任务拆分能力。
- 生产领料、生产入库、半成品入库等动作建议落到 `production_batches` 维度。
- 产品快照在工单下达时冻结，后续修改产品主数据不得回写历史工单。
- 工单下达事务先锁工单，确认 `work_order_owner_id` 非空，再通过 Identity 公开能力复核账号启用且未删除；草稿仍允许暂缺负责人。下达只校验账号，不授予审批权限，任务结案送审时由 Approval 独立检查 `approval:decide`。
- 负责人仅可随草稿编辑，下达后不提供负责人转交接口。结案送审固定当时的负责人及来源工单证据，后续节点不重新解析或自动替换人员。
- `quality_level` 是客户自定义等级，不建立固定状态字典或 `CHECK`；如后续需要客户级等级主数据，必须另行建模，不能把自由文本解释为质量结论。
- 工单实际开工时间不单独持久化，由所属批次的最早 `started_at` 推导；工单实际完工时间由已完工批次的 `completed_at` 汇总，避免形成第二执行事实来源。

当前采用单一 BOM 模型，不建设 BOM 版本头、版本行或当前版本指针。BOM 最终审批通过时，由 Product 与审批同事务写入 `products.bom_locked_at/bom_locked_by`；生产任务创建只通过 Product 公开能力验证已批准及当前物料资格；此后 `product_materials` 永久只读。任务取消、需求完成、库存归零和路线状态变化都不能解锁。原则性用料变化必须创建新产品和新编码，再显式复制、复核 BOM 与路线。产品名称等展示字段修改不改变稳定产品身份，也不破坏既有 ID 引用。

#### 工单审批接入目标结构（尚未实施）

以下为 [ADR-0006](../../../../../../../docs/adr/0006-approval-workflow-boundaries.md) 的技术细化草案，不覆盖当前直接下达实现；审批表和事务协作见[审批设计稿](../../../../../../../docs/approval-design.md)。

| `work_orders` 字段 | 目标类型 | 目标语义 |
| --- | --- | --- |
| 新增 `release_approval_instance_id` | `BIGINT UNSIGNED NULL` | 当前送审或已完成下达所依据的申请 FK `approval_instances.id` |
| 既有 `version` | 保持原类型 | 工单编辑、送审、退回及下达使用同一聚合乐观锁 |
| 既有 `status` | 保持原值域 | 审批中仍为 `draft`，最终批准才进入 `released` |

`draft` 且申请关联非空时展示“草稿 · 审批中”，禁止普通编辑、取消和直接下达；要编辑或取消先由申请人撤回。`draft` 且关联为空才是可编辑草稿。最终批准后保留申请引用，后续生产、关闭不清空；驳回或撤回清空当前关联、保持 `draft` 并递增版本。旧申请按场景和对象引用查询，不以当前字段保留全部历史。

目标状态组合：`cancelled` 必须无申请关联，`released/doing/completed/closed` 必须有批准依据；`draft` 允许有或无关联。数据库 CHECK 保证字段组合，普通 FK 和索引保证引用存在及查询；审批场景、对象类型/ID、申请结果和当前关联匹配由两个所有者的应用事务校验，不由 FK 猜测多态归属。

提交时冻结全部工单可编辑资料，包括成品 ID/编码/名称/单位、类型、数量、客户、外部订单号、质量要求、交期、负责人和备注；保存审批证据并在递增工单版本后记录该冻结版本。下达写入本次已审查的成品快照，重新核对当前成品身份和使用资格，不能最后一步悄悄换成别的产品或未审查资料。来源成品名称后来变化不回写受审证据。

下达审批不要求 BOM 已完整或已批准，销售可基于有效成品编码先正式下达任务；生产任务创建才要求 Product 已批准且永久锁定的 BOM，并继续检查工单余量、路线、物料等原业务资格。现有直接下达接口必须改为审批提交或拒绝绕过，不能保留平行直通入口。

这些目标约束需与审批上线共同追加 migration，现有历史工单不能伪造批准依据；当前开发环境可重置并用统一种子验证。

#### 生产工单状态与管理动作

未来审批设计见 [ADR-0006](../../../../../../../docs/adr/0006-approval-workflow-boundaries.md)：沿用现有工单承接只有成品编码及必要资料、尚无完整 BOM 的任务，工单审批必须核对成品身份与外部订单要求。工单最终批准后下达，生产任务创建另行要求 BOM 已经独立审批通过并永久锁定。工单审批尚未实施，以下状态表仍描述当前直接下达机制；新增审批门禁与状态机细化见 [roadmap](../../../../../../../docs/roadmap.md)。

生产工单的成功完工不由生产批次自动回写。管理员必须通过显式“确认工单完工”命令复核工单计划量、非取消批次、当前批准清单的计划内产出及未结案批次后，再把工单转为 `completed`。管理端确认不替代后端事务校验。

| 当前状态 | 管理动作 | 后端规则与目标状态 |
| --- | --- | --- |
| `draft` | 取消工单 | 尚未下达且没有执行事实时允许；必须填写原因，直接进入 `cancelled` |
| `draft` | 下达工单 | 事务内校验有效负责人，冻结下达快照并进入 `released` |
| `released` | 首个生产批次实际开工 | 与批次开工同事务进入 `doing`；创建或分配批次本身不代表开工 |
| `released` / `doing` | 确认工单完工 | 所有非取消批次均为 `completed`，且其当前批准清单的计划内产出合计等于工单 `planned_quantity` 时，管理员二次确认后进入 `completed` |
| `released` / `doing` | 提前关闭工单 | 不存在未终态批次且全部非取消批次均有批准清单时允许进入 `closed`；必须填写关闭原因。没有批次或只有已取消批次属于未生产结案，正常结案批次的审定计划内产出小于计划量属于不足量结案；含 `terminated` 批次时归为 `production_terminated`，不以报工量替代可用产出 |
| `released` / `doing` | 提前关闭工单但存在未终态批次 | 拒绝并返回未处理批次摘要；管理员须先逐批完成或取消。生产批次没有 `closed` 状态，提示语固定为“请先完成、取消或通过收尾审批结束所有未结束生产批次” |
| `completed` | 关闭工单 | 作为成功完工后的行政归档进入 `closed` |

补充规则：

- “取消”只表达从未下达的草稿作废；工单一经下达，提前终止统一使用“关闭”，不得再执行 `released/doing -> cancelled`。
- `completed` 表达生产计划足量完成，`closed` 同时覆盖成功完工后的归档以及下达后的提前结案；查询直接使用 `close_type` 区分，不得把提前关闭展示为正常完工。
- 提前关闭不得自动取消生产批次。存在未终态或缺少批准清单的批次时返回批次编号、状态、计划量、末工序报工量及审定计划内产出，由管理员逐批核对后执行正常结案、未执行取消，或逐项收尾与审批结束。
- 草稿取消、提前关闭和完工后归档均提交工单 `version`；终态类型、原因、操作人、操作时间与状态在业务主表同一条更新中写入，并与成功操作日志同事务提交。`operation_logs` 只承担审计和排障，不作为工单详情的业务事实查询来源，也不复用 `remark` 覆盖原备注。

---

### 5. `production_batches`

职责：维护生产批次，表示某个工单被拆分后的实际生产批次。

| 字段                     | 类型              | 说明                            |
| ------------------------ | ----------------- | ------------------------------- |
| `id`                     | `BIGINT UNSIGNED` | 主键，生产批次 ID               |
| `work_order_id`          | `BIGINT UNSIGNED` | 工单 ID                         |
| `product_id`             | `BIGINT UNSIGNED` | 冗余产品 ID，与工单组合外键约束 |
| `batch_no`               | `VARCHAR(100)`    | 生产批号                        |
| `route_id`               | `BIGINT UNSIGNED` | 工艺路线 ID，可为空             |
| `route_code_snapshot`    | `VARCHAR(64)`     | 路线编码快照                    |
| `route_version_snapshot` | `VARCHAR(64)`     | 路线版本快照                    |
| `planned_quantity`       | `INT`   | 本批次计划生产数量              |
| `plan_start_date`        | `DATE`            | 本批次计划开始日期，可为空        |
| `plan_end_date`          | `DATE`            | 本批次计划完工日期，可为空        |
| `started_at`              | `DATETIME`        | 批次实际开工时间，可为空        |
| `completed_at`           | `DATETIME`        | 正常结案末级批准时间，可为空            |
| `execution_completed_at / execution_completed_by` | `DATETIME / BIGINT UNSIGNED` | 正常执行确认时间／人员，成对填写，人员 FK 用户 |
| `completed_by`           | `BIGINT UNSIGNED` | 完工确认人，可为空              |
| `cancel_reason`          | `TEXT`            | 取消原因；历史未记录数据可为空  |
| `cancelled_by`           | `BIGINT UNSIGNED` | 取消人；历史未记录数据可为空    |
| `cancelled_at`           | `DATETIME`        | 取消时间；历史未记录数据可为空  |
| `status`                 | `VARCHAR(40)`     | 生产批次状态                    |
| `material_plan_version`  | `INT UNSIGNED`    | 当前整组物料需求计划版本，默认 `1`；用于判断短批授权是否过期 |
| `batch_owner_id`         | `BIGINT UNSIGNED` | 批次负责人，负责该批次执行，可为空 |
| `remark`                 | `TEXT`            | 备注                            |
| `version`                | `INT`             | 乐观锁版本号，默认 `0`          |
| 业务审计字段             | 见统一规则        | 可变业务单据审计字段            |

约束：

- 主键：`id`
- 外键：`FOREIGN KEY (work_order_id, product_id) REFERENCES work_orders(id, product_id)`
- 外键：`FOREIGN KEY (route_id) REFERENCES process_routes(id)`
- 外键：`FOREIGN KEY (batch_owner_id) REFERENCES users(id)`
- 外键：`FOREIGN KEY (completed_by) REFERENCES users(id)`
- 外键：`cancelled_by -> users.id`，删除用户引用时置空
- 检查约束：`CHECK (planned_quantity > 0)`
- 检查约束：`CHECK (planned_quantity = TRUNCATE(planned_quantity, 0))`
- 检查约束：`CHECK (plan_start_date IS NULL OR plan_end_date IS NULL OR plan_end_date >= plan_start_date)`
- 检查约束：`CHECK (status <> 'completed' OR (completed_at IS NOT NULL AND completed_by IS NOT NULL))`
- 唯一约束：`UNIQUE (batch_no)`；批次号在全系统范围内唯一，自动编号与手动输入均由后端校验
- 组合引用索引：`UNIQUE (id, work_order_id)`、`UNIQUE (id, product_id)`
- 检查约束：`CHECK (status IN ('pending', 'material_pending', 'material_assigned', 'material_partially_outbound', 'material_outbound', 'doing', 'completed', 'cancelled', 'terminated', 'closing'))`
- 检查约束：`CHECK (material_plan_version > 0)`
- 组合索引：`INDEX (work_order_id, status)`，用于按工单查询有效生产批次
- 索引：`INDEX (plan_start_date)`，用于生产排程与按计划开工日筛选

状态说明：

| 状态                | 含义                   |
| ------------------- | ---------------------- |
| `pending`           | 待开始                 |
| `material_pending`  | 待生成或待确认物料需求 |
| `material_assigned` | 物料已分配             |
| `material_partially_outbound` | 已确认一部分领料，但仍有活动物料需求 （该状态仅在短批授权的批次下才会出现，正常情况原始物料需求应该被整体满足出库，不可能出部分出库的情况） |
| `material_outbound` | 尚未开工，且已经完成当时全部活动需求的确认领用；后续补料需求不使本状态回退 |
| `doing`             | 生产中                 |
| `completed`         | 生产完成               |
| `cancelled`         | 已取消                 |
| `closing` | 结案处理中，停止执行；逐项核对、质检记录及产出清单送审 |
| `terminated` | 收尾审批通过，产出处置单独登记，不代表足量完工 |

批次状态转换以 `production-status.policy.ts` 为代码入口，与[数据库公共状态矩阵](../../../../../../../docs/database-conventions.md#核心状态转换矩阵)一致：

| 当前状态 | 允许的下一状态 |
| --- | --- |
| `pending` | `material_pending`、`cancelled` |
| `material_pending` | `material_assigned`、`material_partially_outbound`、`material_outbound`、`cancelled` |
| `material_assigned` | `material_pending`、`material_outbound`、`cancelled` |
| `material_partially_outbound` | `material_outbound`、`doing`、`closing` |
| `material_outbound` | `doing`、`closing` |
| `doing` | `closing` |
| `closing` | 首份清单末级批准后 normal → `completed`，early → `terminated` |
| `completed`、`cancelled`、`terminated` | 无，终态 |

状态边仅是必要条件；实际命令还必须满足下面的取消、齐套、短批授权和执行门禁。

任务生成与取消规则：

- 创建生产批次只接受 `released`、`doing` 工单，并在工单锁内重新汇总排除 `cancelled/terminated` 后的任务计划量；有效分配量加本次新增量不得超过工单计划量。创建批次本身不推动工单进入 `doing`。
- `pending` 只允许在创建批次时由数据库默认值产生，已有批次不得迁回 `pending`。释放尚未出库的有效分配后，如果批次不再齐套，允许 `material_assigned → material_pending`；这不是重新开放正常需求生成。
- 所有 `production_batches.status` 和 `work_orders.status` 写入都必须先通过 `production-status.policy.ts` 的统一转换校验；SQL 中的旧状态条件和乐观锁只用于防并发覆盖，不能替代领域校验。
- 生产批次的“取消任务”与“结束本轮”分开：已领料或执行中批次使用 `terminated`，规则见[批次结束与产出处置](production-termination.md)。只允许 `pending`、`material_pending`、`material_assigned` 取消，即任务尚未开工且物料尚未实际出库；`material_partially_outbound` 已形成库存事实，不能取消。
- 取消前管理端必须读取服务端实时影响摘要，展示将取消的待确认出库单、有效预留和活动需求数量，并要求填写取消原因；提交事务仍须重新锁定批次及相关单据校验，不能信任前端摘要。
- 取消事务把 `pending_picking` 待出库单转为 `cancelled`、把活动分配转为 `cancelled` 以释放库存预留、把活动需求转为 `cancelled`，最后把生产批次状态、取消原因、取消人和取消时间同一条更新写入；这些写入和成功审计同事务提交，不生成 `inventory_transaction`。
- `material_partially_outbound`、`material_outbound`、`doing`、`completed` 明令禁止取消。只要存在已确认出库事实，即使批次状态异常滞后也必须拒绝；第一版不提供强制取消或绕过入口。已开工批次通过独立逐项收尾及结案流程结束，不能复用本取消命令。

短批状态与版本规则：

- `material_plan_version` 不是单条需求版本，而是“管理员授权时看到的整组物料计划编号”。创建或取消需求时递增；继续确认出库只会缩小缺口，不递增。退料是余料回仓，不恢复需求、不推进该版本、不改变授权状态；短批开工只要求已发生确认领料，不扣除退料。
- 有效短批授权确认首笔部分领料后，批次从 `material_pending` 进入 `material_partially_outbound`；该状态只表达已经发生部分出库，不表达授权是否仍有效。
- `material_partially_outbound` 不因后续完成分配而回退到 `material_assigned/material_pending`。当前版本授权失效但全部活动需求已经完成分配时，可以不关联短批授权继续普通领料；全部需求确认出库后前进到 `material_outbound`。
- `material_outbound` 与此前是否使用短批授权无关：普通任务由 `material_assigned` 进入；短批任务若在实际开工前补齐全部领料，也由 `material_partially_outbound` 进入。批次已经凭短批授权进入 `doing` 后，后续补齐物料不回退到 `material_outbound`。
- `material_outbound` 形成后新增的工序报废或生产领料损耗补料需求由 `production_item_demand.business_status` 表达，不要求批次状态回退。此时只有活动补料需求可以重新进入分配、候选与制单链路，已经满足的正常需求及其历史分配不得重新成为出库候选。
- 首工序开工事务重新检查授权仍有效、版本匹配、已发生确认领料（不扣除退料，全部退回也不影响开工资格），且实际缺口没有超过逐需求批准值，成功后进入 `doing` 并消费授权。
- 短批开工后剩余活动需求继续分配和出库；存在活动需求时批次不得完成。完整授权表、剩余需求关闭和出库关联规则见 [生产需求、分配与领料出库](demand-allocation-and-outbound.md)。
- 批次查询除授权状态外还派生短批授权动作，供管理端决定显示“授权、重新授权、调整、查看、无需授权”。该字段不是写入事实，授权预览和提交事务必须按锁内最新需求、分配及授权明细重新计算。

当前生产执行完工数量规则：

- 以本批次中 `step_order_snapshot` 最大的工序作为数量来源工序，同序时按工序记录 ID 降序确定；查询字段 `lastStepReportedQuantity` 从该工序的不可变 `batch_step_reports` 聚合 `effective_normal`，计入冲销和替代事实，不在批次表缓存数量。进行中或提前结束任务已有的有效末工序报工也按同一口径展示；无工序或尚无报工时查询返回 `0`，不代表已执行完成。
- 执行完工命令必须在事务内重新锁定并校验所有工序均为 `completed`、需求和补料已满足、末道有效正常量达到执行目标；成功只记录 `execution_completed_at/by`、进入 `closing` 并创建 normal 结案草稿，不另存一份执行完成量。
- 当前至少需要存在一道工序；没有数量来源工序的批次不得执行完工确认。
- 正常执行确认尚未最终结案；提前停止使用 early closing 逐项收尾。两种模式均登记最终产出和质检事实，交工单负责人同一结案流程批准，管理员产出处置不改报工事实。正常工序已完但最终可用不足计划可以按实际批准，不强制补产。
- 批次表不保存执行数量或最终合格数量。质检留存独立记录，审定产出只来自当前批准清单。工序记录用 `normalQuantity` 表示有效正常报工量，不能解释为质检合格量或回写为批次数量。

当前数量结构由追加迁移 `202609170008-drop-batch-output-counters` 删除批次旧数量列及其约束，计划数量的正整数约束保留。既有迁移不修改；回退仅从末工序报工恢复已经正常确认执行完成的旧完成量，不推造质检合格量。详情、追溯与幂等结果契约同步使用派生字段，不提供旧字段兼容双写。

任务列表、详情及工单下属任务通过 `finalOutput` 返回当前批准清单的 `revisionNo/availableQuantity/extraQuantity/scrapQuantity`；未有批准清单时返回 `null`，已批准零产出则明确返回零。只关联 `production_batch_closeout.current_revision_id`，不累加历史版本，不读取更正草稿，也不双写批次数量。`scrapQuantity` 为该版历史工序报废与结案新增报废合计。执行报工量独立使用 `lastStepReportedQuantity`，追溯与工单操作核对使用相同口径。

工单汇总、完工／关闭确认与各任务使用相同批准口径。可用产出合计为计划内加计划外，不含报废；既有 `finalOutput.totalQuantity` 表达含报废的总处置量，不得标成合格或可入库数量。计划缺口为负数时，页面展示“超出 N”，不修改计划额度规则。

`GET /production/work-orders/options` 在原任务创建权限内返回计划量、有效已分配量、已终止计划量、剩余可分配量与当前批准产出汇总。新增任务展示这些实时投影及本次分配后的余额；剩余额度仍按计划减有效任务计划计算，不扣减审定产出，最终创建事务重新锁定校验。

说明：

- `production_batches` 是生产执行批次，不是库存批次。
- 生产批次负责表达“这一批怎么生产”。
- `product_id` 是受组合外键保护的查询冗余，不允许与工单产品不一致。
- 路线快照在批次创建时冻结；批次执行期间不能跟随路线主数据变化。
- `plan_start_date`、`plan_end_date` 是批次排程，不是实际执行事实；实际开工、执行完成分别以 `started_at`、`execution_completed_at` 为准；`completed_at` 表示正常结案批准。
- 成品入库使用 item_batch.product_id 分支，来源任务与工单必填；仓管按最新批准清单收齐本类别后一次确认，任务结案与工单关闭不代办入库。物料精确版本分支及其外键保留。

---

## 工单计划分配口径

`assignedQuantity` 是所有非 `cancelled/terminated` 任务的计划量合计；`closing` 与正常完工 `completed` 仍占用。`terminatedPlannedQuantity` 是已终止任务原计划量合计，仅作历史展示。`remainingQuantity` 为工单计划减有效分配；列表、详情、工单候选与创建事务共用同一 SQL 口径。页面主数显示有效分配，附注“已终止计划 N，不占额度”；不把历史累计安排量作为分配上限。

首份提前结束清单批准成为 `terminated` 才释放原计划额度，原任务计划量不改零。此规则只控制任务分配，不扣除终止任务已经批准的产出，也不保证累计产出小于工单计划；已终止产出继续按当前批准清单汇总。产出更正不会回写分配额度，取消和提前结束不抹除已发生事实。

## 工单产出查询口径

列表及详情 `finalOutput` 只累计每个已結案任务根 `current_revision_id` 所指向的批准清单，计划内 `availableQuantity`、额外 `extraQuantity`、历史及新增报废分别展示；不累计旧版本，不将报工数当作最终可用量。计划缺口仅减计划内批准量，额外及报废不抵扣。

`finalizedBatchCount` 统计 completed/terminated，`closingBatchCount/pendingAvailableQuantity` 单列处理中任务和未审定草稿量；未审定量不计最终产出。正常结案可以少于计划，工单不足量关闭据批准量判断；含提前结束任务仍使用 `production_terminated`，不因数量达标变成正常完工。任务终态与待入库进度相互独立。
