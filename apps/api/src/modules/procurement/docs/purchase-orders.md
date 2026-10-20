# 采购订单

提供草稿、正式下单、无到货整单取消、逐行或整单结束、逐行恢复、超量补单及真实质量退回补货。普通采购明确选择 `demand/stock`：按需求主单必填单一 `workOrderId`，可选同工单多个任务的正式需求；备料 `workOrderId=null` 且无需求来源。每行明确选择 `supplierId`，同物料／精确版本／供应商唯一，采购量独立填写正整数，不分摊、不按需求量封顶、不预留库存或回写需求。每单最多 100 行、合计最多 100 条来源映射；同需求在不同供应商行的每次映射分别计数。

共享契约见 `packages/contracts/src/procurement/purchase-orders.ts`，稳定代码及中文映射见 `packages/constants/src/procurement-orders.ts`。数量物理使用整数，响应按 `String(quantity)` 返回整数字符串。列表按创建时间和 ID 倒序分页，详情当前物料名称关联 `materials.id/material_name`，历史来源不受当前需求或物料状态过滤。

## 当前 HTTP 和权限

| 方法与路径（省略 /api） | 权限（省略 procurement:orders:） | 请求 |
| --- | --- | --- |
| GET /procurement/purchase-orders、/:id | view | keyword/supplierId/sourceType/status/supplementReason/originOrderLineId/originReceiptLineId，公共分页；全部来源条件须命中同一补单行；按到货明细与补因查询相关补单 |
| GET /procurement/purchase-order-lines/:id/receipt-records | view | 只读分页核对本行累计到货来源；keyword 搜到货单号／供应商批号／到货明细 ID，完整口径见[采购行到货记录](receipt-queries.md#采购行到货记录) |
| POST /procurement/purchase-orders | create | workOrderId/sourceType/remark/items（每行 supplierId） |
| PATCH /procurement/purchase-orders/:id | update | 上述完整草稿及 version |
| POST /procurement/purchase-orders/:id/actions/place | place | version |
| POST /procurement/purchase-orders/:id/actions/cancel | cancel | version/reason |
| POST /procurement/purchase-order-lines/:id/actions/close | close | 行 version、reason |
| POST /procurement/purchase-order-lines/:id/actions/reopen | close | 行 version、reason |
| POST /procurement/purchase-orders/:id/actions/close | close | 主单 version、reason，原子结束全部进行中行 |
| POST /procurement/purchase-orders/:id/supplements | create | `id` 为原采购主单；supplementReason、items（每行 originOrderLineId、originReceiptLineId、plannedQuantity、supplementEvidence）及 remark；原子创建多行同补因独立补单 |
| GET /procurement/purchase-order-lines/:id/excess-receipt-candidates | view | 公共分页；keyword 搜到货单号／供应商批号，receiptLineId 精确定位；仅列有当前可入余量或实际已入事实的有效到货，返回身份、本次到货量及同次到货同补因的补单摘要 |
| GET /procurement/purchase-order-lines/:id/quality-replacement-candidates | view | 按原到货明细分页；keyword 搜到货单号／供应商批号／真实质量退回单号，receiptLineId 精确定位；当前有效质量待退或真实质量已退提供资格，返回本次到货量、当前待退／历史已退及同到货同补因补单摘要 |
| GET /procurement/demand-work-orders | view | page/pageSize/keyword，只返回包含合资格需求的工单 |
| GET /procurement/demand-candidates | view | 必填 workOrderId，分页及 keyword/batchId/itemId/demandType |
| POST /procurement/demand-candidates/resolve | view | workOrderId/demandIds，显式解析每个已选项，异工单返回阻断；只读，无幂等头 |
| GET /procurement/material-options | view | keyword/includeIds，Product 采购窗口候选 |
| GET /procurement/material-variants/options | view | materialId，全量该物料未删版本，允许停用版本 |

GET `/procurement/related-purchases` 接受批量 demandIds 和公共分页，合法查看权限任一：`procurement:orders:view`、`production:tasks:view`、`production:material-demands:view`、`production:materials:view`。响应为分页关联采购行与逐需求 distinct 采购单数；行计划量明确是不分摊的整行数量。当前需求已关闭、被更正、已履约或基础物料停用都不抹去关联历史。查询按集合处理，禁止逐需求 N+1。

订单写命令均要求 Idempotency-Key，采购主单和补单在实际创建事务内由服务端分配 PO 编号；create 为 `procurement.purchase-order.create.v2`，update 为 `.update.v4`，place 为 `.place.v4`，cancel 为 `.cancel.v3`，整单结束为 `.close.v1`，supplement 为 `.supplement.v6`；行结束为 `procurement.purchase-order-line.close.v2`，行恢复为 `.reopen.v1`。PATCH 同样使用幂等以保证整体替换草稿行的响应不确定时安全重放。application 规范化请求并收窄审计上下文传给 port，平台 executor 与业务、审计复用同一事务。所有写结果为 `{purchaseOrderId,version}`，首次和重放返回同一 codec 快照，再 GET 当前详情。

## 当前状态、来源与事务

采购行 `open` 显示为“进行中”。正式下单后，行状态由人员结束或恢复；到货、检验、正式清单、入库、退回及采购数量投影均不自动结束或恢复采购。不提供行取消命令或主单独立完成确认。

### 采购主单

| 当前状态 | 变为 | 发生条件 |
| --- | --- | --- |
| 未创建 | 草稿 `draft` | 新建采购单或独立补单成功。 |
| 草稿 `draft` | 已下单 `ordered` | 人员确认正式下单，供应商、物料、需求来源或补单依据等校验通过；全部物料行同时进入“进行中”。 |
| 草稿 `draft` | 已取消 `cancelled` | 人员填写原因取消整单，整单从未登记自身到货。 |
| 已下单 `ordered` | 已结束 `completed` | 最后一条进行中行被人工结束；或人员填写原因整单结束全部进行中行，已结束行保持原状态。 |
| 已下单 `ordered` | 已取消 `cancelled` | 人员填写原因取消整单，整单从未登记自身到货；已结束行不额外阻断，全部行置为已取消。 |
| 已结束 `completed` | 已下单 `ordered` | 人员填写原因恢复其中一条已结束行，主单与该行在同一事务更新。 |
| 已取消 `cancelled` | 无后续状态 | 终态，不恢复。 |

### 采购物料行

| 当前状态 | 变为 | 发生条件 |
| --- | --- | --- |
| 未创建 | 草稿 `draft` | 随采购主单创建物料行。 |
| 草稿 `draft` | 进行中 `open` | 所属采购主单正式下单成功。 |
| 草稿 `draft` | 已取消 `cancelled` | 所属采购草稿被整单取消。 |
| 进行中 `open` | 已结束 `closed` | 人员填写原因结束本行，或整单结束时结束本行；不设数量或物流门槛。 |
| 已结束 `closed` | 进行中 `open` | 人员填写原因恢复本行；采购身份、计划及来源保持正式下单快照。 |
| 进行中 `open`／已结束 `closed` | 已取消 `cancelled` | 所属已下单采购满足整单取消条件，并被人员取消。 |
| 已取消 `cancelled` | 无后续状态 | 终态，不恢复。 |

结束行会阻止该行新增到货；须先恢复再登记新到货。已经登记的实物继续按原到货办理检验、清单、更正、入库及退回，不受采购结束影响；超量补单只记录已有到货补购，不新增重复到货。部分行结束且仍有进行中行时主单保持 `ordered`。新建、下单或结束补单不推进原采购单状态。

结束、恢复及整单取消都要求 trim 后非空原因，最多 2000 字。命令直接更新行状态，原因、目标、操作者和时间由平台 `operation_logs` 记录；整单结束只更新当前进行中行。详情返回各行当前状态和 `quantities` 当前物流投影（超量补单为 `null`），数量不作为结束依据或历史快照。

详情的 `canCancel` 由后端按当前主单状态和本单历史自身到货计算，管理端不从当前数量推算取消资格。实收更正为零、到货作废或剩余授权清空都不恢复整单取消资格；命令在锁内再次核验，详情不能代替写入校验。

草稿修改完整替换未生效行和来源映射；已下单不允许普通 PATCH 修改供应商、精确身份、计划量和来源。补单固定原采购行、原到货明细和建单说明，不保存分配级引用，不提供更换来源命令。每次根修改 version 递增；逐行结束和恢复校验行 version 后同时推进根 version，整单结束及取消校验主单 version。行状态、主单汇总和成功审计在同一事务内写入。管理端草稿、并发和候选约束见[采购专题](../../../../../admin-web/docs/procurement-inbound.md)。

### 来源资格与锁序

普通草稿保存及正式下单经 `ProductionProcurementQuery.requirePurchasableDemands` 校验并锁工单、任务、需求；采购根锁定后才经 `ProductInventoryEligibility.requirePurchasableReferences` 取得采购资格及编码／单位快照。正式下单重新读取资格并更新最终快照，基础物料／分类必须有效，精确版本允许停用。供应商始终按稳定 ID 核验未删。

下单先非锁定位草稿来源，再按 Production 根 → Procurement 原根／当前根（数值 ID 排序）→ 供应商与采购行 → Product 锁序办理。取得采购根后检查版本及完整来源映射未变化，变化即失败，不继续补锁新的 Production 根。锁后业务读取使用当前锁读；无锁定位结果只用于确定锁集合。新增单没有已存在的采购根，先核供应商后插入新根，再检查 Product 并写行。写入失败全部回滚。

补单是独立单号、ID 和草稿，一张补单只引用同一已正式下单原采购单且只选择一种补因，可选该原单的多条不同物料行；每条补单行只引用一条原采购行、一条真实到货及一份具体依据，同一原行不得重复加入。各行继承原供应商、精确物料版本和完整需求关联，主单继承来源类别及工单。旧需求资格不重新判定、不重开，不因来源后来关闭而失去追溯；Product 和供应商仍重新核验。超量新建要求有效可入或实际已入的真实到货引用及非空现场依据文字；补单草稿只调整各行计划量及主单备注，行数、顺序、原身份、需求和依据保持。两类补单均不设累计补购额度或次数上限，不存在仓库承接绑定。

采购页的超量补单到货候选独立使用 `procurement:orders:view`，不借用到货管理页权限。候选严格按原采购行读取，不把相同物料的其他采购到货混入；允许原采购已关闭、到货已执行完的历史事实作为依据，本次到货量按[候选查询契约](receipt-queries.md#入库候选及正式分配)展示，不作为创建补单的数量上限，创建仍由服务端在锁内核验资格，定稿不绑定补单。keyword 在分页前匹配到货单号或供应商批号，列表按到货时间和明细 ID 倒序分页，`receiptLineId` 仅在该原行内精确解析，用于跨页面定位。

结束和恢复命令只锁采购根与行，不读取或冻结到货、Quality、Inventory 数量。整单结束、整单取消与逐行操作均先按数值顺序锁原采购根和当前根，再锁全部采购行；部分行结束、最后一行结束和从已结束主单恢复一行据锁内行状态原子汇总主单。取消在相同锁内检查本单历史自身到货，不借助数量投影判断资格。

质量补发每行提交 originOrderLineId、originReceiptLineId 及非空 supplementEvidence（供应商补发约定）。创建在原采购根锁内核验该到货属于固定原采购行且未作废，并存在当前有效正式质量退回分配或真实质量退回历史；只存在旧检验不合格数、无实际退回的失效授权、人工拒收、超发或采购终止退回均不提供质量补单新建资格。资格按到货明细判断，不保存或选择某条分配 ID。已有补单下单只核验固定来源身份、未作废及采购资格，不以当前处理轮或新建资格阻断。

候选按请求路径原采购行的到货明细分页，每份到货只返回一行。pendingReturnQuantity 只汇总当前正式质量退回剩余，returnedQuantity 汇总全部真实质量退回，两份数量独立聚合；当前无质量待退但历史实际质量已退仍可选择。receivedQuantity 是该次到货的当前核实总量，不作为补发数量上限。补单保留原行需求来源，不按已建补单累计量限制补发，采购核对约定数量及相关补单。允许先补后退，不要求原单关闭，不自动登记退回、关闭原单或新增需求。仓库退回仍通过自己的 allocation_id 追溯实际执行，与补单来源引用分离。

成功审计 action 为 `purchase-order.create/update/place/cancel/close/supplement` 或 `purchase-order-line.close/reopen`，同业务事务写入。验证与验收顺序遵守 [AGENTS.md](../../../../../../AGENTS.md#数据库与交付约定)。

## 明细供应商与单工单来源

按需求采购限定单一工单，可跨该工单任务选择正式需求；分页单位为需求，不能从当前页推断该任务的全部需求。更换工单后必须重新明确来源并核对明细，不可将原需求静默改归属。独立备料不填写工单、任务或需求，也不自动回绑后来的需求。

每条普通采购明细的供应商由用户手动输入检索并明确选择现有供应商，保存 `items[].supplierId`。未配置的供应商先到名称配置页新增，再返回选用；不隐式建供应商，不用自由文本替代稳定 ID，不设主单供应商或从主单批量复制。同一单允许不同明细选择不同供应商。

同单以 `(itemId,materialVariantId,supplierId)` 识别物料行：同物料版本、不同供应商保留独立行；完全相同的三项由用户归并为一行，来源 demandIds 去重，计划总量由用户确认，后端拒绝未归并的重复行，不静默合量或以需求参考量自动分摊。相同需求可以追溯到不同供应商的采购行，关联采购单数仍按主单 ID 去重，不能把每行全量都算作该需求已采购量。

仍最多 100 条采购行、全单最多 100 条来源映射；同一需求关联不同供应商行时，每条映射分别计数，同一行内不得重复关联。调用 Production 公开资格校验时先按需求 ID 去重，仍最多 100 个 ID。`normalizePurchaseDraft` 按三元身份拒绝重复行，来源按行去重并核对全单映射条数。需求归组后拆分供应商行时，由用户明确确认各行来源，不能自动分摊或推算采购量。

| 契约 | 当前输入与响应 |
| --- | --- |
| 新建／编辑普通采购 | POST／PATCH 不接受顶层 supplierId；workOrderId 为 string 或 null，demand 必填 ID、stock 必须 null；每条 items 必填 supplierId；PATCH 保留主单 version，旧主单供应商形状不兼容接收 |
| 采购主单列表 | 返回 PurchaseOrderItem，不返回 suppliers 或顶层 supplierId/supplierName，也不查询供应商汇总；workOrderId/workOrderNo 在备料单均为 null |
| 采购主单详情 | 返回 PurchaseOrderDetail，包含从全部采购行去重得到的 suppliers: {id,supplierName}[]；明细返回自己的 supplierId/supplierName，汇总不代表主单具有唯一供应商 |
| 供应商筛选 | supplierId 及 keyword 的供应商名称匹配使用采购明细 EXISTS 条件，分页前过滤主单并保持主单去重；订单详情继续完整显示全部行，不能把匹配行当作整单 |
| GET /procurement/demand-work-orders | 只读接口，权限 procurement:orders:view；page/pageSize/keyword → PageResult<{id,workOrderNo}>，仅列至少含一条当前合资格需求的工单 |
| GET /procurement/demand-candidates | workOrderId 必填；batchId 为可选任务筛选且须属于该工单，itemId/demandType/keyword/分页继续可选；返回需求叶子分页及每条需求的任务资料，不增加树形 API |
| POST /procurement/demand-candidates/resolve | {workOrderId,demandIds}；返回各已选 ID 的资格与归属，其他工单项保留并标明阻断原因，不静默丢失；保持只读，不要求幂等键 |
| 相关采购 | 继续逐采购行返回数量与状态；supplierId/supplierName 取该行，保留同单不同供应商行，单数按主单去重 |

采购详情行的 `originReceiptNo: string | null` 是 `originReceiptLineId` 所属原到货主单的真实单号，由已有到货明细和主单关联读取；无到货来源时返回 `null`。该只读来源标识随采购详情按 `procurement:orders:view` 返回，不要求到货页面权限，也不因原到货已作废或处理轮已替代而隐藏。单号只补充详情行追溯信息，不进入采购主单列表、写命令或新增存储字段；到货办理接口仍独立校验权限。

工单选项由 `ProductionProcurementQuery.listWorkOrders` 按相同工单／任务／需求资格独立分页提供，不能从当前一页需求反推完整工单列表。`listCandidates` 入参必填 workOrderId；`resolveDemands` 保留现有历史解析签名，由 Procurement 对返回的每项额外比较所选工单。历史来源展示不套当前候选过滤。普通草稿保存及正式下单调用 `requirePurchasableDemands` 后，也须将各来源所属工单与主单逐项比较，不能只信前端筛选。

从任务需求进入采购的定位携带 workOrderId+demandId，由服务端解析后核对归属和资格。缺少工单时先选择工单；已有编辑内容时应用同一工单切换确认，不能凭 URL 参数静默换工单或绕过校验。

正式下单冻结每行供应商、物料精确版本、计划量及需求来源，并固定按需主单工单；补单原采购、原到货和建单说明保持固定。普通按需写事务先校验 Production 来源根，再锁 Procurement 根与行；供应商按 ID 去重并以数值顺序锁定／校验，避免多行多供应商交叉锁。公开 Product 资格及当前数量、状态门禁继续有效。请求规范化、指纹、结果 codec 和幂等 scope 必须随契约切换审视，不能把新请求解释为旧主单供应商契约。

补单入口从一个已正式下单的原采购主单选择一至多条不同原行，创建一张同补因独立新单。每条补单行继承并锁定对应**原采购行**的供应商、物料精确版本及完整需求来源；按需补单保持原单工单，原需求关闭或工单结束仍不要求重新激活。创建请求不开放 supplierId/workOrderId；补单草稿复用普通 PATCH 完整形状时，行数与顺序以及这些身份字段必须与继承值一致，只能调整逐行计划量和主单备注。质量补发的正式质量退回处置、原到货及原采购行必须同属相应供应商；超量补单也沿所引用原行追溯，不从多供应商主单随意选一个供应商。若要向另一供应商另行购买，应按相应普通采购入口建单，不能改写异常补单的原供应商身份。不跨原采购主单合单，也不让同一补单行绑定多份到货来源。

采购数量按具体采购行自身到货及实际执行展示，其他供应商同物料行的实收或放行不抵补本行。行结束只停止该行新增到货，已到实物待办继续办理。表名与约束见[数据库设计](database.md)。

生产提示通过需求来源的 `supplierHint` 展示，批量取任务需求基础提示，研发取本笔需求提示。提示只是当前生产要求说明，不自动选择实际 supplierId，也不限制库存分配供应商。

## 补单来源与独立物流

超量补单固定引用 originReceiptLineId，fulfillment_mode=existing_receipt，表示“已有到货补购”。创建时来源未作废，且有当前有效可入余量或实际历史已入库事实；未定稿、全待处理、全退回或仅有失效未执行可入记录不提供资格。实际已入通过 Inventory 公开能力在事务内核实。超量单不新增到货、不占原到货分配，详情 quantities=null；到货记录为空，累计量为 0。原采购仍统计完整自身到货及入退，不因补购时间而变化。

质量补单为 new_arrival，固定引用原到货明细并保存供应商补发约定；其新到货、质检、定稿和入退独立办理与统计，不回溯汇总到最初原采购。质量原因由创建时的到货资格确认，采购行不保存分配 ID、分配当前性或具体实际退回 ID。

两类补单创建时原子保存原采购行、原到货明细和说明，不提供无依据建单、独立补关联或跨到货换绑命令。创建检查当前可选资格；已有补单下单只校验固定身份、未作废及供应商／物料等采购资格。普通草稿编辑只调整采购量与备注，保留锁内读取的原采购行、原到货明细、履约方式和 supplementEvidence。原采购或原到货选错需取消旧草稿后重建；已有自身到货按现有人工结束规则办理。

更正、复检等替代旧轮次时，补单状态、数量和原到货来源保持。来源轮次不参与补单引用身份，也不提供仓库执行授权。取消补单保留原到货历史；非取消补单继续阻断原到货作废。

候选 receiptLinkedSupplements 按同一 origin_receipt_line_id、同一补因汇总，跨轮次并包括已取消状态；count 表示关联明细条数，plannedQuantity 表示这些明细采购量，不表示占用仓库额度。按集合去重来源后汇总，不随候选中的分配条数重复累计。详情原单、到货单号和各明细 ID 不依赖仓储跳转权限。

### 已实际退回后的到货依据

例如本次到货 10 件，先安排可入 8、质量退回 2 并真实退回。剩余 8 重新定稿为全部可入时，当前轮不再生成质量退回分配；实际退回继续引用其原分配并保留真实事实。这份到货仍凭历史质量已退 2 提供新建质量补单资格，已保存该到货来源的补单可继续下单，不要求指向当前轮中不存在的退回分配，也不把历史已退复制为当前待退。演示准备见[演示数据](../../../../../../packages/database/demo/README.md)。

## 整批重办期间的数量展示

到货按 current_round_id 维护整批流程；复检或更正替代未执行授权，真实已入／已退保留。采购行物流始终来自自己的到货：累计到货取非作废登记的当前修订 T，当前可入／待退只取当前正式余量，历史实际入退只计一次。未定稿剩余量归该到货自己的采购行，不分配给补单。

有效可入量包含库管有依据确认的超质检建议正式授权；质量待复检和不放行不能由数量例外绕过。人工拒收及其真实退回计入一般待退／已退，不计为 qualityReturnedQuantity，也不作为质量补发来源。数量变化不改采购状态，人员动作与原因通过通用操作日志追溯。
