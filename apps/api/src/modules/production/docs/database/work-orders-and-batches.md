# Production 工单与批次数据库设计

## 工单与任务自动编号

工单与任务按[统一编号](../../../../../docs/business-numbering.md)分别使用 `work_order`、`production_batch` 类型，编号由服务端生成且不可改。公共字段、数量与审计遵守[数据库约定](../../../../../../../docs/database-conventions.md)；本章维护工单、任务的逐表结构、设计职责和业务边界。

工单与任务创建均要求 `Idempotency-Key`，scope 与结果定义见[应用幂等契约](../../application/idempotency/)。创建重放保留原产品与负责人快照，不因当前资格变化失败。任务创建结果为轻量概览，不含工序、开工说明或开工物料快照。

## 研发轮次关联与资料带出

`work_orders.previous_research_order_id` 是可空的前序研发工单自引用外键，仅创建时设置，之后永久不变。关联工单必须保持 `research` 类型，数据库 CHECK 保护该约束；插入触发器拒绝自指，更新触发器拒绝建立、移除或更换已有工单的前序关系。前序删除受外键限制，不级联删除研发历史。

新建续轮事务先锁定前序工单，确认其类型为研发、状态为 `completed` 或 `closed`，且本轮成品 ID 与前序不同，再分配新工单号并创建。旧轮产出可以仍待入库；续轮不改变旧轮结案、批准清单或入库资格。草稿编辑必须再次校验前序关联，不允许通过编辑改为批量单或改回前序成品。前序不能是取消单、草稿、已下达或生产中的单据；不存在“恢复旧轮”入口。

一个前序允许关联多个后续研发方向，不额外维护轮次计数、研发项目表或成功／失败字段。所有前序均在新工单创建前存在，且关系不可改，配合非自指约束形成可逐轮追溯的关系。后续草稿被取消时仍保留关联，不删除历史。

`POST /production/work-orders` 接受可选 `previousResearchOrderId`，同原创建命令使用 HTTP 幂等。列表和详情返回该 ID；详情另含只读 `previousResearchOrder` 摘要与 `nextResearchOrders` 直接后续列表，提供工单号、成品 ID／编码／名称及状态。查询仍按 Production 权限执行，直接前后关系通过现有详情接口逐轮浏览，不新增追溯路由或复制整条链快照。

开启下一轮研发时重新读取前序详情，预填可编辑的计划数量、负责人、客户、质量等级、外部订单号和备注；新成品和计划日期要求重新选择，类型固定为研发，前序关联只读。失效负责人仍沿原候选校验处理。

新成品通过 Product 原有入口建立，研发任务不要求 BOM 或工艺路线。续轮只带出可编辑计划资料，不复制或改写旧需求、分配、批次、库存、报工、BOM 批准记录和审批事实；本轮可以直接手工提出任意有效物料及版本的需求。

迁移 `202609170005-research-work-order-lineage` 直接追加可空关联及约束，旧工单不推测前序。down 在存在任何研发关联时拒绝丢弃历史，开发环境可按统一约定重置后回退；已执行 migration 不修改。

## 工单类型与物料版本规则

`work_orders.order_type` 只允许 `mass_production` 与 `research`，草稿可改、下达后固定。任务沿所属工单读取类型，HTTP `ProductionBatchItem.orderType` 明确返回此值，不另存任务类型列。长期决定见 [ADR-0014](../../../../../../../docs/adr/0014-task-material-policy-and-output-inspection.md)。

| 规则 | 批量任务 | 研发任务 |
| --- | --- | --- |
| 创建任务 | 必须显式选择路线，经 Product 复核启用且未删除的路线与已批准、锁定且有效的 BOM | 只复核有效自制成品，不读取、不审批 BOM |
| 初始需求 | 完整覆盖 BOM，数量为单耗 × 任务计划量，每物料选择一个版本 | 管理员从有效物料目录手工提需，版本与正整数数量逐笔填写 |
| 版本一致性 | 同任务同基础物料固定一个精确版本，不同任务可不同 | 工单和任务无统一版本锁，同物料可使用多个启用版本 |
| 后续人工提需 | 仅本任务冻结 BOM 物料，继续原锁定版本 | 可追加此前未用过的物料、其他版本和数量 |
| 供应商提示 | 初配随版本一起冻结 | 本次具体需求可选填写，后续不强制继承 |
| 工艺执行 | 创建时手动选择路线，冻结路线、工序与 SOP，按工序报工 | 不选择路线、不生成工序，使用任务级开始／结束 |
| 领料损坏 | 仅记录实际损坏，需要更多物料另行人工提需 | 相同规则；不自动生成同版等量需求 |

“同物料”按稳定 `materials.id` 判断，不按名称或分类。无版本锁也不放宽实际需求、分配和领料的精确版本一致性与生产用途资格。

### 批量任务确认与冻结

`production_material_requirement_basis` 同时承担本任务 BOM 公式、`locked_material_variant_id` 和 `supplier_hint` 的冻结配置。管理员在任务初始需求窗口一次确认全部 BOM 行，基础、锁版提示、正式需求、任务状态和成功审计同事务提交。初次确认前可以调整选择，提交后不提供修改入口；需要另一版本时创建新任务，旧任务按实际执行情况取消或结案，正常完工历史不阻断其他任务选版。

