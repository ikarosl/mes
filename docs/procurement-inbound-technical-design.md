# 采购到入库技术设计

本文落实 [ADR-0013](adr/0013-procurement-source-and-stock-boundaries.md) 与[业务设计](procurement-inbound-design.md)，维护采购闭环的跨模块结构与事务规则。当前供应商、采购、到货、窄 Quality 和检验后入库均已接入；准确文件及契约由 [Procurement](../apps/api/src/modules/procurement/README.md)、[Quality](../apps/api/src/modules/quality/README.md) 和 [Inventory](../apps/api/src/modules/inventory/README.md) 就近维护。用户黑盒、UI 与正式测试安排见[路线图](roadmap.md)。不重新开放已收口的业务选择。

本项目目前处于开发阶段，数据库结构可能随时调整，允许在任何时候完全重置数据库数据（清空或重建），无需保留兼容性数据。数据库变更只追加成对 migration，不修改已执行文件，不建立兼容双写、影子表或另一套库存账本。正式测试集待用户黑盒和 UI 验收通过并明确通知后编写；本阶段完成类型检查、构建与启动验证。

## 1. 实施前基线与现有结构

| 核对对象 | 实施前核对基线 | 当前结构与约束 |
| --- | --- | --- |
| `202608120001-production-purchase-inbound` 与实施前外购 Repository | 手工 `batchCode`；创建 pending 入库时按物料版本和批号创建／复用 `item_batch`；确认直接写正流水 | 全部外购来自采购到货及有效质检范围；首次实际确认入库才自动建批 |
| `202609040002`、`202609070001` | 物料精确版本及基础物料外键已经存在；物料 ID 指向 `materials` | 保留精确身份，不将新采购行或供应商批号当成库存身份 |
| `202609080002-current-material-display-names` | 已删除入库明细等处的物料名称快照 | 新采购／到货不保存物料名称快照；历史按稳定 ID 读取当前名称 |
| `202609170002-finished-goods-inbound` | `inbound_detail.batch_id` 物理可空，但 `chk_inbound_detail_identity` 的物料分支仍要求非空；成品草稿有独立 `requested_batch_code` | 新外购核对仅保存前端本地状态，确认直接生成 completed 单据；因此无需放宽物料分支 CHECK。成品 pending 及一次全量确认规则保留 |
| 已有批次与实际入库链 | `inbound_detail.batch_id → item_batch.id`，内部批号为 `item_batch.batch_code` | 新到货明细保存可空 `batch_id`；首次确认原子绑定，后续复用，不增加另一内部批号字段 |
| `Production.public.ts` | 仅导出模块，没有采购需求资格能力 | 增加事务内采购需求资格、候选及历史解析能力 |
| `mysql-production-supply-demand.repository.ts` | 需求下钻只按 `business_status='active'`，没有完整任务状态和在审更正过滤 | 单独实现采购资格，不能把当前供需查询当作已存在的采购接口 |
| Product `listEnabledByMaterials` | 只返回启用且未删除版本、启用基础物料和分类 | 增加采购用途资格；不放宽现有生产选版接口 |
| 实施前确认领料 | 锁出库、分配、库存批次及需求，尚无精确版本停用门禁 | 在生产分配候选、可领齐套量和确认领料中统一排除停用版本；既有库存事实保留 |
| 库存所有权 | `scripts/api-data-ownership.mjs` 中库存及入库／盘点表仍属于 Production | 整表切换到 Inventory；Production 保留分配、领料、生产退料、需求及结案产出 |

左栏基线用于解释必须保留的既有字段和事实，不表示当前代码仍处于旧手工外购或 Production 库存所有权状态。当前库存已由 Inventory 独占，Product 已提供分用途资格，Production 已提供采购需求公开能力；采购及检验 schema 由 §9 的追加 migration 建立。

## 2. 所有权和调用方向

| 所有者 | 表／事实 | 可公开的能力 |
| --- | --- | --- |
| Production | 需求、分配、领料单及履约、生产退料、生产损耗、工单任务、结案质检与批准产出 | 采购需求资格与历史；编排生产库存消费及成品入库 |
| Procurement | 供应商、采购单与来源映射、采购关闭事实、到货与实收修订、入库前实物处置范围、实际退供应商 | 采购场景编排、物流待办、来源追溯 |
| Quality | 外购初检／复核办理及不可变检验结论 | 对已核验到货范围开展检验，校验有效放行依据；不接管 `production_output_inspection` |
| Inventory | `item_batch`、`inventory_transaction`、现有两张余额投影、`inbound_order/detail` 整表、`stock_check_order/detail` | 唯一库存写入与批次资格、入库事实、账面库存及盘点 |
| 平台 | `operation_logs`、`http_idempotency_records` | 现有事务审计和 HTTP 幂等闭环 |

依赖方向为 `Procurement → Production / Product / Quality / Inventory`、`Production → Product / Inventory`。所有跨模块 import 只经 `public.ts`。Quality 不反向查询 Procurement，也不取得仓管确认权限；Inventory 不判定生产或采购业务资格。Procurement 的处置范围表达未入库实物的检验和办理依据，**不维护库存余额，也不把范围状态当成实际入库量的事实来源**。

