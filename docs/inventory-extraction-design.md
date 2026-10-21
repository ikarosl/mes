# Inventory：所有权与跨模块事务协议

本文维护 Production、Procurement、Product、Quality 与 Inventory 共同遵守的协议。当前端口由 [Inventory 公开能力](../apps/api/src/modules/inventory/docs/public-contracts.md)维护，库存字段及状态由[数据库所有者](../apps/api/src/modules/inventory/docs/database.md)维护；采购来源选择理由见 [ADR-0013](adr/0013-procurement-source-and-stock-boundaries.md)，公共单据结构与预留反向读取的决策边界见 [ADR-0020](adr/0020-shared-stock-documents-and-source-boundaries.md)。

## 1. 库存约束与 migration 依据

inventory_transaction 是唯一库存事实，只追加；余额由触发器在同一事务维护，可以重建。物料和成品使用同一组库存表的互斥身份分支，不复制影子库存，不按来源拆分同表写权。数据库迁移操作见[迁移安全](../packages/database/docs/migration-safety.md)。

item_batch.batch_code 是唯一内部批号，公共入库明细的 batch_id 引用真实库批。其他入库 new 草稿只保存目标意图、batch_id=NULL，确认才生成并回填真实批次；采购／批准成品仍是一次来源确认成单，不开放仓库编辑草稿。归批键不是人工批号，取消其他草稿不留下空批次。

## 2. 唯一表所有者

| 所有者 | 职责 |
| --- | --- |
| Inventory | 公共入出库四表、批次、唯一库存流水、余额投影和物料盘点；完整表定义见其数据库文档 |
| Production | 需求、预留、损耗、执行、产出、结案和批准清单，以及领退料来源校验／履约编排；公共实际单据和库存经 Inventory 写入 |
| Procurement | 采购来源、到货、整批流程、正式分配和实际退供应商；通过公开命令确认采购入库 |
| Quality | 不可变检验事实、复检与结论；不改生产产出或库存 |
| Product | 基础物料、精确版本及成品身份和用途资格；提供统一父身份锁 |

物理外键可跨所有者，应用写入只能由表所有者完成。历史已删除表仅为不可修改的旧 migration 保留登记，不恢复结构。退料使用公共 inbound_order/detail(return_inbound)，不建双写、影子或第二份退料数量；outbound_order/detail 整表归 Inventory，即使其行内含生产来源 ID，也不授予 Production 直接写权。

## 3. 公开端口与调用方向

来源模块先在锁内决定业务资格，再调用 inventory/public.ts 的窄 application 能力。Inventory 核对自有库存身份、批次状态、余额及单据状态，不反调 Production、Procurement 或 Quality 决定来源资格；其他出库仅按 §7 的窄反向预留端口读取 Production 当前分配事实；不接受任意流水类型、来源表或覆盖余额。

所有 adapter 使用同一 DATABASE_POOL，withTransaction 嵌套调用复用现有事务，命令读取通过 withActiveConnection 加入当前连接。来源单据、库存事实、触发器余额、成功审计和已启用 HTTP 幂等结果一起提交；错误向外传播并整体回滚。端口不传数据库连接、Executor、SDK 类型或 SQL。

## 4. 授权消费与目标库存批次

按 [ADR-0016](adr/0016-inbound-authorizations-and-stock-batches.md)，来源资格与库管归批分开。Procurement 保留原有到货、质检、定稿、复检、采购归属和退回规则；一次外购物料确认可跨供应商，逐明细保存来源，见 [ADR-0018](adr/0018-purchase-inbound-multiple-suppliers.md)。Production 在有效批准轮内提供计划内外剩余授权，库管可以分次消费。

