# 采购与入库管理端设计

本文依据 [ADR-0013](../../../docs/adr/0013-procurement-source-and-stock-boundaries.md)、[采购与外购物料入库业务设计](../../../docs/procurement-inbound-design.md)和[阶段 2 技术设计](../../../docs/procurement-inbound-technical-design.md)，说明管理端当前实现与采购闭环目标。当前供应商、采购及两类补单、到货、更正、来料检验／主动复检、供应商退回和放行入库页面已接入公开契约；这些页面均未完成用户黑盒或 UI 验收。具体实现范围同时由本目录 README 与各 API 模块所有者文档说明。

通用视觉、页面分层、候选生命周期、路由弹窗和错误处理分别遵守本目录的[视觉设计](visual-design.md)、[架构](architecture.md)、[路由与标签页](route-dialogs-and-tabs.md)和[HTTP 错误处理](http-error-handling.md)。本文只规定采购场景的消费契约，不创建第二套状态码或业务资格算法。

## 1. 当前代码与目标的区别

| 事项 | 当前实现 | 已批准目标 |
| --- | --- | --- |
| 供应商 | 独立名称目录可新增、分页查看和修改，采购按稳定 ID 选择 | 采购按目录稳定 ID 选择，用户只填写名称 |
| 采购与到货 | 两种采购入口、独立补单、到货与质检待办均已接入，详情独立展示采购关闭与实物范围 | 按需求／独立备料采购，登记到货，强制检验，再由仓管确认入库 |
| 外购入库 | `PurchaseInboundPanel` 选择当前放行范围确认入库，旧自由直入写接口已移除 | 从采购及有效放行范围核对实际入库量；本地草稿直接提交实际确认，由服务端原子生成已完成入库事实 |
| 内部批号 | 核对页无批号输入，首次确认由服务端原子创建既有库存批次并回填到货 `batchId` | 新到货明细的 `batchId` 初始可空；首次实际入库自动生成并绑定既有 `item_batch`，以后沿用 |
| 需求入口 | `ProductionTasksPage` 的需求总览提供批量相关采购计数、追溯及发起采购 | 在同一需求总览增加相关采购入口；采购候选另按工单、任务和需求组织 |
| 入库追溯定位 | 外购明确附 `sourceType=purchased`，实际打开后仍核对真实单据类型 | 明确区分外购与成品定位，沿用同一稳定路由 |
| 版本资格 | 采购用途候选已允许停用精确版本并提示状态，生产候选维持原规则 | 采购用途允许停用精确版本；基础物料／分类及其他资格继续由后端核验，生产选版候选保持原规则 |

当前需求总览是 `views/production/components/MaterialDemandOverviewDialog.vue`，由 `ProductionTasksPage.vue` 打开；不存在可供链接的独立 `production-material-demands` 页面。既有 `/production/material-demands` HTTP 查询资源不等于前端路由。

新增采购入库不持久化外购待确认单，本地输入仍随 KeepAlive 保存。可空批次属于 `procurement_receipt_line.batch_id` 及其前端到货／核对投影；已经实际确认的 `inbound_detail.batch_id` 继续非空。成品入库仍使用现有待确认单、批准清单和每类别一次全量确认，不随此选择改变。

## 2. 页面与路由

| 菜单入口 | 路径 | 路由名 | 稳定组件名 | 用途 |
| --- | --- | --- | --- | --- |
| 采购管理 → 供应商配置 | `/procurement/suppliers` | `procurement-suppliers` | `SuppliersPage` | 供应商名称分页、新增与修改 |
| 采购管理 → 采购单 | `/procurement/purchase-orders` | `procurement-orders` | `PurchaseOrdersPage` | 两种采购入口、草稿、下单、逐行关闭与补单 |
| 仓储管理 → 采购到货 | `/procurement/receipts` | `procurement-receipts` | `PurchaseReceiptsPage` | 实收到货、更正、待退及实际交接 |
| 质量管理 → 来料检验 | `/quality/inbound-inspections` | `quality-inbound-inspections` | `InboundInspectionsPage` | 每条到货的检验、复检和历史结论 |
| 仓储管理 → 入库管理 | `/warehouse/inbound-orders` | `warehouse-inbound` | `InboundOrdersPage` | 保留外购／成品页签，外购选择当前有效放行来源 |

