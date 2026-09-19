# Inventory 提取：所有权、公开能力与原子事务

本文明确 Inventory 的所有权、公开能力与事务边界，承接 [ADR-0013](adr/0013-procurement-source-and-stock-boundaries.md) 和[采购业务设计](procurement-inbound-design.md)。现有库存能力已提取到 [Inventory](../apps/api/src/modules/inventory/README.md)，采购、到货与检验通过公开端口接入。下节保留真实提取前基线供字段和约束核对；当前调用与来源关系见[采购技术设计](procurement-inbound-technical-design.md)。

本项目目前处于开发阶段，数据库结构可能随时调整，允许在任何时候完全重置数据库数据（清空或重建），无需保留兼容性数据。结构变化仅追加 migration，重置后由现有 migration／seed 恢复；不双写、不建影子表。

## 1. 提取前的代码与 migration 基线

| 证据 | 提取前实现及必须保留的约束 |
| --- | --- |
| `scripts/api-data-ownership.mjs` | 本文涉及的八张现行库存表及一张历史余额投影全部登记在 Production；现有模块没有独立 Inventory |
| `202608110002-production-material-allocation-and-outbound` | 建立 `item_batch`、`inventory_transaction` 与生产分配／出库链，库存批次不是生产任务 |
| `202608120001-production-purchase-inbound` | 建立 `inbound_order/detail`，`inbound_detail.batch_id` 引用真实 `item_batch.id` |
| `202608130002-inventory-transaction-immutability` | 数据库触发器禁止更新／删除库存流水；专用测试库清理例外不授予业务修改能力 |
| `202608250002-inventory-balances-and-demand-fulfillment`、`202609040002-production-material-variant-demand` | 余额投影与精确版本身份已存在，流水触发器同事务维护余额 |
| `202609070001-split-product-material-and-routes`、`202609080002-current-material-display-names` | `item_id` 指向基础物料；名称快照已删除，当前名称从 Product 按稳定 ID 读取 |
| `202609170002-finished-goods-inbound` | 同一批次／明细／流水／批次余额加入独立 `product_id` 成品分支；成品批准类别全量一次确认，不能只按旧外购结构提取 |
| `production/infrastructure/mysql-production-inbound.repository.ts` | 旧外购草稿先按手填批号创建／复用批次；确认才写正流水。没有采购、到货和检验引用 |
| `production/infrastructure/mysql-production-finished-inbound.repository.ts` | Production 锁来源清单后直接写入库主从表、批次及流水；来源资格必须仍由 Production 承担 |
| `production/infrastructure/mysql-production-material-outbound.repository.ts`、`mysql-production-return.repository.ts`、`mysql-production-stock-check.repository.ts` | 出库、退料、盘点分别直接写流水；提取要覆盖全部入口，不能保留第二写入所有者 |
| `packages/database/src/index.ts` | `withTransaction` 在同一 pool 的嵌套调用中复用 AsyncLocalStorage 中的连接；`withActiveConnection` 复用同一事务读取。无需创建新事务框架或向 application 传连接 |

`item_batch.batch_code` 已是内部批号，`inbound_detail.batch_id → item_batch.id` 已是历史入库关联。`202609170002` 虽将 `batch_id` 列改为可空，但 `chk_inbound_detail_identity` 的物料分支仍要求 `batch_id IS NOT NULL`。新到货表可以独立保存可空 `batch_id`；采购确认直接生成已完成入库单，物料入库明细落库时已有批次，因此无需为未采用的采购入库草稿放宽这个 CHECK。若以后新增草稿，必须另行追加相应约束迁移，不能只凭列可空宣称支持。

## 2. 提取后的唯一表所有者