本表保证一任务一物料只有一份配置，版本归属及下游需求版本由组合外键约束。任务基础禁止更新、删除。研发不写基础；不保留 `work_order_material_versions`、工单配置接口或跨任务修改阻断。

初配、追加和工序报废补料仍按工单 → 任务 → 所需事实顺序锁定，工单锁服务父状态和计划并发，不表示工单统一锁版。初配在 Product 公共能力内复核 BOM 与启用版本；后续命令校验本任务基础。供应商提示不限制实际采购或领料供应商，采购逐来源展示并独立选择实际供应商。

| API | 契约 |
| --- | --- |
| `GET /production/material-demands` | 任务需求基础及历史需求投影；研发 BOM 专属字段为空 |
| `GET /production/material-demands/material-options` | 研发手工提需有效物料远程候选，关键词窗口 50 项，最多 100 个 `includeIds` 回显 |
| `POST /production/batches/:batchId/material-demands/configurations` | 批量专用，完整 `requirements[{productMaterialId,splits:[{materialVariantId,quantity,supplierHint?}]}]`，每行一个版本 |
| `POST /production/batches/:batchId/material-demands/additions` | `{reason,requirements:[{materialId,splits:[{materialVariantId,quantity,supplierHint?}]}]}`；研发首次与后续均使用该入口，批量追加不接受修改供应商提示 |

创建研发任务保留工单可用状态、负责人、日期及计划额度校验；不得传入路线或工序覆盖。工单向有效任务分配的总计划量仍不超过工单计划，`cancelled/terminated` 释放额度，`closing/completed` 保留占用。实际可用产出可超计划，超出部分进入计划外清单，不回改任务计划。

创建批量任务时 `routeId` 必须由请求显式提供，缺失或空值返回 `400 INVALID_INPUT`，不使用成品历史默认值或第一条候选。Product 在同一事务重新核验所选路线启用、未删除及有效工序，并冻结执行快照。路线后续停用或归档只影响新任务选用；既有任务保持原快照，编辑负责人、计划日期和备注不重新校验当前路线资格，也不更换路线。历史无路线批量任务不自动补路或补造工序，须按既有取消资格取消后重新创建；不具备取消资格的历史任务仍待单独确认处置方式。

迁移 `202609200001-task-material-policy` 替换配置粒度、扩展基础与需求约束；up/down 均拒绝既有生产任务，开发数据通过统一初始化入口重建，不推断历史配置或双写。

## 3.2 生产执行表

---

### 4. `work_orders`

职责：维护生产工单，记录某个产品的整体生产计划。

历史取消和关闭的原因、人员、时间允许缺失；正常完工归档也不要求关闭原因，不补造历史。

取消人、关闭人的历史用户引用在用户被物理删除时置空。

说明：

- 工单处于 `released` 或 `doing` 且仍有未分配计划量时均可继续创建生产批次；首批次开工不冻结工单剩余任务拆分能力。
- 当前生产领料与批准成品入库关联 `production_batches`；其他自产半成品入库不属于当前范围。
- 产品编码、名称和单位在工单下达时冻结，后续主数据变化不回写历史工单。
- 工单负责人选择与下达使用下节的固定场景资格；草稿仍允许暂缺负责人。
- 负责人仅可随草稿编辑，下达后不提供负责人转交接口。结案送审固定当时的负责人及来源工单证据，后续节点不重新解析或自动替换人员。
- `quality_level` 是客户自定义等级，不建立固定状态字典或 `CHECK`；如后续需要客户级等级主数据，必须另行建模，不能把自由文本解释为质量结论。
- 工单实际开工时间不单独持久化，由所属批次的最早 `started_at` 推导；工单实际完工时间由已完工批次的 `completed_at` 汇总，避免形成第二执行事实来源。

BOM 批准与永久锁定由 [Product](../../../product/docs/product-rules.md)维护；任务取消、履约或路线变化不撤销这项批准事实。

**`work_orders` 字段定义**

