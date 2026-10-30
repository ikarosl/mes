# Inventory：所有权与跨模块事务协议

本文维护 Production、Procurement、Product、Quality 与 Inventory 共同遵守的协议。当前端口由 [Inventory 公开能力](../apps/api/src/modules/inventory/docs/public-contracts.md)维护，库存字段及状态由[数据库所有者](../apps/api/src/modules/inventory/docs/database.md)维护；采购来源选择理由见 [ADR-0013](adr/0013-procurement-source-and-stock-boundaries.md)，公共单据结构与预留反向读取的决策边界见 [ADR-0020](adr/0020-shared-stock-documents-and-source-boundaries.md)。

## 1. 库存约束与 migration 依据

inventory_transaction 是唯一库存事实，只追加；余额由触发器在同一事务维护，可以重建。物料和成品使用同一组库存表的互斥身份分支，不复制影子库存，不按来源拆分同表写权。数据库迁移操作见[迁移安全](../packages/database/docs/migration-safety.md)。

## 2. 唯一表所有者

| 所有者 | 职责 |
| --- | --- |
| Inventory | 公共入出库四表、批次、唯一库存流水、余额投影和物料盘点；业务含义见其数据库文档 |
| Production | 需求、预留、损耗、执行、产出、结案和批准清单，以及领退料来源校验／履约编排；公共实际单据和库存经 Inventory 写入 |
| Procurement | 采购来源、到货、整批流程、正式分配和实际退供应商；通过公开命令确认采购入库 |
| Quality | 不可变检验事实、复检与结论；不改生产产出或库存 |
| Product | 基础物料、精确版本及成品身份和用途资格；提供统一父身份锁 |

物理外键可跨所有者，应用写入只能由表所有者完成。历史已删除表仅为不可修改的旧 migration 保留登记，不恢复结构。退料使用公共 inbound_order/detail(return_inbound)，不建双写、影子或第二份退料数量；outbound_order/detail 整表归 Inventory，即使其行内含生产来源 ID，也不授予 Production 直接写权。

## 3. 公开端口与调用方向

来源模块先在锁内决定业务资格，再调用 inventory/public.ts 的窄 application 能力。Inventory 核对自有库存身份、批次状态、余额及单据状态，不反调 Production、Procurement 或 Quality 决定来源资格；其他出库仅按 §7 的窄反向预留端口读取 Production 当前分配事实；不接受任意流水类型、来源表或覆盖余额。