新增页面同时登记在 `router/index.ts` 和 `AdminLayout.vue`，路由与菜单使用同一页面权限。页面只按查看权限控制整页；命令权限由后端逐接口校验，状态阻断由服务端返回资格，不要求页面内按钮做权限隐藏。

详情继续使用 Modal，采购单、到货和检验详情用现有 `RouteDialog workbench`。不为每个到货范围、质检结论或关联需求新建标签页和菜单。页面列表默认提供关键词、状态及业务所需筛选，正式列表全部服务端分页，不按不同物料直接合计数量。

### 2.1 详情定位

- 采购页使用 `purchaseOrderId` 定位详情；从需求进入可传 `demandId`，由服务端解析具体需求及资格后显式带入采购草稿，不能将 URL 参数作为合格来源证明。
- 到货页使用 `receiptId`，可附 `receiptLineId` 定位明细；质检页用 `receiptLineId` 定位该条到货的当前范围及检验历史。
- 入库管理沿用 `inboundId`；外购链接显式附 `sourceType=purchased`，没有该参数的现有链接继续按原成品定位。页面解析参数后仍须读取单据详情核对真实 `sourceType`，不能靠参数改变单据类型或权限。
- 从采购或到货进入外购入库核对可传 `receiptLineId`；页面重新查询当前批准范围、批次及可入量，采购已关闭也正常读取有效范围。
- 更换定位目标前确认是否放弃当前未保存草稿；提交中或结果未知时阻止换单，保留原请求重试。离开页面只使旧读取失效，不销毁编辑草稿。

## 3. 供应商及采购选择

供应商配置只有名称输入，`supplierName` 去首尾空白后必填且最多 100 字符，不增加联系人、编码输入、备注、附件、物料绑定或评审。名称规范、去重、并发和软删除字段遵守 Procurement 所有者契约；页面不得把供应商名称作为关系键。既有采购的供应商身份和下单事实不因目录改名而改变。

当前 `SuppliersPage` 已提供名称查询、分页、新增和修改，创建／更新时间为只读展示；采购草稿通过关键词窗口与已选 ID 解析消费供应商目录。列表与编辑器分别由 `useSuppliersList`、`useSupplierEditor` 持有，返回缓存页刷新列表，保留编辑输入及打开时的版本。版本变化时提示过期并阻止旧草稿提交，关闭后重新选择才能采用最新资料；名称重复失败保留输入供修正。列表读取支持取消旧请求，页面离开不取消已发出的业务写入。

### 3.1 按需求采购

需求选择弹窗按“工单 → 任务 → 具体需求”展示。工单／任务标题来自服务端候选投影，需求行展示类型、基础物料当前名称、编码、精确版本、单位、需求量、当前剩余缺口和当前状态。人工追加、工序报废补料、领料损耗补料均使用真实需求 ID，不按任务尚未领料简单过滤，也不按存在既有采购就排除。

候选分页以具体需求为数量口径、稳定排序，同一工单／任务可跨页；每页按工单、任务分组，跨页分组显示“当前页”。界面不宣称页内组是完整需求集合。筛选支持工单、任务、物料和需求类型；只展开当前返回页，不逐组加载全部历史需求。

编辑器使用按 `demandId` 索引的本地已选集合保留跨页勾选，页内全选只作用于当前页可选行，另有独立“已选需求”区域供核对、移除和查看所属工单／任务。翻页、筛选及刷新不清空已选项，也不把未出现在当前页的项标为失效。服务端通过选中 ID 解析契约返回每个已选项的当前资格与阻断原因；只有该明确解析结果才能判定选中需求失效。解析失败保留草稿并禁止正式下单，不能默认为全部合格或清空来源。