| 字段 | SQL 定义 | 业务含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键，自增 |
| `work_order_no` | `VARCHAR(100) NOT NULL` | 工单编号 |
| `order_type` | `VARCHAR(30) NOT NULL` | 必填：`mass_production` 批量生产、`research` 研发任务 |
| `previous_research_order_id` | `BIGINT UNSIGNED NULL` | 前序研发工单，可空；仅新建时关联，之后不可改 |
| `product_id` | `BIGINT UNSIGNED NOT NULL` | 计划生产对象 ID |
| `product_code_snapshot` | `VARCHAR(100) NOT NULL` | 下达时产品编码快照 |
| `product_name_snapshot` | `VARCHAR(200) NOT NULL` | 下达时产品名称快照 |
| `unit_snapshot` | `VARCHAR(20) NOT NULL` | 下达时单位快照 |
| `planned_quantity` | `INT NOT NULL` | 工单计划生产数量 |
| `customer_name` | `VARCHAR(255) NULL` | 客户名称，可为空 |
| `quality_level` | `VARCHAR(50) NULL` | 客户自定义质量等级代码，可为空 |
| `work_order_owner_id` | `BIGINT UNSIGNED NULL` | 工单负责人；草稿可为空，下达必须符合工单负责人场景资格 |
| `plan_start_date` | `DATE NULL` | 计划开始日期，可为空 |
| `plan_end_date` | `DATE NULL` | 计划完工日期，可为空 |
| `status` | `VARCHAR(30) NOT NULL DEFAULT 'draft'` | `draft`、`released`、`doing`、`completed`、`cancelled`、`closed` |
| `released_at` | `DATETIME NULL` | 下达时间 |
| `cancel_reason` | `TEXT NULL` | 草稿工单取消原因；历史未记录数据可为空 |
| `cancelled_by` | `BIGINT UNSIGNED NULL` | 草稿工单取消人；历史未记录数据可为空 |
| `cancelled_at` | `DATETIME NULL` | 草稿工单取消时间；历史未记录数据可为空 |
| `close_type` | `VARCHAR(30) NULL` | `unproduced`、`underproduced`、`completed_archive`、`production_terminated` |
| `close_reason` | `TEXT NULL` | 提前关闭原因；正常完工归档及历史未记录数据可为空 |
| `closed_by` | `BIGINT UNSIGNED NULL` | 关闭人；历史未记录数据可为空 |
| `closed_at` | `DATETIME NULL` | 关闭时间；历史未记录数据可为空 |
| `external_order_no` | `VARCHAR(100) NULL` | 外部订单号，可为空 |
| `remark` | `TEXT NULL` | 备注 |
| `version` | `INT NOT NULL DEFAULT 0` | 乐观锁版本号，默认 `0` |
| `created_by` | `BIGINT UNSIGNED NULL` | 创建人 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 创建时间 |
| `updated_by` | `BIGINT UNSIGNED NULL` | 最近修改人 |
| `updated_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最近修改时间 |

**`work_orders` 键、索引与检查约束**

| 类别 | 定义 |
| --- | --- |
| 主键 | `PRIMARY KEY (id)` |
| 外键 | `CONSTRAINT fk_work_orders_product FOREIGN KEY (product_id) REFERENCES products(id)` |
| 外键 | `CONSTRAINT fk_work_orders_owner FOREIGN KEY (work_order_owner_id) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_work_orders_created_by FOREIGN KEY (created_by) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_work_orders_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_work_orders_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE SET NULL` |
| 外键 | `CONSTRAINT fk_work_orders_closed_by FOREIGN KEY (closed_by) REFERENCES users(id) ON DELETE SET NULL` |
| 外键 | `CONSTRAINT fk_work_orders_previous_research FOREIGN KEY (previous_research_order_id) REFERENCES work_orders(id)` |
| 唯一键 | `UNIQUE KEY uk_work_orders_no (work_order_no)` |
| 唯一键 | `UNIQUE KEY uk_work_orders_product_reference (id, product_id)` |
| 索引 | `KEY idx_work_orders_status_created_at (status, created_at)` |
| 索引 | `KEY idx_work_orders_owner_status_created_at (work_order_owner_id, status, created_at)` |
| 索引 | `KEY idx_work_orders_plan_start_date (plan_start_date)` |
| 索引 | `KEY idx_work_orders_external_order_no (external_order_no)` |
| 索引 | `KEY idx_work_orders_cancelled_by (cancelled_by)` |
| 索引 | `KEY idx_work_orders_closed_by (closed_by)` |
| 索引 | `KEY idx_work_orders_previous_research (previous_research_order_id,id)` |
| CHECK | `CONSTRAINT chk_work_orders_quantity CHECK (planned_quantity > 0)` |
| CHECK | `CONSTRAINT chk_work_orders_plan_dates CHECK (plan_start_date IS NULL OR plan_end_date IS NULL OR plan_end_date >= plan_start_date)` |
| CHECK | `CONSTRAINT chk_work_orders_status CHECK (status IN ('draft', 'released', 'doing', 'completed', 'cancelled', 'closed'))` |
| CHECK | `CONSTRAINT chk_work_orders_version CHECK (version >= 0)` |
| CHECK | `CONSTRAINT chk_work_orders_quantity_integer CHECK (planned_quantity = TRUNCATE(planned_quantity, 0))` |
| CHECK | `CONSTRAINT chk_work_orders_type CHECK (order_type IN ('mass_production', 'research'))` |
| CHECK | `CONSTRAINT chk_work_orders_close_type CHECK (close_type IS NULL OR close_type IN ('unproduced','underproduced','completed_archive','production_terminated'))` |
| CHECK | `CONSTRAINT chk_work_orders_research_lineage_type CHECK (previous_research_order_id IS NULL OR order_type='research')` |
| CHECK | `CONSTRAINT chk_integer_storage_work_orders CHECK ( planned_quantity BETWEEN 0 AND 99999999 )` |

**`work_orders` 数据库触发器**

| 触发器 | 时机 | 保护或维护范围 |
| --- | --- | --- |
| [trg_work_orders_reject_released_type_update](../../../../../../../packages/database/migrations/202609070002-work-order-material-version-policy.up.sql) | `BEFORE UPDATE` | 非草稿工单不得更改批量／研发类型 |
| [trg_work_orders_reject_number_update](../../../../../../../packages/database/migrations/202609170003-work-order-auto-number.up.sql) | `BEFORE UPDATE` | 工单编号创建后不可改 |
| [trg_work_orders_reject_self_research](../../../../../../../packages/database/migrations/202609170005-research-work-order-lineage.up.sql) | `AFTER INSERT` | 拒绝研发前序自指 |
| [trg_work_orders_reject_research_lineage_update](../../../../../../../packages/database/migrations/202609170005-research-work-order-lineage.up.sql) | `BEFORE UPDATE` | 前序研发关联创建后不可改 |

#### 工单负责人候选与历史展示

工单负责人使用受控场景 `production.work_order_owner`。Identity 拥有[场景角色配置和人员资格](../../../identity/docs/database.md)，Production 只通过其公开候选服务读取与复核；具体角色由配置选择，业务代码不依赖角色编码。未配置或配置无有效角色时没有候选，管理员也须满足相同资格。该场景只接入工单，不改变生产任务、路线默认负责人或工序派工的人员规则。

`GET /production/work-orders/owner-options` 无场景参数，返回全部当前合资格的 `UserOption[]`，不分页、不截断。合法消费者为工单页的新建、草稿编辑及下一轮研发表单，授权集为 `production:orders:view`；调用者不能指定其他场景。列表、详情和返回工单的命令另以 `ownerName` 返回原负责人当前显示姓名，通过 Identity 历史引用批量解析；退出候选、停用或软删除不抹去历史姓名，空负责人或无法解析时为 `null`。历史姓名不构成当前可选资格。

创建工单和草稿编辑的最终负责人非空时，必须在业务写入事务内按该场景复核；未修改负责人 ID 的草稿编辑也须检查保留的负责人，明确清空则允许保存。下达先锁定并重新读取工单，要求负责人非空后再复核，不信任之前候选或草稿的判断。编辑和下达的锁序为工单根 → Identity 资格锁 → 所需 Product 资格读取 → 后续工单写入；Identity 内部人员、配置和角色锁序由其所有者维护。资格锁、业务写入与成功审计保持同一事务；创建的资格复核只在幂等首次执行 handler 内办理，成功重放保留原响应，包括创建时姓名，不因后来配置变化失败。

配置变化只影响以后新建、草稿编辑和下达的资格，不改写已下达工单负责人，也不替换已冻结审批人。结案送审仍按[结案审批](production-termination.md)独立核验审批资格；不能从候选角色自动推导审批权限或提前要求 `approval:decide`。

#### 工单审批接入目标结构（尚未实施）

以下为 [ADR-0006](../../../../../../../docs/adr/0006-approval-workflow-boundaries.md) 的技术细化草案，不覆盖当前直接下达实现；审批表和事务协作见[审批设计稿](../../../../../../../docs/approval-design.md)。

| `work_orders` 字段 | 目标语义 |
| --- | --- |
| 新增 `release_approval_instance_id` | 可空，关联当前送审或已完成下达所依据的审批申请 |
| 既有 `version` | 工单编辑、送审、退回及下达使用同一聚合版本 |
| 既有 `status` | 审批中仍为 `draft`，最终批准才进入 `released` |

`draft` 且申请关联非空时展示“草稿 · 审批中”，禁止普通编辑、取消和直接下达；要编辑或取消先由申请人撤回。`draft` 且关联为空才是可编辑草稿。最终批准后保留申请引用，后续生产、关闭不清空；驳回或撤回清空当前关联、保持 `draft` 并递增版本。旧申请按场景和对象引用查询，不以当前字段保留全部历史。

目标状态组合：`cancelled` 必须无申请关联，`released/doing/completed/closed` 必须有批准依据；`draft` 允许有或无关联。数据库保证字段组合及引用存在；审批场景、对象类型/ID、申请结果和当前关联匹配由两个所有者的应用事务校验，不由 FK 猜测多态归属。

提交时冻结全部工单可编辑资料，包括成品 ID/编码/名称/单位、类型、数量、客户、外部订单号、质量要求、交期、负责人和备注；保存审批证据并在递增工单版本后记录该冻结版本。下达写入本次已审查的成品快照，重新核对当前成品身份和使用资格，不能最后一步悄悄换成别的产品或未审查资料。来源成品名称后来变化不回写受审证据。

下达审批不要求 BOM 已完整或已批准，销售可基于有效成品编码先正式下达任务；批量任务创建才要求 Product 已批准且永久锁定的 BOM，并继续检查工单余量、路线、物料等原业务资格。现有直接下达接口必须改为审批提交或拒绝绕过，不能保留平行直通入口。

这些目标约束需与审批上线共同追加 migration，现有历史工单不能伪造批准依据；当前开发环境可重置并用统一种子验证。

#### 生产工单状态与管理动作

以下状态描述当前直接下达机制；尚未实施的审批目标见[上节](#工单审批接入目标结构尚未实施)。

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
- 提前关闭不得自动取消生产批次。存在未终态或缺少批准清单的批次时返回批次编号、状态、计划量及审定计划内产出，由管理员逐批核对后执行正常结案、未执行取消，或逐项收尾与审批结束。
- 草稿取消、提前关闭和完工后归档均提交工单 `version`；终态类型、原因、操作人、操作时间与状态在业务主表同一条更新中写入，并与成功操作日志同事务提交。`operation_logs` 只承担审计和排障，不作为工单详情的业务事实查询来源，也不复用 `remark` 覆盖原备注。

---

### 5. `production_batches`

职责：维护生产批次，表示某个工单被拆分后的实际生产批次。

历史任务的取消原因、人员和时间允许缺失，不补造历史。

任务产品必须与工单一致；正常完成必须同时保存完工时间和确认人。取消人的历史用户引用在用户被物理删除时置空。批次号由服务端分配，不接受手填。

**`production_batches` 字段定义**

| 字段 | SQL 定义 | 业务含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键，自增 |
| `work_order_id` | `BIGINT UNSIGNED NOT NULL` | 工单 ID |
| `product_id` | `BIGINT UNSIGNED NOT NULL` | 冗余产品 ID，与工单组合外键约束 |
| `batch_no` | `VARCHAR(100) NOT NULL` | 生产批号 |
| `route_id` | `BIGINT UNSIGNED NULL` | 工艺路线 ID，可为空 |
| `route_code_snapshot` | `VARCHAR(64) NULL` | 路线编码快照 |
| `route_version_snapshot` | `VARCHAR(64) NULL` | 路线版本快照 |
| `planned_quantity` | `INT NOT NULL` | 本批次计划生产数量 |
| `plan_start_date` | `DATE NULL` | 本批次计划开始日期，可为空 |
| `plan_end_date` | `DATE NULL` | 本批次计划完工日期，可为空 |
| `started_at` | `DATETIME NULL` | 首次管理员任务开工时间；撤回结束时保留 |
| `started_by` | `BIGINT UNSIGNED NULL` | 首次任务开工人，FK 用户 |
| `start_reason` | `TEXT NULL` | 开工说明；存在活动需求领料缺口时必填 |
| `start_material_snapshot` | `JSON NULL` | 首次开工锁内读取的需求与领料缺口快照，仅提示和追溯，不形成产能额度 |
| `completed_at` | `DATETIME NULL` | 正常结案末级批准时间，可为空 |
| `execution_completed_at` | `DATETIME NULL` | 正常执行确认时间；与确认人同时填写 |
| `execution_completed_by` | `BIGINT UNSIGNED NULL` | 正常执行确认人；与确认时间同时填写，关联用户 |
| `completed_by` | `BIGINT UNSIGNED NULL` | 完工确认人，可为空 |
| `cancel_reason` | `TEXT NULL` | 取消原因；历史未记录数据可为空 |
| `cancelled_by` | `BIGINT UNSIGNED NULL` | 取消人；历史未记录数据可为空 |
| `cancelled_at` | `DATETIME NULL` | 取消时间；历史未记录数据可为空 |
| `status` | `VARCHAR(40) NOT NULL DEFAULT 'pending'` | 生产批次状态 |
| `batch_owner_id` | `BIGINT UNSIGNED NULL` | 任务负责人；新建及编辑必须符合任务负责人场景资格，历史记录可为空 |
| `remark` | `TEXT NULL` | 备注 |
| `version` | `INT NOT NULL DEFAULT 0` | 乐观锁版本号，默认 `0` |
| `created_by` | `BIGINT UNSIGNED NULL` | 创建人 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 创建时间 |
| `updated_by` | `BIGINT UNSIGNED NULL` | 最近修改人 |
| `updated_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最近修改时间 |

