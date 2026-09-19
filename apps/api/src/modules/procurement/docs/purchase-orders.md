# 采购订单

当前能力为草稿、正式下单、无到货取消、逐行关闭、超量补单及真实质量退回补货。普通采购明确选择 `demand/stock`，不可混合；按需求逐条关联已存在的正式需求，允许同供应商跨工单／任务合单，精确物料版本合并一行。每行独立填写正整数计划量，不按需求分摊、不受需求量封顶、不预留库存或回写需求。每单最多 100 行、合计最多 100 条需求来源。

共享契约见 `packages/contracts/src/procurement/purchase-orders.ts`，稳定代码及中文映射见 `packages/constants/src/procurement-orders.ts`。数量物理使用整数，响应按 `String(quantity)` 返回整数字符串。列表按创建时间和 ID 倒序分页，详情当前物料名称关联 `materials.id/material_name`，历史来源不受当前需求或物料状态过滤。

## HTTP 和权限

| 方法与路径（省略 /api） | 权限（省略 procurement:orders:） | 请求 |
| --- | --- | --- |
| GET /procurement/purchase-orders、/:id | view | keyword/supplierId/sourceType/status/originOrderLineId，公共分页；originOrderLineId 精确反查原行的相关独立补单 |
| POST /procurement/purchase-orders | create | supplierId/sourceType/remark/items |
| PATCH /procurement/purchase-orders/:id | update | 上述完整草稿及 version |
| POST /procurement/purchase-orders/:id/actions/place | place | version |
| POST /procurement/purchase-orders/:id/actions/cancel | cancel | version/reason |
| POST /procurement/purchase-order-lines/:id/actions/close | close | 行 version、reasonType=quality_target/quality_return_completed/manual_end/cancelled、reason |
| POST /procurement/purchase-order-lines/:id/supplements | create | supplementReason、plannedQuantity、supplementEvidence、originReceiptLineId/originSupplierReturnId、remark |
| GET /procurement/demand-candidates | view | 分页及 keyword/workOrderId/batchId/itemId/demandType |
| POST /procurement/demand-candidates/resolve | view | demandIds，显式解析已选项；只读，无幂等头 |
| GET /procurement/material-options | view | keyword/includeIds，Product 采购窗口候选 |
| GET /procurement/material-variants/options | view | materialId，全量该物料未删版本，允许停用版本 |

GET `/procurement/related-purchases` 接受批量 demandIds 和公共分页，合法查看权限任一：`procurement:orders:view`、`production:tasks:view`、`production:material-demands:view`、`production:materials:view`。响应为分页关联采购行与逐需求 distinct 采购单数；行计划量明确是不分摊的整行数量。当前需求已关闭、被更正、已履约或基础物料停用都不抹去关联历史。查询按集合处理，禁止逐需求 N+1。

六类订单写命令均要求 Idempotency-Key，scope 分别为 `procurement.purchase-order.create/update/place/cancel/supplement.v1` 与 `procurement.purchase-order-line.close.v1`。PATCH 同样使用幂等以保证整体替换草稿行的响应不确定时安全重放。application 规范化请求并收窄审计上下文传给 port，平台 executor 与业务、审计复用同一事务。所有写结果为 `{purchaseOrderId,version}`，首次和重放返回同一 codec 快照，再 GET 当前详情。

## 状态、来源与事务

主单 `draft -> ordered/cancelled`；已下单在全部行关闭后 `completed`，全部取消时 `cancelled`。行 `draft -> open/cancelled`，`open -> closed/cancelled`；终态不重开。草稿修改完整替换未生效行和来源映射；已下单供应商、精确身份、计划量和来源冻结，修改命令拒绝。每次根修改 version 递增；逐行关闭校验行 version 后同时推进根 version。

普通草稿保存及正式下单经 `ProductionProcurementQuery.requirePurchasableDemands` 校验并锁工单、任务、需求；采购根锁定后才经 `ProductInventoryEligibility.requirePurchasableReferences` 取得采购资格及编码／单位快照。正式下单重新读取资格并更新最终快照，基础物料／分类必须有效，精确版本允许停用。供应商始终按稳定 ID 核验未删。

下单先非锁定位草稿来源，再按 Production 根 → Procurement 原根／当前根（数值 ID 排序）→ 供应商与采购行 → Product 锁序办理。取得采购根后检查版本及完整来源映射未变化，变化即失败，不继续补锁新的 Production 根。锁后业务读取使用当前锁读；无锁定位结果只用于确定锁集合。新增单没有已存在的采购根，先核供应商后插入新根，再检查 Product 并写行。写入失败全部回滚。

超量补单是独立单号、ID 和草稿，仅允许引用已正式下单的原行，继承供应商、来源类别和完整需求关联。旧需求资格不重新判定、不重开，不因来源后来关闭而失去追溯；Product 和供应商仍重新核验。要求非空现场依据文字，不强迫虚记原到货。补单草稿只调整数量及备注，原身份和依据保持，计划量和次数无累计额度限制。

采购行详情批量返回当前 quantities 与 allowedCloseReasons，读写复用 `allowedPurchaseOrderClosureReasons`。取消要求从未有任何到货明细，实收更正为零仍不能取消。关闭根据锁内当前修订、有效范围、Quality 未完成复核、实际退回和 Inventory 累计入库计算 A/U/L/I/J/R/R质量：质检达标 L>=计划；质量退回处置完成 A>=计划、L<计划、U=0、无待退、L+R质量>=计划且无复核；人工结束必须说明原因。正常关闭不要求已经全部入库，关闭事实冻结当时依据 ID 与数量，后续修订和物流不覆盖关闭事实或重开采购。

质量补货必须提交原采购行、originReceiptLineId 和已实际确认的 originSupplierReturnId，锁内核实其 reason_type=quality 及归属。采购终止退回不能发起质量补货。补单保留原来源映射，不受原单关闭限制；不按既有补单累计量限制新补购。新采购仍重新检查 Product 与供应商资格。

成功审计 action 为 `purchase-order.create/update/place/cancel/supplement` 或 `purchase-order-line.close`，同业务事务写入。无正式测试集；类型、架构和构建通过后由用户进行黑盒与 UI 验收。