选定后按物料及精确版本形成采购物料行，每行展开具体需求来源。采购量由采购独立填写，来源没有分摊量，不自动把需求剩余量当作采购上限、自动改量或已采购数量。不同工单的需求可归同一供应商采购单，按需求和备料入口不混合。

在审更正或其他不合格来源由服务端明确标注不可选；已有采购来源的历史展示不受新候选过滤影响。草稿保存和正式下单分别执行后端契约要求的校验，正式下单重新核对全部资格，不能只更新版本号继续发送过期来源。

### 3.2 独立备料与补单

备料草稿自行选择物料及精确版本，不要求工单、任务或需求，不带入或伪造来源 ID。采购专用物料／版本候选包含仍符合其他资格的停用精确版本，并明确显示停用状态；不复用生产选版的启用过滤来误判采购资格。

补单从原采购行或实际质量退回记录进入，使用普通采购草稿和下单生命周期。界面分别展示采购来源与补单原因：超量补单追溯原采购行及真实来货依据，不合格补货从到货历史中的真实质量退回进入，携带 `originReceiptLineId/originSupplierReturnId` 追溯原行、到货及实际质量退回。新单只带入所选原行的需求来源，原需求已关闭也保留追溯，不能要求恢复旧需求。供应商补发及额外购买量独立填写，原采购行的“相关补单”使用 `originOrderLineId` 精确筛选分页，展示两种原因的全部状态并可跳转详情，供人员核对既有补单；不按原需求／原退回量设置累计补购上限。

### 3.3 需求相关采购

任务需求总览新增“关联采购 N 单”，计数按实际采购单去重。点击后分页展示相关采购行的自身数量、状态和后续进度，说明“一条采购行可关联多个需求，以下数量为采购行数量”。不展示本需求已采购量、不累计相关采购量作为生产满足量。

计数与列表由服务端批量投影，不能为表格每行分别请求详情；关联历史查询不使用新下单候选过滤。点击某一采购进入采购详情时，目标页面及详情 API 仍独立鉴权。采购查看不使用户自动获得生产需求编辑权限。

## 4. 采购履约与关闭

列表显示采购单号、供应商、按需求／备料、补单原因、生命周期、物料行数和创建／下单时间。不同物料的数量放在详情逐行展示；必要的单据摘要按单位及物料身份组织，不能把多个物料相加作为完成进度。

采购草稿可修改，正式下单后供应商、物料、精确版本及计划量只读。错误按无到货取消或已有到货人工结束后重建；不提供原单直接改量、换版、重新绑定需求或自动重开入口。

采购行的“后续处置”使用服务端返回的下列独立量与资格：

| 展示 | 口径 |
| --- | --- |
| 计划量 | 本行正式锁定的 `Q` |
| 累计实收 | 原行各有效实收修订形成的 `A`，实际退回不扣减 |
| 少收量 | `max(Q - A, 0)`，仅表示计划尚未收齐 |
| 有效允许入库量 | `L`，含已入库锁定份额，不随生产领用减少 |
| 放行差额 | `max(Q - L, 0)`，不能标为少收量 |
| 仓库待办 | 未检、复核中、当前可入、质量待退、终止待退分别表达 |
| 已处置 | 累计已确认入库及实际退回，不以当前库存余额替代 |

关闭弹窗只提供服务端判定允许的依据：质检达标、质量退回处置完成或人工结束。确认时展示当前行、计划／实收／放行／质量退回事实和副作用；人工结束必须填写真实原因。达标不会自动关单，多个行可以采用不同合法依据，不因另一物料超收抵补本行。

关闭行停止新增到货，其他未关行继续收货；全部行关闭后主单完成。原到货的待检、复核、入库与退回仍显示在独立待办，不随采购终态消失。关闭证据与当前进度分开查看，更正导致当前量变化时展示差异，不覆盖历史关闭依据。