命令通过原有同池事务上下文协作，application port 不出现 MySQL 连接类型。展示联查仅在登记后的 `infrastructure/queries/` 目录执行；Procurement 可批准只读 Production 的需求／任务／工单来源字段、Product 当前名称、Quality 检验历史和 Inventory 入库来源／批次展示字段，逐字段登记。命令资格不使用此授权，仍调用所有者公开能力。其他模块不能直接写 Procurement 范围或 Inventory 表。

## 3. 物理类型与公共列

所有新业务表采用 InnoDB、`utf8mb4_0900_ai_ci`；ID 与外键为 `BIGINT UNSIGNED`，单表主键 `id` 自增，时间为 `DATETIME` 北京时间。下文 `ID`、`QTY`、`CODE` 分别展开为 `BIGINT UNSIGNED`、`INT`、`VARCHAR(30)`；未标 `NULL` 的列均 `NOT NULL`，没有声明默认值的列必须显式提供。`QTY` 均具有数量范围 CHECK；正数范围为 `1..99999999`，累计／结果拆分允许零；跨行汇总也校验存储范围，禁止舍入。

公共列组须实际展开到 DDL，不是表继承：

- **事实 F**：`created_by ID` 外键 `users(id)`；`created_at DATETIME DEFAULT CURRENT_TIMESTAMP`。事实无通用编辑或删除入口。
- **可变 M**：F 加 `updated_by ID`、`updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`、`version INT DEFAULT 0 CHECK(version>=0)`；操作者外键 `users(id)`。命令按 `id+version` 更新。
- **主数据 S**：M 加 `is_deleted TINYINT DEFAULT 0 CHECK(is_deleted IN(0,1))`、`deleted_by ID NULL`、`deleted_at DATETIME NULL`；删除人外键 `users(id)`，删除信息完整性 CHECK。供应商一期只开放名称维护，不需要增加启停、联系人或附件字段。
- **关联 R**：指定复合主键，加 `created_at DATETIME DEFAULT CURRENT_TIMESTAMP`；操作人由同事务成功审计追溯。

所有封闭 CODE 与布尔均有 CHECK，并同时在 constants 定义标签、contracts 定义字符串联合。FK 不使用级联删除／更新。数据库 CHECK 不负责跨行守恒、状态转换或外部事实校验，后者在锁内执行。

### 3.1 采购与供应商表（Procurement）

| 表 | 公共组及全部业务列 | 键和约束 |
| --- | --- | --- |
| `procurement_supplier` | S；`id`、`supplier_name VARCHAR(100)` | PK id；UK supplier_name（trim 后保存，数据库排序规则去重，软删除不复用）；名称非空 CHECK；索引 `(is_deleted,supplier_name,id)`；长度与既有入库及批次provider一致 |
| `purchase_order` | M；`id`、`purchase_no VARCHAR(100)`、`supplier_id ID`、`source_type CODE`、`supplement_reason CODE NULL`、`status CODE DEFAULT 'draft'`、`remark TEXT NULL`、`ordered_by ID NULL`、`ordered_at DATETIME NULL` | UK purchase_no；FK supplier；操作者 FK users；CHECK source=`demand/stock`，reason=`excess_purchase/quality_replacement` 或 NULL，status=`draft/ordered/completed/cancelled`；正式下单信息成对存在；索引 `(status,created_at,id)`、`(supplier_id,created_at,id)` |
| `purchase_order_line` | M；`id`、`purchase_order_id ID`、`line_no INT`、`item_id ID`、`material_variant_id ID`、`item_code_snapshot VARCHAR(100)`、`material_variant_code_snapshot VARCHAR(180)`、`unit_snapshot VARCHAR(20)`、`planned_quantity QTY`、`status CODE DEFAULT 'draft'`、`origin_order_line_id ID NULL`、`origin_receipt_line_id ID NULL`、`origin_supplier_return_id ID NULL`、`supplement_evidence TEXT NULL` | FK 主单、基础物料、`(material_variant_id,item_id)→material_variants(id,material_id)`；原记录分别 FK，匹配关系事务校验；UK `(purchase_order_id,line_no)`、`(purchase_order_id,item_id,material_variant_id)`、`(id,purchase_order_id)`、`(id,item_id,material_variant_id)`；计划正整数，行号>0；状态 `draft/open/closed/cancelled`；索引 `(origin_order_line_id,id)` |
| `purchase_order_line_source` | R；`purchase_order_line_id ID`、`demand_id ID` | PK `(purchase_order_line_id,demand_id)`；两个 FK；索引 `(demand_id,purchase_order_line_id)`；无分摊量、无需求数组、无冗余主单 ID |
| `purchase_order_line_closure` | F；`id`、`purchase_order_line_id ID`、`reason_type CODE`、`reason TEXT NULL`、`planned_quantity QTY`、`received_quantity QTY`、`undetermined_quantity QTY`、`approved_quantity QTY`、`inbound_quantity QTY`、`return_due_quantity QTY`、`returned_quantity QTY`、`quality_returned_quantity QTY`、`evidence_json JSON` | UK 行 ID（一期不重开，单次关闭事实）；FK 行；reason=`quality_target/quality_return_completed/manual_end/cancelled`；所有数量非负整数，plan>0；人工结束和取消原因必填；evidence 保存当时修订、有效范围、检验及实际交接 ID 的不可变证据快照，不能当作操作关系表 |