| 对象 | 当前所有者 | 责任 |
| --- | --- | --- |
| `item_batch` | Inventory | 物料／成品批次身份、原 `batch_code`、状态、来源引用 |
| `inventory_transaction` | Inventory | 唯一库存事实、幂等键及来源明细；只追加 |
| `inventory_batch_balance` | Inventory | 流水触发器维护、可重建的批次／状态余额 |
| `inventory_material_variant_balance` | Inventory | 流水触发器维护、可重建的物料精确版本余额 |
| `inbound_order`、`inbound_detail` | Inventory | 外购和成品整表所有，不按 `source_type` 将同表写权拆给多个模块 |
| `stock_check_order`、`stock_check_detail` | Inventory | 现有物料库存批次盘点、库存快照复核和差异流水 |
| `inventory_item_balance`（历史已删除） | Inventory，仅历史登记 | 只为不可修改的历史 migration 与访问边界保留名称；不恢复该投影 |
| `production_item_allocation`、`outbound_order/detail`、`return_order/detail`、`item_scrap` | Production | 预留、领料履约、可退／损耗额度与对应业务单据；调用 Inventory 写库存 |
| `production_output_inspection/revision`、结案表、工单／任务／需求及补料 | Production | 生产规则、线下结案质检与批准产出；不迁入新 Quality |

模块提取本身不改 schema，也不复制表或回填数据。采购来源 FK、供应商、到货与质检结构由独立追加 migration 实现。物理外键可以跨所有者，应用写入只能由所属模块完成。

## 3. 公开端口与调用方向

公开入口为 `inventory/public.ts`，只导出 module、application 端口及协议无关类型。Inventory 不反调 Production、Procurement 或 Quality 进行资格决策。已校验业务来源的调用方负责开启／复用事务，Inventory adapter 用相同 `DATABASE_POOL` 加入事务；失败向外传播并整体回滚。

`InventoryStockCommand` 承担下列窄能力：

| 方法 | 输入／返回及责任 |
| --- | --- |
| `lockMaterialBatches(ids)` | 无锁定位历史物料／版本后，通过 Product `lockHistoricalReferences({references})` 先锁父身份，再按稳定数字 ID 顺序锁批次并复核身份，返回物料 ID、精确版本、批号、单位、批次状态及现有库存量；不能返回数据库行／连接类型 |
| `recordProductionOutbound(lines, context)` | 已由 Production 验证需求／分配／版本及数量的明细；Inventory 再核对批次身份、状态和总余额，追加 `production_material_outbound` 负流水，保留 `PMO:<order>:<detail>` 防重键 |
| `recordProductionReturn(lines, context)` | 已由 Production 验证可退额度的明细；复用原库存批次，追加 `material_return_inbound` 公共可用库存正流水，保留来源和 `RETURN:<detail>` 防重键 |

预留仍属于 Production。`lockMaterialBatches` 只返回账面数量，不自行减去生产预留；Production 在同一批次锁内合计有效分配的未出库占用并判断可分配量。端口不开放任意 transaction type、任意来源表或通用覆盖余额入口。

`InventoryInboundCommand` 拥有入库表写入及锁定能力：

| 方法组 | 调用者与责任 |
| --- | --- |
| `getFinishedLocator`／`getFinishedOrder`／`listFinishedSlots`／`readFinishedReceipts` | Production 通过不带数据库类型的结果定位任务、锁入库单、核对当前类别有效单据及累计实际入库；其中带锁读取必须由来源锁在先的事务调用 |
| `createFinishedDraft`／`updateFinishedDraft`／`cancelFinishedDraft` | Production 先校验批准来源及在审状态；Inventory 写主从表并校验单据版本／状态，保留取消事实与唯一类别约束 |
| `confirmFinishedReceipt` | Production 在当前来源锁内核对清单 ID 与整类批准量；Inventory 创建原成品批次、绑定明细、写 `production_inbound` 正流水并确认单据；不新增分次成品规则 |
| `confirmPurchaseReceipt` | Procurement 先锁到货／有效范围并经 Quality 核对依据，再由 Inventory 创建已完成采购入库主从记录、生成或复用库存批次及正流水；详见下节 |