## 5. 到货、实收更正与退回

到货登记选择允许继续收货的采购行，带出锁定物料／精确版本及单位，填写本次实际接受数量、供应商批号及到货依据。计划与已收量只用于对照，数量输入不按计划剩余设置 `max`；只限制正整数及公共数量上限。不同供应商实物批号拆明细，同批号也不跨到货自动合并内部批次。

超量提示说明免费且同意接受可记原单，采购同意额外购买须先建立独立超量补单，再分别登记真实实物；系统不自动拆单，也不把已实际接收后的退回处理成减少实收。现场未接受的实物不计实收，本期没有门口拒收登记。

实收更正显示原数量、当前修订、累计已入／已退及可更正范围，必填原因。更正不能少于累计已处置数量，不能更改身份、批次、旧入库／退回事实，不能作为新增来货或真实损耗的替代。提交后明确显示受影响范围复核中，新的质检结论确定前暂停相应入库和退回；前端不根据新实收数字推算放行量。采购关闭不隐藏此更正入口。

更正表单逐范围填写调整后数量，并独立填写核实为原实收漏录的同批剩余量；用户明确确认仍是同一原到货实物后，提交 `version/previousRevisionId/receivedQuantity/reason/physicalIdentityConfirmed`、`adjustments[{scopeId,scopeVersion,revisedQuantity}]` 和 `newRemainderQuantity`。不能只改总实收而不说明影响范围。未改范围保留原依据，终止待退范围更正后仍保留终止约束。

更正把某个未处置范围减至零时，仍显示覆盖量为零的复核待办；质检明确核实后追加 `receipt_zero_confirmed` 结论，不因没有剩余实物自动隐藏任务或认定检验完成。只有原批已处置事实、没有旧未处置范围时，核实同批原实收漏录的余量也可登记并复核；该入口不替代新到货。

待退范围分质量判退与采购终止，状态只表达未处理／已退回供应商，没有应退量时不显示未处理。终止指定须显示范围与独立原因，不能更改原质检结果为不合格。实际交接表单带出该范围全部剩余应退量、只读显示，填写交接时间及凭据后一次确认；不提供分次退回输入。复核中的范围禁止实际退回，质检判退本身不表示实物已经离开保管。

## 6. 来料检验与复检

质检待办分页区分真实未检范围和已有检验办理，提供未检、复核中及历史状态筛选。未检行使用 `taskKind=uninspected` 与真实范围身份，`case=null`；只有明确发起初检才创建 Quality case，不能给未检范围伪造检验记录 ID。采购关闭后的原到货仍在待办中，页面不因采购结束禁用合法检验。一次办理只选同一到货明细的范围，不提供跨到货合并检验。

全检记录覆盖量、实际合格和不合格数量；抽检记录覆盖量、实际样本量、样本内不合格量和实际剔除不良量，展示真实抽样比例，不内置尚未批准的抽样档位。质检明确选择“是否批准入库”，另记录结论、后续处置、说明和凭据。不批准不自动代表整批退回，样本不合格比例不自动生成放行数量。

主动复检先选具体未处置范围和数量、填原因，再明确点击“确认发起复检”。确认弹窗解释该范围立即暂停入库及实际退回；仅打开表单不暂停。发起成功后显示服务端显式 `reviewing` 状态，已入／已退范围不能再选，采购终止指定待退也不能通过复检恢复放行。其他未受影响范围仍可继续办理。

复检完成追加结论并恢复新结论允许的待办，不覆盖旧记录。页面分别列出实收修订、检验办理记录、不可变结论及实际处置引用，显示当前有效范围，避免将历史批准量相加。提交前必须重新核对当前范围和版本；旧读取失败或依据变化时保留输入但阻止确认。

## 7. 有效放行与实际入库