普通按需行至少一个来源；普通备料行没有来源。草稿整体替换明细允许删除从未生效的草稿关联；下单后全部身份、供应商、来源映射和计划量冻结。相同物料精确版本合并一行，不保存来源采购量。一次补单使用一种原因；按需和备料不混单。补单每个行一个原采购行及对应异常依据，避免一期引入跨异常来源的另一层合并结构。

不合格补货必须引用同供应商、同物料精确版本的已实际确认 `quality` 退回记录，并保存原行及原到货；采购终止退回不能使用。超量补单必须有原采购行及现场来货依据文字，原到货明细在存在时引用；额外实物尚未登记是合法情况，不能强迫先在原单虚记到货以取得 ID。复制原行来源映射用于追溯，不重新检查旧需求是否仍可采购，不重开旧需求。补单仍检查 Product 采购资格和供应商有效性，不限制累计补单量／次数。

### 3.2 到货、实收修订与范围（Procurement）

到货页面可以保留本地核对草稿；确认命令直接产生正式到货事实，不另建服务端可修改的到货草稿单。

| 表 | 公共组及全部业务列 | 键和约束 |
| --- | --- | --- |
| `procurement_receipt` | F；`id`、`receipt_no VARCHAR(100)`、`purchase_order_id ID`、`received_at DATETIME`、`handover_evidence TEXT`、`remark TEXT NULL` | UK receipt_no、`(id,purchase_order_id)`；FK 采购；交接依据非空；索引 `(purchase_order_id,received_at,id)` |
| `procurement_receipt_line` | M；`id`、`receipt_id ID`、`purchase_order_id ID`、`purchase_order_line_id ID`、`line_no INT`、`item_id ID`、`material_variant_id ID`、`supplier_batch_code VARCHAR(100) NULL`、`current_receipt_revision_id ID NULL`、`batch_id ID NULL`、`over_receipt_note TEXT NULL` | UK `(receipt_id,line_no)`、`(id,item_id,material_variant_id)`、`(id,purchase_order_line_id)`、`batch_id`（NULL 可多条）；组合 FK 主单归属、采购行归属／身份、库存 `(batch_id,item_id,material_variant_id)`；当前修订组合 FK `(current_receipt_revision_id,id)→revision(id,receipt_line_id)`；索引 `(purchase_order_line_id,id)` |
| `procurement_receipt_revision` | F；`id`、`receipt_line_id ID`、`revision_no INT`、`previous_revision_id ID NULL`、`received_quantity QTY`、`reason TEXT`、`physical_identity_confirmed TINYINT` | FK 到货行；UK `(receipt_line_id,revision_no)`、`(id,receipt_line_id)`；前版组合 FK 同一行；quantity>=0、revision_no>0、identity_confirmed=1；首版数量>0及无前版由确认事务保证；更正允许零 |
| `procurement_receipt_scope` | M；`id`、`receipt_line_id ID`、`receipt_revision_id ID`、`parent_scope_id ID NULL`、`quantity QTY`、`disposition CODE`、`transition_type CODE`、`inspection_id ID NULL`、`review_case_id ID NULL`、`termination_root_scope_id ID NULL`、`termination_reason TEXT NULL` | UK `(id,receipt_line_id)`；FK 行；修订、父范围、终止根均组合 FK 同一行；检验与复核组合 FK 同一行；quantity>0；disposition=`uninspected/reviewing/approved/quality_return/termination_return/inbounded/returned/superseded`；transition=`receipt/split/inspection/review/receipt_correction/termination/inbound/return`；索引 `(receipt_line_id,disposition,id)`、`(review_case_id,id)`、`(inspection_id,id)` |
| `procurement_supplier_return` | F；`id`、`return_no VARCHAR(100)`、`receipt_line_id ID`、`receipt_revision_id ID`、`scope_id ID`、`inspection_id ID NULL`、`reason_type CODE`、`returned_quantity QTY`、`returned_at DATETIME`、`handover_evidence TEXT`、`remark TEXT NULL` | UK return_no、scope_id；FK 同到货行的修订／范围／检验；reason=`quality/procurement_termination`；quantity>0、凭据非空；质量原因必须有 inspection；索引 `(receipt_line_id,returned_at,id)` |

建表循环引用在全部表创建后用 `ALTER TABLE ADD CONSTRAINT` 补齐。到货确认先插稳定行、再插首版修订、再原子设置当前指针；`current_receipt_revision_id` 物理允许 NULL 仅为同事务创建，不允许提交后存在未初始化行。`batch_id` 仅从 NULL 绑定一次，不可改绑、清除或复制 `batch_code`。同一供应商批号的不同到货仍是不同来源／批次。当前名称通过采购行物料 ID 联查，不因主数据停用或删除过滤历史。

### 3.3 检验办理与结论（Quality）

