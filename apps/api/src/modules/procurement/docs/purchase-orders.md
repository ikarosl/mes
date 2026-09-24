# 采购订单

提供草稿、正式下单、无到货取消、逐行关闭、超量补单及真实质量退回补货。普通采购明确选择 `demand/stock`：按需求主单必填单一 `workOrderId`，可选同工单多个任务的正式需求；备料 `workOrderId=null` 且无需求来源。每行明确选择 `supplierId`，同物料／精确版本／供应商唯一，采购量独立填写正整数，不分摊、不按需求量封顶、不预留库存或回写需求。每单最多 100 行、合计最多 100 条来源映射；同需求在不同供应商行的每次映射分别计数。

共享契约见 `packages/contracts/src/procurement/purchase-orders.ts`，稳定代码及中文映射见 `packages/constants/src/procurement-orders.ts`。数量物理使用整数，响应按 `String(quantity)` 返回整数字符串。列表按创建时间和 ID 倒序分页，详情当前物料名称关联 `materials.id/material_name`，历史来源不受当前需求或物料状态过滤。

## 当前 HTTP 和权限

| 方法与路径（省略 /api） | 权限（省略 procurement:orders:） | 请求 |
| --- | --- | --- |
| GET /procurement/purchase-orders、/:id | view | keyword/supplierId/sourceType/status/originOrderLineId，公共分页；originOrderLineId 精确反查原行的相关独立补单 |
| POST /procurement/purchase-orders | create | workOrderId/sourceType/remark/items（每行 supplierId） |
| PATCH /procurement/purchase-orders/:id | update | 上述完整草稿及 version |
| POST /procurement/purchase-orders/:id/actions/place | place | version |
| POST /procurement/purchase-orders/:id/actions/cancel | cancel | version/reason |
| POST /procurement/purchase-order-lines/:id/actions/close | close | 行 version、reasonType=quality_target/quality_return_completed/manual_end/cancelled、reason |
| POST /procurement/purchase-order-lines/:id/supplements | create | supplementReason、plannedQuantity、supplementEvidence、originReceiptLineId/originAllocationId、remark |
| GET /procurement/purchase-order-lines/:id/excess-receipt-candidates | view | 公共分页、可选 receiptLineId 精确定位；返回本原采购行的真实到货及当前实收／未处置量，供采购页选择超量补单依据 |
| GET /procurement/demand-work-orders | view | page/pageSize/keyword，只返回包含合资格需求的工单 |
| GET /procurement/demand-candidates | view | 必填 workOrderId，分页及 keyword/batchId/itemId/demandType |
| POST /procurement/demand-candidates/resolve | view | workOrderId/demandIds，显式解析每个已选项，异工单返回阻断；只读，无幂等头 |
| GET /procurement/material-options | view | keyword/includeIds，Product 采购窗口候选 |
| GET /procurement/material-variants/options | view | materialId，全量该物料未删版本，允许停用版本 |

GET `/procurement/related-purchases` 接受批量 demandIds 和公共分页，合法查看权限任一：`procurement:orders:view`、`production:tasks:view`、`production:material-demands:view`、`production:materials:view`。响应为分页关联采购行与逐需求 distinct 采购单数；行计划量明确是不分摊的整行数量。当前需求已关闭、被更正、已履约或基础物料停用都不抹去关联历史。查询按集合处理，禁止逐需求 N+1。

六类订单写命令均要求 Idempotency-Key，create/update scope 为 `procurement.purchase-order.create.v2/update.v2`；place/cancel 仍为各自 `.v1`，supplement 使用 `.v3`，行关闭为 `procurement.purchase-order-line.close.v1`。PATCH 同样使用幂等以保证整体替换草稿行的响应不确定时安全重放。application 规范化请求并收窄审计上下文传给 port，平台 executor 与业务、审计复用同一事务。所有写结果为 `{purchaseOrderId,version}`，首次和重放返回同一 codec 快照，再 GET 当前详情。

## 当前状态、来源与事务

物料行 `open` 前端显示为“进行中”，同时适用于新到货与既有到货承接，不表示已经收齐或可以自动结束。

### 采购主单

| 当前状态 | 变为 | 发生条件 |
| --- | --- | --- |
| 未创建 | 草稿 `draft` | 新建采购单或独立补单成功。 |
| 草稿 `draft` | 已下单 `ordered` | 人员确认正式下单，供应商、物料、需求来源或补单依据等校验通过；全部物料行同时进入“进行中”。 |
| 草稿 `draft` | 已取消 `cancelled` | 人员填写原因取消整单。 |
| 已下单 `ordered` | 已完成 `completed` | 人员逐行处理后，全部物料行均已结束或已取消，且至少一行已结束；主单自动汇总为已完成。 |
| 已下单 `ordered` | 已取消 `cancelled` | 全部物料行均被取消；或人员取消整单且整单从未登记到货、从未承接正式分配、没有已结束的物料行。 |
| 已完成 `completed` | 无后续状态 | 终态，不重开。 |
| 已取消 `cancelled` | 无后续状态 | 终态，不恢复。 |