仓库当前由 `usePurchaseInboundReleases` 独占放行窗口、跨页已选与入库数量草稿，`usePurchaseInbounds` 仅负责只读历史。`src/api/procurement-inbounds.ts` 发送一条批量确认命令；旧 Production 外购创建、确认和取消的前端调用已删除。一次确认只含同供应商范围，支持跨采购及到货。首次确认生成的内部批号只读展示，同一到货后续复用。

提交前通过 `scopeIds` 一次读取全部已选范围，分页窗口不影响跨页选择；任何范围不再可入、被拆分或依据／数量变化均保留原输入并阻止提交。显式“重新核对已选”只更新相同范围的依据，保留已填数量，不能自动替换子范围或自动调大数量。普通收起保留草稿，结果未知冻结原命令并提供同键重试。返回缓存页面刷新放行清单，历史入库通过 `inboundId + sourceType=purchased` 定位，`receiptLineId` 定位放行来源，库存来源链接按实际 `sourceType` 打开对应入库页签。

外购页签提供“待入库”和“入库记录”。仓管可先选择采购，再选择其已明确批准、没有复核／终止阻断且仍有可入库余量的到货范围；也可从来源详情带入。已关闭采购的有效范围继续可选，采购状态不是已有到货的入库资格。

核对弹窗显示供应商、采购／到货、物料与精确版本、供应商批号、当前实收修订／检验依据、累计已入量及剩余可入量。默认本次量等于当前剩余有效批准量，允许调小，须大于零且不超过该范围服务端额度。数量和资格按具体到货范围核验，不以整张采购单选中为任意录入授权。

首次入库前 `batchId/batchCode` 为空，显示“首次确认入库时生成”；不提供内部批号输入。确认成功后显示服务端返回的现有 `item_batch.batch_code`，后续同到货沿用。到货与检验不写库存，点击实际确认并成功提交后才形成 completed 入库单、原 `inbound_detail` 批次引用及唯一库存流水。

本地草稿保存打开时的范围版本和核对依据。其他仓管入库、实收更正、指定待退或发起复检后，旧依据不得只更新版本继续提交。确认失败后重新读取当前有效范围供明确核对；结果未知保留原请求和幂等键，不自动取新范围或新键重新入库。

入库记录继续展示采购 → 到货 → 实收修订 → 检验结论 → 入库明细 → 库存批次的事实链。累计已入量跨历次入库明细聚合，不能使用当前库存余额，也不能只累计最新质检结论关联的入库。一次入库后生产领用减少余额，不使到货重新获得额度。

## 8. 状态与 HTTP 消费约定

状态码由[阶段 2 技术设计](../../../docs/procurement-inbound-technical-design.md)定义，实施时统一进入 `packages/constants` 和 `packages/contracts`。前端按以下维度分别展示，不以一列“完成”替代采购、检验和仓库待办：

| 维度 | 目标状态码 | 前端语义 |
| --- | --- | --- |
| 采购来源 | `demand / stock` | 按需求／独立备料 |
| 补单原因 | `excess_purchase / quality_replacement`，普通单为空 | 超量补单／不合格补货 |
| 采购主单 | `draft / ordered / completed / cancelled` | 草稿／已下单／采购完成／已取消 |
| 采购行 | `draft / open / closed / cancelled` | 草稿／可收货／已关闭／已取消 |
| 行关闭依据 | `quality_target / quality_return_completed / manual_end / cancelled` | 质检达标／质量退回处置完成／人工结束／无到货取消 |
| 实物范围 | `uninspected / approved / quality_return / termination_return / reviewing / inbounded / returned / superseded` | 未检／批准入库／质量待退／采购终止待退／复核中／已入库／已退回／历史替代范围 |
| 质检办理 | `reviewing / completed / superseded` | 复核中／已完成／被后续实收更正替代的办理记录 |
| 检验发起类型 | `initial / reinspection / inspection_correction / receipt_correction` | 初检／主动复检／检验更正／实收更正复核 |
| 检验方法 | `full / sampling / review_only` | 全检／抽检／零量实收修订核实，最后一种只适用服务端返回的零量复核 |
| 质量处置 | `release / await_full_inspection / await_decision / return_all / receipt_zero_confirmed` | 明确放行／转全检／待决定／整范围退回／零量实收核实完成 |