| 表 | 公共组及全部业务列 | 键和约束 |
| --- | --- | --- |
| `quality_inbound_case` | M；`id`、`receipt_line_id ID`、`receipt_revision_id ID`、`source_scope_id ID NULL`、`target_scope_id ID NULL`、`case_type CODE`、`status CODE DEFAULT 'reviewing'`、`covered_quantity QTY`、`reason TEXT`、`completed_by ID NULL`、`completed_at DATETIME NULL`、`superseded_by_receipt_revision_id ID NULL` | FK 同到货行的修订／来源范围／目标范围；UK `(id,receipt_line_id)`、target_scope_id；type=`initial/reinspection/inspection_correction/receipt_correction`；status=`reviewing/completed/superseded`；quantity>=0；只有 receipt_correction 可为零且 target_scope_id=NULL；非零必须有目标范围；source_scope_id 仅实收少录后新增余量复核可空；完成／被更正替代的元数据与状态 CHECK；索引 `(status,created_at,id)`、`(receipt_line_id,id)` |
| `quality_inbound_inspection` | F；`id`、`case_id ID`、`receipt_line_id ID`、`receipt_revision_id ID`、`covered_quantity QTY`、`inspection_method CODE`、`qualified_quantity QTY NULL`、`unqualified_quantity QTY NULL`、`sample_quantity QTY NULL`、`sample_unqualified_quantity QTY NULL`、`removed_defect_quantity QTY`、`inbound_approved TINYINT`、`disposition CODE`、`approved_quantity QTY`、`quality_return_quantity QTY`、`undetermined_quantity QTY`、`remark TEXT`、`evidence TEXT` | UK case_id、`(id,receipt_line_id)`；FK case及同到货修订；method=`full/sampling/review_only`，disposition=`release/await_full_inspection/await_decision/return_all/receipt_zero_confirmed`；拆分非负整数且和=covered_quantity；布尔0/1；索引 `(receipt_line_id,created_at,id)` |

结论 CHECK：full 必有合格／不合格且和=覆盖量，样本列为空；sampling 必有 `1<=sample<=covered`、`0<=sample_unqualified<=sample`，全检两列为空；`review_only` 仅零数量实收修订核实，无样本、无放行。非批准时 approved_quantity=0；release 必显式批准且 `approved_quantity=covered_quantity-removed_defect_quantity`、`quality_return_quantity=removed_defect_quantity`、undetermined=0；全检放行的剔除数等于实检不合格数，抽检放行不得少于已确认需剔除的样本不良。return_all 的判退量=覆盖量；转全检／待决定不批准，不把 false 自动转成质量退回。可记录已经明确剔除的不良为判退范围，其余保留未判定。

无固定抽样档位、无破坏性取样损耗字段；本期手工样本记录不声称采用了不存在的规则版本。未来接配置时追加规则参数快照。检验说明与凭据为业务文本引用，不新增文件存储系统。是否重新实物检验由质检判断，非零范围的复核仍保存真实方法、数量及结论。

### 3.4 实际入库来源（Inventory）

在原 `inbound_detail` 追加可空 `procurement_receipt_line_id`、`procurement_receipt_revision_id`、`procurement_scope_id`、`procurement_inspection_id`，均为 ID。新增组合 FK 保证修订／范围／检验属于同一到货；范围和入库明细的物料、数量、批次一致性由锁内公开命令校验。新增 `UNIQUE(procurement_scope_id)`：确认时分次入库先拆出本次恰好消费的范围，因此一个消费叶子只能形成一笔实际入库明细。新增 `(procurement_receipt_line_id,id)`、`(procurement_inspection_id,id)` 查询索引。

删除旧 `uk_inbound_detail_order_batch_item(inbound_id,batch_id,item_id)`，以采购消费范围唯一约束替代物料分支，允许同一入库单同批次的多个质量范围各留明细；保留成品 `(inbound_id,product_id)` 唯一约束和成品身份 CHECK。四个新引用要么全部有值，要么全部为空；采购命令必须全部有值，成品全部为空。开发切换要求旧无来源外购单据为空，不能给旧单伪造来源；旧直入 create/confirm 路由同时移除或明确拒绝，历史只读入口保留。

新外购确认直接生成 completed 入库，批次当场创建后写入明细，原物料 `batch_id IS NOT NULL` CHECK 无需放宽。`inventory_transaction` 继续 `reference_type='inbound_detail'`、`reference_detail_id` 引用原明细，以既有唯一键／幂等键防重复流水；不增加另一种采购库存账本。

## 4. 范围树与不可覆盖的处置事实

范围是同一到货内可单独说明依据的一组同质实物数量，不是每件序列号。每个节点的数量、修订、身份和检验引用一经创建不覆盖。仅 disposition 按状态机单向推进并递增 version。无子节点的非 superseded 记录为当前叶子；所有拆分均锁到货行及被拆范围后执行，父节点改 superseded、子节点同时落地。除明确实收修订外，子量和必须等于父量；历史树始终可回溯。

1. 确认到货 A=100：首版修订和 uninspected 100 叶子，不写库存。
2. 开始检验／复检：选择当前非处置、非终止退回叶子的 `quantity<=余量`。若只选部分，拆出未影响余量及 reviewing 叶子；同事务创建明确 reviewing case。旧父范围随拆分失效，其他叶子仍可办理。
3. 检验完成：Quality 追加结论并完成 case；Procurement 将 reviewing 叶子替换成 approved／quality_return／uninspected 子叶，三者合计覆盖量。不修改父检验记录的批准数。
4. 分次入库：approved 90 入60，先拆为本次60与余30；Inventory确认60后同事务把60置 inbounded。以后复检30仅影响余30；原Q1支持的已入60和另一个判退10始终保留。
5. 实际退回：当前 quality_return／termination_return 叶子一次全部确认，产生唯一 supplier_return，再置 returned；本动作不拆为部分交接。质检合法复检先形成新的非重叠待退范围后，新范围各自仍一次退清，不能利用仓管确认接口自行拆退。
6. 指定采购终止退回：未入未退、非 reviewing 范围可按实际数量拆分成 termination_return；保存终止根及原因。已 quality_return 的部分不重复指定为终止退回，不改变实际质量结论。

