# 采购订单

提供草稿、正式下单、无到货整单取消、逐行或整单结束、逐行恢复、超量补单及真实质量退回补货。普通采购明确选择 `demand/stock`：按需求主单必填单一 `workOrderId`，可选同工单多个任务的正式需求；备料 `workOrderId=null` 且无需求来源。每张主单必选唯一 `supplierId`，同单物料／精确版本唯一，采购量独立填写正整数，不分摊、不按需求量封顶、不预留库存或回写需求。每单最多 100 行、合计最多 100 条来源映射。

共享契约见 `packages/contracts/src/procurement/purchase-orders.ts`，稳定代码及中文映射见 `packages/constants/src/procurement-orders.ts`。数量物理使用整数，响应按 `String(quantity)` 返回整数字符串。列表按创建时间和 ID 倒序分页，详情当前物料名称关联 `materials.id/material_name`，历史来源不受当前需求或物料状态过滤。

## 当前 HTTP 和权限

| 方法与路径（省略 /api） | 权限（省略 procurement:orders:） | 请求 |
| --- | --- | --- |
| GET /procurement/purchase-orders、/:id | view | keyword/supplierId/sourceType/status/supplementReason/originOrderLineId/originReceiptLineId，公共分页；全部来源条件须命中同一补单行；按到货明细与补因查询相关补单 |
| GET /procurement/purchase-order-lines/:id/receipt-records | view | 只读分页核对本行累计到货来源；keyword 搜到货单号／供应商批号／到货明细 ID，完整口径见[采购行到货记录](receipt-queries.md#采购行到货记录) |
| POST /procurement/purchase-orders | create | supplierId/workOrderId/sourceType/remark/items（每行可填两项采购单位单价、taxRatePercent、manualTotalAmount） |
| PATCH /procurement/purchase-orders/:id | update | 上述完整草稿及 version |
| POST /procurement/purchase-orders/:id/actions/place | place | version |
| POST /procurement/purchase-orders/:id/actions/cancel | cancel | version/reason |
| POST /procurement/purchase-order-lines/:id/actions/close | close | 行 version、reason |
| POST /procurement/purchase-order-lines/:id/actions/reopen | close | 行 version、reason |
| POST /procurement/purchase-orders/:id/actions/correct-amounts | update | 主单 version、变更行 items（id、行 version、taxExclusiveAmount、taxInclusiveAmount、taxRatePercent、manualTotalAmount）、reason；原子补填或更正已下单／已结束采购的金额 |
| POST /procurement/purchase-orders/:id/actions/close | close | 主单 version、reason，原子结束全部进行中行 |
| POST /procurement/purchase-orders/:id/supplements | create | `id` 为原采购主单；supplementReason、items（每行 originOrderLineId、originReceiptLineId、plannedQuantity、supplementEvidence 及可选单价、taxRatePercent、manualTotalAmount）及 remark；原子创建多行同补因独立补单 |
| GET /procurement/purchase-order-lines/:id/excess-receipt-candidates | view | 公共分页；keyword 搜到货单号／供应商批号，receiptLineId 精确定位；仅列有当前可入余量或实际已入事实的有效到货，返回身份、整次到货五项处理数量及同次到货同补因的补单摘要 |
| GET /procurement/purchase-order-lines/:id/quality-replacement-candidates | view | 按原到货明细分页；keyword 搜到货单号／供应商批号／真实质量退回单号，receiptLineId 精确定位；当前有效质量待退或真实质量已退提供资格，返回整次到货五项处理数量及同到货同补因补单摘要，口径见[候选查询契约](receipt-queries.md#入库候选及正式分配) |
| GET /procurement/demand-work-orders | view | page/pageSize/keyword，只返回包含合资格需求的工单 |
| GET /procurement/demand-candidates | view | 必填 workOrderId，分页及 keyword/batchId/itemId/demandType |
| POST /procurement/demand-candidates/resolve | view | workOrderId/demandIds，显式解析每个已选项，异工单返回阻断；只读，无幂等头 |
| GET /procurement/material-options | view | keyword/includeIds，Product 采购窗口候选 |
| GET /procurement/material-variants/options | view | materialId，全量该物料未删版本，允许停用版本 |

GET `/procurement/related-purchases` 接受批量 demandIds 和公共分页，合法查看权限任一：`procurement:orders:view`、`production:tasks:view`、`production:material-demands:view`、`production:materials:view`。响应为分页关联采购行与逐需求 distinct 采购单数；行计划量明确是不分摊的整行数量。当前需求已关闭、被更正、已履约或基础物料停用都不抹去关联历史。查询按集合处理，禁止逐需求 N+1。

订单写命令（含整体替换草稿行的 PATCH）均要求 `Idempotency-Key`；响应不确定时，使用原键和原请求重试。所有写结果为 `{purchaseOrderId,version}`，重放返回首次成功结果快照，当前详情另行 GET 获取。采购主单和补单在实际创建事务内由服务端按[统一编号规则](../../../../docs/business-numbering.md)分配采购订单号。

请求规范化、事务与重放机制遵循[平台幂等契约](../../../../docs/idempotency.md)，命令上下文的分层传递遵循[命令上下文](../../../../docs/command-context.md)；各命令的 scope 及版本见[采购幂等契约代码](../application/idempotency/procurement-idempotency-scopes.contract.ts)。

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

草稿修改完整替换未生效行和来源映射；普通草稿可更换主单供应商。已下单不允许普通 PATCH 修改供应商、精确身份、计划量、单价、税率和来源，两项单价、税率与手填总额只通过[独立更正命令](#正式下单后的金额更正)办理。补单固定主单供应商、原采购行、原到货明细和建单说明，不保存分配级引用，不提供更换来源命令。每次根修改 version 递增；逐行结束和恢复校验行 version 后同时推进根 version，金额更正同时核对主单及变更行 version，整单结束及取消校验主单 version。行状态、主单汇总和成功审计在同一事务内写入。管理端草稿、并发和候选约束见[采购专题](../../../../../admin-web/docs/procurement-inbound.md)。

### 来源资格与锁序

普通草稿保存及正式下单经 `ProductionProcurementQuery.requirePurchasableDemands` 校验并锁工单、任务、需求；采购根锁定后才经 `ProductInventoryEligibility.requirePurchasableReferences` 取得采购资格及编码／单位快照。正式下单重新读取资格并更新最终快照，基础物料／分类必须有效，精确版本允许停用。供应商始终按稳定 ID 核验未删。

下单先非锁定位草稿来源，再按 Production 根 → Procurement 原根／当前根（数值 ID 排序）→ 供应商与采购行 → Product 锁序办理。取得采购根后检查版本及完整来源映射未变化，变化即失败，不继续补锁新的 Production 根。锁后业务读取使用当前锁读；无锁定位结果只用于确定锁集合。新增单没有已存在的采购根，先核供应商后插入新根，再检查 Product 并写行。写入失败全部回滚。

补单是独立单号、ID 和草稿，一张补单只引用同一已正式下单原采购单且只选择一种补因，可选该原单的多条不同物料行；每条补单行只引用一条原采购行、一条真实到货及一份具体依据，同一原行不得重复加入。各行继承精确物料版本和完整需求关联，主单继承原单供应商、来源类别及工单。旧需求资格不重新判定、不重开，不因来源后来关闭而失去追溯；Product 和供应商仍重新核验。超量新建要求有效可入或实际已入的真实到货引用及非空现场依据文字；补单草稿只调整各行计划量、两项单价、税率及手填总额及主单备注，行数、顺序、原身份、需求和依据保持。两类补单均不设累计补购额度或次数上限，不存在仓库承接绑定。

采购页的超量补单到货候选独立使用 `procurement:orders:view`，不借用到货管理页权限。候选严格按原采购行读取，不把相同物料的其他采购到货混入；允许原采购已关闭、到货已执行完的历史事实作为依据，整次到货的处理数量按[候选查询契约](receipt-queries.md#入库候选及正式分配)展示，不作为创建补单的数量上限，创建仍由服务端在锁内核验资格，定稿不绑定补单。keyword 在分页前匹配到货单号或供应商批号，列表按到货时间和明细 ID 倒序分页，`receiptLineId` 仅在该原行内精确解析，用于跨页面定位。

结束和恢复命令只锁采购根与行，不读取或冻结到货、Quality、Inventory 数量。整单结束、整单取消与逐行操作均先按数值顺序锁原采购根和当前根，再锁全部采购行；部分行结束、最后一行结束和从已结束主单恢复一行据锁内行状态原子汇总主单。取消在相同锁内检查本单历史自身到货，不借助数量投影判断资格。

质量补发每行提交 originOrderLineId、originReceiptLineId 及非空 supplementEvidence（供应商补发约定）。创建在原采购根锁内核验该到货属于固定原采购行且未作废，并存在当前有效正式质量退回分配或真实质量退回历史；只存在旧检验不合格数、无实际退回的失效授权、人工拒收、超发或采购终止退回均不提供质量补单新建资格。资格按到货明细判断，不保存或选择某条分配 ID。已有补单下单只核验固定来源身份、未作废及采购资格，不以当前处理轮或新建资格阻断。

候选按请求路径原采购行的到货明细分页，每份到货只返回一行。当前无质量待退但历史实际质量已退仍可选择；展示使用与超量候选相同的整次到货五项处理数量，全部原因的待退／已退量与质量原因候选资格的边界由[候选查询契约](receipt-queries.md#入库候选及正式分配)维护。数量不作为补发上限，补单保留原行需求来源，不按已建补单累计量限制补发，采购核对约定数量及相关补单。允许先补后退，不要求原单关闭，不自动登记退回、关闭原单或新增需求。仓库退回仍通过自己的 allocation_id 追溯实际执行，与补单来源引用分离。

成功审计 action 为 `purchase-order.create/update/place/cancel/close/supplement/correct-amounts` 或 `purchase-order-line.close/reopen`，同业务事务写入。验证与验收顺序遵守 [AGENTS.md](../../../../../../AGENTS.md#数据库与交付约定)。

## 主单供应商与单工单来源

按需求采购限定单一工单，可跨该工单任务选择正式需求；分页单位为需求，不能从当前页推断该任务的全部需求。更换工单后必须重新明确来源并核对明细，不可将原需求静默改归属。独立备料不填写工单、任务或需求，也不自动回绑后来的需求。

普通采购主单由用户手动检索并明确选择现有供应商，保存顶层 `supplierId`，采购行不接受或保存独立供应商。未配置的供应商先到名称配置页新增，再返回选用；不隐式建供应商，不用自由文本替代稳定 ID。向不同供应商采购时分别建单。

同单以 `(itemId,materialVariantId)` 识别物料行：同物料精确版本只保留一行，来源 demandIds 去重，计划总量及两项单价、税率及手填总额由用户确认；后端拒绝重复身份，不静默合量或以需求参考量自动分摊。相同需求可以追溯到不同采购单，关联采购单数按主单 ID 去重，不能把每行全量都算作该需求已采购量。

仍最多 100 条采购行、全单最多 100 条来源映射，同一行内不得重复关联需求。调用 Production 公开资格校验时先按需求 ID 去重，仍最多 100 个 ID。`normalizePurchaseDraft` 按物料及精确版本拒绝重复行，来源按行去重并核对全单映射条数。

| 契约 | 当前输入与响应 |
| --- | --- |
| 新建／编辑普通采购 | POST／PATCH 必填顶层 supplierId；workOrderId 为 string 或 null，demand 必填 ID、stock 必须 null；items 不接受 supplierId；PATCH 保留主单 version |
| 采购主单列表 | 返回 PurchaseOrderItem，直接含 supplierId/supplierName；不返回 suppliers 集合；workOrderId/workOrderNo 在备料单均为 null |
| 采购主单详情 | 返回 PurchaseOrderDetail，供应商由主单字段表达；每条明细返回 taxExclusiveAmount/taxInclusiveAmount/taxRatePercent/totalAmount/totalAmountSource，不再返回行 supplierId/supplierName |
| 供应商筛选 | supplierId 及 keyword 的供应商名称匹配直接使用主单供应商，分页前过滤主单；订单详情继续完整显示全部行 |
| GET /procurement/demand-work-orders | 只读接口，权限 procurement:orders:view；page/pageSize/keyword → PageResult<{id,workOrderNo}>，仅列至少含一条当前合资格需求的工单 |
| GET /procurement/demand-candidates | workOrderId 必填；batchId 为可选任务筛选且须属于该工单，itemId/demandType/keyword/分页继续可选；返回需求叶子分页及每条需求的任务资料，不增加树形 API |
| POST /procurement/demand-candidates/resolve | {workOrderId,demandIds}；返回各已选 ID 的资格与归属，其他工单项保留并标明阻断原因，不静默丢失；保持只读，不要求幂等键 |
| 相关采购 | 继续逐采购行返回数量与状态；supplierId/supplierName 取该行所属主单，单数按主单去重 |

采购详情行的 `originReceiptNo: string | null` 是 `originReceiptLineId` 所属原到货主单的真实单号，由已有到货明细和主单关联读取；无到货来源时返回 `null`。该只读来源标识随采购详情按 `procurement:orders:view` 返回，不要求到货页面权限，也不因原到货已作废或处理轮已替代而隐藏。单号只补充详情行追溯信息，不进入采购主单列表、写命令或新增存储字段；到货办理接口仍独立校验权限。

工单选项由 `ProductionProcurementQuery.listWorkOrders` 按相同工单／任务／需求资格独立分页提供，不能从当前一页需求反推完整工单列表。`listCandidates` 入参必填 workOrderId；`resolveDemands` 保留现有历史解析签名，由 Procurement 对返回的每项额外比较所选工单。历史来源展示不套当前候选过滤。普通草稿保存及正式下单调用 `requirePurchasableDemands` 后，也须将各来源所属工单与主单逐项比较，不能只信前端筛选。

从任务需求进入采购的定位携带 workOrderId+demandId，由服务端解析后核对归属和资格。缺少工单时先选择工单；已有编辑内容时应用同一工单切换确认，不能凭 URL 参数静默换工单或绕过校验。

正式下单冻结主单供应商、各行物料精确版本、计划量及需求来源，并固定按需主单工单；金额补填与更正遵守下节的专用命令边界，补单原采购、原到货和建单说明保持固定。普通按需写事务先校验 Production 来源根，再锁 Procurement 根与行，并核验唯一供应商。公开 Product 资格及当前数量、状态门禁继续有效。请求规范化、指纹、结果 codec 和幂等 scope 与主单供应商、金额契约保持一致，不把旧逐行供应商请求解释为当前请求。

补单入口从一个已正式下单的原采购主单选择一至多条不同原行，创建一张同补因独立新单。补单主单继承并锁定**原采购主单**供应商；各行继承原行物料精确版本及完整需求来源，按需补单保持原单工单，原需求关闭或工单结束仍不要求重新激活。创建请求不开放 supplierId/workOrderId；补单草稿复用普通 PATCH 完整形状时，主单供应商、行数与顺序以及继承身份必须一致，只能调整逐行计划量、两项单价、税率及手填总额和主单备注。质量退回处置、原到货及原采购行必须保持同源。若要向另一供应商另行购买，应按相应普通采购入口建单，不能改写异常补单的原供应商身份。不跨原采购主单合单，也不让同一补单行绑定多份到货来源。

采购数量按具体采购行自身到货及实际执行展示，其他采购单同物料行的实收或放行不抵补本行。行结束只停止该行新增到货，已到实物待办继续办理。表名与约束见[数据库设计](database.md)。

生产提示通过需求来源的 `supplierHint` 展示，批量取任务需求基础提示，研发取本笔需求提示。提示只是当前生产要求说明，不自动选择实际 supplierId，也不限制库存分配供应商。

## 明细采购单位单价

每条采购明细的 `taxExclusiveAmount`（无税单价）和 `taxInclusiveAmount`（含税单价）均按本行采购单位填写，可任选一项或同时填写；两者都保留人工输入，不相互反算或覆盖，均须校验、持久化并支持后续更正及审计。以下金额和税率在 HTTP、共享函数及持久化边界均使用字符串，不能转成 JavaScript Number 后运算。

| 字段 | 输入及规范化 |
| --- | --- |
| taxExclusiveAmount / taxInclusiveAmount | 可省略或为 null；trim 后空文本归一为 null，否则为最多 100 字符的非负普通十进制字符串，保留原小数精度、尾零和前导零 |
| taxRatePercent | 逐行百分比税率，范围 0～100、最多 4 位小数；省略、null 或空文本取默认值 13，响应为十进制字符串并可带数据库 4 位小数尾零；13 只是可修改的录入默认值，不表示所有采购适用同一税率 |
| manualTotalAmount | 可省略或为 null；空文本归一为 null，否则为最多 128 字符、最多 2 位小数的非负普通十进制字符串；表示本行手填含税总额，0 是有效覆盖值 |

普通十进制要求整数部分存在，小数点后须有数字；拒绝科学记数、负数、货币符号、分隔符及说明文字。采购量仍遵守正整数数量契约。格式或范围非法须拒绝，不能截断、夹取或默认为零。

最终本行含税总额按以下优先级确定：

1. 有手填总额时采用 `manualTotalAmount`，来源为 `manual`，手填 0 同样有效。
2. 否则有含税单价时，按 `taxInclusiveAmount × plannedQuantity` 推算，来源为 `calculated`；两项单价同时填写时使用含税单价，税率不重复参与。
3. 否则有无税单价时，按 `taxExclusiveAmount × plannedQuantity × (1 + taxRatePercent / 100)` 推算，来源为 `calculated`。
4. 手填总额与两项单价均为空时，总额和来源均为 null，不将缺失价格当作零；单价为 0 时仍是有效计算依据。

前后端共同调用 [@company/utils](../../../../../../packages/utils/README.md) 的 `calculatePurchaseLineAmount`，使用 decimal.js 进行十进制运算，中间乘法保持精度，最终总额一次按 `ROUND_HALF_UP` 舍入并规范为 2 位小数，结果不得超过 128 字符。`totalAmount` 与 `totalAmountSource` 由服务端重新计算并成对保存，响应来源仅为 `manual`、`calculated` 或 null。写请求不接受这两个结果字段；不另存手填总额，编辑时仅在来源为 `manual` 时将响应总额投影回 `manualTotalAmount`，防止两份可变总额不一致。

既存 `calculated` 与 `manual` 总额及来源保持持久值，GET 不按当前公式重新计算或写回，也不批量回填历史。只有显式创建／保存草稿、下单、创建补单或正式金额更正时，才按当前输入和公式落库并沿用该命令的审计；手填总额继续优先。

普通及补单草稿可修改单价、采购量、税率和手填总额。改变采购量不改写单价；有手填总额时保留覆盖，无覆盖时实时重新推算。清空手填总额即恢复上述推算规则。补单默认两项单价及手填总额为空、税率为 13，不继承原行报价或手填覆盖；供应商等身份继承规则保持。本能力仅记录和推算采购价款，不提供税务申报、税额台账、结算、付款、财务或库存成本事实，也不参与需求履约、质检或库存资格。物理字段见[采购数据库](database.md#procurement_order_line)。

### 正式下单后的金额更正

正式下单后通过 `POST /procurement/purchase-orders/:id/actions/correct-amounts` 一次补填或更正本单一至多行的两项单价、税率及手填总额；权限为 `procurement:orders:update`。请求必须包含主单 `version`、1～100 条不重复的变更行 `items`，以及 trim 后非空、最多 2000 字的 `reason`。每行须明确包含真实 `id`、行 `version`、`taxExclusiveAmount: string | null`、`taxInclusiveAmount: string | null`、`taxRatePercent: string` 和 `manualTotalAmount: string | null`；缺少字段拒绝，不能将未提供的报价解释为保持或清空。草稿的两项单价仍允许省略。主单为 `ordered` 或 `completed` 且目标行为 `open`／`closed` 时可办，草稿通过草稿编辑办理，已取消采购拒绝；目标行必须全部属于路径中的主单。

四项金额输入分别保留人工约定，不相互反算。单价按本节规则 trim，空文本与 null 表示清空，其余保留原十进制字符串的前导零和尾零；即使最终总额未变，报价字符串发生变化也须保存。修改报价或税率时，有手填总额则保留覆盖；清空手填总额后，按上述优先级与固定采购量重新推算。采购量、供应商、物料身份及需求／补单来源继续冻结。

命令在采购根和行锁内核对全部目标行的归属、状态、版本及金额输入；任一项失败，全批不写入。重复行拒绝；任一行的两项规范化报价字符串、规范化税率及最终总额／来源全部相同时，整批返回 `400 INVALID_PURCHASE_ORDER`，不能借无变化提交推进版本。成功每个变更行 version 递增一次，主单 version 仅递增一次。指纹包括主单 ID／version、按请求顺序保留的各行 ID／version、四项规范化金额输入及原因；首次与重放返回相同根版本，重放不再次推进版本或追加审计。金额计算契约的不兼容变更、版本切换及待确认旧请求按[scope 版本与开发重置](../../../../docs/idempotency.md#13-scope-版本与开发重置)办理。

每次批量成功只写一条 `operation_logs`：`module=procurement`、`action=purchase-order.correct-amounts`、`target_type=purchase_order`、`target_id` 为采购主单 ID，操作者为当前命令用户。`after_data.reason` 保存本次原因；`before_data` 与 `after_data` 各保存根 `version` 和变更行 `items`，每行含 `id/version/taxExclusiveAmount/taxInclusiveAmount/taxRatePercent/totalAmount/totalAmountSource` 前后值。业务更新、成功审计和幂等结果在同一事务提交，不新增金额历史表、不改物流事实；通用审计结构与写入边界见[平台审计](../../../../docs/audit.md)。

## 补单来源与独立物流

超量补单固定引用 originReceiptLineId，fulfillment_mode=existing_receipt，表示“已有到货补购”。创建时来源未作废，且有当前有效可入余量或实际历史已入库事实；未定稿、全待处理、全退回或仅有失效未执行可入记录不提供资格。实际已入通过 Inventory 公开能力在事务内核实。超量单不新增到货、不占原到货分配，详情 quantities=null；到货记录为空，累计量为 0。原采购仍统计完整自身到货及入退，不因补购时间而变化。

质量补单为 new_arrival，固定引用原到货明细并保存供应商补发约定；其新到货、质检、定稿和入退独立办理与统计，不回溯汇总到最初原采购。质量原因由创建时的到货资格确认，采购行不保存分配 ID、分配当前性或具体实际退回 ID。

两类补单创建时原子保存原采购行、原到货明细和说明，不提供无依据建单、独立补关联或跨到货换绑命令。创建检查当前可选资格；已有补单下单只校验固定身份、未作废及供应商／物料等采购资格。补单草稿编辑只调整采购量、两项单价、税率及手填总额与备注，保留锁内读取的主单供应商、原采购行、原到货明细、履约方式和 supplementEvidence。原采购或原到货选错需取消旧草稿后重建；已有自身到货按现有人工结束规则办理。

更正、复检等替代旧轮次时，补单状态、数量和原到货来源保持。来源轮次不参与补单引用身份，也不提供仓库执行授权。取消补单保留原到货历史；非取消补单继续阻断原到货作废。

候选 receiptLinkedSupplements 按同一 origin_receipt_line_id、同一补因汇总，跨轮次并包括已取消状态；count 表示关联明细条数，plannedQuantity 表示这些明细采购量，不表示占用仓库额度。按集合去重来源后汇总，不随候选中的分配条数重复累计。详情原单、到货单号和各明细 ID 不依赖仓储跳转权限。

### 已实际退回后的到货依据

例如本次到货 10 件，先安排可入 8、质量退回 2 并真实退回。剩余 8 重新定稿为全部可入时，当前轮不再生成质量退回分配；实际退回继续引用其原分配并保留真实事实。这份到货仍凭历史质量已退 2 提供新建质量补单资格，已保存该到货来源的补单可继续下单，不要求指向当前轮中不存在的退回分配，也不把历史已退复制为当前待退。演示准备见[演示数据](../../../../../../packages/database/demo/README.md)。

## 整批重办期间的数量展示

到货按 current_round_id 维护整批流程；复检或更正替代未执行授权，真实已入／已退保留。采购行物流始终来自自己的到货：累计到货取非作废登记的当前修订 T，当前可入／待退只取当前正式余量，历史实际入退只计一次。未定稿剩余量归该到货自己的采购行，不分配给补单。

有效可入量包含库管有依据确认的超质检建议正式授权；质量待复检和不放行不能由数量例外绕过。人工拒收及其真实退回计入一般待退／已退，不计为 qualityReturnedQuantity，也不作为质量补发来源。数量变化不改采购状态，人员动作与原因通过通用操作日志追溯。