### 采购物料行

| 当前状态 | 变为 | 发生条件 |
| --- | --- | --- |
| 未创建 | 草稿 `draft` | 随采购主单创建物料行。 |
| 草稿 `draft` | 进行中 `open` | 所属采购主单正式下单成功。 |
| 草稿 `draft` | 已取消 `cancelled` | 所属采购草稿被整单取消。 |
| 进行中 `open` | 已结束 `closed` | 人员填写原因，按下表任一关闭依据确认结束。 |
| 进行中 `open` | 已取消 `cancelled` | 人员按“无到货取消”处理本行：从未登记到货，也从未承接正式分配；或所属整单满足取消条件并被取消。 |
| 已结束 `closed` | 无后续状态 | 终态，不重开，不再接受该行新增到货。 |
| 已取消 `cancelled` | 无后续状态 | 终态，不恢复，不接受新增到货。 |

### 物料行“已结束”的三种依据

下列条件只提供关闭资格，均需人员确认，不会因数量达到条件自动关闭物料行。

| 关闭依据 | 发生条件 |
| --- | --- |
| 质检达标 `quality_target` | 本行正式可入库余量＋实际已入库量 ≥ 本行计划采购量。不要求已经全部入库。 |
| 质量退回处置完成 `quality_return_completed` | 本行实收量 ≥ 计划量；正式可入库余量＋实际已入库量 < 计划量；无未检／未定稿／待处理数量、无待退数量、无进行中的检验或复核；正式可入库余量＋实际已入库量＋实际质量退回量 ≥ 计划量。 |
| 人工结束 `manual_end` | 人员决定不再继续收货并填写原因；允许少收、尚未达标或仍有原到货物流待办时结束。 |

### 不触发采购状态变化的情况

| 情况 | 状态处理 |
| --- | --- |
| 修改并保存草稿 | 仍为草稿，不自动下单。 |
| 到货、质检、清单定稿、入库或实际退回 | 不直接改变采购主单／物料行状态；数量满足条件也只提供关闭资格。 |
| 部分物料行结束或取消，仍有进行中行 | 主单仍为已下单。 |
| 新建、下单或完成补单 | 原采购单状态不变；原单关闭与补单办理相互独立。 |
| 原单已完成后，更正或继续办理原到货的检验、清单、入库、退回 | 原单保持已完成，不因物流变化重新打开。 |
| 已登记到货后将实收更正为零 | 不恢复“无到货取消”资格。 |

表中数量均按本采购行的有效归属统计，不叠加历史清单，不把独立补单的履约量加回原行。超量承接补单虽使用 `open` 状态，但承接已有到货，不另登记一次到货。

草稿修改完整替换未生效行和来源映射；已下单供应商、精确身份、计划量和来源冻结，修改命令拒绝。每次根修改 version 递增；逐行关闭校验行 version 后同时推进根 version。管理端草稿、并发和候选约束见[采购专题](../../../../../admin-web/docs/procurement-inbound.md)。

### 来源资格与锁序

普通草稿保存及正式下单经 `ProductionProcurementQuery.requirePurchasableDemands` 校验并锁工单、任务、需求；采购根锁定后才经 `ProductInventoryEligibility.requirePurchasableReferences` 取得采购资格及编码／单位快照。正式下单重新读取资格并更新最终快照，基础物料／分类必须有效，精确版本允许停用。供应商始终按稳定 ID 核验未删。

下单先非锁定位草稿来源，再按 Production 根 → Procurement 原根／当前根（数值 ID 排序）→ 供应商与采购行 → Product 锁序办理。取得采购根后检查版本及完整来源映射未变化，变化即失败，不继续补锁新的 Production 根。锁后业务读取使用当前锁读；无锁定位结果只用于确定锁集合。新增单没有已存在的采购根，先核供应商后插入新根，再检查 Product 并写行。写入失败全部回滚。

超量补单是独立单号、ID 和草稿，仅允许引用已正式下单的原行，继承供应商、来源类别和完整需求关联。旧需求资格不重新判定、不重开，不因来源后来关闭而失去追溯；Product 和供应商仍重新核验。要求真实到货引用及非空现场依据文字。补单草稿只调整数量及备注，原身份和依据保持；超量补单按已到货承接规则核验绑定，质量补发不设累计补发额度或次数上限。