当前叶子 `reviewing` 与 Quality case 的 `reviewing` 同事务建立和完成，是持续业务状态，不用版本差猜测；数据库行锁只持续一个短事务。已 inbounded／returned 节点不允许复检、更正、拆分或恢复办理。范围转移记录用于处置防重及追溯，`I` 必须从 Inventory 的确认入库事实得到，并与终态范围交叉核对；不以范围求和替代库存事实。

### 4.1 实收更正

`correct-receipt` 提交 `version`、`previousRevisionId`、`receivedQuantity`、非空原因、`physicalIdentityConfirmed=true`，以及 `adjustments:[{scopeId,scopeVersion,revisedQuantity}]`、`newRemainderQuantity`（默认0）。页面显示每个未处置范围及其新量，不能只改总量而不说明影响哪部分；用户确认这是同一原到货实物，不是新来货、损耗或身份替换。系统校验至少一项变化、各目标当前有效、终态范围不在 adjustments 内，并校验：

```text
新 A = 不受影响当前叶子量 + 全部调整后范围量 + newRemainderQuantity
新 A >= I + R
```

其中不受影响当前叶子包含已入／已退锁定份额。旧修订不改，追加新修订并切当前指针。受影响旧叶子 superseded，其新非零数量生成引用新修订的 reviewing 子叶和 receipt_correction case；更正降低至零时不建零量实物叶子，但保留 `covered_quantity=0,target_scope_id=NULL` 的复核 case，由质检显式核实并追加 `receipt_zero_confirmed` 结论。待复核零量 case 可见，不能靠“已经没有可入量”自动算完成。

`newRemainderQuantity>0` 只用于核实原实收少录的同批剩余实物，生成引用新修订、parent_scope_id=NULL 的 reviewing 根及 receipt_correction case（source_scope_id=NULL，target_scope_id为新根），不重新打开或修改终态范围。例如原 A=I+R=100，核实原实际到货为110，可保留全部100已处置事实并新增待复核10；不存在旧未处置叶子也能办理。该入口仍须明确核实最初接收事实，不能用来登记后来新来货、补发或更换物料，不能凭旧批准自动放行。

更正替换已经 reviewing 的范围时，旧 case 由 Quality 置 superseded 并引用本次修订，新 case 继续暂停；旧 case 不能再提交结果。没有在本次 adjustments 中的叶子保持原修订和检验依据合法，**不因明细 current_receipt_revision_id 改变而整体失效**。当前指针只表达最新总实收版本；确认依据按具体有效叶子的修订校验，新产生的更正叶子则必须引用新修订。

采购终止待退叶子的数量也可更正并由质检复核，但其 `termination_root_scope_id` 必须传递到新 reviewing 叶子，复核完成后的全部非零余量仍是 termination_return；质量批准不得恢复其入库资格。质检主动复检不能选择终止范围。终止中的零量核实保留终止和更正历史，不生成退回事实。

数学条件只是必要条件；负数、影响已处置身份／数量／依据、实际新来货或真实损耗均拒绝本入口。已关闭采购可以更正原到货，不自动重开、不新增到货资格，不改批次绑定。更正也不使用库存余额计算 I。

## 5. 数量、状态和采购关闭

```text
I = Inventory 查询本到货所有 completed 入库明细及匹配正流水的累计量
R = 本到货所有实际 supplier_return 累计量
L = I + 当前 approved 叶子量
J = R + 当前 quality_return、termination_return 叶子量
U = 当前 uninspected、reviewing 叶子量
A = U + L + J
尚保管量 = A - I - R
待入库 = L - I；待实际退回 = J - R
```

历史 inspection 不参与简单 SUM，已经 superseded 的范围不累计。累计入库查询不限制当前修订或最新检验，生产领用不降低 I。reviewing 的旧放行／判退暂移入 U，未影响范围保留；已经实际处置事实保持计入 I/R。零覆盖复核 case 不增加 U，但 `hasOpenReview` 必须阻断“检验处置完成”的正常关闭分支。

| 状态机 | 合法推进 |
| --- | --- |
| 采购主单 | draft→ordered/cancelled；ordered→completed/cancelled；终态不重开 |
| 采购行 | draft→open/cancelled；open→closed/cancelled；全部行终态后主单完成（全部取消则 cancelled） |
| 质检办理 | reviewing→completed/superseded；无撤回后恢复旧放行的捷径 |
| 退回展示 | 有当前待退范围且无实际交接=未处理；实际唯一交接完成=已退回供应商；复核暂停另列，历史范围失效不当作待退 |
| 到货概览 | 检验、待入、待退、复核、实物处理完毕分别派生，不用一个总状态遮蔽部分范围 |

逐行人工关闭：quality_target 要求 `L>=Q`；quality_return_completed 要求 `A>=Q && L<Q && U=0 && J-R=0 && L+R质量>=Q && !hasOpenReview`；manual_end 要求非空真实原因，无需伪造达标；cancelled 要求没有任何已确认到货事实，不能把更正到零误当作“从未到货”。正常关闭不要求 I=L，质检达标关闭也不要求没有其他待检／待退范围。关闭事实冻结 Q/A/U/L/I/J/R/R质量及依据；最新差异另行查询，关闭后放行减少不会覆盖证据或自动重开。

