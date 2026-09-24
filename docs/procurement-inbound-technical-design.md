# 采购、质检与入库技术设计

本文维护采购、质检及实际入库的跨模块协作；各模块当前规则由下列所有者文档维护，选择理由见 [ADR-0013](adr/0013-procurement-source-and-stock-boundaries.md) 和 [ADR-0015](adr/0015-unified-quality-quantity-semantics.md)。用户验收及正式测试见[路线图](roadmap.md)。

| 所有者 | 当前表与公开能力 | 边界 |
| --- | --- | --- |
| Procurement | procurement_order*、receipt/line/revision/round、receipt_acceptance/allocation、supplier_return；来源命令 | 采购来源、实物草稿、正式分配、退回及关闭，禁止写需求或库存 |
| Quality | quality_inspection_case/record；QualityInboundCommand/Query、QualityFinishedInspectionQuery及来源registry | 共用不可变检查事实；来料G/F与结论，成品保留C规则；不写来源草稿 |
| Production | 任务、production_batch_closeout、production_output_revision | 产线修正、结案审批、批准清单，公开能力引用QC |
| Inventory | item_batch、inbound_order/detail、inventory_transaction与余额 | 只记录实际库存，消费精确正式依据，不能把待检保管量写成可用库存 |

表均按公共审计、整数数量、FK/组合FK、并发和不可变规则设计。Quality source_kind与显式来源组互斥；结果冗余稳定来源ID仅用于组合FK，由case约束一致。采购原始来源仍固定，履约归属从不可变分配及有效范围取得。

## 事务和当前依据

来料由receipt_line.current_round_id指向整批流程。初次到货创建revision和uninspected轮次；草稿和检查无allocation。发起检查经Quality public创建与incoming_round_id同源的case；全检/抽检都覆盖本批全部未处置实物，样本不拆资格。结果按结论进入待定稿/待复检/不放行。库管定稿核实C并保存正式授权、校准revision和不可变allocation，Quality原G/F不覆盖。普通分配更正可显式继承本批有效QC。

复检／独立更正使旧 round.superseded，全部未实际处置授权退出；previous_round_id 串联整批历史，source_allocation_round_id 仅继承采购归属／终止约束。allocation 保持不可变，实际入退直接关联，部分入库不拆子节点；I/B事实继续保留。T为本次到货核实总量，U=T−I−B，starting_quantity只存起始U。G/F是建议，正式可入数量仍由库管按明确放行记录承担确认责任。

按数值ID锁原采购和关联补单根，再锁到货行、当前轮和份额，经public核对Quality/Inventory；写入、审计、幂等同事务。质检、复检、拒收、定稿、入库和退回在同一来源互斥，数据库锁不跨现场操作。先核对状态/版本再新增事实，禁止先插迟到记录再标历史。未知结果复用原幂等key/body，已成功操作只重放原结果。

人工拒收创建 manual_rejection/finalized 轮及无 acceptance 的 return/manual_rejection 分配，真实退回引用分配／拒收轮。撤销拒收需原因及剩余量，追加 rejection_revocation/uninspected，不改 revision；拒收后更正 T 也按 receipt_correction 回待检，如仍拒收须再决定。旧未完成检查失效，旧事实保留，已入库退货不在此入口。

成品沿现有线下登记，Quality通过Production注册来源能力锁可编辑根，原子创建完成case/record并推进来源版本；产线管理员引用最新记录送审，Inventory按批准清单每类一次确认。

## 结构、接口与界面所有者

- [采购数据库](../apps/api/src/modules/procurement/docs/database.md)：供应商、订单、来源与关闭。
- [正式清单主从](../apps/api/src/modules/procurement/docs/receipt-acceptance.md)：physical-first、existing_receipt与new_arrival、字段/约束、分配、更正及120件示例。
- [到货命令](../apps/api/src/modules/procurement/docs/receipts.md)：状态、权限、幂等与实际退回。
- [查询](../apps/api/src/modules/procurement/docs/receipt-queries.md)：候选、分页、分配历史与真实执行量。
- [Quality数据库](../apps/api/src/modules/quality/docs/database.md)：共用两表与同源约束。
- [库存来源](../apps/api/src/modules/inventory/docs/database/inventory-ledger-and-inbound.md)：正式分配引用、固定批次及唯一账本。
- [管理端交互](../apps/admin-web/docs/incoming-inspection-adoption.md)：数量输入、核对/分配、未知结果恢复、跨页导航。

## 迁移与验证

当前来料正式分配使用不可变 allocation，入库、退回和质量补发精确引用其身份。数据库初始化、历史升级边界与回滚操作只维护于[迁移安全](../packages/database/docs/migration-safety.md)，不在业务说明复述迁移步骤。

共享字符串代码由constants管理，HTTP用class DTO；展示跨表字段登记api-data-ownership，业务资格仍由锁内public核验。新幂等scope与架构检查和API幂等文档同步。应用类型、构建、迁移检查及启动是交付验证，不等于用户UI验收或正式测试集通过。

质量补发引用正式质量退回分配与供应商约定，创建及下单按原采购根锁重核处置有效；不以实际交接或原单关闭为前置。实际退回与补发分别引用同一分配明细，新增补发实物仍独立走到货/质检/正式清单/入库，字段见[采购订单](../apps/api/src/modules/procurement/docs/purchase-orders.md)。