**`production_batches` 键、索引与检查约束**

| 类别 | 定义 |
| --- | --- |
| 主键 | `PRIMARY KEY (id)` |
| 外键 | `CONSTRAINT fk_production_batches_work_order_product FOREIGN KEY (work_order_id, product_id) REFERENCES work_orders(id, product_id)` |
| 外键 | `CONSTRAINT fk_production_batches_route FOREIGN KEY (route_id) REFERENCES process_routes(id)` |
| 外键 | `CONSTRAINT fk_production_batches_owner FOREIGN KEY (batch_owner_id) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_production_batches_completed_by FOREIGN KEY (completed_by) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_production_batches_created_by FOREIGN KEY (created_by) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_production_batches_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_production_batches_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE SET NULL` |
| 外键 | `CONSTRAINT fk_production_batch_execution_completed_by FOREIGN KEY (execution_completed_by) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_production_batch_started_by FOREIGN KEY (started_by) REFERENCES users(id)` |
| 唯一键 | `UNIQUE KEY uk_production_batches_no (batch_no)` |
| 唯一键 | `UNIQUE KEY uk_production_batches_work_order_reference (id, work_order_id)` |
| 唯一键 | `UNIQUE KEY uk_production_batches_product_reference (id, product_id)` |
| 索引 | `KEY idx_production_batches_work_order_status (work_order_id, status)` |
| 索引 | `KEY idx_production_batches_plan_start_date (plan_start_date)` |
| 索引 | `KEY idx_production_batches_cancelled_by (cancelled_by)` |
| CHECK | `CONSTRAINT chk_production_batches_completed CHECK (status <> 'completed' OR (completed_at IS NOT NULL AND completed_by IS NOT NULL))` |
| CHECK | `CONSTRAINT chk_production_batches_version CHECK (version >= 0)` |
| CHECK | `CONSTRAINT chk_production_batches_plan_dates CHECK (plan_start_date IS NULL OR plan_end_date IS NULL OR plan_end_date >= plan_start_date)` |
| CHECK | `CONSTRAINT chk_production_batches_status CHECK (status IN ('pending','material_pending','material_assigned','material_partially_outbound','material_outbound','doing','completed','cancelled','terminated','closing'))` |
| CHECK | `CONSTRAINT chk_production_batch_execution_completed CHECK ( (execution_completed_at IS NULL AND execution_completed_by IS NULL) OR (execution_completed_at IS NOT NULL AND execution_completed_by IS NOT NULL) )` |
| CHECK | `CONSTRAINT chk_production_batches_quantity CHECK (planned_quantity > 0)` |
| CHECK | `CONSTRAINT chk_production_batches_quantities_integer CHECK (planned_quantity = TRUNCATE(planned_quantity, 0))` |
| CHECK | `CONSTRAINT chk_integer_storage_production_batches CHECK ( planned_quantity BETWEEN 0 AND 99999999 )` |
| CHECK | `CONSTRAINT chk_production_batch_start_facts CHECK ( (started_at IS NULL AND started_by IS NULL AND start_reason IS NULL AND start_material_snapshot IS NULL) OR (started_at IS NOT NULL AND started_by IS NOT NULL AND start_material_snapshot IS NOT NULL AND (start_reason IS NULL OR CHAR_LENGTH(TRIM(start_reason))>0)) )` |