旧外购入库提取期间维持现有 HTTP 读契约；采购切换时删除无采购来源的创建／确认能力。既有旧 pending 仅允许查询和取消，开发库也可直接重置。旧入口不能绕过新到货质检规则。

`InventoryInboundRepository` 提供现有库存批次、流水和入库历史查询，`InventoryStockCommand.materialBatchReferences` 提供历史批次展示身份。生产命令需要的身份、锁内余额与已入类别读取使用上述公开能力；展示联查按下一节登记。库存总列表若展示预留量，预留 SQL 只能在已登记只读目录读取 Production 分配／出库，不将其转成 Inventory 预留事实。公开失败使用稳定 `InventoryCommandError`，不导出内部领域错误或 SQL 异常。

盘点使用 `InventoryStockCheckRepository/Service` 独立用例；其业务实现整体迁入 Inventory，不通过 Production 代理写表。

## 4. 采购入库与固定批次契约

采购模块与 Inventory 约定：

```ts
interface ConfirmPurchaseReceiptInput {
  provider: string;
  remark?: string;
  details: Array<{
    receiptLineId: string;
    receiptRevisionId: string;
    inspectionId: string;
    scopeId: string;
    itemId: string;
    materialVariantId: string;
    itemCode: string;
    materialVariantCode: string;
    unit: string;
    quantity: number;
    batchId: string | null;
  }>;
}

interface ConfirmPurchaseReceiptResult {
  inboundId: string;
  inboundNo: string;
  details: Array<{
    receiptLineId: string;
    scopeId: string;
    batchId: string;
    inboundDetailId: string;
    transactionId: string;
  }>;
}
```

实际端口为 `confirmPurchaseReceipt(input, context)`。端口不接受客户端提供的“已合格”布尔值；参数由 Procurement 锁内读取的真实到货身份、当前实收修订和 Quality 公开校验结果形成。HTTP DTO 只接收所选来源 ID、版本／依据和本次数量，不能直接提供上述可信快照。

1. Procurement 按稳定顺序锁采购根、到货明细及当前处置范围，检查显式复核状态、质检结论、未入未退余量和 Product 当前采购入库资格。采购关闭不影响已有到货合法入库。
2. Inventory 在调用事务内生成入库单号。`batchId=null` 时创建唯一 `item_batch` 并自动写原 `batch_code`；非空时核对已有批次的物料／精确版本／来源和业务状态。编号使用固定前缀、北京时间日期及随机唯一段，数据库原唯一键为最终防重边界。
3. 同一次多个 scope 引用同一 `receiptLineId` 时，Inventory 在调用内维护 `receiptLineId → batchId` 映射，只创建一次批次；不同到货不按供应商批号合并。
4. 每条入库明细对应一个 scope，保存到货明细、实收修订、检验与 scope 外键，原 `batch_id` 继续引用真实库存批次；每条明细仅产生一笔本次 `purchase_inbound` 正流水。
5. Procurement 接收返回值后在同一事务将 `procurement_receipt_line.batch_id` 从空原子绑定，后续保持不变。当前可入额度由已完成入库明细／正流水的累计量消耗，不能读取当前库存余额替代累计已入量。
6. 采购成功审计、入库事实、流水、批次绑定和 HTTP 幂等响应同事务提交，任一步失败全部回滚。内部调用不再另开 HTTP 请求或使用提交后通知。

采购追加 migration 将旧入库明细的同单／物料／批次唯一约束改为适合“一个明细一个采购 scope”的唯一键，保留成品类别唯一键；不另建内部批号列、库存批次表或入库影子表。供应商来料批号只保存在采购到货追溯字段。

## 5. 现有文件的迁移与适配清单