## 6. 公开能力定稿

类型均为纯 TypeScript，ID 为 string，数量输入 number、输出沿既有精确数量字符串。错误为协议无关稳定结果／领域错误，HTTP 映射在 presentation。模块内 Repository 只接 `CommandContext`；幂等 application 用例接 `IdempotentCommandContext` 并收窄后调用 port。

| `public.ts` 能力 | 参数／结果及责任 |
| --- | --- |
| `ProductionProcurementQuery.listCandidates(query)` | PageQuery + keyword/workOrderId/batchId/itemId/demandType；返回按需求平铺的分页叶子及工单／任务展示字段，前端分组 |
| `ProductionProcurementQuery.resolveDemands({demandIds})` | 最多100个；逐ID返回历史资料、当前 eligible 与具体阻断原因，不因不在候选窗口丢失已选项 |
| `ProductionProcurementQuery.requirePurchasableDemands({demandIds})` | 活动事务内锁工单→任务→需求，返回精确物料／版本、单位、来源 ID；不扣需求、不取预留齐套门禁 |
| `MaterialVariantQuery.listPurchasableByMaterials({materialIds})` | 基础物料／分类有效且版本未删；允许版本 status=0，返回实际启停状态供提示；生产 listEnabled 保留 |
| `ProductInventoryEligibility.requirePurchasableReferences({references:[{itemId,materialVariantId}]})` | 活动事务锁定并核对上述采购资格和身份，返回编码／单位快照；到货及入库再次调用 |
| `ProductInventoryEligibility.requireProductionIssuableReferences({references})` | 基础物料／分类及版本全部启用未删，供确认领料，配套候选及可分配展示一致 |
| `ProductInventoryEligibility.lockHistoricalReferences({references,productIds?})` | 库存操作先取得历史material/product及精确版本父身份共享锁，不过滤停用／软删除，不作为采购或生产资格；统一Product内部锁序，避免流水／余额外键隐式锁父行与库存批次锁倒序 |
| `QualityInboundCommand.startCase(input,context)` | 已锁来源的 lineId/revisionId/sourceScopeId/targetScopeId、type、coveredQuantity、reason；追加显式 reviewing case |
| `QualityInboundCommand.completeCase(input,context)` | caseId/version、来源修订／范围、方法及真实数量、批准、处置、凭据；锁case并验证结果，追加不可变 inspection，返回拆分数量及 inspectionId |
| `QualityInboundCommand.supersedeCases(input,context)` | 当前被实收更正影响的 caseIds + 新修订 ID；仅替换尚reviewing办理，保留旧记录 |
| `QualityInboundQuery.requireReleaseBasis(input)` | Procurement先锁并验证本模块scope仍为approved、无终止或复核、范围仍有效；Quality仅核对传入的inspectionId、caseId、receiptLineId、revisionId对应其真实完成且批准的结论，不查询Procurement表，不接受客户端“已合格”布尔值。当前scope/复核状态由Procurement负责，不能声称Quality自行重新读取 |
| `InventoryInboundCommand.confirmPurchaseReceipt(input,context)` | `input={provider,remark,details:[{receiptLineId,receiptRevisionId,inspectionId,scopeId,itemId,materialVariantId,itemCode,materialVariantCode,unit,quantity,batchId}]}`；由采购锁来源并核验质量；创建一张completed入库及逐范围明细、首次批次和正流水；返回 `{inboundId,inboundNo,details:[{receiptLineId,scopeId,batchId,inboundDetailId,transactionId}]}`。同次多个scope属于同一到货时在Inventory内部复用首次创建的batch |
| `InventoryInboundQuery.getReceiptInboundFacts({receiptLineIds})` | 按稳定到货 ID 返回所有确认来源、批次与流水匹配累计，不过滤历史修订，不读取余额代替累计 |
| `ProcurementQuery.listRelatedPurchases({demandIds,page,pageSize})` | 批量需求ID关联采购投影；采购单数去重、采购行数量标注不分摊；历史来源不套新下单资格 |

普通需求采购资格最终映射现有状态：工单 released/doing；任务 material_pending/material_assigned/material_partially_outbound/material_outbound/doing；需求 business_status=active、remaining_number>0、pending_correction_id=NULL。所有需求类型按自身有效性判断，不因已有采购、库存或分配自动禁选。补单用原采购与异常事实，不调用普通新来源资格。基础物料／分类停用、软删除仍阻止采购及入库，版本停用仅允许采购用途；库存批次 frozen/disabled 仍不可继续入库／领料。

## 7. HTTP、权限、分页与页面依据

所有 path/query/body 使用 class DTO，分页默认10、上限100；批量数组上限100，单次明细上限100。以下权限由追加 migration 写目录，前端只用页面 view 控制路由，按钮可显示，由每个后端命令独立鉴权。共用下拉授权使用消费页面 view 的 any-of。

