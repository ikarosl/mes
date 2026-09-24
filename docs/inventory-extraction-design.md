# Inventory：所有权与跨模块事务协议

本文维护 Production、Procurement、Product、Quality 与 Inventory 共同遵守的协议。当前端口由 [Inventory 公开能力](../apps/api/src/modules/inventory/docs/public-contracts.md)维护，库存字段及状态由[数据库所有者](../apps/api/src/modules/inventory/docs/database.md)维护；选择理由见 [ADR-0013](adr/0013-procurement-source-and-stock-boundaries.md)。

## 1. 库存约束与 migration 依据

inventory_transaction 是唯一库存事实，只追加；余额由触发器在同一事务维护，可以重建。物料和成品使用同一组库存表的互斥身份分支，不复制影子库存，不按来源拆分同表写权。数据库迁移操作见[迁移安全](../packages/database/docs/migration-safety.md)。

item_batch.batch_code 是内部批号，inbound_detail.batch_id 引用真实库存批次。虽然后者列允许空值，物料分支 CHECK 仍要求非空；采购确认直接生成已完成入库单，不能仅凭列可空推断支持采购入库草稿。

## 2. 提取后的唯一表所有者

| 所有者 | 职责 |
| --- | --- |
| Inventory | 批次、入库主从单、唯一库存流水、余额投影和物料盘点；完整表定义见其数据库文档 |
| Production | 需求、预留、领料、退料、损耗、执行、产出、结案和批准清单；通过公开命令写库存 |
| Procurement | 采购来源、到货、整批流程、正式分配和实际退供应商；通过公开命令确认采购入库 |
| Quality | 不可变检验事实、复检与结论；不改生产产出或库存 |
| Product | 基础物料、精确版本及成品身份和用途资格；提供统一父身份锁 |

物理外键可跨所有者，应用写入只能由表所有者完成。历史已删除的 inventory_item_balance 仅为不可修改的旧 migration 保留登记，不恢复结构。

## 3. 公开端口与调用方向

来源模块先在锁内决定业务资格，再调用 inventory/public.ts 的窄 application 能力。Inventory 核对自有库存身份、批次状态、余额及单据状态，不反调 Production、Procurement 或 Quality 决定来源资格；不接受任意流水类型、来源表或覆盖余额。

所有 adapter 使用同一 DATABASE_POOL，withTransaction 嵌套调用复用现有事务，命令读取通过 withActiveConnection 加入当前连接。来源单据、库存事实、触发器余额、成功审计和已启用 HTTP 幂等结果一起提交；错误向外传播并整体回滚。端口不传数据库连接、Executor、SDK 类型或 SQL。

## 4. 采购入库与固定批次契约

采购实际供应商逐行确定，同一次入库只能选择同一供应商。Procurement 从锁内采购行解析 provider，并以真实到货身份、当前修订、正式 allocation 及 Quality 校验结果构造可信参数；HTTP 客户端不能自行提供“已合格”标记或可信快照。

1. Procurement 按稳定顺序锁采购根、到货及当前轮／分配，检查状态、明确放行、未入未退余量和 Product 用途资格。关闭不影响既有到货合法入库。
2. Inventory 在同一事务创建已完成入库单；首次实际入库生成唯一批次，已有批次则复核物料、精确版本、来源和状态。
3. 同一调用按 receiptLineId 复用批次，同到货多分配只建一次；不同到货不按供应商批号合并。
4. 每条实际入库明细引用一个 allocation，保存到货、实收修订和检验依据，并产生一笔本次正流水。一个 allocation 可多次实际入库，不能改写授权行或按一次消费封死。
5. Procurement 同事务将空 batch_id 原子绑定；后续批次不变。当前额度扣除历史实际入库累计量，不扣当前库存余额。
6. 入库事实、流水、批次绑定、审计和 HTTP 幂等响应原子提交，失败全部回滚；不另开内部 HTTP 或依赖提交后通知补写。

