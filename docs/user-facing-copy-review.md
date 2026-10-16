# 用户提示语盘点

盘点日期：2026-10-16。依据当前工作区源码（含既有未提交修改）。**状态：用户已批准实施；52 组已实施、2 组部分实施，无保留待确认组，均未完成用户验收及正式测试。** 待办见[路线图](roadmap.md#用户提示语友好化待验收)。

## 范围与结论

本轮扫描管理端页面、弹窗、共用组件及 composable、共享常量，以及 API 的业务错误、参数校验和 HTTP 错误映射；覆盖生产与本人现场工序、采购、仓储、质量、产品、审批、系统管理、登录和通知。清单收录 **54 组优先处理的文案问题**，同类重复出现合并记录，不等于 54 个字符串或全部中文文案数量。

表内引号保留盘点时的原文证据或明确标注的摘录，实施状态以新增状态列为准；动态数值以变量示意，文件链接指向当前来源。源码检查不等于逐角色、逐状态的完整 UI 验收。搜索命中中的注释、日志、测试、演示页和未向用户暴露的内部异常不计入问题；API 行注明其展示链路，不能把所有 `throw new Error` 都当成用户报错。

主要问题有三类：内部机制直接外露（幂等、原请求、事务、投影）；普通业务被抽象成“事实、履约、资格”；长篇规则同时堆在常驻提示中。最先处理错误和危险确认，随后精简高频页面说明，再统一业务术语。**风险提示应更易懂，不能因精简而隐藏库存影响、不可撤销、重复提交或审批限制。**

以下“高／中”是文案改进优先级，不是故障等级。“改写”仅改变表达；“拆分”保留主要限制并将长解释按状态展示；“移帮助”仅适用于非阻断解释；“删除”限于不影响操作的实现说明。

## 1. 共用错误与提交处理（10 组）

| 编号／优先级 | 实施状态 | 原文案与来源 | 问题 | 建议文案与处理 |
| --- | --- | --- | --- | --- |
| C01 高 | 已实施，待验收 | “当前环境不支持 Web Crypto（randomUUID/getRandomValues），无法生成安全幂等键，已阻止提交以免重复批次风险”：[useIdempotentIntent](../apps/admin-web/src/composables/idempotency/useIdempotentIntent.ts) | 浏览器 API、函数名和实现机制不能指导用户 | 改写：“当前浏览器无法安全提交，请使用受支持的浏览器或联系管理员。”保留禁止提交；具体函数名放诊断日志。不能承诺刷新即可恢复。 |
| C02 高 | 已实施，待验收 | “该提交的幂等结果已损坏，已阻止继续提交……”（摘录）：同上 | “损坏”无法由用户处理；可能误以为业务未成功 | 改写：“暂时无法确认本次操作是否成功，已暂停提交。请先到相关记录中核对；仍无法确认时请联系管理员。”保留业务对象名及不能继续重试的限制。 |
| C03 高 | 已实施，待验收 | “该提交已超出幂等重试窗口（12 小时）……”（摘录）：同上 | 将内部保证窗口暴露为开发术语 | 改写：“本次提交已超过可重试时限。请先核对是否已成功，确认后再重新办理。”12 小时可作为辅助说明，不能让用户跳过核对直接新建。 |
| C04 高 | 已实施，待验收 | “上次提交结果未知（网络异常或服务端未确认）。修改内容后重新提交可能生成重复……”（摘录）：同上 | 长句、服务端概念；风险与下一步不突出 | 改写：“暂时无法确认上次操作是否成功，请勿修改后重复提交。请先到相关记录中核对。”有安全重试按钮时单独指向该按钮，不能统一建议刷新。 |
| C05 高 | 已实施，待验收 | “本次提交标识已用于不同内容，请刷新数据后重新操作”：[error-handler](../apps/admin-web/src/api/error-handler.ts) | 用户不认识提交标识；刷新可能与未确认提交处理冲突 | 改写：“本次提交内容与上次不一致，无法继续提交。请先核对上次操作结果。”恢复动作须结合当前编辑器，不能仅凭错误码统一放弃草稿。 |
| C06 高 | 已实施，待验收 | “服务端保存的提交结果异常，请联系管理员核对业务结果”：同上 | 服务端、业务结果均抽象 | 改写：“暂时无法确认操作结果，请先核对相关记录，并联系管理员处理。”请求编号作为辅助排查信息保留。 |
| C07 高 | 已实施，待验收 | “放弃幂等意图确认”：[ProductionTasksPage](../apps/admin-web/src/views/production/ProductionTasksPage.vue)、[MaterialOutboundOrderCreateDialog](../apps/admin-web/src/views/production/components/MaterialOutboundOrderCreateDialog.vue) | 弹窗标题完全是实现术语 | 改为“确认关闭当前操作”；正文保留关闭后无法继续原操作重试、可能重复提交的影响。不要改成普通“放弃修改”。 |
| C08 高 | 已实施，待验收 | “按原请求重试”“返回原请求”：[ProductionReportAdjustmentDialog](../apps/admin-web/src/views/production/components/ProductionReportAdjustmentDialog.vue)、[ProductionReportVerificationDialog](../apps/admin-web/src/views/production/components/ProductionReportVerificationDialog.vue)、[ProductionReworkCompletionDialog](../apps/admin-web/src/views/production/components/ProductionReworkCompletionDialog.vue) | 按钮描述实现对象而非用户动作 | 分别改为“重试本次提交”“返回本次操作”。只改标签，重试仍必须使用原内容与原标识。批量冲销同类按钮一并统一。 |
| C09 高 | 已实施，待验收 | “原请求和安全重试标识仍保留”“原数量、版本和请求已锁定”等：[useOtherInventoryOrderEditor](../apps/admin-web/src/views/warehouse/composables/useOtherInventoryOrderEditor.ts)、[BatchStepReportDialog](../apps/admin-web/src/views/production/components/BatchStepReportDialog.vue)、[useDemandCorrection](../apps/admin-web/src/views/production/composables/useDemandCorrection.ts) | 多模块重复解释版本、请求和标识，用户仍不知道可做什么 | 统一表达结构：“暂时无法确认是否成功，本次填写内容已保留，暂不能修改。请重试本次提交或先核对〔具体记录〕。”不能重试的状态使用 C02/C03，不能混为一条提示。 |
| C10 中 | 已实施，待验收 | “供应商候选刷新失败，请重试后再保存”“物料候选项已失效，请重新选择”：[useSupplierOptions](../apps/admin-web/src/composables/options/useSupplierOptions.ts)、[ProductMaterialDialog](../apps/admin-web/src/views/product/components/ProductMaterialDialog.vue) | “候选项”是控件内部用语，“失效”原因不明确 | 分别改为“供应商列表加载失败，请重新加载后再保存”“所选物料已不可用，请重新选择”。无法确认是停用、删除或权限变化时不要擅自写“已停用”。同类工序、负责人选择提示一起检查。 |

## 2. 生产、现场工序与追溯（16 组）

| 编号／优先级 | 实施状态 | 原文案与来源 | 问题 | 建议文案与处理 |
| --- | --- | --- | --- | --- |
| P01 中 | 已实施，待验收 | “暂无物料需求事实”“暂无生产领料出库事实”：[ProductionTracePage](../apps/admin-web/src/views/production/ProductionTracePage.vue) | 普通空状态使用数据建模术语 | 改为“暂无物料需求”“暂无领料出库记录”。 |
| P02 中 | 已实施，待验收 | “报工事实”：[ProductionStepReportTable](../apps/admin-web/src/views/production/components/ProductionStepReportTable.vue) | 高频标题不自然，多个宿主共用 | 改为“报工记录”；同时检查生产追溯、执行记录、现场工序等宿主，不逐页复制修改。 |
| P03 中 | 已实施，待验收 | “冲销事实只读”“结果事实只读”“关联事实”：[production-report-presentation](../apps/admin-web/src/views/production/production-report-presentation.ts) | “事实”不说明为何不能改 | 改为“冲销记录仅可查看”“该返工结果仅可查看”“关联记录”；保留具体返工单号及关联类型。 |
| P04 中 | 已实施，待验收 | “返工已完成并生成报工事实”：[useProductionAbnormalActions](../apps/admin-web/src/views/production/composables/useProductionAbnormalActions.ts)；“已整体冲销…条报工，原事实已保留”：[BatchStepBulkReverseDialog](../apps/admin-web/src/views/production/components/BatchStepBulkReverseDialog.vue) | 成功消息偏实现说明 | 改为“返工已完成，报工记录已生成”“已冲销…条报工，原记录可在历史中查看”。不暗示删除了原报工。 |
| P05 高 | 已实施，待验收 | “历史收尾根的保留不代表当前仍可编辑产出或办理质检……”（摘录）：[ProductionBatchTerminationDialog](../apps/admin-web/src/views/production/components/ProductionBatchTerminationDialog.vue) | “收尾根”是内部模型名，用户无法理解 | 改为“任务已恢复生产，收尾记录仅供查看。再次结束任务后，可按当前任务状态办理产出和质检；已完成的处理不会自动撤销。”保持状态条件。 |
| P06 高 | 已实施，待验收 | 同弹窗从“产出草稿与检验引用在产出清单办理”至“原待确认损耗请先处理或取消”的整段说明 | 同时交代入口、流程、停止生产、审批驳回、退料和损耗，阅读负担过大 | 拆分：主提示“完成收尾和物料核对后，返回产出清单提交审批”；对应区块显示退料／损坏入口说明；“驳回不会恢复已关闭事项”在执行不可撤销动作前始终可见，不移入帮助。 |
| P07 中 | 已实施，待验收 | “以下为结束时保存的物料快照，可退上限不代表当前可退数量或现场实物余量”：[BatchCloseoutMaterialPanel](../apps/admin-web/src/views/production/components/BatchCloseoutMaterialPanel.vue) | “快照”技术化，但数量区别必须保留 | 改为“以下为任务结束时的物料记录。实际可退数量请到退料管理核对，并以现场实物为准。”可退上限与当前可退量仍保留独立标签，不合并数值。 |
| P08 高 | 已实施，待验收 | “提交时后端会重新校验任务状态和出库事实；任一条件变化都会拒绝取消”：[ProductionBatchCancelDialog](../apps/admin-web/src/views/production/components/ProductionBatchCancelDialog.vue) | 强调后端工作机制而非取消条件 | 删除“后端重新校验”实现解释；提示“请确认以下取消影响。若任务状态或领料记录发生变化，请重新核对。”实际阻断仍显示具体原因。 |
| P09 中 | 已实施，待验收 | “开始、明确完成和重开分别记录状态动作；数量分布不代表完工或质量放行……”（摘录）：[WorkerTasksPage](../apps/admin-web/src/views/production/WorkerTasksPage.vue) | 现场员工入口像设计规范，多条阶段规则堆叠 | 常驻简化为“报工后仍需点击完成工序；报工数量不代表质检结果。”已完成且有新增报工动作时提示“新增报工前请先重新开工”；结案只读提示按状态显示。历史纠错例外仍保留在纠错入口。 |
| P10 中 | 已实施，待验收 | “报废数量沿用来源异常事实；补料品种和数量必须人工选择，不按异常数量自动推算”：[AbnormalReworkPanel](../apps/admin-web/src/views/production/components/AbnormalReworkPanel.vue) | 语义有用但偏规则说明 | 改为“报废数量取自原异常记录。请按实际需要选择补料品种和数量，系统不会自动填写。”保留原异常数量来源。 |
| P11 高 | 已实施，待验收 | “仅记录已经领到产线的损坏物料。不办理退料、不产生库存流水、不生成补料或补产，也不计入成品报废。结案审批驳回不会撤销本次损坏事实”：[ProductionCloseoutMaterialLossDialog](../apps/admin-web/src/views/production/components/ProductionCloseoutMaterialLossDialog.vue) | 多重否定、库存实现词，后果却很重要 | 拆分并改写：“用于登记已领到产线的物料损坏。登记后会扣减可退上限，不改变仓库库存；补料需另行申请。本次登记立即生效，结案审批驳回也不会撤销。”成品报废与退料边界放相关字段说明。对应确认框保留品种、数量和扣减前后值。 |
| P12 中 | 已实施，待验收 | “当前记录只读，后续办理以最新任务状态及服务端资格为准”：[ProductionOutputDialog](../apps/admin-web/src/views/production/components/ProductionOutputDialog.vue) | 用户不能操作“服务端资格”，没有下一步 | 改为“当前产出记录仅可查看。请在生产任务中核对当前状态和可办理操作。”若已有具体阻断原因，优先显示具体原因，不能让用户误以为刷新一定解锁。 |
| P13 中 | 已实施，待验收 | “核对检查事实后明确选择记录，再保存产出草稿；记录不会自动绑定”：[ProductionOutputReviewForm](../apps/admin-web/src/views/production/components/ProductionOutputReviewForm.vue) | 绑定是数据关系术语 | 改为“请选择本次产出使用的质检记录，再保存草稿。”未选择时显示字段校验；不自动选择最新质检。 |
| P14 高 | 已实施，待验收 | “更正会全量冲销原记录并生成替代记录，原事实和原因继续留存”：[ProductionReportAdjustmentDialog](../apps/admin-web/src/views/production/components/ProductionReportAdjustmentDialog.vue) | 后半句技术化，但更正/增减区别不能丢 | 保留“填写更正后的完整正常数量，不是增减数量”；后半句改为“更正后将以新记录替代原报工，原记录和更正原因保留供查阅”。冲销操作独立表达，不能统称删除。 |
| P15 中 | 已实施，待验收 | “该操作只做成功完工后的行政归档，不改变批次生产事实”：[WorkOrderTransitionDialog](../apps/admin-web/src/views/production/components/WorkOrderTransitionDialog.vue) | 抽象、冗长 | 改为“归档用于收纳已完工工单，不改变生产记录。”影响不大时放归档确认框，普通列表不重复常驻。 |
| P16 中／需确认术语 | 部分实施：履约术语待确认 | “事实已变化，需重核”“待履约”“取消未履约补料单”：[共享生产状态](../packages/constants/src/production/statuses.ts)；“补料履约依据”：[DemandCorrectionEvidence](../apps/admin-web/src/views/production/components/DemandCorrectionEvidence.vue) | 常量会同时影响多个模块；“履约”未必等于出库 | “事实已变化”可改“相关记录已更新，请重新核对”。其余先逐状态确认是待领料、待补料完成还是待授权生效，再定名称；不能全局把履约替换成“已出库”。状态代码不变。 |

## 3. 采购与仓储（10 组）

| 编号／优先级 | 实施状态 | 原文案与来源 | 问题 | 建议文案与处理 |
| --- | --- | --- | --- | --- |
| W01 中 | 已实施，待验收 | “独立办理，不计入采购或生产履约”：[OtherInventoryOrdersPanel](../apps/admin-web/src/views/warehouse/components/OtherInventoryOrdersPanel.vue) | 内部范围说明，且入出库共用 | 按方向改写。入库：“用于采购收货、生产入库以外的入库”；出库：“用于生产领料以外的出库”。完整来源边界留帮助/所有者文档，不暗示允许新业务场景。 |
| W02 中 | 已实施，待验收 | “未产生库存流水”：[OtherInboundHistoryGroups](../apps/admin-web/src/views/warehouse/components/OtherInboundHistoryGroups.vue)、[OtherInventoryOrdersPanel](../apps/admin-web/src/views/warehouse/components/OtherInventoryOrdersPanel.vue) | 用户关心库存是否变化 | 在已取消分支改为“已取消，库存未变动”。必须限定该取消单，不能泛指整个库存从未变动。 |
| W03 高 | 已实施，待验收 | “创建时冻结所选库存批次与库存状态的账面数量……”及“创建并冻结账面数”：[StockChecksPage](../apps/admin-web/src/views/warehouse/StockChecksPage.vue) | “冻结”容易被理解成冻结实际库存 | 改为“创建盘点单时记录当前账面数量。完成前若相关库存发生变动，本单无法完成，需重新盘点。”按钮“创建盘点单”。不能声称创建后阻止出入库。 |
| W04 中 | 已实施，待验收 | “完成时系统会重新核对账面快照，并在同一事务内生成差异调整流水”：同上 | 同一事务属于实现保证 | 保留“可以分次保存实盘数量；全部录入后才能完成盘点”；后半句改为“完成后按盘点差异调整库存”。确认框继续显示实际差异项数，删除事务说明。 |
| W05 中 | 已实施，待验收 | “数量仅由库存流水聚合，页面不可编辑。成品不参与物料分配和物料盘点”：[WarehouseInventoryPage](../apps/admin-web/src/views/warehouse/WarehouseInventoryPage.vue) | 聚合是实现词；两个对象范围同时展示 | 改为“库存数量根据出入库记录自动计算，不能直接修改。”成品限制仅在成品相关位置/帮助展示，不能推导出新的成品盘点功能。 |
| W06 高 | 已实施，待验收 | “确认结果未知：已保留原授权、数量、目标批次和幂等键。请核对记录后按原操作重试”：[FinishedGoodsInboundDialog](../apps/admin-web/src/views/warehouse/components/FinishedGoodsInboundDialog.vue) | 关键库存写入提示被内部机制占据 | 改为“暂时无法确认是否已入库，本次填写内容已保留。请先核对入库记录，或重试本次确认；请勿重新建单。”保留输入锁定及安全重试，不自动刷新替换依据。 |
| W07 中／需确认术语 | 已实施，待验收 | “当前履约与仓库待办”“履约方式”“仅列出原单已下单、可引用的到货履约行”：[PurchaseOrderLines](../apps/admin-web/src/views/procurement/components/PurchaseOrderLines.vue)、[PurchaseOrderSupplementDialog](../apps/admin-web/src/views/procurement/components/PurchaseOrderSupplementDialog.vue) | 采购普通用户难以判断含义；不能机械等同收货 | 分别建议“到货处理与仓库待办”“到货方式”“仅显示原采购单中已下单、可引用的到货明细”。“履约方式”的具体枚举必须先核对是否仅表示物流到货/补单承接，确认后采用。 |
| W08 高 | 已实施，待验收 | “旧拒收决定退出当前效力”“全部未处置分配将被替代”“已入／已退事实保留”（摘录）：[ReceiptLineActionDialog](../apps/admin-web/src/views/procurement/components/ReceiptLineActionDialog.vue) | 更正实收后果难理解，不能简单删警告 | 按原分支拆写：“更正后，原拒收决定不再适用，剩余物料需重新检验；如需拒收，请重新办理。”“尚未入库或退回的数量安排需重新确认。已入库和已退回记录不变。”保留不是新增到货/真实损耗的限制及零量处理语义。 |
| W09 中 | 已实施，待验收 | “当前无未处置量，不能直接更正正式分配……已入与已退事实保留”（摘录）：[ReceiptDetailDialog](../apps/admin-web/src/views/procurement/components/ReceiptDetailDialog.vue) | 复合条件长、抽象 | 改为“当前没有待处理数量，无法调整入库和退回安排。若实收总数有误，请先更正实收；新增待处理数量须重新检验并由仓库确认。已入库、已退回记录不变。”仅在对应阻断状态显示。 |
| W10 中 | 已实施，待验收 | “库存事实 ID”：[ReceiptHistoryDialog](../apps/admin-web/src/views/procurement/components/ReceiptHistoryDialog.vue) | 标识不说明对象 | 先确认对应字段确为库存流水 ID，再改为“库存流水记录 ID”；放追溯辅助区，不抢占业务单号。无业务单号时保留真实 ID，不能伪造编号。 |

## 4. 质量检验（6 组）

| 编号／优先级 | 实施状态 | 原文案与来源 | 问题 | 建议文案与处理 |
| --- | --- | --- | --- | --- |
| Q01 中 | 已实施，待验收 | “检查事实”：[FinishedInspectionPanel](../apps/admin-web/src/views/quality/components/FinishedInspectionPanel.vue)；“可继续填写检查事实与放行结论”：[InboundInspectionDetailDialog](../apps/admin-web/src/views/procurement/components/InboundInspectionDetailDialog.vue) | 标题和操作提示技术化 | 改为“检查结果”“可继续填写检查结果与放行结论”；不把检查结果合并为入库资格或批准产出。 |
| Q02 中 | 已实施，待验收 | “发起时申报快照”“与发起申报快照相差”：[InboundInspectionFields](../apps/admin-web/src/views/procurement/components/InboundInspectionFields.vue)、[InboundInspectionHistory](../apps/admin-web/src/views/procurement/components/InboundInspectionHistory.vue) | “快照”不自然 | 改为“送检时申报数量”“与送检时申报数量相差”；必须明确历史时点，不能简化为可能随时变化的“申报数量”。 |
| Q03 中 | 已实施，待验收 | “本结论不自动形成入库或退回事实”：[InboundInspectionFields](../apps/admin-web/src/views/procurement/components/InboundInspectionFields.vue) | 事实词汇；用户关注还需谁办理 | 改为“检验完成后仍需仓库确认，入库或退回需另行办理。”保留来料检验与仓库定稿的职责边界。 |
| Q04 中 | 已实施，待验收 | “抽检仅记录样本事实，不推算整批数量；产出仍须核对审批，不合格不自动报废”：[FinishedInspectionFacts](../apps/admin-web/src/views/quality/components/FinishedInspectionFacts.vue) | 准确但可以更直接 | 改为“抽检结果仅代表样本，不换算整批数量。产出需另行审批，不合格品需另行处理。”若“处理”太泛，保留“不合格不自动报废”短句；不能删去抽检口径。 |
| Q05 高 | 已实施，待验收 | “零产出不得伪装为抽检，零量清单不办理成品入库”（摘录）：[FinishedInspectionPanel](../apps/admin-web/src/views/quality/components/FinishedInspectionPanel.vue) | “伪装”带指责语气，用户可能只是不了解规则 | 改为“零产出请按零产出确认填写说明和凭据，不使用抽检方式，也不办理入库。”保留已单独登记报废不再次计入送检范围的说明。 |
| Q06 中 | 已实施，待验收 | “放行后返回产出清单，明确引用记录并保存……待复检或不放行继续阻断”（摘录）：同上 | 引用、阻断偏技术表达，行动路径不醒目 | 改为“放行后，请返回产出清单选择本次质检记录并保存。完成收尾和物料核对后可提交审批；待复检或未放行时暂不能提交。”不能提示放行后自动审批或自动入库。 |

## 5. 产品、系统和审批（4 组）

| 编号／优先级 | 实施状态 | 原文案与来源 | 问题 | 建议文案与处理 |
| --- | --- | --- | --- | --- |
| M01 中 | 已实施，待验收 | “启用后该版本的步骤、SOP 和规则快照将不可修改”“工序顺序和规则快照已保存”：[ProcessRoutesPage](../apps/admin-web/src/views/product/ProcessRoutesPage.vue) | “规则快照”无助理解启用影响 | 改为“启用后，该版本的工序、SOP 和工艺要求不能修改；如需调整，请创建新版本。”“工序顺序和工艺要求已保存。”先核对规则字段的业务叫法，保留不可修改限制。 |
| M02 中 | 已实施，待验收 | “该 BOM 已审批通过并永久锁定，当前仅可查看。原则变化请新建产品和产品编码”：[ProductMaterialDialog](../apps/admin-web/src/views/product/components/ProductMaterialDialog.vue) | “原则变化”不是清晰的业务动作 | “该物料清单已审批通过，仅可查看。若物料的材料、关键参数等根本属性发生变化，请新建物料并使用新编码。”根本属性边界见 [Product](../apps/api/src/modules/product/docs/product-rules.md#稳定身份与工作流)，不泛指所有用料调整，也不解除 BOM 锁定或套用工艺路线版本规则。 |
| M03 中 | 已实施，待验收 | “详情定位更新失败”：[ApprovalInboxPage](../apps/admin-web/src/views/approval/ApprovalInboxPage.vue) | 错误发生在关闭详情清理路由参数，原文像开发诊断 | 改为“审批详情页面状态更新失败，请刷新页面后重试。”只调整这条路由失败提示，不能说审批操作失败或已撤回。 |
| M04 中 | 已实施，待验收 | “通知 ID 或版本无效”“通知操作需要登录身份”：[notification.service](../apps/api/src/modules/notification/application/notification.service.ts) | 普通用户无法修复版本/身份参数 | 分别建议“通知信息无效，请刷新通知列表后重试”“请先登录后再操作通知”。先确认调用方为本人通知命令；内部事件发布校验不应误列为前端常驻提示。 |

## 6. API 返回、校验与诊断边界（8 组）

| 编号／优先级 | 实施状态 | 原文案与来源 | 可见性与问题 | 建议文案与处理 |
| --- | --- | --- | --- | --- |
| A01 高 | 部分实施：完整 DTO 字段名称待补 | “请求包含未允许的字段：…”；字段路径 + “必须是字符串／数字字符串／布尔值／数组／对象／有效的 UUID”：[validation.pipe](../apps/api/src/presentation/http/validation.pipe.ts) | ValidationPipe 返回 400，前端可能直接提示；中文化仍保留参数结构术语 | 常规输入使用业务字段名，如“数量必须为整数”“请选择有效的物料”。未知字段/结构异常使用“提交内容格式不正确，请重新打开页面后重试”；机器字段路径保留在技术诊断。需逐 DTO 标注名称，不能只做全局正则替换或改变校验条件。 |
| A02 中 | 已实施，待验收 | “不支持当前请求方法”“不支持当前媒体类型”“上游服务异常”：[http-exception.filter](../apps/api/src/presentation/http/http-exception.filter.ts) | HTTP 默认兜底可对用户返回；描述协议而非操作 | 普通 UI 统一为“暂时无法完成操作，请稍后重试；如仍失败请联系管理员”。上传场景按实际原因显示“文件格式不受支持”；不能把所有 415 都断定为文件类型问题。保留错误码/请求编号供排查。 |
| A03 中 | 已实施，待验收 | “幂等键长度必须在 1 到 150 个字符之间”“幂等命令缺少已校验的 Idempotency-Key”：[idempotency-key.guard](../apps/api/src/infrastructure/idempotency/idempotency-key.guard.ts)、[auth.decorators](../apps/api/src/common/security/auth.decorators.ts) | 异常客户端可收到；属调用协议异常，不是普通表单错误 | 面向用户：“本次提交校验失败，请先核对操作结果，再重新打开页面或联系管理员。”技术调用者仍需要稳定错误码与具体诊断；不应提示用户手工编辑请求头。 |
| A04 高 | 已实施，待验收 | “生产任务已有物料出库事实，不能取消”：[mysql-production-batch.repository](../apps/api/src/modules/production/infrastructure/tasks/mysql-production-batch.repository.ts) | 业务错误会映射返回 | 改为“该任务已有领料出库记录，不能取消。”不建议用户删除记录绕过限制。 |
| A05 中 | 已实施，待验收 | “领料、退料或损耗事实已变化，请刷新核对”：[mysql-production-closeout-material-loss.repository](../apps/api/src/modules/production/infrastructure/closeout/mysql-production-closeout-material-loss.repository.ts)；“产出、检验依据或收尾事实已变化，请刷新核对”：[mysql-production-output.repository](../apps/api/src/modules/production/infrastructure/closeout/mysql-production-output.repository.ts) | 并发更新类业务错误，真正需要重新核对 | 将“事实”改为“记录”，保留具体对象及刷新核对动作；必须配合前端保留未保存输入，不自动覆盖草稿。 |
| A06 中 | 已实施，待验收 | “当前到货、质检及退回事实不满足所选关闭条件”：[mysql-purchase-order.repository](../apps/api/src/modules/procurement/infrastructure/mysql-purchase-order.repository.ts) | 业务阻断原因笼统 | 改为“当前到货、检验或退回情况不符合所选关闭方式，请核对相关记录。”若已有具体阻断字段，应直接显示未完成事项；本轮不新增或推测关闭条件。 |
| A07 高 | 已实施，待验收 | “检验命令必须位于来源业务事务中”“检验当前读要求来源活动事务”：[mysql-quality-inbound.repository](../apps/api/src/modules/quality/infrastructure/mysql-quality-inbound.repository.ts)、[mysql-quality-finished.repository](../apps/api/src/modules/quality/infrastructure/mysql-quality-finished.repository.ts) | 这两处是 QualityCommandError，模块[异常映射](../apps/api/src/modules/quality/presentation/http/quality-command-exception.filter.ts)保留 message；属于内部调用错误，却可能成为业务冲突文案 | 用户看到“当前无法办理检验，请联系管理员处理”并附排查编号；具体事务诊断留日志。是否调整异常分类需单独评审，不能仅为了文案把所有错误吞掉。普通内部 Error 已有兜底，不应一起批量替换。 |
| A08 中 | 已实施，待验收 | “报工事实数量或单位不一致”“返工完成事实存在重复或状态不一致”等：[production-step-quota-distribution.policy](../apps/api/src/modules/production/domain/production-step-quota-distribution.policy.ts) | 作为不可用原因进入执行展示；这是异常数据而非用户输入错误 | 分别改为“报工记录的数量或单位不一致，请核对相关记录”“返工完成记录存在重复或状态不一致，请联系管理员核对”。不能隐藏异常后显示零数量，也不能提示盲目重试写入。 |

## 7. 保留项与不能机械替换的内容

- **现有普通业务提示多数可以保留。** 例如“请选择物料”“当前账号没有执行此操作的权限”“当前没有分配给你的工序”“账号已停用，请联系管理员”已经指向用户的操作或状态，不需要为了统一而改写。
- **权限目录和操作日志不是普通业务页。** [PermissionsPage](../apps/admin-web/src/views/system/PermissionsPage.vue) 中的权限编码、路由、接口路径，以及日志中的请求编号、IP、对象标识可保留；采用次要层级展示即可，不删掉排查能力。
- **精确版本、库存批次、BOM、SOP、冲销属于必要业务概念。** 首次使用可增加短解释，不宜统一改成模糊的“信息”“文件”“撤销”。“冲销”尤其不能改为删除；“不合格”不能改为报废，“批准产出”不能改为已入库。
- **冻结需要逐义区分。** 库存冻结、审批期间禁止修改与盘点记录创建时账面数不是同一种状态。不能全局替换“冻结”。
- **履约需要逐状态确认。** 采购到货、补料、需求关闭、补产授权生效的边界不同，建议词只是候选，不能据此更改状态代码、公式或写入资格。
- **不可撤销、差异数量、关闭后的重复风险保持可见。** 只精简实现细节；不能把安全提示全部移入折叠、悬浮帮助或文档。
- **保留真实历史编号。** 普通列表可弱化原始 ID，追溯详情仍需可核对；缺少业务单号不能用序号或拼接编号冒充。
- **内部日志和未处理 Error 不属于用户文案。** 全局[异常过滤器](../apps/api/src/presentation/http/http-exception.filter.ts)对普通未知异常返回统一提示，源码中的事务、投影等诊断不能仅凭关键字命中判为泄漏。幂等存储类也要连同前端错误码覆盖一起判断，不把底层原文与最终显示算成两处独立问题。

## 8. 实施与验收状态

- **已实施 52 组：** C01–C10、P01–P15、W01–W10、Q01–Q06、M01–M04、A02–A08。仅调整用户表达和恢复状态对应的提示，技术诊断、错误码、请求编号、接口字段、HTTP 状态及业务限制保留。损坏登记的重试按钮在不可安全重试时禁用，初次提交和底层写入状态机不变。
- **部分实施 2 组：** A01 已处理结构异常、已核对的共用字段、明确自定义提示和数值范围；完整 DTO 的业务字段名称仍待逐项核对，不猜测未知路径的业务含义。P16 仅实施“相关记录已更新，请重新核对”；补料、需求关闭及补产授权中的履约术语保留，待分别确认。
- **已核对的术语边界：** M02 仅说明决定成品或物料身份的根本属性，产品与物料分别使用自身新编码；具体定义由上述 Product 文档维护。W07 依据 Procurement 的 new_arrival/existing_receipt 定义使用“到货方式”，不改变具体枚举及承接规则。

用户提示的共同表达约束见[前端 HTTP 错误处理](../apps/admin-web/docs/http-error-handling.md#7-错误对象与页面责任)，API 校验诊断边界见[API 文档](../apps/api/README.md#http-错误诊断)，不在清单内复制完整规范。

待验收：用户能从提示知道当前是否成功、能否继续及下一步入口；失败保留输入；不诱导重复入库、重复报工或覆盖草稿；不可撤销和审批限制保持可见。覆盖 pending、blocked、expired、并发变化、正常校验和结构异常，以及普通账号与管理员。正式测试仍按根 [AGENTS.md](../AGENTS.md) 的授权顺序执行，本阶段未编写、调整或运行正式测试。
