# 采购、质检与入库技术设计

本文维护采购、质检及实际入库的跨模块协作；各模块当前规则由下列所有者文档维护，选择理由见 [ADR-0013](adr/0013-procurement-source-and-stock-boundaries.md) 和 [ADR-0015](adr/0015-unified-quality-quantity-semantics.md)。用户验收及正式测试见[路线图](roadmap.md)。

| 所有者 | 当前表与公开能力 | 边界 |
| --- | --- | --- |
| Procurement | procurement_order*、receipt/line/revision/round、receipt_acceptance/allocation、supplier_return；来源命令 | 采购跟进状态、实物登记及主表作废状态、正式分配和退回，禁止写需求或库存 |
| Quality | quality_inspection_case/record；QualityInboundCommand/Query、QualityFinishedInspectionQuery及来源registry | 共用不可变检查事实；来料／成品只记录G/F与明确结论；不写来源草稿 |
| Production | 任务、production_batch_closeout、production_output_round/revision/allocation | 产线修正、结案审批、批准清单，公开能力引用QC |
| Inventory | item_batch、inbound_order/detail、inventory_transaction与余额 | 只记录实际库存，消费精确正式依据，不能把待检保管量写成可用库存 |

来料整批 C 由 Procurement 库管定稿核实。成品按 [ADR-0019](adr/0019-finished-inspection-measurement-simplification.md) 仅在 Production 定稿引用放行全检记录时，按原检验轮已入基准加 G 提示累计目标差额；Quality 不生成整批 C 或放行数量建议。

采购结束／恢复仅管理跟进意图，不以物流数量为资格，主单按行汇总。到货主单冻结原登记字段，以主表专门字段、修改审计及乐观版本表达一次性整单作废；在无实际入退且已处理补单依赖时撤销未执行资格，原登记和已完成检查保留，采购状态不随作废改变。两者的取舍和取代范围见 [ADR-0022](adr/0022-procurement-state-and-receipt-void.md)。

表均按公共审计、整数数量、FK/组合FK、并发和不可变规则设计。Quality source_kind与显式来源组互斥；结果冗余稳定来源ID仅用于组合FK，由case约束一致。采购原采购行及原到货身份固定，物流归属由到货自身采购行确定；超量补购只追溯来源，质量补发另有自己的到货。两类补单只保存原采购行、原到货明细及建单依据，不引用仓库分配，取舍见 [ADR-0025](adr/0025-supplement-receipt-line-basis.md)。

采购供应商唯一存于 Procurement 主单；到货、来料和库存来源展示沿固定采购行所属主单解析，Quality 不增供应商存储。采购行只保存本行无税／含税整行金额文本，金额不进入库存或检验资格，见 [ADR-0026](adr/0026-purchase-order-supplier-and-amounts.md)及[采购数据库](../apps/api/src/modules/procurement/docs/database.md)。来料分组和外购实际入库仍可跨供应商；Inventory 已确认名称快照、既有批次 provider 和审计历史不随存储层级变化回写。

## 事务和当前依据

来料由receipt_line.current_round_id指向整批流程。初次到货创建revision和uninspected轮次；草稿和检查无allocation。发起检查经Quality public创建与incoming_round_id同源的case；全检/抽检都覆盖本批全部未处置实物，样本不拆资格。结果按结论进入待定稿/待复检/不放行。库管定稿核实C并保存正式授权、校准revision和不可变allocation，Quality原G/F不覆盖。普通分配更正可显式继承本批有效QC。

复检／独立更正使旧 round.superseded，全部未实际处置授权退出；previous_round_id 串联整批历史，source_allocation_round_id 仅继承采购终止约束。allocation 保持不可变，实际入退直接关联，部分入库不拆子节点；I/B事实继续保留。T为本次到货核实总量，U=T−I−B，starting_quantity只存起始U。G/F是建议，正式可入数量仍由库管按明确放行记录承担确认责任。

按数值ID锁原采购和关联补单根，再锁到货行、当前轮和份额，经public核对Quality/Inventory；整单作废在到货行后锁定主单、核对主单版本及作废标记，再锁各当前轮。写入、审计、幂等同事务。质检、复检、拒收、定稿、入库、退回和作废在同一来源互斥，数据库锁不跨现场操作。先核对状态/版本再新增事实，禁止先插迟到记录再标历史。未知结果复用原幂等key/body，已成功操作只重放原结果。

人工拒收创建 manual_rejection/finalized 轮及无 acceptance 的 return/manual_rejection 分配，真实退回引用分配／拒收轮。撤销拒收需原因及剩余量，追加 rejection_revocation/uninspected，不改 revision；拒收后更正 T 也按 receipt_correction 回待检，如仍拒收须再决定。旧未完成检查失效，旧事实保留，已入库退货不在此入口。

成品按 [ADR-0016](adr/0016-inbound-authorizations-and-stock-batches.md) 管理来源轮次及剩余授权。Quality通过Production注册来源能力锁内固定检查来源，独立开始及完成检查；产线管理员引用有效记录送审，负责人批准后按授权分次入库。两来源实际入库都由库管选择新建或已有合资格批次，来料其他业务规则保持。

## 结构、接口与界面所有者

- [采购数据库](../apps/api/src/modules/procurement/docs/database.md)：供应商、订单、来源与关闭。
- [正式清单主从](../apps/api/src/modules/procurement/docs/receipt-acceptance.md)：physical-first、existing_receipt与new_arrival、字段/约束、分配、更正及120件示例。
- [到货命令](../apps/api/src/modules/procurement/docs/receipts.md)：状态、权限、幂等与实际退回。
- [查询](../apps/api/src/modules/procurement/docs/receipt-queries.md)：候选、分页、分配历史与真实执行量。
- [Quality数据库](../apps/api/src/modules/quality/docs/database.md)：共用两表与同源约束。
- [库存来源](../apps/api/src/modules/inventory/docs/database/inventory-ledger-and-inbound.md)：正式分配引用、自主归批及唯一账本。
- [管理端交互](../apps/admin-web/docs/incoming-inspection-adoption.md)：数量输入、核对/分配、未知结果恢复、跨页导航。

## 迁移与验证

当前来料正式分配使用不可变 allocation，实际入库和退回精确引用其身份；质量补单关联到货明细，分配只参与新建资格核验。数据库初始化、历史升级边界与回滚操作只维护于[迁移安全](../packages/database/docs/migration-safety.md)，不在业务说明复述迁移步骤。

共享字符串代码由constants管理，HTTP用class DTO；展示跨表字段登记api-data-ownership，业务资格仍由锁内public核验。新幂等scope与架构检查和API幂等文档同步。应用类型、构建、迁移检查及启动是交付验证，不等于用户UI验收或正式测试集通过。

质量补发引用原到货明细与供应商约定，创建在原采购根锁内核验该明细存在当前有效质量退回处置或真实质量退回事实；已有补单下单只核验固定来源及采购资格，来源轮次被替代不阻断继续办理，不以实际交接或原单关闭为前置。两类候选均按到货明细展示整次到货的统一处理数量，展示退回总量不替代质量原因资格，字段及汇总口径见[候选查询](../apps/api/src/modules/procurement/docs/receipt-queries.md#入库候选及正式分配)。新增补发实物独立走到货/质检/正式清单/入库，规则见[采购订单](../apps/api/src/modules/procurement/docs/purchase-orders.md)。