| 端点（省略 `/api`） | 权限 | 关键请求／返回 |
| --- | --- | --- |
| GET `/procurement/suppliers`、`/options` | 列表 `procurement:suppliers:view`；options any-of `procurement:suppliers:view/procurement:orders:view/procurement:receipts:view` | 正式列表分页；options 远程窗口 keyword + includeIds，返回最小字段，明确解析已选项 |
| POST/PATCH `/procurement/suppliers[/:id]` | `procurement:suppliers:create/update` | supplierName；修改携version |
| GET `/procurement/material-options` | `procurement:orders:view` | 窗口候选keyword/includeIds，最小基础物料字段，由Product公开能力返回 |
| GET `/procurement/material-variants/options` | `procurement:orders:view` | materialId必填，完整返回该有效基础物料下未删除版本，包含停用状态；不改变原生产启用版本接口 |
| GET `/procurement/purchase-orders`、`/:id` | `procurement:orders:view` | 分页列表及单据详情；物料行、来源、关闭历史、当前数量各自明确 |
| POST/PATCH `/procurement/purchase-orders[/:id]` | `procurement:orders:create/update` | supplierId/sourceType/items及逐条demandId；PATCH携version，仅draft |
| POST `/procurement/purchase-orders/:id/actions/place` | `procurement:orders:place` | version，重核全部资格 |
| POST `/procurement/purchase-orders/:id/actions/cancel` | `procurement:orders:cancel` | version/reason，无确认到货 |
| POST `/procurement/purchase-order-lines/:id/actions/close` | `procurement:orders:close` | version/reasonType/reason，返回冻结依据和当前物流进度 |
| POST `/procurement/purchase-order-lines/:id/supplements` | `procurement:orders:create` | 独立草稿的原因、原到货／实际退回、数量与证据；不能原单改量 |
| GET `/procurement/demand-candidates`、POST `/demand-candidates/resolve` | `procurement:orders:view` | 分页候选、显式已选ID解析；resolve只读不发送幂等键 |
| GET `/procurement/related-purchases` | any-of `procurement:orders:view/production:tasks:view/production:material-demands:view/production:materials:view` | 批量需求ID，分页相关采购行及每需求distinct单数，不逐需求N+1 |
| GET `/procurement/receipts`、`/:id` | `procurement:receipts:view` | 分页到货；详情含范围、修订、质检、当前批号、入库与退回事实 |
| POST `/procurement/receipts/actions/confirm` | `procurement:receipts:confirm` | purchaseOrderId/各行版本、receivedAt/evidence/details；不按计划封顶 |
| POST `/procurement/receipt-lines/:id/actions/correct-receipt` | `procurement:receipts:correct` | §4.1完整修订输入，返回新修订和明确复核待办 |
| GET `/quality/inbound-inspections`、`/:caseId` | `quality:inbound-inspections:view` | 分页质检待办及历史；通过Procurement来源查询和Quality公开能力组合 |
| POST `/procurement/receipt-lines/:id/actions/start-review` | `quality:inbound-inspections:review` | version/scopeId/scopeVersion/quantity/caseType/reason；初检也显式建case |
| POST `/procurement/receipt-lines/:id/actions/inspect` | `quality:inbound-inspections:inspect` | caseId/caseVersion、修订与范围、全检/抽检及处置字段 |
| POST `/procurement/receipt-lines/:id/actions/terminate-return` | `procurement:receipts:return` | 当前范围/version/quantity/reason；指定终止待退，不写交接事实 |
| POST `/procurement/receipt-lines/:id/actions/return` | `procurement:receipts:return` | scopeId/scopeVersion/basis、完整待退量、交接时间及凭据 |
| GET `/procurement/inbound-releases` | `production:inbounds:view` | 分页有效放行范围，包含采购已关闭来源、当前批次或首次生成提示 |
| POST `/procurement/purchase-inbounds/actions/confirm` | `production:inbounds:confirm` | details中各receiptLineId/scopeId/scopeVersion/revisionId/inspectionId/quantity，及remark；一单可含多个到货范围，同事务整体确认 |
| GET `/production/purchase-inbounds`、`/:id` | `production:inbounds:view` | 保留历史路径，由Inventory实现，读取原入库单及新来源，所有历史修订可追溯；旧POST创建／confirm／cancel写路径移除 |

HTTP前缀体现编排入口，不改变检验办理人的权限归属；来料质检页可以使用上述Procurement场景命令。`/quality/inbound-inspections` 的来源查询由Procurement场景编排提供，使用quality查看权限，不要求质检另有采购页面权限，也不让Quality反向依赖Procurement。前端沿既有仓储入库页签选择采购及有效到货范围，入库核对量默认剩余且允许调小，本地草稿不写库存或建批。确认端点统一用details数组（1..100），一单多个到货／范围仍按统一锁序原子完成；不能让前端循环单范围HTTP却显示为一张原子入库单。

单据详情中批号直连 `receipt_line.batch_id→item_batch.batch_code`，首次为空显示“首次入库时生成”；入库历史按所有 `inbound_detail.procurement_receipt_line_id` 联查单据与正流水，不限制当前revision。前端不沿关系逐条发请求。采购详情的大量到货／检验／入库历史使用独立分页子资源，不返回无限增长数组。

操作依据为 `{scopeId,scopeVersion,receiptRevisionId,inspectionId,reviewCaseId}`，按操作允许 NULL；版本只防并发，显式范围状态和case状态仍需核验。对未受影响旧修订范围允许继续操作；对已拆分父范围提示刷新重核，不能静默把旧ID换成子范围。数量已被其他动作消耗时拒绝超量，不静默调小代替仓管确认。

## 8. 事务、锁序和幂等

所有核心事实、范围变化、当前指针、Inventory写入及成功审计一次提交。外围 application 调用幂等 executor，Repository 和公开能力用 `withTransaction` 复用同一连接；失败全回滚。各模块只写自身表，操作日志统一使用现有 `writeTransactionalAudit`。同类ID按数值升序；不能用JS浮点Number比较BIGINT。