采购页的超量补单到货候选独立使用 `procurement:orders:view`，不借用到货管理页权限。候选严格按原采购行读取，不把相同物料的其他采购到货混入；允许原采购已关闭、到货已执行完的历史事实作为依据，未处置量只是参考，不改变创建补单及定稿绑定的服务端资格规则。列表按到货时间和明细 ID 倒序分页，`receiptLineId` 仅在该原行内精确解析，用于跨页面定位。

采购行详情批量返回当前 quantities 与 allowedCloseReasons，读写复用 `allowedPurchaseOrderClosureReasons`。取消要求从未有任何到货明细，实收更正为零仍不能取消。关闭根据锁内当前修订、有效范围、Quality 未完成复核、实际退回和 Inventory 累计入库计算 A/U/L/I/J/R/R质量：质检达标 L>=计划；质量退回处置完成 A>=计划、L<计划、U=0、无待退、L+R质量>=计划且无复核；人工结束必须说明原因。正常关闭不要求已经全部入库，关闭事实冻结当时依据 ID 与数量，后续修订和物流不覆盖关闭事实或重开采购。

质量补发必须提交原采购行、originReceiptLineId、originAllocationId 及非空 supplementEvidence（供应商补发约定）。引用同次到货正式清单中 disposition=return、return_reason=quality 的分配明细；创建及正式下单均在原采购根锁内确认仍有该分配的质量待退或已退范围。被更正取消或全部进入复核的旧处置不可新建或下单，不能只引用历史检验不合格数。超发及采购终止退回不适用。允许先补后退，不要求实际退回或原单关闭；补发不自动登记退回、不关闭原单、不新增需求。实际退回独立通过相同 allocation_id 追溯。补单保留原来源映射，不按既有补单累计量限制补发；采购核对约定数量与相关补单，Product 与供应商资格仍重新检查。

