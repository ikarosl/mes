# Quality 检验数据库

本文维护共用检验事实的字段与约束；当前成品规则见[成品检验](finished-inspections.md)，来料来源授权见[正式清单](../../procurement/docs/receipt-acceptance.md)。跨模块决策理由见 [ADR-0015](../../../../../../docs/adr/0015-unified-quality-quantity-semantics.md)和精确取代成品数量旧裁决的 [ADR-0019](../../../../../../docs/adr/0019-finished-inspection-measurement-simplification.md)。Quality 拥有 `quality_inspection_case` 与 `quality_inspection_record`；Procurement 的整批处理轮次、正式数量授权和实际退回不由 Quality 写入。关系见[统一检验模型](unified-inspection-model.md)。

两表使用 InnoDB、utf8mb4_0900_ai_ci；ID/人员外键为 BIGINT UNSIGNED，时间为北京时间 DATETIME，单条数量为 INT、0..99999999。办理使用完整可变审计及 version，结果只有创建审计。公共规则见[数据库约定](../../../../../../docs/database-conventions.md)。

## 检验办理 quality_inspection_case

| 字段 | 语义与约束 |
| --- | --- |
| id / source_kind | 主键；incoming 与 finished 的来源字段组完整且互斥 |
| receipt_line_id / receipt_revision_id | 来料来源及发起时实收修订，组合 FK |
| incoming_round_id | 来料整批处理轮次；与 receipt_line_id 组合 FK，唯一，一轮最多一次办理 |
| closeout_id / production_batch_id / finished_round_id | 成品结案、任务与办理轮次，同源组合 FK；finished_round_id 唯一，一轮最多一份 case；来料时为空 |
| declared_version / declared_available_quantity / declared_extra_quantity / declared_scrap_quantity | 成品草稿版本与三项原申报快照；来料为空 |
| declared_quantity | 发起时申报数量D；来料是整轮尚未处置实物量，必须为正；不由抽检样本反推 |
| case_type | initial / reinspection / inspection_correction / receipt_correction，表示办理目的 |
| status | reviewing / completed / superseded，与来源轮次的质量流转状态分开 |
| reason | 非空原因；来源及发起数量快照不可静默覆盖 |
| completed_by / completed_at | 仅完成状态成组非空 |
| superseded_by_round_id / superseded_reason | 仅未完成办理失效时成组非空；替代轮次必须同一到货 |
| created_by/at / updated_by/at / version | 人员 FK，version 非负；完成和失效递增 |

来料不再关联 source_scope_id/target_scope_id，也不创建零量办理。第一次发起在当前轮创建办理；再次复检与独立实收更正由 Procurement 创建新轮，收回旧未处置执行资格。`supersedeCases` 在活动事务内按旧轮查找 reviewing 办理，记录替代轮及失效原因。已完成办理和结果保留，迟到的旧页面提交在插入结果前返回冲突，不能为了留历史而插入一个本不存在的结果。

`startCase/completeCase/supersedeCases` 只接受同池活动事务；Procurement 先锁到货与当前轮并校验资格。Quality 核对自己的版本、状态、轮次和原申报修订，不查询 Procurement 表。完成结果后由来源模块把轮次推进为待复检、不放行或待定稿；case 的 completed 不代表允许入库。

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

UPDATE/DELETE 触发器禁止覆盖结果。N 由 G+F 派生，不单独保存。来料 API 的 `coveredQuantity/releasedQuantity` 返回 null，不用 0 或原申报伪造测量量，也不在 Quality 计算库管未来的可入授权。成品请求和响应均不含这些字段，也不含 `cumulativeSuggestionQuantity`。

来料明确放行后，由 Procurement 定稿核实C，提示全检建议G、抽检建议C−F。用户已批准库管填写依据确认超建议数量；原G/F不改写。待复检及不放行仍不能生成正常可入依据。`QualityInboundQuery.requireReleaseBasis` 只核验 completed、明确放行、精确case/record及同到货来源，不再用旧C作硬上限；Procurement必须核验当前轮、正式授权和未消费量。

成品保留检验事实计数约束及零产出核实：全检和抽检都只记录 G/F，普通 N=G+F>0；`zero_confirmation` 要求 G=F=N=0 且 `released`。非放行结论不产生放行资格。`covered_quantity` 共用物理列保留但新成品与来料结果均为 NULL；结果只保存本轮 G/F，不保存 N、整批 C、本次放行建议或累计建议。Quality 读取结果时以 `case.finished_round_id` 关联 Production 的轮次基准，返回 `baselinePlannedReceived`、`baselineExtraReceived` 供历史说明；这两项不因以后入库、归批或领用改变。Production 仅在引用 `full+released` 时用原检验轮固定已入基准及 G 对累计目标给出非阻断定稿提示，其他方式不作整批数量差异。实际执行防重与正式授权保持 Production/Inventory 规则。

## 迁移及查询

`202609240001-unified-inbound-allocation-target` 增加成品 `finished_round_id`、唯一键及同来源组合外键；来料 incoming_round_id 约束保持独立。

`202609220001-receipt-processing-rounds` 追加成对迁移，切换来料轮次来源、失效原因及来源区分的数量CHECK。上下行在永久DDL前拒绝已有相关来料事实，不猜历史、不双写；未触及的成品事实允许保留。由开发初始化入口重建后应用，无需修改执行过的迁移。

`202610080001-finished-inspection-measurements` 追加成对迁移，调整共用结果表的成品条件 CHECK：普通检查 N>0、零产出 N=0 且明确放行，`covered_quantity` 对两来源均为 NULL。up/down 在首个永久 DDL 前要求旧成品检验、批准版、结案审批及根冻结快照为空；不转换已有业务事实，不修改已执行迁移。运行与停写细节见[迁移安全](../../../../../../packages/database/docs/migration-safety.md)。

Quality public 提供分页及批量自身记录。来料列表由 Procurement 登记的只读查询目录读取来源定位字段，完整检验仍通过 Quality public 获取。成品查询与来源注册规则见[成品质检](finished-inspections.md)。