| 现有文件／职责 | 提取方案 |
| --- | --- |
| `mysql-production-inbound.repository.ts` | 库存查询、入库主从 CRUD、批次与流水迁入 Inventory adapter；旧 Production 入库应用／协议层按公开能力调用。采购接通后旧手工写路径删除 |
| `mysql-production-stock-check.repository.ts`、对应 port/service/controller/DTO | 整体迁入 Inventory，保留原盘点 HTTP 路径、权限、状态与幂等语义 |
| `mysql-inventory-batch.query.ts` | 迁至 Inventory 的 `infrastructure/queries/`；物料名、成品工单名、预留及批准版本展示按明确字段登记 |
| `mysql-production-inventory.shared.ts` | 编号／分页等机械函数按实际所有者拆分；删除 Production 对 `item_batch` 的动态锁白名单。Production 审计仍写 `module=production`，Inventory 自有用例写 `module=inventory` |
| `mysql-production-material.repository.ts` | 分配先调用 Inventory 锁批次与读账面数量；Production 保留需求、分配占用和齐套判定。候选展示移至登记查询目录 |
| `mysql-production-material-outbound.repository.ts` | 保留出库单、需求扣减、短批授权、补料齐套和补产放行的完整事务；库存锁与写入改公开命令。移除跨表 `FOR UPDATE` 的库存 JOIN |
| `mysql-production-return.repository.ts` | 保留可退额度／损耗扣占及退料单；库存增量调用公开命令，来源库存展示单独查询，不能靠展示 JOIN 取得跨所有者锁 |
| `mysql-production-finished-inbound.repository.ts`、`mysql-production-finished-inbound.read.ts` | Production 保留来源清单、任务状态与资格；入库单写锁和写入全部改公开端口。展示部分放入 `queries/`，不将整份命令文件搬入豁免目录 |
| `mysql-production-output.read.ts` | `readOutputReceipts` 更正前置属于业务资格，改调用 `InventoryInboundCommand.readFinishedReceipts`；不能登记为展示读取后继续锁入库表 |
| `mysql-production-demand-correction.repository.ts`、`mysql-production-termination.repository.ts` | 拆开 Production 锁和库存显示 JOIN。更正／结案对分配、需求和已确认出库的判断仍属 Production；库存身份／批号通过公开能力或独立无锁展示查询取得 |
| `mysql-production-material-loss.repository.ts`、`mysql-production-closeout-loss.read.ts`、`mysql-production-material.mapper.ts` | 物料身份与批号展示移入批准查询；业务额度只读 Production 已确认出库、退料和损耗，不增加库存扣减 |
| `mysql-production-trace.repository.ts`、`mysql-production-supply-demand.repository.ts` | 含跨模块事实组合的纯读方法移入专用 `queries/`，登记最小字段；保留筛选先于分页、当前物料名称和历史来源解释 |
| `mysql-production-material-persistence.ts` | 动态锁仅保留 Production 自有表，库存批次锁由 Inventory 公开能力承担 |
| `production.module.ts`、`inventory.module.ts`、各 `public.ts` | 单向 `Production → Inventory`，Inventory 不 import Production module；根 API 只组合真实用例，不建空微服务 |

整数数量解析和格式化是纯数学能力，可迁到既有 `@company/utils` 后由两模块使用，不能让 Inventory 深层 import Production domain。领域错误由各自定义或公开稳定失败结果映射；不得将 Production HTTP filter 当作 Inventory domain 依赖。

## 6. 展示目录与字段白名单

只读登记更新在 `scripts/api-data-ownership.mjs`，与迁入的具体 SQL 同步。不得给整个 infrastructure 放开跨表读，也不得允许 `SELECT *`、写入或 `FOR UPDATE/SHARE`。每个业务命令使用库存资格时须走公开端口，目录位置不能将业务校验伪装成展示读取。

