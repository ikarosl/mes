# 待讨论事项

## 供应商聚合展示的保留范围

状态：以下入口仅排查记录，是否整改待决定。本事项的交互所有者为[采购与入库管理端设计](../../apps/admin-web/docs/procurement-inbound.md)，此处只保留未决范围和证据，不新增全局禁用聚合展示的规则。

管理端当前共有 **4 处供应商名称集合展示，分布于 3 个组件**：

| 入口 | 代码证据 | 当前语义与待讨论影响 |
| --- | --- | --- |
| 采购到货 → 记录到货 → 选择采购单列表 | [ReceiptCreateDialog.vue](../../apps/admin-web/src/views/procurement/components/ReceiptCreateDialog.vue#L53)，`supplierSummary(row.suppliers)` | 用采购单供应商集合辅助选单，尚未进入逐行录入。是否保留该选单线索待决定。 |
| 采购到货 → 记录到货 → 已选采购单顶部 | [ReceiptCreateDialog.vue](../../apps/admin-web/src/views/procurement/components/ReceiptCreateDialog.vue#L92)，`supplierSummary(order.suppliers)` | 展示完整采购单的供应商集合，明细又逐行显示实际供应商；本次可以只登记部分采购行，顶部集合不等于本次实际到货涉及的供应商。是否移除待决定。 |
| 到货详情 → 作废整张到货登记 | [ReceiptVoidDialog.vue](../../apps/admin-web/src/views/procurement/components/ReceiptVoidDialog.vue#L40)，`supplierSummary(detail.suppliers)` | 顶部集合用于整单核对，下方完整明细已有供应商列；是否仅保留逐行信息待决定，不能据此缩小整单作废范围。 |
| 物料入库 → 外购物料 → 已入库记录的入库单组头 | [PurchaseInboundHistoryGroups.vue](../../apps/admin-web/src/views/warehouse/components/PurchaseInboundHistoryGroups.vue#L25)，本地 `supplierSummary(order)` 定义于第 283 行 | 按入库主单汇聚明细供应商，显示名称及多供应商家数；展开明细又逐行显示确认时名称。折叠时是否仍需供应商线索待决定。 |

到货相关的两个组件共用 [supplier-summary.ts](../../apps/admin-web/src/views/procurement/supplier-summary.ts#L3)，将服务端集合的名称用顿号连接；入库历史有独立实现。只调整一个 helper 不能覆盖全部入口，也不能代替按场景决定信息位置。

另外，外购入库确认的 [PurchaseInboundPanel.vue](../../apps/admin-web/src/views/warehouse/components/PurchaseInboundPanel.vue#L221) 展示“本次涉及 N 张到货单、M 家供应商，将生成一张外购入库单”；第 505 行按本次所选明细的供应商 ID 去重计数。这里**仅提示合单范围，没有拼接供应商名称集合**，不纳入上表 4 处；是否保留家数提示需单独决定。

现行依据需与整改范围一并核对：

- [管理端当前交互边界](../../apps/admin-web/docs/procurement-inbound.md#1-当前交互边界)已区分逐行供应商和展示摘要；[到货选单查询契约](../../apps/api/src/modules/procurement/docs/receipt-queries.md#接口和权限)明确保留选单候选及详情的供应商汇总。因此选单摘要不能直接判定为违反现行约定。
- [有效放行与实际入库](../../apps/admin-web/docs/procurement-inbound.md#7-有效放行与实际入库)明确要求入库确认的供应商家数提示和已入库头部集合；[Inventory 只读展示契约](../../apps/api/src/modules/inventory/docs/public-contracts.md#只读展示)说明其集合及逐行历史名称来源。若决定移除这些 UI，需同步所属交互约定；隐藏 UI 不自动授权删除 API 字段或改变历史供应商语义。

排除范围：`PurchaseSupplierSelect` 是逐采购行选择单个供应商的候选控件；`PurchaseOrderLines`、`ReceiptWorklist`、`ReceiptLineSummary`、`InboundInspectionSummary` 和待入库明细中的供应商是行级身份，均不是上述聚合展示。普通采购主单列表及关联补单列表未发现供应商名称集合渲染；不能因采购详情契约含 `suppliers` 就推断页面一定展示了集合。