成品类别的整类一次确认规则保持独立。编号、字段及查询契约见 [Inventory 公开能力](../apps/api/src/modules/inventory/docs/public-contracts.md#采购入库协议)。

## 5. 当前实现职责

Production → Inventory 为单向依赖；Inventory 不深层引用 Production domain 或 HTTP filter。调用业务由来源模块审计，Inventory 自有用例由 Inventory 审计。机械数量函数使用公共工具，各模块映射公开稳定错误。代码文件位置与方法清单直接从 public.ts 和 application 端口读取，本文不复制文件目录。

## 6. 展示目录与字段白名单

跨模块只读目录、表和字段的准确许可由 scripts/api-data-ownership.mjs 登记。不得放开整个 infrastructure，不允许 SELECT *、写入或 FOR UPDATE/SHARE。目录位置不能把业务资格伪装成展示读取。

Inventory 可在登记查询中展示 Production 的有效预留，但不取得预留事实所有权；也不能据此选择批准版本或修改生产单据。命令资格必须使用公开能力在同一事务重核。

## 7. 事务与锁序

业务锁由各表所有者的公开能力取得；展示查询不能承担业务锁或资格判断，也不能通过 `JOIN item_batch ... FOR UPDATE` 顺带锁定跨模块显示行。多个同类 ID 按数值稳定排序；先定位来源但不加锁，然后取得来源根锁，再重新读取并核对引用不变。

| 用例 | 锁／处理顺序与同事务结果 |
| --- | --- |
| 分配 | 生产任务 → Product 历史父身份共享锁 → Inventory 批次（排序）→ Production 需求／分配；账面可用量减有效预留后新增分配。保持同一任务命令以任务根锁串行化 |
| 确认生产出库 | 生产任务 → 出库单／工序／分配 → Product 精确版本用途门禁及父身份锁 → Inventory 批次（排序）→ 需求；需求履约、负流水、单据状态、短批授权、补料齐套／补产放行与审计一起提交 |
| 确认退料 | 生产任务 → 退料单／分配 → Product 历史父身份共享锁 → Inventory 批次（排序）；核对已确认领料与退料／损耗占用，单据与公共库存正流水一起提交 |
| 成品草稿／确认及清单更正 | 工单 → 生产任务 → 结案／当前批准清单 → Product 历史成品父身份共享锁 → Inventory 入库主从 → 库存批次；清单更正读已入类别使用同序公开能力，已确认类别批准量不可改 |
| 盘点完成 | 盘点单 → 明细 → Product 历史父身份共享锁 → 库存批次（排序）；逐项重核库存快照，再写非零差额流水、明细调整状态、完成单据及审计 |
| 采购入库／复检／更正／退供应商 | 采购根 → Product 用途资格与父身份锁（需要时）→ 到货明细（排序）→ 当前轮／分配及检验依据（排序）→ 入库主从 → 库存批次（排序）。复核持久状态跨越人工过程，数据库锁只存在于短事务；库存公开能力不再反锁采购根 |

Inventory 只直接锁自有表，不在公开命令内读锁生产来源或反向调用调用者。Product 身份锁通过其公开能力取得，Product 停用／启用只锁自身主数据。按需求下单统一采用 Production 工单／任务／需求 → 采购根 → Product；先无锁定位草稿来源，再锁来源与采购根并重核引用，变化则并发失败，不在持有采购根后补锁新的生产来源。不能同时保留“Product → 采购根”的提交路径和“采购根 → Product”的到货路径，也不能在持有库存锁后回调 Production。

### 父身份外键锁与循环审查

`inventory_transaction` 外键引用 `materials`，余额触发器写入 `inventory_material_variant_balance` 时还引用 `material_variants`，因此写流水会隐式获取 Product 父行共享锁。退料／盘点若先占库存批次，再等待被采购资格查询占用的 Product 父行，同时采购又等待同一库存批次，会形成环。

Product 提供 `lockHistoricalReferences({references})`，在相同事务内按其统一顺序锁成品或物料及精确版本身份；这是共享锁及引用存在性校验，不过滤停用、软删除，不授予新采购或领料资格。Inventory 的所有物料批次锁入口统一先调用它再锁批次；无锁定位后在批次锁内重新核对 ID，引用变化时失败，不能追加逆序父锁。成品创建明细／批次／流水同样先取得 `products` 历史身份共享锁，已批准产出不因此新增主数据启用门禁。

Product 用途资格与历史引用锁必须使用相同内部父行顺序；同批命令先收集全部物料／版本 ID、统一排序一次锁定，不能逐明细重复“Product → 库存 → 下一个 Product”。批次余额和版本余额触发器属于库存内部锁，跨版本流水也按稳定精确版本／批次次序执行以降低死锁，数据库死锁仍按已登记幂等命令重试规则整体重试。

`mysql-production-output.read.ts` 通过 `InventoryInboundCommand.readFinishedReceipts` 读取已确认入库；带锁读取属于清单更正资格判断，不是展示。只有取得工单／任务／结案根的调用链才能调用 Inventory 带锁版本；先锁入库再回取结案根的实现禁止。普通详情用非锁查询，不能从非锁结果推导写入资格。

`withTransaction` 的当前连接必须贯穿公开调用；只读 adapter 若可能参与命令使用 `withActiveConnection`，不能错误地固定调用 `pool.query` 逃离外层事务。跨模块端口不接受 `PoolConnection`、Executor 或 SQL 片段。

## 8. 必须保留的生产语义

- 需求与履约由 Production 管理：采购不扣需求，分配不写库存，确认领料才履约并扣库存。退料回原批次公共可用库存，不恢复旧需求或开工授权；领后损耗不再扣仓库库存。
- 物料按基础物料、精确版本、库存批次及库存状态定位，成品使用独立 product_id。版本停用与批次冻结是不同门禁，采购和生产领料分别校验用途。
- 盘点仅处理已有正库存物料批次及库存状态，不创建空中批次、不扩展成品或生产预留保护；库存快照变化须重盘。
- 成品按 self_made/production_extra 每类收齐一次确认。来源清单在审冻结、整类批准量及有效单唯一约束继续适用，采购分次规则不能套用。
- 历史业务明细、取消原因、批次来源、批准版本和流水正负保留；历史身份不因停用或软删除消失，累计入库／领料不从当前余额反推。

当前字段与库存规则见 [Inventory 数据库](../apps/api/src/modules/inventory/docs/database.md)，生产来源门禁见 [Production 数据库](../apps/api/src/modules/production/docs/database/README.md)。

## 9. 维护与验证边界

端口及所有权变更同步模块 owner、调用方和实际登记脚本；具体字段和方法只维护在 owner，公共事务与锁序维护在本文。库存、盘点和成品入库继续使用既有 HTTP／权限；旧无采购来源的外购写入口关闭，查询历史保留，不因模块归属改名而改接口。

交付及正式测试顺序见 [AGENTS.md](../AGENTS.md#数据库与交付约定)，待验收见[路线图](roadmap.md)。关键业务验证覆盖分配、领料、补料放行、退料、盘点、成品入库和采购闭环；构建及启动不表示完整业务测试通过。
