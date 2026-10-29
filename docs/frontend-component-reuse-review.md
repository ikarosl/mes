# 前端组件复用审查

证据核对日期：2026-10-29，基于当前工作区（含未提交修改）。本文只保留需要单独确定抽离边界的复用候选。

**状态：未批准实施。** 静态重复不表示已发生运行故障，也不构成测试或用户验收结论。是否采纳及实施范围由[路线图](roadmap.md#前端组件复用审查仅记录未批准实施)跟踪；状态所有权和组件职责遵守[管理端架构](../apps/admin-web/docs/architecture.md#1-分层与状态所有权)，本文不新增业务规则。

## FR-02：入库数量编辑区

- 当前证据：[FinishedGoodsInboundDialog.vue](../apps/admin-web/src/views/warehouse/components/FinishedGoodsInboundDialog.vue) 与 [PurchaseInboundPanel.vue](../apps/admin-web/src/views/warehouse/components/PurchaseInboundPanel.vue) 的数量列仍分别实现文本输入、`quantitySummaries` 授权合计、可入量、入库后剩余及错误展示，`quantity-summary` 样式也分别维护。两处已有批次选择与拆分组件，尚未复用数量编辑区。
- 待决：是否在 Warehouse 内抽取纯输入／展示组件，统一接收原始数量文本、单位、摘要、错误和禁用状态；保留两处错误来源及可入量文案的差异，避免为少量展示差异扩大组件职责。
- 抽离边界：授权身份、合计计算、摘要显示位置和提交资格仍由各 editor 决定；输入与拆分行为以[有效放行与实际入库](../apps/admin-web/docs/procurement-inbound.md#7-有效放行与实际入库)为准，不合并两类入库的业务编辑器。

## FR-03／FR-11：领料分配选择与数量校验

- 当前证据：[MaterialOutboundDialog.vue](../apps/admin-web/src/views/production/materials/MaterialOutboundDialog.vue) 与 [MaterialOutboundOrderCreateDialog.vue](../apps/admin-web/src/views/production/materials/MaterialOutboundOrderCreateDialog.vue) 仍重复需求分组、分配行选择、数量列和选中摘要，也分别维护选中集合、逐行数量及正整数／额度校验。两者已共用 `groupMaterialDemandRows`，选择状态和校验尚未共享。
- 待决：是否在 Production 的 `materials` 能力内配套抽取分配行展示组件与选择 composable；先确定规范化行契约，再评估共同部分，避免仅移动模板却保留两套数量处理。
- 适配依据：两处已确认量分别来自 `outboundQuantity` 与 `confirmedOutboundQuantity`，物料身份及单位展示也有差异。调用方须明确适配；批次候选、历史、备注及提交流程仍各有所有者。仓库经 Production 公开入口复用制单弹窗，不改变该能力所有权。
- 抽离边界：展示只接收数据、发出事件；选择 composable 由各 editor 独立实例化，草稿和幂等意图不跨入口共享。生命周期与未知结果处理引用[管理端架构](../apps/admin-web/docs/architecture.md#5-写意图与错误)。

## FR-06：生产批次摘要表

- 当前证据：[WorkOrderDetailDialog.vue](../apps/admin-web/src/views/production/work-orders/WorkOrderDetailDialog.vue) 与 [WorkOrderTransitionDialog.vue](../apps/admin-web/src/views/production/work-orders/WorkOrderTransitionDialog.vue) 仍分别展示批次号、计划数量、当前批准产出和状态；均已复用 `BatchApprovedOutput`。详情另有负责人，状态分别使用文字与标签，关闭核对表另有限高。
- 待决：是否在 Production 的 `work-orders` 能力内抽取批次摘要表，并确定状态展示是否统一、负责人列和限高是否值得作为显式差异保留。
- 抽离边界：只共享摘要展示；新增、编辑和工单关闭命令仍由原 editor 负责，不扩成任意列配置的表格框架。