#### 任务负责人资格与公开边界

任务负责人使用独立的 `production.task_owner` 场景；配置集合、默认拒绝及并发资格规则由 [Identity](../../../identity/docs/user-candidates.md) 所有。批量与研发任务新建时都必须指定合格负责人；编辑仍仅限 `pending` 任务，不能清空负责人，省略 `ownerId` 时也须复核保留的负责人。历史空负责人不回填，编辑时须补选；其他任务命令不因候选配置变化自动改派或追加负责人门禁。任务负责人不参与工单负责人审批解析，也不替代工序派工或路线默认人员。

`GET /production/batches/owner-options` 固定查询该场景，消费入口为任务新建和编辑表单，独立授权 `production:tasks:view`，返回完整 `UserOption[]`，不接收场景参数、不分页或截断。无配置或空集合不回退通用用户目录、工单负责人、当前用户或管理员。历史任务负责人姓名继续通过 Identity 历史引用能力解析，不按当前候选过滤。

创建在幂等首次执行事务内先锁工单，再通过 Identity 公开 `UserCandidateService.checkEligibility` 复核负责人；编辑先锁工单和任务，再按最终负责人复核。资格锁保留到任务写入、成功审计及创建幂等结果提交；失败整体回滚，成功重放不重复核验当前资格。