每个范围状态的颜色和文案由共享常量提供；`reviewing` 明确表示暂停，不能从实收修订与最后结论 ID 不一致推断。历史 `superseded` 范围只在历史展示，不再次累计可办理量。页面显示关闭原因时，不将人工结束或质量退回处置完成翻译成质检达标。

检验的页面职责与 HTTP 编排入口分开：页面路由为 `/quality/inbound-inspections`，命令仍由 Procurement 锁定到货及范围后调用 Quality 公开能力。前端不分别请求两模块来模拟同一事务，也不传“已合格”布尔值代替服务端检验依据。

以下路径省略统一 `/api` 前缀。实体 ID 使用字符串，请求数量遵守公共正／非负整数及 `99999999` 上限，响应数量按共享契约显示。写接口使用 class DTO 的精确字段，未知字段不能作为兼容输入；列表统一返回 `PageResult<T>`，默认每页 10 条，上限 100。批量来源、已选 ID 解析及单次入库明细上限 100；超过时界面要求另单办理，不偷偷截断。API wrapper 只传递由用例持有的幂等键，不自行生成。

### 8.1 页面与命令权限

| 页面 | 路由／菜单查看权限 | 独立命令权限 |
| --- | --- | --- |
| 供应商配置 | `procurement:suppliers:view` | `procurement:suppliers:create`、`procurement:suppliers:update` |
| 采购单 | `procurement:orders:view` | `procurement:orders:create/update/place/close/cancel`，分别对应完整动作权限 |
| 采购到货 | `procurement:receipts:view` | `procurement:receipts:confirm/correct/return`，分别对应完整动作权限 |
| 来料检验 | `quality:inbound-inspections:view` | `quality:inbound-inspections:review`、`quality:inbound-inspections:inspect` |
| 外购入库页签 | 既有 `production:inbounds:view` | 既有 `production:inbounds:confirm` |

以上斜线只缩写平行权限名称，不产生包含斜线的新权限码。只读消费权限明确如下：

- 供应商 options：`procurement:suppliers:view`、`procurement:orders:view`、`procurement:receipts:view` 的 any-of；质检页面本期不单独请求供应商选择接口。
- 采购用途物料／版本候选与需求候选／解析：`procurement:orders:view`，不要求主数据管理页面权限。
- 相关采购批量投影：`procurement:orders:view`、`production:tasks:view`、`production:material-demands:view`、`production:materials:view` 的 any-of，覆盖真实任务需求弹窗宿主。真正跳转采购详情仍要求 `procurement:orders:view`。
- 来料检验读取只要求 `quality:inbound-inspections:view`，不要求附加采购查看权限；入库放行读取沿 `production:inbounds:view`，不要求质检查看权限。

检验权限不授予修改实收、实际退回或入库权限，也不要求不同自然人分担各角色。Quality 详情与放行清单按目标页面查看权限提供相互追溯入口；跳转保留或显式处理原页面未保存输入，未知提交结果阻止切换目标。

### 8.2 HTTP 与表单字段

