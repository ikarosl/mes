# 前端组件复用审查

审查日期：2026-09-29。依据当前工作区（含既有未提交修改），由三个 GPT-6 Sol MAX 子代理分别审查采购／质检／仓库、生产、产品／系统／审批，主代理复核主要证据。

**状态：仅记录问题与建议，未批准实施。** 用户明确要求不直接改动代码。本轮不抽离组件、不修正业务逻辑、不修改正式测试。以下“高／中／低”表示复用收益与建议处理顺序，不是运行故障严重程度。静态重复不等于已发生功能缺陷，也不等于本次覆盖了所有运行时问题。

后续决策统一由[路线图](roadmap.md#前端组件复用审查仅记录未批准实施)跟踪。状态所有权、组件职责和生命周期以[管理端架构](../apps/admin-web/docs/architecture.md)为准，视觉以[视觉设计](../apps/admin-web/docs/visual-design.md)为准，拆分与字典规则以[编码规范](coding-standards.md)为准；本文不新增业务规则。文件行号是审查时定位，后续编辑可能变化。

## 1. 问题清单

| 编号 | 项目 | 优先级 | 建议形式 | 当前结论 |
| --- | --- | --- | --- | --- |
| FR-01 | 产品／物料规格参数编辑表重复 | 高 | Product 模块组件 | 值得抽离，保留父级初始化差异 |
| FR-02 | 两类入库数量输入及额度摘要重复 | 高 | Warehouse 模块组件 | 值得抽离纯输入与展示部分 |
| FR-03 | 两个领料制单入口的分配选择表重复 | 高 | Production 模块组件 | 值得抽离，先适配不同字段契约 |
| FR-04 | 用户／角色页重复实现已有分页组件 | 高 | 采用现有组件 | 保留原分页事件与布局 |
| FR-05 | 日志页独立分页，公共组件缺固定页容量模式 | 中 | 公共组件可选能力 | 不直接替换导致新增页容量操作 |
| FR-06 | 三处生产批次摘要表重复 | 中 | Production 模块组件 | 核心列共享，业务动作留在父级 |
| FR-07 | 单据分组折叠按钮结构重复 | 中 | 公共展示组件 | CSS 已复用，只收敛按钮结构与事件 |
| FR-08 | 外购入库单／多供应商分区组操作重复 | 中 | Warehouse 模块组件 | 仅封装组选择与核对入口 |
| FR-09 | 四个仓储页关键词／状态筛选条重复 | 低 | Warehouse 模块组件 | 可选，不扩成通用列表框架 |
| FR-10 | 生产常驻说明尚未采用 InlineHint | 低 | 采用现有组件 | 视觉一致性候选，不替换阻断告警 |
| FR-11 | 领料选择集合与数量校验逻辑重复 | 中 | Production composable | 与 FR-03 配套，不能塞进展示组件 |
| FR-12 | 多页查询／表格容器样式重复 | 低 | CSS／设计 token | 不需要新增业务组件 |
| FR-13 | 路线步骤读取逻辑分散 | 低 | 窄读取 composable | 待读取与编辑生命周期核对 |
| FR-14 | 产品启停状态编码及中文映射散落模板 | 中 | 常量／展示 helper | 先收敛映射，再评估标签组件 |
| FR-15 | 两个系统角色多选模板重复 | 低 | 可选模块组件 | 重复较小，当前可暂缓 |

## 2. 值得抽离或采用现有组件的项目

### FR-01：规格参数编辑器

- 证据：[ProductFormDialog.vue](../apps/admin-web/src/views/product/components/ProductFormDialog.vue) 第 101–161 行与 [MaterialFormDialog.vue](../apps/admin-web/src/views/product/components/MaterialFormDialog.vue) 第 93–150 行重复新增按钮、参数名称／值／单位输入、删除操作；对应增删函数和表格样式也重复。
- 建议：`views/product/components/SpecValuesEditor.vue`，接收 `modelValue` 和占位文案，通过 `update:modelValue` 返回新值。保存、整表校验和数据加载仍由父表单负责，不直接修改传入对象。
- 边界：产品表单第 280 行附近在空规格时补一行，物料表单没有相同初始化行为；不能在公共编辑器内默认补行。产品与物料整体表单的字段及约束不同，不合并整张表单。

### FR-02：入库数量编辑区

- 证据：[FinishedGoodsInboundDialog.vue](../apps/admin-web/src/views/warehouse/components/FinishedGoodsInboundDialog.vue) 第 170–220 行与 [PurchaseInboundPanel.vue](../apps/admin-web/src/views/warehouse/components/PurchaseInboundPanel.vue) 第 284–334 行重复数量输入、同授权目标合计、可入量、入库后剩余及错误展示；样式分别重复于第 693 行和第 680 行附近。
- 建议：`views/warehouse/components/InboundQuantityEditor.vue`，接收 `quantity/unit/summary/error/disabled/ariaLabel`，发出 `update:quantity`。`summary` 只包含展示需要的 `count/valid/total/allowance/after`。
- 边界：授权聚合、可提交资格、错误计算、原始非法输入保留以及“同授权只在首条目标显示摘要”由原 editor 决定。组件不请求 API，不自行重算额度，不改变拆分或幂等行为。现有 `InboundBatchTargetPicker`、`InboundSplitControl` 继续承担各自职责。

### FR-03：领料分配行选择器

- 证据：[MaterialOutboundDialog.vue](../apps/admin-web/src/views/production/components/MaterialOutboundDialog.vue) 第 21–111 行与 [MaterialOutboundOrderCreateDialog.vue](../apps/admin-web/src/views/production/components/MaterialOutboundOrderCreateDialog.vue) 第 86–172 行重复需求组标题、分配行勾选、分配／已确认／待确认占用／可制单数量、本次数量输入和选中摘要。后者也用于仓储出库入口，但业务组件所有者仍是 Production。
- 建议：`views/production/components/MaterialOutboundAllocationPicker.vue`，接收规范化分配组、选中 ID 和逐行数量，发出选择与数量变化事件。
- 边界：两处“已确认”分别使用 `outboundQuantity` 与 `confirmedOutboundQuantity`，物料身份及单位展示也有差异；须由调用方按现有契约适配，不能因外观相似直接混用字段。批次候选、备注、历史、提交、关闭保护和幂等意图保留在各自 editor。选择逻辑见 FR-11。

### FR-04：用户／角色页采用现有分页

- 证据：[UsersPage.vue](../apps/admin-web/src/views/system/UsersPage.vue) 第 212–239 行、[RolesPage.vue](../apps/admin-web/src/views/system/RolesPage.vue) 第 167–194 行手写总数、10／20／50 条选择及分页，已存在 [PaginationFooter.vue](../apps/admin-web/src/components/PaginationFooter.vue)。两个页面也有各自分页样式。
- 建议：直接复用已有组件，接入 `total/currentPage/pageSize/layout` 和 `update:pageSize/pageChange`，不另造分页包装。
- 边界：用户页当前没有 jumper，角色页有；切换页容量后重置页码及读取由原列表处理。公共组件与现有系统页的尺寸、间距存在差异，后续需 UI 核对，不把替换记为无视觉变化。

### FR-05：日志分页保持固定页容量

- 证据：[LogsPage.vue](../apps/admin-web/src/views/system/LogsPage.vue) 第 214–223 行只有总数与页码，第 291–292 行附近固定每页 10 条；`PaginationFooter` 当前总是显示页容量选择。
- 建议：若统一到已有分页组件，可先评估 `showPageSize=false` 一类可选展示能力，再接入日志列表。
- 边界：不能为消除重复，未经确认就给日志页增加页容量切换；本项不是新建第二个分页组件的理由。

### FR-06：生产批次摘要表

- 证据：[BatchListDialog.vue](../apps/admin-web/src/views/production/components/BatchListDialog.vue) 第 26–100 行、[WorkOrderDetailDialog.vue](../apps/admin-web/src/views/production/components/WorkOrderDetailDialog.vue) 第 201–244 行、[WorkOrderTransitionDialog.vue](../apps/admin-web/src/views/production/components/WorkOrderTransitionDialog.vue) 第 40–85 行重复批次号、计划量、末工序正常报工量、当前批准产出和状态。
- 建议：`views/production/components/ProductionBatchSummaryTable.vue`，接收 `ProductionBatchItem[]`，按实际差异提供 `showDates/showOwner/maxHeight`，用 `actions` 插槽承载已有编辑动作。内部继续使用 `BatchApprovedOutput`。
- 边界：新增批次、编辑及工单关闭命令不进入该表。当前一处状态为文字、两处为标签，统一前需确认展示方式；不扩成任意列配置的表格引擎。

### FR-07：分组折叠按钮

- 证据：[InboundInspectionsPage.vue](../apps/admin-web/src/views/quality/InboundInspectionsPage.vue) 第 105–120 行、[FinishedInspectionsPage.vue](../apps/admin-web/src/views/quality/FinishedInspectionsPage.vue) 第 102–117 行重复箭头、展开／收起文案和 `aria-expanded`。入库单据块头已有模块内 [InboundGroupHeader.vue](../apps/admin-web/src/views/warehouse/components/InboundGroupHeader.vue)，不作为新增通用组件的重复实现证据。
- 建议：`src/components/BusinessDisclosureButton.vue`，接收 `expanded`，标题使用 slot，按需提供动作文案，发出 `toggle`。全局 [index.css](../apps/admin-web/src/styles/index.css) 第 179 行起已经共享外观，不再另造主题。
- 边界：折叠 Set、按对象保留／重置、分页和数据读取由各页持有。无需把 `details`、`el-collapse` 及表格展开全部统一成同一状态模型；简短规则提示仍应直接显示。

### FR-08：外购入库组操作

- 证据：[PurchaseInboundReleaseGroups.vue](../apps/admin-web/src/views/warehouse/components/PurchaseInboundReleaseGroups.vue) 第 43–65 行与第 85–109 行分别在单供应商组和多供应商分区实现相同的复选框、部分选中、禁用、核对入口及“加入已选”文案。
- 建议：模块内 `PurchaseInboundGroupActions.vue`，接收 `checked/indeterminate/disabled/reviewLabel/ariaLabel`，发出 `change/review`。
- 边界：跨页选择、数量上限及组成员归属仍由父级计算；外购物料跨供应商规则见 [ADR-0018](adr/0018-purchase-inbound-multiple-suppliers.md)。不将整个 `usePurchaseInboundReleases` 对象传入新组件，也不移动业务资格判断。

### FR-09：仓储关键词／状态筛选条

- 证据：[ReturnOrdersPage.vue](../apps/admin-web/src/views/warehouse/ReturnOrdersPage.vue) 第 3–40 行、[StockChecksPage.vue](../apps/admin-web/src/views/warehouse/StockChecksPage.vue) 第 3–39 行、[ScrapsPage.vue](../apps/admin-web/src/views/warehouse/ScrapsPage.vue) 第 3–36 行、[OutboundOrdersPage.vue](../apps/admin-web/src/views/warehouse/OutboundOrdersPage.vue) 第 3–41 行都有关键词、状态、查询与重置。
- 建议：可选的 `views/warehouse/components/KeywordStatusFilter.vue`，传值、候选和占位文案，发出值更新、`search/reset`。收益主要是输入与键盘交互一致。
- 边界：筛选含义、枚举、分页重置及请求归各列表。收益有限，若为保留差异需要大量条件 props，可继续保留现状；不扩成通用 CRUD 页面。

### FR-10：生产常驻说明采用 InlineHint

- 证据：[WorkerTasksPage.vue](../apps/admin-web/src/views/production/WorkerTasksPage.vue) 第 26 行、[ProductionTracePage.vue](../apps/admin-web/src/views/production/ProductionTracePage.vue) 第 52 行的常驻规则／范围说明仍使用 `el-alert`；现有 [InlineHint.vue](../apps/admin-web/src/components/InlineHint.vue) 已用于采购、质检及入库多个位置。
- 建议：后续做视觉一致性整理时评估接入现有组件；不新建第二套说明组件。
- 边界：这两处是信息说明，不证明当前功能有缺陷。失败、阻断、危险确认及需要警示图标的场景保留相应告警表达；不批量将所有 `el-alert` 替换为普通提示。生产相关页面本轮只审查。

## 3. 不应通过新增展示组件解决的重复

### FR-11：领料选择与数量状态

- 证据：[MaterialOutboundDialog.vue](../apps/admin-web/src/views/production/components/MaterialOutboundDialog.vue) 第 197–258 行与 [MaterialOutboundOrderCreateDialog.vue](../apps/admin-web/src/views/production/components/MaterialOutboundOrderCreateDialog.vue) 第 221–291 行分别维护组选择、选中集合、逐行数量及提交数量校验。
- 建议：如实施 FR-03，同时评估生产局部 `useMaterialOutboundSelection`。先适配行身份／数量字段，再共享选择和校验函数；各 editor 独立创建实例，不能共享草稿或幂等意图。

### FR-12：查询／表格容器 CSS

- 证据：[UsersPage.vue](../apps/admin-web/src/views/system/UsersPage.vue) 第 472–530 行、[RolesPage.vue](../apps/admin-web/src/views/system/RolesPage.vue) 第 331–391 行、[ProcessesPage.vue](../apps/admin-web/src/views/product/ProcessesPage.vue) 第 493–545 行各自维护相似 `query-panel/table-panel` 布局样式。
- 建议：按现有设计 token／通用布局规则整理共同部分；页面独有响应式和密度继续局部维护。仅因样式重复不建立负责查询、表单及提交的通用页面组件。

### FR-13：路线步骤读取

- 证据：[RouteDetailDialog.vue](../apps/admin-web/src/views/product/components/RouteDetailDialog.vue) 第 119–149 行自行维护请求代际与步骤读取；[RouteStepDialog.vue](../apps/admin-web/src/views/product/components/RouteStepDialog.vue) 第 180–223 行使用 [useRouteStepEditor.ts](../apps/admin-web/src/views/product/composables/useRouteStepEditor.ts)，两者读取同一路线步骤接口。
- 建议：低优先级评估窄读取 composable 或已有 `useLatestReadRequest` 的采用，不合并读详情与编辑组件。
- 边界：目前代码已有过期响应保护，本次未证明存在竞态故障。加载失败、取消、合法空列表、草稿初始化和刷新不能混为一种返回结果，编辑器实例仍独立。

### FR-14：启停状态映射

- 证据：[ProcessesPage.vue](../apps/admin-web/src/views/product/ProcessesPage.vue) 第 140–142 行、[ProductCategoriesPage.vue](../apps/admin-web/src/views/product/ProductCategoriesPage.vue) 第 107–110 行、[ProductsPage.vue](../apps/admin-web/src/views/product/ProductsPage.vue) 第 140–141、262–263、315–316 行，以及 [ProductDetailDialog.vue](../apps/admin-web/src/views/product/components/ProductDetailDialog.vue) 第 30–32 行重复将数值 `1` 映射为“启用”，否则为“停用”；标签色和动作文案也有散落判断。
- 建议：先按共享常量和产品模块展示 helper 收敛编码、中文及颜色映射，再评估是否需要薄的状态标签组件。这是维护约定偏差，单靠包装 `el-tag` 不能解决整个映射重复。
- 边界：仅处理真正相同的启停语义，不将工单、质检、审批等不同状态机映射合成全局“万能状态”。不得更改已有状态值或把未知状态静默当作停用。

### FR-15：角色多选模板

- 证据：[UserFormDialog.vue](../apps/admin-web/src/views/system/components/UserFormDialog.vue) 第 53–71 行与 [UserRoleDialog.vue](../apps/admin-web/src/views/system/components/UserRoleDialog.vue) 第 19–38 行重复角色多选、失效选项显示；`buildLiveOptions` 已得到复用。
- 建议：仅记录为可选 `views/system/components/SystemRoleMultiSelect.vue`，传 `modelValue/roleOptions/placeholder`，发出值更新和 `refresh-roles`。
- 边界：两处模板很小，可暂不新增组件。候选实例归属、刷新和保存前资格校验继续由原所有者负责，不因组件化再请求一份候选。

## 4. 已复用及应保留差异的结构

- 公共层已有 `InlineHint`、`TableToolbar`、`PaginationFooter`；[main.ts](../apps/admin-web/src/main.ts) 第 43 行已全局把 `ElDialog` 注册为 `RouteDialog`，模板使用 `<el-dialog>` 不代表绕过公共弹窗。
- 仓储已共用 `InboundBatchTargetPicker` 与 `InboundSplitControl`；采购已复用 `ReceiptLineSummary`、`InboundInspectionRecord`，当前工作区已有 `ReceiptLinesTable`。生产已有 `BatchApprovedOutput`、`BatchCloseoutEvidence`。不重复创建同职责组件。
- [InboundInspectionFields.vue](../apps/admin-web/src/views/procurement/components/InboundInspectionFields.vue) 与 [FinishedInspectionPanel.vue](../apps/admin-web/src/views/quality/components/FinishedInspectionPanel.vue) 外观相近，但来料围绕本轮未处置实物及库管定稿，成品还有零量确认、实际送检总量与固定基准；不合并完整业务表单。依据见[来料交互](../apps/admin-web/docs/incoming-inspection-adoption.md)及[成品质检交互](../apps/admin-web/docs/finished-inspections.md)。
- 报工办理页与只读生产追溯页，以及需求事实总览与库存分配弹窗，命令资格与展示职责不同，不整体合并。
- 退料与盘点详情的取消人／时间／原因展示存在短片段重复（`ReturnOrdersPage.vue` 第 352 行、`StockChecksPage.vue` 第 312 行附近），目前只涉及少量描述项，不足以单独新增审计详情组件。
- 本次在 Dashboard、Login、审批流程和审批收件箱范围未确认到足以优先新增组件的重复结构；这不是对其所有行为、权限或运行状态的验收结论。

## 5. 影响及验证边界

本轮仅新增审查记录并登记文档入口。业务源码、契约、API、数据库、migration、配置和测试均未修改；保留工作区原有未提交修改。建议所有者限制在管理端公共展示层或对应业务视图模块，不提取新的 workspace UI 包，也不改变后端模块所有权。

本次未执行应用类型检查、构建、API／管理端启动、浏览器验收或正式测试，因为没有实施代码变更。文档链接检查在编辑前后均只报告同样四处既有 `temp` 文档失效链接，分别位于 `documentation-conflicts.md` 和 `roadmap.md`，本轮未新增失效链接；既有链接不属于本次组件复用审查的修正范围。
