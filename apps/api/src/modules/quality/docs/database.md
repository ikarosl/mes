# Quality 检验数据库

本文维护 Quality 的表设计：来料分组主单及当前关联、共用检验办理及不可变结果、工序专检及其结果。当前成品规则见[成品检验](finished-inspections.md)，来料来源授权见[正式清单](../../procurement/docs/receipt-acceptance.md)。跨模块决策理由见 [ADR-0015](../../../../../../docs/adr/0015-unified-quality-quantity-semantics.md)和精确取代成品数量旧裁决的 [ADR-0019](../../../../../../docs/adr/0019-finished-inspection-measurement-simplification.md)。`quality_process_inspection` 与 `quality_process_inspection_record` 的完整字段、冲销更正及累计承接约束由[工序专检专题](process-inspections.md#数据库结构)维护，不并入来料／成品的检验办理。Procurement 的整批处理轮次、正式数量授权和实际退回不由 Quality 写入。来料与成品关系见[统一检验模型](unified-inspection-model.md)。

Quality 业务表使用 InnoDB、utf8mb4_0900_ai_ci；ID/人员外键为 BIGINT UNSIGNED，时间为北京时间 DATETIME，单条数量为 INT、0..99999999。办理与专检单使用完整可变审计及 version，结果只有创建审计。公共规则见[数据库约定](../../../../../../docs/database-conventions.md)。

## 来料分组主单 quality_incoming_inspection_order

本表只组织工作分组，不拥有检查状态、数量或结果。主单及下表均由 Quality 写入，Procurement 负责来源编排；完整业务规则见[分组主单](incoming-inspection-orders.md)。

| 字段 | 类型、空值与默认值 | 含义 |
| --- | --- | --- |
| id | BIGINT UNSIGNED NOT NULL AUTO_INCREMENT | 主键，稳定主单身份 |
| inspection_no | VARCHAR(64) NOT NULL | 永久唯一的服务端业务编号；CHECK 保证 trim 后非空 |
| remark | VARCHAR(500) NULL | 可选分组备注 |
| version | INT UNSIGNED NOT NULL DEFAULT 0 | 主单乐观版本；关系或备注实际变化时递增 |
| created_by / updated_by | BIGINT UNSIGNED NOT NULL | 分别 FK users(id)，创建及最近修改人 |
| created_at | DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) | 创建时间 |
| updated_at | DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) | 最近修改时间 |

键为 `PRIMARY KEY(id)`、`uk_incoming_inspection_order_no(inspection_no)`；列表索引为 `idx_incoming_inspection_order_created(created_at,id)`，两个人员 FK 有对应支撑索引。无 status、软删除、进度缓存、检验结果或数量字段。空主单继续保留，应用不提供删除、取消或归档命令；表不设置不可变事实触发器。

## 当前到货关联 quality_incoming_inspection_order_receipt

| 字段 | 类型、空值与默认值 | 含义 |
| --- | --- | --- |
| inspection_order_id | BIGINT UNSIGNED NOT NULL | FK quality_incoming_inspection_order(id) |
| receipt_id | BIGINT UNSIGNED NOT NULL | FK procurement_receipt(id)，真实整张到货身份 |
| created_at | DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) | 当前关系建立时间 |

复合主键为 `(inspection_order_id,receipt_id)`，同时支持主单内按 receipt_id 倒序读取。`uk_incoming_inspection_order_receipt(receipt_id)` 保证同一到货至多一个当前归属。两个 FK 使用默认 RESTRICT；关系不含行号、独立 ID、version 或操作者列。解除删除关系行，转移原子替换当前归属；操作人及变更前后值由平台日志保留。关系不冻结到货或检查，Quality case／record 不增加主单外键。