1. 来源模块按稳定顺序锁来源根、当前轮及所选授权，核对版本、明确放行和本次按授权汇总的消费量。不同目标明细引用同一授权时也必须合计校验，不逐条独立放过总超量。
2. HTTP 请求只能表达授权选择、本次数量和新建／已有目标；来源身份、单位、编码及供应商由所属模块锁内解析，不信任客户端资格快照。
3. Inventory 在相同事务锁定 Product 父身份及已有目标批次，核验产品或物料精确版本、单位、批次状态和容量。新批次由明确的请求内标识复用，不能靠相同批号猜测复用；既有批次通过 ID 选择，不自动更换目标。
4. 采购／成品每条 inbound_detail 消费一份正式授权并指向一个实际 batch_id；每条有效实际明细对应本次唯一原始正流水。多次入库可同批，不同授权可共用目标；合库批不合并检查、不更改采购或生产来源归属。
5. 到货与库存批次通过实际入库明细关联，不限定唯一 batch_id，成品也不按类别独占库批。历史已入累计以来源及明细、匹配正流水计算，不扣当前库存余额；目标批次被其他来源追加或发生领用都不改变原来源基准。
6. 单据、明细、批次创建、流水、余额投影、成功审计与 HTTP 幂等响应原子提交，失败全部回滚。采购／成品按 pending → 明细／目标 → 流水 → completed 执行，但没有可跨请求继续办理的仓库编辑草稿；事务内部临时状态由 Inventory 守卫控制，不对外增加业务步骤。

成品入库主单可包含多份授权，不持有唯一批准版本。正式依据沿“实际明细 → 授权 → 批准版 → 检验”追溯，类别留在授权，批次及主单使用中性成品类型。批号从实际 item_batch 读取，不在明细中重复保存批号。端口、字段与索引由 [Inventory 公开能力](../apps/api/src/modules/inventory/docs/public-contracts.md)及其数据库 owner 维护。

## 5. 当前实现职责

生产、采购等来源编排调用 Inventory public，Inventory 不深层引用 Production domain 或 HTTP filter。其他出库预留保护使用只读事实反向协作：Inventory 定义端口，由 API 组合根 adapter 只导入 Production public 装配，不决定来源业务资格，也不修改分配。仅此范围允许反向读取预留事实，其余来源办理保持来源先验证。调用业务由来源模块审计，Inventory 自有用例由 Inventory 审计。机械数量函数使用公共工具，各模块映射公开稳定错误。代码文件位置与方法清单直接从 public.ts 和 application 端口读取，本文不复制文件目录。

## 6. 展示目录与字段白名单

跨模块只读目录、表和字段的准确许可由 scripts/api-data-ownership.mjs 登记。不得放开整个 infrastructure，不允许 SELECT *、写入或 FOR UPDATE/SHARE。目录位置不能把业务资格伪装成展示读取。

Inventory 可在登记查询中展示 Production 的有效预留，但不取得预留事实所有权；也不能据此选择批准版本或修改生产单据。命令资格必须使用公开能力在同一事务重核。

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

全部新增／增量分配先持目标库存批次锁。跨任务预留余额与公共领料当前读也使用 NOWAIT，防止“持批次等分配”与“持分配等批次”互等。NOWAIT 冲突立即使整个业务事务回滚，已登记 HTTP 幂等命令使用原键、原语义有限重试；达到上限返回可重试失败，不能只重试半次记账、SKIP LOCKED 漏算，或把普通 RR 快照当当前读。NOWAIT 不宣称解决全部既有锁序问题。

该例外只允许只读预留事实反向协作，其他出库不能抢占、释放分配，也不能恢复需求履约。来源模块取消、释放、更正和领料继续自己的权限、状态和数量校验；Inventory 当前事实不反锁来源任务。

采购历史已入事实的当前读不取得历史库批锁；事实端口与展示批号读取分离，具体字段见 [Inventory 公开能力](../apps/api/src/modules/inventory/docs/public-contracts.md)。已有目标批次由实际入库命令按完整集合和稳定顺序一次取得排他锁，避免不同采购来源共批时先持有历史共享锁、再互相等待升级为排他锁。

### 父身份外键锁与循环审查

`inventory_transaction` 外键引用 `materials`，余额触发器写入 `inventory_material_variant_balance` 时还引用 `material_variants`，因此写流水会隐式获取 Product 父行共享锁。退料／盘点若先占库存批次，再等待被采购资格查询占用的 Product 父行，同时采购又等待同一库存批次，会形成环。

