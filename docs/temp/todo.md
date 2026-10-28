# 待讨论事项

## 外购入库供应商摘要的保留范围

状态：以下入口仅排查记录，是否整改待决定。交互所有者为[采购与入库管理端设计](../../apps/admin-web/docs/procurement-inbound.md#7-有效放行与实际入库)，此处只保留未决范围和证据，不新增禁用供应商摘要的规则。

[已入库记录](../../apps/admin-web/src/views/warehouse/components/PurchaseInboundHistoryGroups.vue)的入库单组头使用本地 `supplierSummary(order)` 汇聚明细供应商，显示名称及多供应商家数；展开明细又显示各自确认时名称。折叠时是否保留此供应商线索待决定。

[外购入库确认](../../apps/admin-web/src/views/warehouse/components/PurchaseInboundPanel.vue)另有“本次涉及 N 张到货单、M 家供应商，将生成一张外购入库单”的范围提示，按本次选择的真实供应商 ID 去重计数，没有拼接名称集合；是否保留家数提示需单独决定。

采购主单唯一供应商不改变外购实际入库可跨供应商合单的边界。现行[有效放行与实际入库](../../apps/admin-web/docs/procurement-inbound.md#7-有效放行与实际入库)保留上述摘要及家数提示，[Inventory 只读展示契约](../../apps/api/src/modules/inventory/docs/public-contracts.md#只读展示)说明其集合和逐行历史名称来源。若决定移除 UI，须同步所属交互约定；隐藏 UI 不授权删除 API 字段、改写历史快照或把入库主单解释为唯一供应商。
