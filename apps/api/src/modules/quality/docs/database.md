# Quality 检验数据库

本文维护共用检验事实的字段与约束；当前成品规则见[成品检验](finished-inspections.md)，来料来源授权见[正式清单](../../procurement/docs/receipt-acceptance.md)。跨模块决策理由见 [ADR-0015](../../../../../../docs/adr/0015-unified-quality-quantity-semantics.md)。Quality 拥有 `quality_inspection_case` 与 `quality_inspection_record`；Procurement 的整批处理轮次、正式数量授权和实际退回不由 Quality 写入。关系见[统一检验模型](unified-inspection-model.md)。

两表使用 InnoDB、utf8mb4_0900_ai_ci；ID/人员外键为 BIGINT UNSIGNED，时间为北京时间 DATETIME，单条数量为 INT、0..99999999。办理使用完整可变审计及 version，结果只有创建审计。公共规则见[数据库约定](../../../../../../docs/database-conventions.md)。

## 检验办理 quality_inspection_case

| 字段 | 语义与约束 |
| --- | --- |
| id / source_kind | 主键；incoming 与 finished 的来源字段组完整且互斥 |
| receipt_line_id / receipt_revision_id | 来料来源及发起时实收修订，组合 FK |
| incoming_round_id | 来料整批处理轮次；与 receipt_line_id 组合 FK，唯一，一轮最多一次办理 |
| closeout_id / production_batch_id | 成品结案与任务，同源组合 FK；来料时为空 |
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

成品仍沿原入口，由 Production public 锁定可编辑来源后，Quality 同事务创建 completed 办理及结果。没有新增成品轮次、单独发起冻结或库管超建议授权。

## 不可变结果 quality_inspection_record

| 字段 | 来料 | 成品 |
| --- | --- | --- |
| case_id | 唯一，一次办理最多一个结果 | 同左 |
| 来源字段组 | receipt_line_id / receipt_revision_id | closeout_id / production_batch_id |
| inspection_method | full / sampling | full / sampling / zero_confirmation |
| covered_quantity | 必须 NULL；整批核实C归库管正式清单 | 必填C，全检C=G+F，抽检独立核实 |
| qualified_quantity / unqualified_quantity | 非负G/F，N=G+F必须为正且不超过单条数量上限 | 非负G/F，N≤C |
| release_decision | released / pending_reinspection / not_released | 同左 |
| previous_record_id | 同到货前驱组合 FK | 同结案前驱组合 FK |
| inspected_at / result_note / evidence_reference | 真实时间、非空说明和凭据 | 同左 |
| created_by / created_at | 不可变创建事实，人员 FK | 同左 |

UPDATE/DELETE 触发器禁止覆盖结果。N由G+F派生，不单独保存。来料 API 的 `coveredQuantity/releasedQuantity` 返回 null，不用0或原申报伪造测量量，也不在 Quality 计算库管未来的可入授权。

来料明确放行后，由 Procurement 定稿核实C，提示全检建议G、抽检建议C−F。用户已批准库管填写依据确认超建议数量；原G/F不改写。待复检及不放行仍不能生成正常可入依据。`QualityInboundQuery.requireReleaseBasis` 只核验 completed、明确放行、精确case/record及同到货来源，不再用旧C作硬上限；Procurement必须核验当前轮、正式授权和未消费量。

成品保留检验事实的计数约束及零产出核实：全检C=N>0，抽检0<N≤C，明确放行后的派生数分别为G、C−F；其余结论不产生放行资格。零量核实仅成品使用，C=G=F=0且明确确认。应用将派生数作为定稿建议，数量差异不拦保存、送审或批准；仍要求最新记录明确放行。检验事实条件CHECK与已批准量的实际执行防重保留，表及契约结构不因建议语义改变。[CQ-01](../../../../../../docs/documentation-conflicts.md#cq-01)的固定已入基准、剩余范围快照与开始复检冻结尚待实施。

## 迁移及查询

`202609220001-receipt-processing-rounds` 追加成对迁移，切换来料轮次来源、失效原因及来源区分的数量CHECK。上下行在永久DDL前拒绝已有相关来料事实，不猜历史、不双写；未触及的成品事实允许保留。由开发初始化入口重建后应用，无需修改执行过的迁移。

Quality public 提供分页及批量自身记录。来料列表由 Procurement 登记的只读查询目录读取来源定位字段，完整检验仍通过 Quality public 获取。成品查询与来源注册规则见[成品质检](finished-inspections.md)。