| 目录 | 目标表与批准字段范围 |
| --- | --- |
| `production/infrastructure/queries/` | `materials(id,material_name)`；`item_batch(id,item_id,material_variant_id,product_id,item_code_snapshot,material_variant_code_snapshot,unit_snapshot,batch_code,source_type,provider,batch_status,production_date,source_work_order_id,source_production_batch_id)` |
| 同上 | `inventory_transaction(id,item_id,material_variant_id,product_id,batch_id,transaction_type,quantity,unit_snapshot,stock_status,reference_type,reference_detail_id,created_at,remark)`；`inventory_batch_balance(batch_id,item_id,product_id,stock_status,current_quantity)`；`inventory_material_variant_balance(material_variant_id,material_id,stock_status,batch_status,current_quantity)` |
| 同上 | `inbound_order(id,inbound_no,source_type,work_order_id,production_batch_id,product_id,output_revision_id,provider,status,inbound_at,operator_id,created_by,created_at,version,remark,cancel_reason,cancelled_by,cancelled_at)`；`inbound_detail(id,inbound_id,item_id,material_variant_id,product_id,batch_id,requested_batch_code,item_code_snapshot,inbound_number,unit_snapshot,stock_status)`；采购新增来源字段仅在实际展示用到时追加 |
| `inventory/infrastructure/queries/` | `materials(id,material_name)`；`work_orders(id,work_order_no,product_name_snapshot)`；`production_batches(id,batch_no,work_order_id)`；`production_output_revision(id,revision_no)` |
| 同上 | `production_item_allocation(id,batch_id,item_id,material_variant_id,assigned_number,allocation_status)`；`outbound_detail(allocation_id,outbound_id,outbound_number)`；`outbound_order(id,status)`，仅计算展示用的已预留未出库量 |

Inventory 不借这些查询选择批准版本或改变生产单据；成品查询需要更多字段时，由 Production 组合公开 Inventory 结果或按实际显示用途增补字段登记，不能直接开放所有 Production 表。

## 7. 事务与锁序

提取前存在使用 `JOIN item_batch ... FOR UPDATE` 将显示行一起锁定的实现。当前所有者锁已分开，展示查询不能承担业务锁或资格判断。多个同类 ID 按数值稳定排序；先定位来源但不加锁，然后取得来源根锁，再重新读取并核对引用不变。

| 用例 | 锁／处理顺序与同事务结果 |
| --- | --- |
| 分配 | 生产任务 → Product 历史父身份共享锁 → Inventory 批次（排序）→ Production 需求／分配；账面可用量减有效预留后新增分配。保持同一任务命令以任务根锁串行化 |
| 确认生产出库 | 生产任务 → 出库单／工序／分配 → Product 精确版本用途门禁及父身份锁 → Inventory 批次（排序）→ 需求；需求履约、负流水、单据状态、短批授权、补料齐套／补产放行与审计一起提交 |
| 确认退料 | 生产任务 → 退料单／分配 → Product 历史父身份共享锁 → Inventory 批次（排序）；核对已确认领料与退料／损耗占用，单据与公共库存正流水一起提交 |
| 成品草稿／确认及清单更正 | 工单 → 生产任务 → 结案／当前批准清单 → Product 历史成品父身份共享锁 → Inventory 入库主从 → 库存批次；清单更正读已入类别使用同序公开能力，已确认类别批准量不可改 |
| 盘点完成 | 盘点单 → 明细 → Product 历史父身份共享锁 → 库存批次（排序）；逐项重核库存快照，再写非零差额流水、明细调整状态、完成单据及审计 |
| 采购入库／复检／更正／退供应商 | 采购根 → Product 用途资格与父身份锁（需要时）→ 到货明细（排序）→ scope／当前检验依据（排序）→ 入库主从 → 库存批次（排序）。复核持久状态跨越人工过程，数据库锁只存在于短事务；库存公开能力不再反锁采购根 |

Inventory 只直接锁自有表，不在公开命令内读锁生产来源或反向调用调用者。Product 身份锁通过其公开能力取得，Product 停用／启用只锁自身主数据。按需求下单统一采用 Production 工单／任务／需求 → 采购根 → Product；先无锁定位草稿来源，再锁来源与采购根并重核引用，变化则并发失败，不在持有采购根后补锁新的生产来源。不能同时保留“Product → 采购根”的提交路径和“采购根 → Product”的到货路径，也不能在持有库存锁后回调 Production。