| 操作 | 请求 | 表单／结果依据 |
| --- | --- | --- |
| 供应商分页／选择 | GET `/procurement/suppliers`、`/procurement/suppliers/options` | 选择接口用 `keyword + includeIds` 远程窗口，解析当前已选 ID；不复用正式分页列表过滤 |
| 新增／修改供应商 | POST `/procurement/suppliers`、PATCH `/procurement/suppliers/:id` | `supplierName`；修改带 `version` |
| 采购物料／版本选择 | GET `/procurement/material-options`、`/procurement/material-variants/options` | 物料远程窗口用 `keyword + includeIds`；版本传 `materialId`，完整返回该物料的采购合格版本并标注实际启停状态 |
| 采购列表／详情 | GET `/procurement/purchase-orders`、`/procurement/purchase-orders/:id` | 分页列表；行、来源、关闭历史及当前物流数量分开展示 |
| 创建／保存采购草稿 | POST `/procurement/purchase-orders`、PATCH `/procurement/purchase-orders/:id` | `supplierId/sourceType/items` 及来源中的逐条 `demandId`；修改带 `version` |
| 正式下单／取消 | POST `/procurement/purchase-orders/:id/actions/place`、`.../actions/cancel` | 下单带 `version`；取消另带 `reason`，须无确认到货 |
| 逐行关闭 | POST `/procurement/purchase-order-lines/:id/actions/close` | `version/reasonType/reason`，结果包含冻结关闭依据和当前物流进度 |
| 独立补单 | POST `/procurement/purchase-order-lines/:id/supplements` | 原行、补单原因、相关到货／实际退回、数量与真实依据；返回新采购草稿 |
| 需求候选／解析 | GET `/procurement/demand-candidates`、POST `/procurement/demand-candidates/resolve` | 分页叶子；解析传 `demandIds`，逐 ID 返回当前资格及原因，不发送幂等键 |
| 相关采购 | GET `/procurement/related-purchases` | 批量 `demandIds` 与分页参数；每需求 distinct 采购单数及相关采购行 |
| 到货列表／详情 | GET `/procurement/receipts`、`/procurement/receipts/:id`、`/procurement/receipt-lines/:id` | 明细只含当前未处置范围、最近历史预览及全部未完成办理；单明细可解析到货 ID 用于追溯定位 |
| 到货明细历史 | GET `/procurement/receipt-lines/:id/{revisions,cases,returns,inbounds,scopes}` | 各 `PageResult<T>`，独立分页，不在主详情下载全部增长历史 |
| 收货采购候选 | GET `/procurement/receipt-order-options`、`/procurement/receipt-order-options/:id` | 专用于到货页，`receipts:view` 读取可收货采购与锁定行，无需采购页查看权限 |
| 实际到货确认 | POST `/procurement/receipts/actions/confirm` | `purchaseOrderId`、各采购行版本、`receivedAt/evidence/details`；实际量不按计划封顶 |
| 实收更正 | POST `/procurement/receipt-lines/:id/actions/correct-receipt` | `version/previousRevisionId/receivedQuantity/reason/physicalIdentityConfirmed`、`adjustments[]/newRemainderQuantity`，逐范围核实更正 |
| 检验待办／详情 | GET `/quality/inbound-inspections`、`/quality/inbound-inspections/:caseId`、`/quality/inbound-inspections/receipt-lines/:id` | Quality 页面权限读取任务投影、真实 case 及办理所需当前到货范围，不附加采购到货页权限 |
| 初检／主动复检发起 | POST `/procurement/receipt-lines/:id/actions/start-review` | `version/scopeId/scopeVersion/quantity/caseType/reason`；成功即明确进入复核中 |
| 检验确认 | POST `/procurement/receipt-lines/:id/actions/inspect` | `caseId/caseVersion`、修订和范围、全检／抽检实际数量、批准及处置、说明与凭据 |
| 指定终止待退 | POST `/procurement/receipt-lines/:id/actions/terminate-return` | 当前范围及版本、数量和原因；不等于实际退回 |
| 实际退回确认 | POST `/procurement/receipt-lines/:id/actions/return` | `scopeId/scopeVersion` 与依据、全部剩余待退量、交接时间和凭据 |
| 有效放行清单 | GET `/procurement/inbound-releases` | 分页当前可入范围，支持采购／到货定位，包含关闭采购来源和可空批次 |
| 实际入库确认 | POST `/procurement/purchase-inbounds/actions/confirm` | `details[]` 中每条提交具体到货／范围、版本、修订、检验依据与本次数量；一单多范围原子确认 |
| 入库历史／详情 | GET `/production/purchase-inbounds`、`/production/purchase-inbounds/:id` | 保留既有查看权限及路径，由 Inventory 读取；含新采购来源及历史批次／库存流水 |