Product 提供 `lockHistoricalReferences({references})`，在相同事务内按其统一顺序锁成品或物料及精确版本身份；这是共享锁及引用存在性校验，不过滤停用、软删除，不授予新采购或领料资格。Inventory 所有批次写入口先取已收集完整身份的 Product 历史或对应用途父锁，再锁批次；无锁定位后在批次锁内重新核对 ID，引用变化时失败，不能追加逆序父锁。成品创建明细／批次／流水同样先取得 `products` 历史身份共享锁，已批准产出不因此新增主数据启用门禁。

Product 用途资格与历史引用锁必须使用相同内部父行顺序；同批命令先收集全部物料／版本 ID、统一排序一次锁定，不能逐明细重复“Product → 库存 → 下一个 Product”。批次余额和版本余额触发器属于库存内部锁，跨版本流水也按稳定精确版本／批次次序执行以降低死锁，数据库死锁仍按已登记幂等命令重试规则整体重试。

`mysql-production-output.read.ts` 通过 `InventoryInboundCommand.readFinishedTaskAllocationReceipts/readFinishedAllocationReceipts` 读取已确认入库；带锁读取属于清单更正资格判断，不是展示。只有取得工单／任务／结案根的调用链才能调用 Inventory 带锁版本；先锁入库再回取结案根的实现禁止。普通详情用非锁查询，不能从非锁结果推导写入资格。

`withTransaction` 的当前连接必须贯穿公开调用；只读 adapter 若可能参与命令使用 `withActiveConnection`，不能错误地固定调用 `pool.query` 逃离外层事务。跨模块端口不接受 `PoolConnection`、Executor 或 SQL 片段。

## 8. 必须保留的生产语义

- 需求与履约由 Production 管理：采购不扣需求，分配不写库存，确认领料才履约并扣库存。退料回原批次公共可用库存，不恢复旧需求或开工授权；领后损耗不再扣仓库库存。
- 物料按基础物料、精确版本、库存批次及库存状态定位，成品使用独立 product_id。版本停用与批次冻结是不同门禁，采购和生产领料分别校验用途。
- 盘点仅处理已有正库存物料批次及库存状态，不创建空中批次、不扩展成品或生产预留保护；库存快照变化须重盘。
- 成品按 self_made/production_extra 授权类别分次执行；开始更正／复检暂停旧剩余资格，最终批准授予新剩余量。类别累计批准量不低于对应历史已入；库存归批不改变该类别归属。
- 人工其他出入库只修正库存，不改生产需求、补料履约、退料占用或采购／产出授权累计；退料也不新增质检，其他单不增加通用质检／定稿。
- 公共流水仅一个可写来源，有类型生成 FK 和 original_posting_key 分别保护真实分支与每明细一笔原始记账；分组非空不能跳过去重，基础冲销不授予通用撤销已确认单据。
- 历史业务明细、取消原因、批次来源、批准版本和流水正负保留；历史身份不因停用或软删除消失，累计入库／领料不从当前余额反推。

当前字段与库存规则见 [Inventory 数据库](../apps/api/src/modules/inventory/docs/database.md)，生产来源门禁见 [Production 数据库](../apps/api/src/modules/production/docs/database/README.md)。

## 9. 维护与验证边界

端口及所有权变更同步模块 owner、调用方和实际登记脚本；具体字段和方法只维护在 owner，公共事务与锁序维护在本文。库存、盘点和成品入库继续使用既有 HTTP／权限；外购物料写入必须具有采购来源，无采购来源的历史业务仅可查询；退料 HTTP 保留 returned 表达并映射公共 completed，物理引用统一 inbound_detail。其他入／出库四类写命令（创建、保存、确认、取消）逐方向独立登记权限与 HTTP 幂等，不把 ledger 唯一键等同 HTTP 重放。

交付及正式测试顺序见 [AGENTS.md](../AGENTS.md#数据库与交付约定)，待验收见[路线图](roadmap.md)。关键业务验证覆盖分配、领料、补料放行、退料、盘点、成品入库和采购闭环；构建及启动不表示完整业务测试通过。