状态说明：

| 状态                | 含义                   |
| ------------------- | ---------------------- |
| `pending`           | 待开始                 |
| `material_pending`  | 待生成或待确认物料需求 |
| `material_assigned` | 物料已分配             |
| `material_partially_outbound` | 尚未开工，已经确认部分领料；不表示开工资格或当前现场余额 |
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
| `material_pending` | `material_assigned`、`material_partially_outbound`、`material_outbound`、`doing`、`cancelled` |
| `material_assigned` | `material_pending`、`material_partially_outbound`、`material_outbound`、`doing`、`cancelled` |
| `material_partially_outbound` | `material_outbound`、`doing`、`closing` |
| `material_outbound` | `doing`、`closing` |
| `doing` | `closing` |
| `closing` | 首份清单末级批准后 normal → `completed`，early → `terminated`；批准前明确撤回结束恢复本次进入前阶段 |
| `completed`、`cancelled`、`terminated` | 无，终态 |

状态边仅是必要条件；实际命令还必须满足配置、任务阶段、权限、版本及所属业务资格。

任务生成与取消规则：

- 创建生产批次只接受 `released`、`doing` 工单，并在工单锁内重新汇总排除 `cancelled/terminated` 后的任务计划量；有效分配量加本次新增量不得超过工单计划量。创建批次本身不推动工单进入 `doing`。
- `pending` 只允许在创建任务时进入，已有批次不得迁回 `pending`。释放尚未出库的有效分配后，如果批次不再齐套，允许 `material_assigned → material_pending`；这不是重新开放正常需求生成。
- 生产批次的“取消任务”与“结束本轮”分开：已领料或执行中任务不再取消，正常结束通过 `normal` 结案成为 `completed`，提前放弃通过 `early` 结案成为 `terminated`，规则见[批次结束与产出处置](production-termination.md)。只允许 `pending`、`material_pending`、`material_assigned` 取消，即任务尚未开工且物料尚未实际出库；`material_partially_outbound` 已形成库存事实，不能取消。
- 取消前管理端必须读取服务端实时影响摘要，展示将取消的待确认出库单、有效预留和活动需求数量，并要求填写取消原因；提交事务仍须重新锁定批次及相关单据校验，不能信任前端摘要。
- 取消事务把 `pending_picking` 待出库单转为 `cancelled`、把活动分配转为 `cancelled` 以释放库存预留、把活动需求转为 `cancelled`，最后把生产批次状态、取消原因、取消人和取消时间同一条更新写入；这些写入和成功审计同事务提交，不生成 `inventory_transaction`。
- `material_partially_outbound`、`material_outbound`、`doing`、`completed` 明令禁止取消。只要存在已确认出库事实，即使批次状态异常滞后也必须拒绝；第一版不提供强制取消或绕过入口。已开工批次通过独立逐项收尾及结案流程结束，不能复用本取消命令。