成功审计 action 为 `purchase-order.create/update/place/cancel/supplement` 或 `purchase-order-line.close`，同业务事务写入。验证与验收顺序遵守 [AGENTS.md](../../../../../../AGENTS.md#数据库与交付约定)。

## 明细供应商与单工单来源

按需求采购限定单一工单，可跨该工单任务选择正式需求；分页单位为需求，不能从当前页推断该任务的全部需求。更换工单后必须重新明确来源并核对明细，不可将原需求静默改归属。独立备料不填写工单、任务或需求，也不自动回绑后来的需求。

每条普通采购明细的供应商由用户手动输入检索并明确选择现有供应商，保存 `items[].supplierId`。未配置的供应商先到名称配置页新增，再返回选用；不隐式建供应商，不用自由文本替代稳定 ID，不设主单供应商或从主单批量复制。同一单允许不同明细选择不同供应商。

同单以 `(itemId,materialVariantId,supplierId)` 识别物料行：同物料版本、不同供应商保留独立行；完全相同的三项由用户归并为一行，来源 demandIds 去重，计划总量由用户确认，后端拒绝未归并的重复行，不静默合量或以需求参考量自动分摊。相同需求可以追溯到不同供应商的采购行，关联采购单数仍按主单 ID 去重，不能把每行全量都算作该需求已采购量。

仍最多 100 条采购行、全单最多 100 条来源映射；同一需求关联不同供应商行时，每条映射分别计数，同一行内不得重复关联。调用 Production 公开资格校验时先按需求 ID 去重，仍最多 100 个 ID。`normalizePurchaseDraft` 按三元身份拒绝重复行，来源按行去重并核对全单映射条数。需求归组后拆分供应商行时，由用户明确确认各行来源，不能自动分摊或推算采购量。

| 契约 | 当前输入与响应 |
| --- | --- |
| 新建／编辑普通采购 | POST／PATCH 不接受顶层 supplierId；workOrderId 为 string 或 null，demand 必填 ID、stock 必须 null；每条 items 必填 supplierId；PATCH 保留主单 version，旧主单供应商形状不兼容接收 |
| 采购主单列表／详情 | 头部不返回 supplierId/supplierName；返回去重 suppliers: {id,supplierName}[]、workOrderId/workOrderNo（备料均为 null）；明细返回自己的 supplierId/supplierName |
| 供应商筛选 | supplierId 使用采购明细 EXISTS 条件，分页前过滤主单并保持主单去重；订单详情继续完整显示全部行，不能把匹配行当作整单 |
| GET /procurement/demand-work-orders | 只读接口，权限 procurement:orders:view；page/pageSize/keyword → PageResult<{id,workOrderNo}>，仅列至少含一条当前合资格需求的工单 |
| GET /procurement/demand-candidates | workOrderId 必填；batchId 为可选任务筛选且须属于该工单，itemId/demandType/keyword/分页继续可选；返回需求叶子分页及每条需求的任务资料，不增加树形 API |
| POST /procurement/demand-candidates/resolve | {workOrderId,demandIds}；返回各已选 ID 的资格与归属，其他工单项保留并标明阻断原因，不静默丢失；保持只读，不要求幂等键 |
| 相关采购 | 继续逐采购行返回数量与状态；supplierId/supplierName 取该行，保留同单不同供应商行，单数按主单去重 |

工单选项由 `ProductionProcurementQuery.listWorkOrders` 按相同工单／任务／需求资格独立分页提供，不能从当前一页需求反推完整工单列表。`listCandidates` 入参必填 workOrderId；`resolveDemands` 保留现有历史解析签名，由 Procurement 对返回的每项额外比较所选工单。历史来源展示不套当前候选过滤。普通草稿保存及正式下单调用 `requirePurchasableDemands` 后，也须将各来源所属工单与主单逐项比较，不能只信前端筛选。

从任务需求进入采购的定位携带 workOrderId+demandId，由服务端解析后核对归属和资格。缺少工单时先选择工单；已有编辑内容时应用同一工单切换确认，不能凭 URL 参数静默换工单或绕过校验。

正式下单冻结每行供应商、物料精确版本、计划量及来源，并固定按需主单工单。普通按需写事务先校验 Production 来源根，再锁 Procurement 根与行；供应商按 ID 去重并以数值顺序锁定／校验，避免多行多供应商交叉锁。公开 Product 资格及当前数量、状态门禁继续有效。请求规范化、指纹、结果 codec 和幂等 scope 必须随契约切换审视，不能把新请求解释为旧主单供应商契约。

补单入口只从一个原采购行创建单行独立新单。补单继承并锁定**原采购行**的供应商、物料精确版本和来源类别；按需补单保持原单工单，原需求关闭或工单结束仍不要求重新激活。创建请求不开放 supplierId/workOrderId；补单草稿复用普通 PATCH 完整形状时，这些身份字段必须与继承值一致，只能调整现有补单规则允许的数量和备注。质量补发的正式质量退回处置、原到货及原采购行必须同属该供应商；超量补单也沿所引用原行追溯，不从多供应商主单随意选一个供应商。若要向另一供应商另行购买，应按相应普通采购入口建单，不能改写异常补单的原供应商身份。不扩大为多原单、多行补单。

关闭继续以具体采购行判断 Q/A/U/L/I/J/R，其他供应商同物料行的实收或放行不能抵补。行关闭只停止该行新增到货；主单完成仍由所有行终态聚合，已到实物待办不随主单完成消失。表名与约束见[数据库设计](database.md)。

生产提示通过需求来源的 `supplierHint` 展示，批量取任务需求基础提示，研发取本笔需求提示。提示只是当前生产要求说明，不自动选择实际 supplierId，也不限制库存分配供应商。

## 已到货补单与正式履约

超量补单必须引用originReceiptLineId，fulfillment_mode为existing_receipt；正式下单后由库管在原到货核对清单绑定合格可入量，首绑量等于补单计划，不走第二次到货或质检。后续整批重新定稿保留原绑定采购归属，并对数量调整记录依据，不能重复占用补单。quality_replacement引用正式质量退回分配及供应商约定，实际退回独立办理，fulfillment_mode为new_arrival，新补发另登记到货。详见[正式清单](receipt-acceptance.md)。

关闭统计改为归属本采购行的有效正式分配及实际入库/退回，不叠加历史清单或原始QC整批上限。取消同时拒绝已有到货及承接事实；人工关闭只终止新增到货，现存实物仍由库管核对并决定处置，不自动把未检量指定待退。原单与补单锁根按数值顺序共同取得，避免承接/关闭/取消反向锁序。

## 整批重办期间的数量展示

到货按current_round_id维护整批流程。复检或独立实收更正一起替代本批未实际处置份额，已入/已退事实保留；草稿阶段没有待检scope，未判定量由当前实收减真实处置得到。与前轮未处置总量相同时沿旧分配保持采购归属；总量不同则暂显示为原到货采购行未判定，已绑定补单保留暂停标记和原关联，待库管重新定稿确认分配。不推算补单新可入量或恢复首次承接资格。

达标关闭的有效可入量包含库管有依据确认的超质检建议正式授权；质量待复检和不放行不能由数量例外绕过。人工拒收及其真实退回计入一般待退/已退，不能计为quality_returned或冒充质量补发来源。人工关单状态机不变，关闭证据保留当时轮次、范围及物流事实。