流程切换后移除旧 `/production/purchase-inbounds` 创建及其确认／取消写入端点，保留上述只读历史路径。前端同步移除自由选料直入、手填内部批号和待确认外购单操作，不能只隐藏按钮而继续调用旧写接口。

上述确认、采购草稿创建／PATCH、补单创建、下单、取消和关闭使用服务端已登记的 `Idempotency-Key` 闭环；供应商维护和只读解析不启用。POST 方法本身不能作为是否发送幂等键的判断条件。页面提交签名包含路径参数、规范化 body 的全部业务字段及版本；结果未知时保留第一次实际发送的内容。

操作依据以服务端返回的 `{ scopeId, scopeVersion, receiptRevisionId, inspectionId, reviewCaseId }` 为准，按动作允许为空。范围拆分后不能静默以新子范围替换旧草稿中的父范围；未受影响的旧修订范围仍可按后端资格办理，不因修订号与当前明细修订不同就全页禁用。一个原子入库单通过一个批量确认请求提交，不能循环单条 HTTP 后声称全部原子成功。

## 9. 前端状态所有权与实现位置

| 状态 | 所有者 | 刷新与失败行为 |
| --- | --- | --- |
| 供应商、采购、到货、检验、入库分页列表 | 各页面 `useXxxList` | 筛选或写后定向刷新，最后请求生效 |
| 供应商与采购用途物料候选 | 最近共同消费者的 options 实例 | 打开、激活、展开分别刷新；无全局缓存 |
| 跨页需求候选及已选资格解析 | 采购草稿 editor | 已选集合与当前页分开，解析失败禁止下单 |
| 采购／到货／检验关键详情 | 对应 dialog editor | ID 与请求代际双校验，失败不变成可提交空数据 |
| 本地修改及入库核对量 | 当前弹窗 | KeepAlive 保留，刷新不覆盖，旧依据显式重核 |
| 确认命令意图 | 当前用例的 `useIdempotentIntent` | 同请求重试沿用原键，未知结果冻结原意图 |
| 状态值与中文映射 | `packages/constants` | `.vue` 不重定义映射；contracts 使用字符串联合 |

`src/api/procurement.ts` 负责采购场景 HTTP，包括 Procurement 编排的检验命令；不因为权限属于 Quality 就虚构第二条质量写入接口。页面／组件通过局部 composable 调用共享 HTTP 客户端，不在模板组件编排多条事实写入。

落地文件包括新增的 `views/procurement/{SuppliersPage,PurchaseOrdersPage,PurchaseReceiptsPage}.vue`、`views/quality/InboundInspectionsPage.vue` 及各自组件和 composable；供应商候选工厂位于 `composables/options/useSupplierOptions.ts`。旧外购面板与 composable 切换到新契约，删除自由直入入口和手填内部批号；成品面板继续使用自己的 editor。真实状态、DTO、端点及权限目录以[阶段 2 技术设计](../../../docs/procurement-inbound-technical-design.md)为统一来源。

## 10. 交付与验收

每个编码阶段先完成共享包与应用类型检查、构建和启动验证，再提供实际页面供用户黑盒及 UI 验收。按供应商、采购、到货、检验、入库顺序检查主链，并核对需求追溯、跨页选择、关闭后的仓库待办、免费超收、两类补单、分次入库批次复用、实收更正、部分范围主动复检及旧依据拦截。

正式测试集等用户明确通知后再编写，并使用 Luna MAX 子代理全量验证；当前文档和应用构建不代表测试集通过。仓库仍为单 API、单数据库的模块化单体，本前端专题不引入新数据库事实。数据库允许完全重置，不保留兼容双写或影子表；表结构及追加 migration 由 API 模块所有者设计负责。