来源单据、库存事实、余额投影及成功审计在同池事务提交。连接复用和端口类型遵守[架构规范](architecture.md#6-事务与审计)，启用命令的结果重放遵守[平台幂等](../apps/api/docs/idempotency.md)。

## 4. 授权消费与目标库存批次

按 [ADR-0016](adr/0016-inbound-authorizations-and-stock-batches.md)，来源资格与库管归批分开。Procurement 保留原有到货、质检、定稿、复检、采购归属和退回规则；一次外购物料确认可跨供应商，逐明细保存来源，见 [ADR-0018](adr/0018-purchase-inbound-multiple-suppliers.md)。Production 在有效批准轮内提供计划内外剩余授权，库管可以分次消费。

1. 来源模块按稳定顺序锁来源根、当前轮及所选授权，核对版本、明确放行和本次按授权汇总的消费量。不同目标明细引用同一授权时也必须合计校验，不逐条独立放过总超量。
2. HTTP 请求只能表达授权选择、本次数量和新建／已有目标；来源身份、单位、编码及供应商由所属模块锁内解析，不信任客户端资格快照。
3. Inventory 在相同事务锁定 Product 父身份及已有目标批次，核验产品或物料精确版本、单位、批次状态和容量。新批次由明确的请求内标识复用，不能靠相同批号猜测复用；既有批次通过 ID 选择，不自动更换目标。
4. 采购／成品每条 inbound_detail 消费一份正式授权并指向一个实际 batch_id；每条有效实际明细对应本次唯一原始正流水。多次入库可同批，不同授权可共用目标；合库批不合并检查、不更改采购或生产来源归属。
5. 到货与库存批次通过实际入库明细关联，不限定唯一 batch_id，成品也不按类别独占库批。历史已入累计以来源及明细、匹配正流水计算，不扣当前库存余额；目标批次被其他来源追加或发生领用都不改变原来源基准。
6. 单据、明细、批次创建、流水、余额投影、成功审计与 HTTP 幂等响应原子提交，失败全部回滚。采购／成品按 pending → 明细／目标 → 流水 → completed 执行，但没有可跨请求继续办理的仓库编辑草稿；事务内部临时状态由 Inventory 守卫控制，不对外增加业务步骤。

成品入库主单可包含多份授权，不持有唯一批准版本。正式依据沿“实际明细 → 授权 → 批准版 → 检验”追溯，类别留在授权，批次及主单使用中性成品类型。批号从实际 item_batch 读取，不在明细中重复保存批号。公开契约与特殊数据约束见 [Inventory](../apps/api/src/modules/inventory/docs/public-contracts.md)。

## 7. 事务与锁序

业务锁由各表所有者的公开能力取得；展示查询不能承担业务锁或资格判断，也不能通过 `JOIN item_batch ... FOR UPDATE` 顺带锁定跨模块显示行。多个同类 ID 按数值稳定排序；先定位来源但不加锁，然后取得来源根锁，再重新读取并核对引用不变。

| 用例 | 锁／处理顺序与同事务结果 |
| --- | --- |
| 分配 | 生产任务 → Product 生产用途及历史父身份共享锁 → Inventory 目标批次（排序）→ Production 需求／有效分配当前读 NOWAIT → Inventory 已完成生产领料事实当前读 NOWAIT；扣除全部未出库有效预留后新增分配 |
| 确认生产领料 | 生产任务 → Inventory 公共出库父单／明细 → Production 工序／分配 → Product 生产用途及父身份锁 → Inventory 批次（排序）→ Production 需求；履约、负流水、父单完成、任务状态／版本、补料履约与来源审计一起提交 |
| 确认生产退料 | 生产任务 → Inventory 公共入库父单／明细 → Production 原分配及损耗、Inventory 领退料当前事实 → Product 历史父身份 → Inventory 原批次（排序）；核对包括本单的全部退料／损耗占用，正流水、完成父单与来源审计一起提交 |
| 成品确认／清单更正／复检 | 工单 → 任务 → 结案根／当前轮及授权 → Product 历史成品父身份 → Inventory 自有历史已入事实及实际目标批次；更正同序读取历史已入、固定轮次基准并暂停旧剩余资格 |
| 其他草稿保存 | Inventory 父单／有效明细 → Product new 启用或 existing 历史身份 → 已有目标批次；只维护公共草稿及审计，不记流水、不生成 new 批次或预留 |
| 其他入库确认 | Inventory 父单／有效明细 → Product 完整目标父身份 → 已有 Inventory 目标批次（排序），new 按单内键生成／回填真实批次；逐行正流水、完成父单与 Inventory 审计同事务 |
| 其他出库确认 | Inventory 父单／有效明细 → Product 完整目标父身份 → 已有 Inventory 目标批次（排序）→ 窄预留端口当前分配 NOWAIT → Inventory 已完成生产领料当前读 NOWAIT；按批次合计未预留量核对，逐行负流水、完成父单与 Inventory 审计同事务 |
| 盘点完成 | Inventory 盘点单／明细 → Product 历史父身份 → Inventory 批次（排序）；逐项重核快照，非零差额流水、完成事实与审计一起提交 |
| 采购入库／复检／更正／退供应商 | 采购根 → Product 用途／历史身份（需要时）→ 到货行 → 当前轮／分配及检验依据（排序）→ Inventory 自有实际事实及实际目标批次（排序）；库存不反锁采购根 |

每个所有者只直接锁自己的表。Production 需要公共领退料来源状态和数量时，经 InventoryProductionDocumentCommand 取得当前事实；不能在展示目录加 FOR SHARE/UPDATE。Product 资格及统一身份锁经其 public 能力取得，先收集完整目标，不能持库存锁后追加新的 Product 父锁。其他已有批次的历史资格与新建批次的启用资格由独立 ProductOtherStockQuery 校验，不混用生产／采购用途。

按需求下单仍采用 Production 工单／任务／需求 → 采购根 → Product；先无锁定位来源，再锁来源与采购根重核引用，变化时并发失败，不在持采购根后补锁新的生产来源。普通来源确认禁止库存先锁公共单据再回调取得任务资格；必须来源根在前。

### 其他出库保护生产预留的窄例外

预留事实仍为 Production 有效 allocation，不迁移、不新增缓存数量或预留表。InventoryReservationReadPort 由组合根 adapter 调用 ProductionReservationQuery.currentAllocations，返回 id、batchId、assignedNumber、allocationStatus；它不取得任务办理资格、不修改分配，也不替来源模块选择版本。

Inventory 在目标批次排他锁后，经该端口读取目标批次 active/frozen/abnormal 分配；Production 只对自己的分配按 ID 使用 FOR SHARE NOWAIT。Inventory 再对所需的已完成 production_material 实际明细和父单当前读 NOWAIT，逐分配计算 max(assigned−confirmedIssued,0)，按库批求和；只有 available−reserved 足够时，才写 other_outbound。成品不伪造物料 allocation。

全部新增／增量分配先持目标库存批次锁。跨任务预留余额与公共领料当前读也使用 NOWAIT，防止“持批次等分配”与“持分配等批次”互等。NOWAIT 冲突立即使整个业务事务回滚，不能只重试半次记账、SKIP LOCKED 漏算，或把普通 RR 快照当当前读。服务端有限重试的适用范围见 [Inventory 命令契约](../apps/api/src/modules/inventory/docs/public-contracts.md#其他入出库与幂等)，不能推定所有幂等命令都会自动重试。NOWAIT 不宣称解决全部既有锁序问题。

该例外只允许只读预留事实反向协作，其他出库不能抢占、释放分配，也不能恢复需求履约。来源模块取消、释放、更正和领料继续自己的权限、状态和数量校验；Inventory 当前事实不反锁来源任务。

采购历史已入事实的当前读不取得历史库批锁；事实端口与展示批号读取分离，具体字段见 [Inventory 公开能力](../apps/api/src/modules/inventory/docs/public-contracts.md)。已有目标批次由实际入库命令按完整集合和稳定顺序一次取得排他锁，避免不同采购来源共批时先持有历史共享锁、再互相等待升级为排他锁。

### 父身份外键锁与循环审查

`inventory_transaction` 外键引用 `materials`，余额触发器写入 `inventory_material_variant_balance` 时还引用 `material_variants`，因此写流水会隐式获取 Product 父行共享锁。退料／盘点若先占库存批次，再等待被采购资格查询占用的 Product 父行，同时采购又等待同一库存批次，会形成环。

Product 提供 `lockHistoricalReferences({references})`，在相同事务内按其统一顺序锁成品或物料及精确版本身份；这是共享锁及引用存在性校验，不过滤停用、软删除，不授予新采购或领料资格。Inventory 所有批次写入口先取已收集完整身份的 Product 历史或对应用途父锁，再锁批次；无锁定位后在批次锁内重新核对 ID，引用变化时失败，不能追加逆序父锁。成品创建明细／批次／流水同样先取得 `products` 历史身份共享锁，已批准产出不因此新增主数据启用门禁。

Product 用途资格与历史引用锁必须使用相同内部父行顺序；同批命令先收集全部物料／版本 ID、统一排序一次锁定，不能逐明细重复“Product → 库存 → 下一个 Product”。批次余额和版本余额触发器属于库存内部锁，跨版本流水也按稳定精确版本／批次次序执行以降低死锁；发生死锁仍须整体回滚，恢复遵守所属命令的重试契约。

成品清单更正读取已入事实前，须先取得工单、任务及结案根锁；不能先锁入库再回取结案根。历史已入的事实端口与展示读取见 [Inventory 公开能力](../apps/api/src/modules/inventory/docs/public-contracts.md)。

## 9. 维护与验证边界

本文维护跨模块锁序与协作例外；数据和命令语义由 [Inventory](../apps/api/src/modules/inventory/docs/database.md)、[Production](../apps/api/src/modules/production/docs/database/README.md)及 [Procurement](../apps/api/src/modules/procurement/README.md)维护，展示读取许可见[架构登记](architecture.md#展示查询的跨模块读取)。修改协作协议时同步相关所有者与调用方，剩余验收和覆盖缺口见[路线图](roadmap.md)。
