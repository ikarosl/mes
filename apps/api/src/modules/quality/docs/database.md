# Quality 检验数据库

本文维护 Quality 的表设计：来料分组主单及当前关联、共用检验办理及不可变结果、工序专检及其结果。当前成品规则见[成品检验](finished-inspections.md)，来料来源授权见[正式清单](../../procurement/docs/receipt-acceptance.md)。跨模块决策理由见 [ADR-0015](../../../../../../docs/adr/0015-unified-quality-quantity-semantics.md)和精确取代成品数量旧裁决的 [ADR-0019](../../../../../../docs/adr/0019-finished-inspection-measurement-simplification.md)。`quality_process_inspection` 与 `quality_process_inspection_record` 的完整字段、冲销更正及累计承接约束由[工序专检专题](process-inspections.md#数据库结构)维护，不并入来料／成品的检验办理。Procurement 的整批处理轮次、正式数量授权和实际退回不由 Quality 写入。来料与成品关系见[统一检验模型](unified-inspection-model.md)。

本章与[版本化 migration](../../../../../../packages/database/migrations/)同步维护字段和约束。表均用 InnoDB、utf8mb4_0900_ai_ci，ID 为 BIGINT UNSIGNED；除显式 NULL 外均为 NOT NULL，未写 DEFAULT 的字段无显式默认值。外键均有支撑索引并使用默认 RESTRICT。公共类型和时间见[数据库约定](../../../../../../docs/database-conventions.md)。

下文“创建审计”含 created_by（ID，FK users.id）、created_at（DATETIME DEFAULT CURRENT_TIMESTAMP）；“可变审计”另含 updated_by（ID，FK users.id）、updated_at（DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP）、version（INT DEFAULT 0，CHECK >=0）。结果仅用创建审计；来料分组的毫秒时间和无符号版本在本表单列。

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

每张完整到货至多属于一张当前质检主单，关系保存建立时间；不是历史归属记录。

| 字段 | 类型、空值与默认值 | 含义 |
| --- | --- | --- |
| inspection_order_id | BIGINT UNSIGNED NOT NULL | FK quality_incoming_inspection_order(id) |
| receipt_id | BIGINT UNSIGNED NOT NULL | FK procurement_receipt(id)，真实整张到货身份 |
| created_at | DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) | 当前关系建立时间 |

复合主键为 `(inspection_order_id,receipt_id)`，同时支持主单内按 receipt_id 倒序读取。`uk_incoming_inspection_order_receipt(receipt_id)` 保证同一到货至多一个当前归属。两个 FK 使用默认 RESTRICT；关系不含行号、独立 ID、version 或操作者列。解除删除关系行，转移原子替换当前归属；操作人及变更前后值由平台日志保留。关系不冻结到货或检查，Quality case／record 不增加主单外键。