普通下单先非锁读取来源用于确定根集合，再依次取得 **Production 工单→任务→需求→Procurement原采购根（补单）／当前采购根→供应商与采购行→Product采购资格**；锁后复核发现草稿来源或归属变化则拒绝，不在持采购根后新增Production锁。`requirePurchasableDemands`只锁Production并校验需求，不在该步骤提前取得Product锁；Product资格由采购根锁定后单独调用。草稿编辑不持有Procurement锁后反调Production锁。源资格读取只校验、不修改需求量。补单不锁旧需求，原单根和新单按ID顺序处理。

采购下游统一 **采购根→采购行→Product资格（该命令需要时）→到货明细→当前实物范围→Quality case／结论→Inventory入库单／库存批次**。关闭、到货、复检、修订、终止、退回及入库共用采购根和到货锁；关闭后仍能锁原根办理物流。多到货先锁全部根、再各层ID排序，禁止一条完成到库存再回头锁另一采购根。首次创建batch与绑定line在同事务；同次多个范围属于同一到货时复用该新batch。所有者内部先查到实际现有锁序再落地，Product状态更新只锁Product自身，Inventory不得反调Procurement/Production，避免环。

生产既有锁序按库存提取设计保留；新增版本资格须放在库存批次锁之前并在候选／确认统一，不能在一处引入库存→Product而另一处Product→库存。退料、盘点等无需当前Product写入资格的历史操作仍先调用历史父身份共享锁，再锁库存批次，因为流水和余额触发器的FK会隐式锁Product父行；该锁不得错误拒绝停用／删除历史身份。余额投影仍由既有流水触发器维护，不在调用方加第二次更新。

确认／事实生成命令 scope（目标版本均 v1）：

| 命令 | scope |
| --- | --- |
| 新采购草稿／独立补单创建 | `procurement.purchase-order.create.v1` / `procurement.purchase-order.supplement.v1` |
| 正式下单／取消／逐行关闭 | `procurement.purchase-order.place.v1` / `procurement.purchase-order.cancel.v1` / `procurement.purchase-order-line.close.v1` |
| 到货确认／实收更正 | `procurement.receipt.confirm.v1` / `procurement.receipt.correct.v1` |
| 复核发起／检验确认 | `procurement.receipt.review.v1` / `procurement.receipt.inspect.v1` |
| 指定终止退回／实际交接 | `procurement.receipt.terminate-return.v1` / `procurement.receipt.return.v1` |
| 外购入库确认（单／多明细统一数组） | `procurement.inbound.confirm.v1` |

上述端点必须 `Idempotency-Key`，指纹覆盖actor、scope、语义path、规范化body全部字段（包含版本、范围、来源、数量、原因、凭据）。采购需求 ID 集合按定义排序；到货及入库 details 保留原顺序与业务行号。application 将 DTO 及其嵌套数组项转换成普通对象，同一规范化 body 用于指纹与执行。结果codec保存稳定完整响应，至少12小时重放。采购 draft PATCH 同样启用 `procurement.purchase-order.update.v1`：完整替换未生效明细会改变行 ID，同键重放恢复原命令结果，避免响应丢失后以旧版本重复替换或误报并发。普通供应商维护和只读查询不启用，误带键按现有Guard拒绝。唯一采购号／到货号／退回号、case唯一结论、scope唯一入库／退回、库存流水防重共同约束；HTTP幂等不替代实物依据重核，也不宣称能自动识别人员另行发起的重复补购。

## 9. Schema 与验证边界

| Migration | 当前 schema 职责 |
| --- | --- |
| 202609190001-procurement-suppliers | 简单供应商主数据及最小权限 |
| 202609190002-procurement-purchase-orders | 采购主行、逐条需求来源及不可变关闭事实 |
| 202609190003-integer-quantity-storage | 将既有业务数量统一为整数，保留事实语义 |
| 202609190004-procurement-receipts-and-quality | 到货、修订、范围、Quality case／inspection、实际退回、采购补单追溯及原 inbound_detail 来源 FK |

Inventory 代码提取不重建原库存表。新采购入库确认直接生成 completed 入库单，旧手工 purchased 写入口已移除；190004 拒绝存在无采购与检验来源的旧 purchased 数据，开发环境须重置，不能伪造历史。各模块的 README、数据库/API 专题与所有权登记维护当前实现，本文不记录已完成实施流水。

DDL guard失败、MySQL CHECK/FK不支持、公开能力类型错误等属于实施问题，先修到可启动；不改已执行migration。开发重置使用统一初始化和种子入口，不能依赖现有业务数据。验证至少包含类型检查、构建、migration检查、空开发库迁移初始化、API及管理端启动、页面路由和关键HTTP调用；按用户授权暂缓新增正式测试集，不写“全量测试通过”。

手工验收关注：跨工单同版本合单不分摊；采购600关联两个需求不回写；实收超量与补单两种原因；初检／抽检显式放行；部分范围复检即时暂停而其他范围可办理；60已入后100→110修订仍保原事实及同批号；待退更正和零余量复核；采购关闭与原物流独立；分次和并发入库不重建批次、不重复消费；实际退回必须整范围；停用版本可采购入库却不可领用或计入可领齐套。