### 父身份外键锁与循环审查

`inventory_transaction` 外键引用 `materials`，余额触发器写入 `inventory_material_variant_balance` 时还引用 `material_variants`，因此写流水会隐式获取 Product 父行共享锁。退料／盘点若先占库存批次，再等待被采购资格查询占用的 Product 父行，同时采购又等待同一库存批次，会形成环。

Product 提供 `lockHistoricalReferences({references})`，在相同事务内按其统一顺序锁成品或物料及精确版本身份；这是共享锁及引用存在性校验，不过滤停用、软删除，不授予新采购或领料资格。Inventory 的所有物料批次锁入口统一先调用它再锁批次；无锁定位后在批次锁内重新核对 ID，引用变化时失败，不能追加逆序父锁。成品创建明细／批次／流水同样先取得 `products` 历史身份共享锁，已批准产出不因此新增主数据启用门禁。

Product 用途资格与历史引用锁必须使用相同内部父行顺序；同批命令先收集全部物料／版本 ID、统一排序一次锁定，不能逐明细重复“Product → 库存 → 下一个 Product”。批次余额和版本余额触发器属于库存内部锁，跨版本流水也按稳定精确版本／批次次序执行以降低死锁，数据库死锁仍按已登记幂等命令重试规则整体重试。

现有 `mysql-production-output.read.ts` 的 `readOutputReceipts(..., lock=true)` 用 `FOR SHARE` 读取已确认入库，属于清单更正资格判断，不是展示。替换后只有取得工单／任务／结案根的调用链才能调用 Inventory 带锁版本；先锁入库再回取结案根的实现禁止。普通详情用非锁查询，不能从非锁结果推导写入资格。

`withTransaction` 的当前连接必须贯穿公开调用；只读 adapter 若可能参与命令使用 `withActiveConnection`，不能错误地固定调用 `pool.query` 逃离外层事务。跨模块端口不接受 `PoolConnection`、Executor 或 SQL 片段。

## 8. 必须保留的生产语义

- 需求只以 `production_item_demand` 为事实，采购不扣需求，分配不写库存，确认领料才扣需求和库存。退料不恢复需求、不释放已履约分配、不改变开工或短批授权。
- 物料库存以基础物料＋精确版本＋库存批次＋库存状态定位，成品用独立 `product_id`。版本停用不等于批次冻结；采购用途允许停用版本，生产确认领料必须拒绝停用版本，原生产选版规则不放宽。
- 现有盘点只覆盖有正库存的物料 `item_batch × stock_status`，不扩展成品、凭空生成批次或生产预留保护规则。库存变化导致快照失效时拒绝完成并重新盘点。
- 成品仍是 `self_made/production_extra` 各类别收齐后一次确认。当前清单更正、在审冻结、整类数量和有效单唯一键继续生效；采购分次规则不套用于成品。
- 生产领后损耗不再扣仓库库存；结案不补料损坏只占可退额度。普通退料固定回原批次、公共 available。
- 流水正负历史、原业务明细、取消原因、批次来源与批准版本继续可追溯；历史物料展示不因停用或软删除消失。
- 余额是触发器维护的可重建投影。提取不借机完成余额查询性能改造，也不以当前余额替代历史累计入库或累计领料。

## 9. 实施与验证边界

代码迁移完成时同步 Inventory README／数据库所有者文档、Production 相关章节、架构、范围、API 装配与数据所有权登记；保留已有仓库 HTTP 路径和页面路由，除采购新流程明确替换的旧外购请求外，不为模块改名额外改接口。

后续修改仍须完成受影响包类型检查、构建和 API／管理端启动，回归分配、领料、补料放行、退料、盘点、成品入库及采购闭环的可访问入口。正式测试集在用户黑盒与 UI 确认并明确通知后编写，届时由 Luna MAX 子代理全量验证；本阶段不新增／重写正式测试集，也不将构建和启动宣称为完整业务测试通过。