分组不回填既有到货或检查；即使清空关系，仍有主单或已发编号也不能回退。停写和回退条件见[迁移安全](../../../../../../packages/database/docs/migration-safety.md#202610280001来料质检分组主单)。

## 检验办理 quality_inspection_case

本表保存每个来源轮的一次办理身份、发起快照与完成／失效状态；与不可变结果分开，使未完成办理失效时不必伪造检查结果。来料绑定到货处理轮，成品绑定任务、结案根和产出轮，一轮最多一份办理。

| 字段 | 类型、空值与默认值 | 含义 |
| --- | --- | --- |
| id | ID，自增主键 | 稳定办理身份 |
| source_kind | VARCHAR(30) | incoming／finished，由来源 CHECK 限定 |
| receipt_line_id / receipt_revision_id / incoming_round_id | ID NULL | 来料明细、发起时实收修订与整批处理轮；成品时为空 |
| closeout_id / production_batch_id / finished_round_id | ID NULL | 成品结案、任务和产出轮；来料时为空 |
| declared_version | INT NULL | 成品发起时草稿版本；成品时非负，来料为空 |
| declared_available_quantity / declared_extra_quantity / declared_scrap_quantity | INT NULL | 成品可用／额外／报废申报快照，各在 0..99999999；来料为空 |
| declared_quantity | INT，CHECK 0..99999999 | 发起申报量；来料为正，成品等于可用加额外，不由样本反推 |
| case_type | VARCHAR(30) | initial／reinspection／receipt_correction；inspection_correction 仅历史保留 |
| status | VARCHAR(30) DEFAULT reviewing | reviewing／completed／superseded，与来源轮状态分开 |
| reason | TEXT，CHECK trim 后非空 | 发起依据 |
| completed_by / completed_at | ID NULL，FK users.id／DATETIME NULL | 实际完成责任人与时间 |
| superseded_by_round_id / superseded_reason | ID NULL／TEXT NULL | 来料办理的同源替代轮和失效原因 |
| 创建／可变审计 | 见本章公共列组 | 完成和失效推进版本 |

主键 id；单轮唯一键为 incoming_round_id、finished_round_id，组合唯一键为 `(id,receipt_line_id)`、`(id,receipt_line_id,receipt_revision_id)`、`(id,closeout_id,production_batch_id)`。历史索引为 `(receipt_line_id,id)`、`(closeout_id,id)`，状态索引为 `(status,created_at,id)`。

receipt_line_id 单列引用到货明细；receipt_revision_id、incoming_round_id、superseded_by_round_id 各与 receipt_line_id 组合引用同源实收修订／处理轮。成品 `(closeout_id,production_batch_id)` 引用 Production 收尾根，`(finished_round_id,closeout_id)` 引用产出轮；人员字段引用 users。

来源 CHECK 区分两套来源及申报字段；成品不允许填写来料替代轮。类型、状态、申报量、版本及非空原因均有 CHECK。元数据 CHECK 要求 reviewing 的完成及失效字段全空，completed 的完成人／时间成组非空且无失效字段，superseded 仅保留同源替代轮和非空失效原因。历史 inspection_correction 仍在数据库值域中，新建由应用拒绝。

来料办理以整批轮次为来源，不创建零量办理。第一次发起在当前轮创建办理；再次复检与独立实收更正由 Procurement 创建新轮，收回旧未处置执行资格。`supersedeCases` 在活动事务内按旧轮查找 reviewing 办理，记录替代轮及失效原因。`supersedeReceiptCases` 用于来源整单登记作废，按传入到货明细终止全部历史轮次仍在 reviewing 的办理，替代指针指向同源 `receipt_void/voided` 终止轮。已完成办理和结果保留，迟到的旧页面提交在插入结果前返回冲突，不能为了留历史而插入一个本不存在的结果。

`startCase/completeCase/supersedeCases/supersedeReceiptCases` 只接受同池活动事务；Procurement 先锁到货与当前轮并校验资格，按[检验发起规则](../../procurement/docs/receipts.md#整批检验与定稿)决定办理类型。`startCase` 拒绝新建 `inspection_correction`，已有该类型的办理仍按原状态完成、失效及读取，不改写历史分类。Quality 核对自己的版本、状态、轮次和原申报修订，不查询 Procurement 表。完成结果后由来源模块把轮次推进为待复检、不放行或待定稿；case 的 completed 不代表允许入库。来源整单作废的真实执行与补单阻断条件由[Procurement](../../procurement/docs/receipts.md#整单到货登记作废)所有，Quality 不删除或改写已完成结果，也不恢复失效办理。

成品先经明确开始动作由 Production public 建立并冻结来源轮次、将其推进 inspecting；Quality 的 start 接口仅编排该公开能力，此时不创建 case/record。登记时 Production public 锁定当前轮次与来源版本，Quality 在 record 同事务创建 completed case 与不可变结果；同一 finished_round_id 不能再次创建 case，必须开始新轮复检。Quality 不写来源轮次或库管超建议授权。

## 不可变结果 quality_inspection_record

本表保存一次办理的不可变 G/F、结论和检查凭据；不保存可写的 N、整批核实量或执行授权。前驱关联同一到货或结案，保留重新检查的历史链。

| 字段 | 类型、空值与默认值 | 含义 |
| --- | --- | --- |
| id / case_id | ID，自增主键／ID | 结果身份及唯一所属办理 |
| receipt_line_id / receipt_revision_id | ID NULL | 来料来源；与成品来源组互斥 |
| closeout_id / production_batch_id | ID NULL | 成品来源；与来料来源组互斥 |
| inspection_method | VARCHAR(30) | full／sampling；成品另可 zero_confirmation |
| covered_quantity | INT NULL，CHECK 必须 NULL | 旧共用列，不承载整批量或建议 |
| qualified_quantity / unqualified_quantity | INT | 合格 G／不合格 F；各非负，合计不超过 99999999，N=G+F 不存储 |
| release_decision | VARCHAR(30) | released／pending_reinspection／not_released |
| previous_record_id | ID NULL | 同到货或同结案前驱 |
| inspected_at | DATETIME | 真实检查时间 |
| result_note / evidence_reference | TEXT，CHECK trim 后非空 | 检查说明和凭据 |
| 创建审计 | 见本章公共列组 | 不含可变审计、version 或软删除 |

主键 id；唯一键为 case_id、`(id,receipt_line_id)`、`(id,closeout_id)`；历史索引为 `(receipt_line_id,id)`、`(production_batch_id,id)`。case_id 有单列 FK，另以 `(case_id,receipt_line_id,receipt_revision_id)` 和 `(case_id,closeout_id,production_batch_id)` 组合引用办理的同源键；previous_record_id 分别与 receipt_line_id／closeout_id 组合自引用，created_by 引用 users。

来源 CHECK 要求来料或成品字段组完整互斥；放行结论与说明凭据有值域／非空 CHECK。数量 CHECK 保证 G/F 各在 0..99999999 且合计不超上限；测量 CHECK 要求 covered_quantity 为空、普通 full／sampling 的 G+F>0，或仅成品使用 zero_confirmation 且 G=F=0、结论为 released。`trg_quality_record_no_update/no_delete` 禁止改写或删除结果。

注意区分来料办理响应的 `coveredQuantity`：它是发起时申报快照，不是结果 G/F，也不是库管核实的剩余实物量。

`QualityInboundQuery.requireReleaseBasis` 只核验已完成、明确放行、精确 case／record 及同到货来源；当前轮、正式授权和未消费量由 Procurement 判断。来料数量建议见[正式清单](../../procurement/docs/receipt-acceptance.md)。

成品数量、零产出核实及固定已入基准的含义见[成品检验](finished-inspections.md)。历史读取通过 case 的来源轮取得固定基准，不能随以后入库、归批或领用重算；Quality 不生成正式数量授权。

## 迁移及查询

来料处理轮、成品固定轮次及检查数量切换的空数据守卫、停写和回退条件由[迁移安全](../../../../../../packages/database/docs/migration-safety.md)维护，不推造旧轮次或改写既有检验／审批证据。

公开历史查询按单个到货行分页，按办理 ID 倒序；不提供跨行或办理状态／目的筛选。精确读取可批量取得完整事实，命令另行核验放行依据；读取不取代来源模块的当前轮、数量和版本检查。来料主单及到货目录由 Procurement 登记的只读查询提供，单张到货轻量物料投影按需读取当前检验摘要，完整检验通过 Quality public 获取；HTTP 查询边界见[到货查询](../../procurement/docs/receipt-queries.md)。成品查询与来源注册规则见[成品质检](finished-inspections.md)。