### 管理员任务开工与物料阶段

管理员通过统一任务开工命令推进任务为 `doing`，并在工单尚为 `released` 时推进工单。两类任务都必须先有正式需求配置：批量必须已有完整的 `production_material_requirement_basis` 配置事实；研发不要求 BOM 或工序，但至少须手工配置一条本任务的 `production_item_demand` 正式需求，不能在从未提需时开工。配置资格判断是否已形成正式事实，不按当前活动需求数量判断；已履约或已关闭的需求仍保留配置历史。原始需求关闭不删除批量基础，也不重新开放初始配置，额外用料使用已有人工提需。

开工不要求领料、分配齐套或短批授权。预览显示当前正式需求及已确认领料、未领余量；缺料时提交说明。事务重新读取当前事实并保存 `started_at/started_by/start_reason/start_material_snapshot`，首次开工后不覆盖。未开工时开工人、说明与快照均为空；有开工时间时必须同时存在开工人和快照。

首次实际开工人与任务负责人分别展示；人员姓名经 Identity 历史引用解析，停用或删除不抹去历史身份，无法解析时为空。

工序开始仅检查任务处于执行中、当前派工与工序自身状态，不推进任务或工单。需求变更由统一 Writer 推进任务 `version`。正常物流推进按[物料办理资格](demand-allocation-and-outbound.md#物料办理资格)处理；任务执行中不因领料回到物料阶段。

收尾未批准时可明确[撤回结束](production-termination.md#撤回结束与再次收尾)。恢复状态取本次进入事实，已开工恢复执行中，未开工恢复原准备阶段，不重算齐套、不复活需求或分配。`material_*` 是办理阶段；页面不得由阶段直接断言所有物料操作已完成。

当前批量生产执行完工数量规则（研发按任务级结束，不要求工序或领齐剩余需求，最终结案仍须处理物料待办）：

- 执行完工命令在事务内校验全部工序均为 `completed`，不读取报工数量，也不因活动需求或未履约补料阻止进入收尾；记录 `execution_completed_at/by`、进入 `closing` 并创建或复用 normal 结案主记录。物料事项在送审前处理。
- 批量任务至少需要存在一道工序；无工序的批量任务不得执行完工确认。预览返回工序总数和已明确完成数，不选取任何特定工序代表整项任务。
- 正常执行确认尚未最终结案；提前停止使用 early closing 逐项收尾。两种模式均登记最终产出和质检事实，交工单负责人同一结案流程批准，管理员产出处置不改报工事实。正常工序已完但最终可用不足计划可以按实际批准，不强制补产。
- 批次表不保存执行数量或最终合格数量。质检留存独立记录，审定产出只来自当前批准清单。工序记录用 `normalQuantity` 表示有效正常报工量，不能解释为质检合格量或回写为批次数量。

批次只保存计划与生命周期，不缓存执行／最终合格量。历史数量结构回退不能推造质检合格量，见[迁移安全](../../../../../../../packages/database/docs/migration-safety.md)。

任务列表、概览及工单下属任务通过 `finalOutput` 返回当前批准清单的 `revisionNo/availableQuantity/extraQuantity/scrapQuantity`；未有批准清单时返回 `null`，已批准零产出则明确返回零。只关联 `production_batch_closeout.current_revision_id`，不累加历史版本，不读取更正草稿，也不双写批次数量。`scrapQuantity` 为该版历史工序报废与结案新增报废合计；追溯与工单操作核对使用相同批准产出口径。工序报工仅按每道工序表达，任务、工单、追溯、执行结束和结案不提供特定工序的特殊数量汇总。

### 任务查询与命令响应

任务读取按用途独立查询，以下四个端点均要求 `production:tasks:view`。任务不存在返回 `NOT_FOUND`，不以空子资源掩盖不存在。

| API | 响应及读取边界 |
| --- | --- |
| `GET /production/batches` | 分页 `ProductionBatchItem` 摘要，可按 `workOrderId` 筛选工单任务：任务、工单及成品身份，路线摘要，计划量及日期，负责人，生命周期时间与状态，任务及结案版本，当前批准产出；不读取工序投影、说明、取消详情或开工物料快照 |
| `GET /production/batches/:id` | `ProductionBatchDetail` 轻量概览：摘要加任务备注、开工人摘要、执行完成人、结案完成人、取消事实和创建／更新时间；不读取工序集合、工序资格、开工说明或物料快照 |
| `GET /production/batches/:id/step-records` | `ProductionBatchStepRecords`：`batch` 只含 ID、任务编号、工单编号、工单类型、成品编码／名称、计划量、状态及路线编码／版本，`stepRecords` 返回全部冻结工序、数量摘要及当前派工／改派／撤回／SOP 资格；研发返回空工序数组 |
| `GET /production/batches/:id/start-record` | 未开工返回 `null`；已开工返回 `ProductionBatchStartRecord`，含任务 ID、首次开工人 ID／当前姓名、时间、说明与已存物料快照。只读取开工时保存的事实，不用当前需求重新计算；已开工记录缺开工人、缺快照或快照结构损坏时失败 |

工单任务集合由 `GET /production/work-orders/:workOrderId` 的详情 `batches` 返回，要求 `production:orders:view`；任务页通过带 `workOrderId` 的任务分页查询读取，要求 `production:tasks:view`。详情任务集合和执行记录页的任务摘要使用相同的 `ProductionBatchItem` 基础投影，不读取开工物料快照。工序及当前资格在同一只读一致性快照内生成，姓名通过 Identity 公开历史引用批量解析，展示资格不替代锁内命令复核。

任务创建、编辑及取消返回轻量 `ProductionBatchDetail`。实际 SOP 调整返回任务／工序身份、状态及新工序版本，调用方重新读取工序子资源核对当前快照。正常执行结束与研发结束只返回生命周期确认结果，不携带工序报工数量。

工单汇总、完工／关闭确认与各任务使用相同批准口径。可用产出合计为计划内加计划外，不含报废；既有 `finalOutput.totalQuantity` 表达含报废的总处置量，不得标成合格或可入库数量。计划缺口为负数时，页面展示“超出 N”，不修改计划额度规则。

`GET /production/work-orders/options` 在原任务创建权限内返回计划量、有效已分配量、已终止计划量、剩余可分配量与当前批准产出汇总。新增任务展示这些实时投影及本次分配后的余额；剩余额度仍按计划减有效任务计划计算，不扣减审定产出，最终创建事务重新锁定校验。

说明：

- `production_batches` 是生产执行批次，不是库存批次。
- `product_id` 是受组合外键保护的查询冗余，不允许与工单产品不一致。
- 路线快照在批次创建时冻结；批次执行期间不能跟随路线主数据变化。
- `plan_start_date`、`plan_end_date` 是批次排程，不是实际执行事实；实际开工、执行完成分别以 `started_at`、`execution_completed_at` 为准；`completed_at` 表示正常结案批准。
- 成品入库使用 item_batch.product_id 分支；库存批次可归集同产品、单位及状态合格的多次来源，实际任务、工单、类别和批准版按入库明细追溯。仓管按当前轮授权分次确认，任务结案与工单关闭不代办入库。物料精确版本分支及其外键保留。

---

## 工单计划分配口径

`assignedQuantity` 是所有非 `cancelled/terminated` 任务的计划量合计；`closing` 与正常完工 `completed` 仍占用。`terminatedPlannedQuantity` 是已终止任务原计划量合计，仅作历史展示。`remainingQuantity` 为工单计划减有效分配；列表、详情、工单候选与创建事务共用同一 SQL 口径。页面主数显示有效分配，附注“已终止计划 N，不占额度”；不把历史累计安排量作为分配上限。

首份提前结束清单批准成为 `terminated` 才释放原计划额度，原任务计划量不改零。此规则只控制任务分配，不扣除终止任务已经批准的产出，也不保证累计产出小于工单计划；已终止产出继续按当前批准清单汇总。产出更正不会回写分配额度，取消和提前结束不抹除已发生事实。

任务表单的 `GET /production/work-orders/options` 由 `production:tasks:view` 授权，完整返回 `released/doing` 且仍有可分配余量的工单；创建时在工单锁内重核状态和额度。候选完备性遵守[公共规范](../../../../../../../docs/api-conventions.md#51-候选完备性与增长迁移)。

## 工单产出查询口径

列表及详情 `finalOutput` 只累计每个已結案任务根 `current_revision_id` 所指向的批准清单，计划内 `availableQuantity`、额外 `extraQuantity`、历史及新增报废分别展示；不累计旧版本，不将报工数当作最终可用量。计划缺口仅减计划内批准量，额外及报废不抵扣。

`finalizedBatchCount` 统计 completed/terminated，`closingBatchCount/pendingAvailableQuantity` 单列处理中任务和未审定草稿量；未审定量不计最终产出。正常结案可以少于计划，工单不足量关闭据批准量判断；含提前结束任务仍使用 `production_terminated`，不因数量达标变成正常完工。任务终态与待入库进度相互独立。