`202610280001-incoming-inspection-orders` 追加两表、`incoming_inspection_order` 编号类型 CHECK 及管理权限，不回填既有到货或检查。down 在永久 DDL 前拒绝任何主单、关系或该类型已分配编号；停写和回退条件见[迁移安全](../../../../../../packages/database/docs/migration-safety.md#202610280001来料质检分组主单)。

## 检验办理 quality_inspection_case

| 字段 | 语义与约束 |
| --- | --- |
| id / source_kind | 主键；incoming 与 finished 的来源字段组完整且互斥 |
| receipt_line_id / receipt_revision_id | 来料来源及发起时实收修订，组合 FK |
| incoming_round_id | 来料整批处理轮次；与 receipt_line_id 组合 FK，唯一，一轮最多一次办理 |
| closeout_id / production_batch_id / finished_round_id | 成品结案、任务与办理轮次，同源组合 FK；finished_round_id 唯一，一轮最多一份 case；来料时为空 |
| declared_version / declared_available_quantity / declared_extra_quantity / declared_scrap_quantity | 成品草稿版本与三项原申报快照；来料为空 |
| declared_quantity | 发起时申报数量D；来料是整轮尚未处置实物量，必须为正；不由抽检样本反推 |
| case_type | initial / reinspection / receipt_correction 表示办理目的；inspection_correction 仅历史保留，不再接受新建 |
| status | reviewing / completed / superseded，与来源轮次的质量流转状态分开 |
| reason | 非空原因；来源及发起数量快照不可静默覆盖 |
| completed_by / completed_at | 仅完成状态成组非空 |
| superseded_by_round_id / superseded_reason | 仅未完成办理失效时成组非空；替代轮次必须同一到货 |
| created_by/at / updated_by/at / version | 人员 FK，version 非负；完成和失效递增 |

id 为非空自增主键；所有来源及完成／失效引用均为可空 BIGINT UNSIGNED，是否必填由来源和状态 CHECK 联合限定。source_kind、case_type、status 为非空 VARCHAR(30)，status 默认 reviewing；reason 为非空 TEXT，superseded_reason 为可空 TEXT，非空原因须 trim 后非空。declared_version 为可空 INT 且成品时非负；三项申报快照为可空 INT，成品时限定 0..99999999；declared_quantity 为非空 INT、0..99999999，成品时等于申报可用加额外量。完成时间可空 DATETIME；创建及修改时间非空、默认 CURRENT_TIMESTAMP，updated_at 自动随更新推进；created_by／updated_by 非空，version 为非空 INT DEFAULT 0。

除单轮唯一键外，组合唯一键为 `(id,receipt_line_id)`、`(id,receipt_line_id,receipt_revision_id)`、`(id,closeout_id,production_batch_id)`；历史索引为 `(receipt_line_id,id)`、`(closeout_id,id)`，状态索引为 `(status,created_at,id)`。来料实收版本、incoming_round_id 和 superseded_by_round_id 各与 receipt_line_id 组合引用同源 revision／round；成品 `(closeout_id,production_batch_id)` 引用 Production 收尾根，`(finished_round_id,closeout_id)` 引用产出轮。receipt_line_id 另有明细 FK，所有人员 FK 指向 users，外键均有支撑索引并使用默认 RESTRICT。

来料办理以整批轮次为来源，不创建零量办理。第一次发起在当前轮创建办理；再次复检与独立实收更正由 Procurement 创建新轮，收回旧未处置执行资格。`supersedeCases` 在活动事务内按旧轮查找 reviewing 办理，记录替代轮及失效原因。`supersedeReceiptCases` 用于来源整单登记作废，按传入到货明细终止全部历史轮次仍在 reviewing 的办理，替代指针指向同源 `receipt_void/voided` 终止轮。已完成办理和结果保留，迟到的旧页面提交在插入结果前返回冲突，不能为了留历史而插入一个本不存在的结果。

`startCase/completeCase/supersedeCases/supersedeReceiptCases` 只接受同池活动事务；Procurement 先锁到货与当前轮并校验资格，按[检验发起规则](../../procurement/docs/receipts.md#整批检验与定稿)决定办理类型。`startCase` 拒绝新建 `inspection_correction`，已有该类型的办理仍按原状态完成、失效及读取，不改写历史分类。Quality 核对自己的版本、状态、轮次和原申报修订，不查询 Procurement 表。完成结果后由来源模块把轮次推进为待复检、不放行或待定稿；case 的 completed 不代表允许入库。来源整单作废的真实执行与补单阻断条件由[Procurement](../../procurement/docs/receipts.md#整单到货登记作废)所有，Quality 不删除或改写已完成结果，也不恢复失效办理。

成品先经明确开始动作由 Production public 建立并冻结来源轮次、将其推进 inspecting；Quality 的 start 接口仅编排该公开能力，此时不创建 case/record。登记时 Production public 锁定当前轮次与来源版本，Quality 在 record 同事务创建 completed case 与不可变结果；同一 finished_round_id 不能再次创建 case，必须开始新轮复检。Quality 不写来源轮次或库管超建议授权。

## 不可变结果 quality_inspection_record

| 字段 | 来料 | 成品 |
| --- | --- | --- |
| case_id | 唯一，一次办理最多一个结果 | 同左 |
| 来源字段组 | receipt_line_id / receipt_revision_id | closeout_id / production_batch_id |
| inspection_method | full / sampling | full / sampling / zero_confirmation |
| covered_quantity | 必须 NULL；整批核实 C 归库管正式清单 | 必须 NULL；保留共用列，不记录成品整批量 |
| qualified_quantity / unqualified_quantity | 非负 G/F，N=G+F 必须为正且不超过单条数量上限 | 非负 G/F；全检／抽检 N=G+F 必须为正且不超过单条数量上限，零产出 N=0 |
| release_decision | released / pending_reinspection / not_released | 普通检验同左；zero_confirmation 必须 released |
| previous_record_id | 同到货前驱组合 FK | 同结案前驱组合 FK |
| inspected_at / result_note / evidence_reference | 真实时间、非空说明和凭据 | 同左 |
| created_by / created_at | 不可变创建事实，人员 FK | 同左 |

id 为 BIGINT UNSIGNED 非空自增主键，case_id 与 created_by 非空；四项来源和 previous_record_id 为可空 BIGINT UNSIGNED，CHECK 保证来料／成品来源完整互斥。inspection_method／release_decision 为非空 VARCHAR(30)，covered_quantity 为可空 INT，G/F 为非空 INT；inspected_at 为非空 DATETIME，result_note／evidence_reference 为非空 TEXT 且 CHECK trim 后非空，created_at 默认 CURRENT_TIMESTAMP。无可变审计、version 或软删除。

唯一键为 case_id、`(id,receipt_line_id)`、`(id,closeout_id)`；历史索引为 `(receipt_line_id,id)`、`(production_batch_id,id)`。case_id 有单列 FK，同时 `(case_id,receipt_line_id,receipt_revision_id)` 与 `(case_id,closeout_id,production_batch_id)` 分别组合引用 case 的同源唯一键；previous_record_id 分别与 receipt_line_id／closeout_id 组合自 FK。created_by 引用 users，各外键有支撑索引并使用默认 RESTRICT。结果表不单独保存 source_kind，来源由互斥字段组与真实 case 共同限定。

UPDATE/DELETE 触发器禁止覆盖结果。N 由 G+F 派生，不单独保存。来料和成品检查事实的 API 均不提供 `coveredQuantity/releasedQuantity/cumulativeSuggestionQuantity`，不在 Quality 计算库管未来的可入授权。来料办理的 `coveredQuantity` 仍表示发起时申报快照，与结果 G/F 和库管核实整批量分别保存；共用数据库列 `covered_quantity` 按上表保持 NULL。

来料明确放行后，由 Procurement 定稿核实C，提示全检建议G、抽检建议C−F。库管可填写依据确认超建议数量；原G/F不改写。待复检及不放行仍不能生成正常可入依据。`QualityInboundQuery.requireReleaseBasis` 只核验 completed、明确放行、精确case/record及同到货来源；Procurement必须核验当前轮、正式授权和未消费量。

成品保留检验事实计数约束及零产出核实：全检和抽检都只记录 G/F，普通 N=G+F>0；`zero_confirmation` 要求 G=F=N=0 且 `released`。非放行结论不产生放行资格。`covered_quantity` 共用物理列保留但新成品与来料结果均为 NULL；结果只保存本轮 G/F，不保存 N、整批 C、本次放行建议或累计建议。Quality 读取结果时以 `case.finished_round_id` 关联 Production 的轮次基准，返回 `baselinePlannedReceived`、`baselineExtraReceived` 供历史说明；这两项不因以后入库、归批或领用改变。Production 仅在引用 `full+released` 时用原检验轮固定已入基准及 G 对累计目标给出非阻断定稿提示，其他方式不作整批数量差异。实际执行防重与正式授权保持 Production/Inventory 规则。

## 迁移及查询

`202609240001-unified-inbound-allocation-target` 增加成品 `finished_round_id`、唯一键及同来源组合外键；来料 incoming_round_id 约束保持独立。

`202609220001-receipt-processing-rounds` 追加成对迁移，切换来料轮次来源、失效原因及来源区分的数量CHECK。上下行在永久DDL前拒绝已有相关来料事实，不猜历史、不双写；未触及的成品事实允许保留。由开发初始化入口重建后应用，无需修改执行过的迁移。

`202610080001-finished-inspection-measurements` 追加成对迁移，调整共用结果表的成品条件 CHECK：普通检查 N>0、零产出 N=0 且明确放行，`covered_quantity` 对两来源均为 NULL。up/down 在首个永久 DDL 前要求旧成品检验、批准版、结案审批及根冻结快照为空；不转换已有业务事实，不修改已执行迁移。运行与停写细节见[迁移安全](../../../../../../packages/database/docs/migration-safety.md)。

`QualityInboundQuery.listCases(receiptLineId, PageQuery)` 只对单个到货行分页读取全部办理历史，按办理 ID 降序排列，不提供跨行列表或办理状态／目的筛选。`getCase/getCases` 提供单个或批量完整事实，`getCaseByInspection` 定位同源办理，`requireReleaseBasis` 用于来源命令事务内核验；这些读取不取代来源模块的当前轮、数量和版本检查。来料主单及到货目录由 Procurement 登记的只读查询提供，单张到货轻量物料投影按需读取当前检验摘要，完整检验通过 Quality public 获取；HTTP 查询边界见[到货查询](../../procurement/docs/receipt-queries.md)。成品查询与来源注册规则见[成品质检](finished-inspections.md)。
