# 追踪卡、工序交接与最终产出

Production 以任务下的追踪卡表示一盘实物。卡、到站、交接报工、随盘异常和最终确认产出由本模块唯一拥有；实际库存只由 [Inventory](../../../inventory/docs/database.md) 记账。工单及任务生命周期见[工单与任务](work-orders-and-batches.md)和[任务开始与结束](production-termination.md)。

## 执行身份与顺序

批量任务正式下达时一次保存所选路线的工序顺序、编码、名称及 SOP 快照，之后不更换；草稿只保存路线引用，不生成工序。阶段与编辑边界见[工单与任务](work-orders-and-batches.md)。工序定义本身不再拥有派工、开工、完工或数量状态，每张卡分别流转。中间的检验工序与普通工序采用相同扫码操作；路线最后一道工序统一承担最终产出确认，不设置另一套成品检验轮次。

扫码输入是卡号、目标工序和现场登记人员。人员来自 Identity 的统一现场人员目录，扫码、报工、异常及最终产出确认均使用当前启用且未删除的人员，资格由[人员目录](../../../identity/docs/database.md#110-personnel)所有。业务事实保存所选人员 ID、编码、姓名快照，并独立保存实际登录操作者。

任务必须先由有权限的账号明确开始，只有 doing 批量任务可以建卡。首工序现场单盘建卡时，服务器从本任务冻结路线取得首站，以建卡时选定的现场人员同时登记该卡首站到站，初始状态为 in_progress。该命令只记到站，不完成首站、不计报工、产出或库存；单工序路线也须另行明确确认最终产出。

批量预制按总数量和每盘数量拆分，完整盘先生成，余量生成最后一盘，例如 85／25 生成 25、25、25、10。全部数量均为 1 至 99999999 的整数；一次最多张数由 [PRODUCTION_TRACKING_CARD_BATCH_LIMIT](../../../../../../../packages/constants/src/production/tracking-card.ts) 维护，超过上限整体拒绝。所有卡初始为 unused，不产生到站事实。拆分校验先于取号，整批共享一个事务和幂等意图，计数、所有卡及成功审计原子提交，成功结果保存整批真实卡身份。建卡与打印独立；打印及补打只使用已有卡号，不重新建卡或取号。

预制卡及升级前已有 unused 卡首次只能扫路线首站，只形成到站事实，不计报工。下一站扫码须恰好是冻结路线的下一道工序，在同一事务中完成前站交接报工并登记本站到站；前站报工数量取交接时的当前剩余盘量，归属前站原登记人员，不归属本次扫码人员。已到过的工序再次扫码不重记到站、不重记数量、不换登记人员。未经过的工序不得跳站，不能用工序名称替代冻结工序 ID。升级不为旧卡补造到站或更改人员历史。

每站到站身份永久保留；交接完成时间、操作者和数量只允许由空值写入一次。任务级报工总量不作为最终产出，工作台逐站汇总已完成交接事实。

## 任务内卡号

新建追踪卡使用 `任务号-k-序号`，序号使用不补零的完整正整数，例如 `SC20261119-8-k-1`；位数随序号自然增长，不截断或换日重置。同一任务的现场单盘和批量预制共享一个计数，跨日、任务结束和恢复均继续递增；作废、报废或取消不回收已提交序号。卡号只表达可打印身份，不替代任务、卡及冻结工序 ID，不从编号解析写入资格。

标签条形码使用 `YYMMDD任务日序号k卡序号`，下方文字和数据库仍保存完整卡号，例如 `SC20261119-8-k-1` 编码为 `2611198k1`，还原时也不补零。两个序号均使用不补零的完整正整数，超过三位不截断；前六位是任务编号中的日期，`k` 分隔任务日序号与卡序号。两位年份固定对应 2000—2099，不按扫码当天推断世纪；不符合当前任务内卡号规则或年份范围的编号不生成短码。前后端共用纯转换规则，服务端在扫码及追踪码查询时还原完整卡号；手输完整卡号也可定位。转换只用于查找已有卡，权限、任务、工序顺序、人员和状态仍按原业务校验，不从短码推断写入资格。

计数由 Production 的 `production_tracking_card_sequence` 唯一保存，运行时只经 [mysql-production-tracking-number.ts](../../infrastructure/tracking/mysql-production-tracking-number.ts) 在当前业务事务中分配；一次批量锁定计数并分配完整区间，不扫描业务 MAX／COUNT，也不预领号。整批最终序号须处于 BIGINT UNSIGNED 范围，全部卡号须不超过 100 字符；溢出时整体拒绝。计数、卡、现场建卡的首站到站、成功审计及 HTTP 幂等结果同事务提交，失败整体回滚，成功重放不重新取号。

旧卡号及平台 `production_tracking_card` 日计数保留为历史，不重编号、不回填新序号。升级后每个已有任务的新计数从 1 开始，仅代表新规则分配顺序，不声称与旧卡的总张数连续。该任务内计数是[平台日编号](../../../../../docs/business-numbering.md)的明确例外，其他业务日编号不变。

## 盘量更正与作废

建卡数量为正整数。非终态且当前盘量为正时，可按卡版本更正为另一正整数，更正后的盘量不得小于本卡全部 open 异常影响数量合计，也不得小于有效单件刻码数，必须填写原因并追加更正前量、新量、操作人和时间。手工盘量更正是独立纠错，不能代替异常报废结算；更正影响后续交接和最终确认，已完成站点的报工快照保持原值，不能静默覆盖。

盘量为正的未用卡和已用卡可填写原因作废，已有到站、报工、异常和更正记录保留。整盘误报的纠错按[随盘异常](#随盘异常)办理。已确认产出的卡需先撤销未入库产出。入库后的库存补差由 Inventory 独立处理。

## 单件刻码

单件刻码是实物上的数字标记，与 Product 成品主数据编码不同。一条绑定表示本卡的一件实物，一卡一件和一卡多件使用相同模型。实物刻码全局唯一，以不带前导零的数字字符串保存、比较和展示，不得转成 JavaScript Number 导致长码精度丢失。新绑定、更正和查重均要求最多 32 位数字组成的正整数，`001` 规范化为 `1`。已有 `0` 及其关联按原值保留，继续按原有绑定状态参与生产流程，支持展示与追溯。现场确认录入错误时可通过带原因的更正命令填入正确刻码。仅凭实物刻码可定位当前绑定和原追踪卡，入库追溯再沿该卡的有效产出查询本盘入库单。卡号与刻码以 `-` 拼接的完整追溯码仅作组合展示，不再承担唯一性的范围限制；不重复保存任务、产品、完整码或恒为一的数量。

所有使用追踪卡的批量任务均要求终检前绑齐单件刻码，不设置任务开关。执行中批量任务的 unused 预生成卡和 in_progress 流转卡均可绑定，不要求先到站，也不限制工序名称或位置；卡须没有待处理异常，登记人员须当前有效，绑定数不能超过剩余盘量。绑定只登记单件身份，不完成到站、交接或打标机操作。实际刻码由现场核对，输入自动递增不构成服务器分配全局号段。研发任务仍不使用追踪卡，产出按原研发规则办理。

当前实物码在全库唯一，正常件和报废件都占码。录错号码可对同一件留因更正，包括已报废、已终检、已入库或任务结束的单件。更正保留原卡、登记人员、报废及产出关联。旧错误输入和已撤销绑定仅供历史查询；按实物码追溯时查当前归属。

同一任务内可以一次提交多卡的绑定、改号、清空及号码互换。可办理的卡按当前剩余盘量减正常绑定数推导待绑名额。预览和查重均不占号，只有实际提交并成功绑定的单件才占用编码。清空错误绑定释放号码及本卡名额，盘量不变，已撤销的登记只读。报废件及已有有效终检产出的件只允许纠正同一件录错的号码，不能清空或参与号码互换。返修完成或误报恢复的实物继续使用原身份。

整次保存按最终号码分配核验唯一性和逐卡容量。跨卡换绑在同一事务内完成，改动前后的卡和号码由全局操作日志记录。翻页或提交中的中间值不参与占号，任何一行冲突均回滚整次保存。

新登记报废时，按实物选择本卡有效编码。前道（含尚未到站）允许同一笔报废包含已绑定件和未绑定件：所选编码数不得超过报废件数，两者之差不得超过本盘未绑定余量。末道须逐件选齐。系统以结算时本卡在冻结路线的实际位置决定规则，另选的异常关联工序仅用于追溯。历史未结异常沿原口径办理，无码数量只可来自未绑定余量。

每张卡在终检确认时，必须满足有效、未报废、未撤销的绑定数等于当前剩余盘量，且原有末站及异常清零条件成立；按每张卡独立检查，不等待同任务其他卡。产出保存当次有效绑定关联，表示这些实物随本卡完成终检，不表示分别登记过独立检验结果。产出撤销保留原关联及绑定事实，再次确认按当时有效绑定重新建立关联。卡作废只停止所属卡办理，不把绑定转为实物报废；已入库后的处理继续遵守原产出和库存边界。

绑定、释放、异常结算或纠错、盘量更正及终检在工单、任务和卡锁内核对资格。登记状态由当前占码及有效报废关联推导。同一实物在同一时刻最多归属一笔有效报废。

正整数规则在应用命令层生效，沿用现有表结构。发布前结束旧客户端的绑定和更正操作，发布后刷新页面，按当前[幂等作用域](../../../../../docs/idempotency.md#13-scope-版本与保留升级)提交新意图。旧作用域的成功结果保留原快照。

## 随盘异常

同一异常模型覆盖普通工序、中间检查、随机抽检和终检发现。同一卡可多次登记独立异常发现，复用相同描述标签不合并发现记录；每次包含卡、可选关联工序、影响数量、独立描述标签、所选现场人员和实际操作者。影响数量必须是正整数，本次影响数量与本卡已有全部 open 异常影响数量之和不得超过锁定后的当前盘量。未处理数量合计占用新登记额度，多个标签共同描述这一次发现，不逐标签重复计量。关联工序用于记录现场已明确的工序关联，不表示原因或责任判定；省略或显式为空均保留未关联，不自动采用当前站。显式指定的工序必须是本卡已经到站或经过的冻结工序，支持终检关联前道问题；尚未到站和已到站的卡均可登记不带工序的一般异常。

描述可多选关联工序历史标签，也可输入新标签；每枚分别登记，不把多选后的展示拼接文本创建成标签。标签库归 Production 所有，以 Product 标准工序 ID 分组，跨任务、路线及路线版本复用，不以本次冻结工序 ID、编码或名称分隔。Production 先核验关联站，再经 Product 公开历史能力解析其路线步骤对应的标准工序；停用或软删除不抹去历史身份。没有关联工序的记录使用独立的一般异常标签域，历史候选查询与新登记使用同一标签域，不猜测归入某道工序。

已登记的标签原文不可修改或删除，选中历史原文时保持首尾空白与大小写；仅真正的新输入去除首尾空白后登记，同域按完整文本精确去重，不拆分标点或换行。新上报的数量及长度上限由共享常量和 DTO 维护。卡列表与详情按发现及标签顺序汇总所有异常的标签，包含已处理记录并按原文去重；汇总不是新的异常事实或不良品数量。

新登记使用已经确认的现场结果，一条异常选择返修或报废并当次结算。返修完成保持盘量及单件身份，报废扣减本次实际数量。结果不同的实物分别登记。原始异常量、标签、现场人员、原始处理及原扣量快照一并留存。

历史 open 异常仍占用登记额度并阻止整盘后续流转，其一次性结算满足：返修数量 + 新增报废数量 + 各关联已有报废数量 = 原异常影响数量。返修与新增报废之和不超过当前盘量，只有本次新增报废扣量。

历史重叠结算只可引用同一卡其他异常中仍有效的实际报废来源。同一来源在一笔结算内只用一次，引用量不超过来源有效报废量。不同异常可以分别引用同一来源。已形成历史重叠的处理及其被引用的来源保留原事实。

新登记额度约束新上报及盘量更正命令，不将既有发现重释为实物互不重叠。历史发现、处理及关联事实保持原义，不按新额度回填、去重或改写；系统无法仅凭历史数量推断实物重叠关系，既有异常仍按原有高级结算规则办理。

更正报废提交该笔更正后的正整数总数和原因，沿用首次结算冻结的选码规则。允许选码的记录提交更正后全部实际报废编码，可保留本笔原有效报废码或选入本卡有效绑定。历史只按数量办理的记录继续按数量更正。当前盘量增加原有效报废数，再减新数，仍须满足未结异常占量、有效绑定与数量上限。只换码时盘量保持原值。作废整笔报废恢复当前仍扣减的数量及编码，作废返修只登记作废。原始发现及结算快照保留，当前有效结果取最新纠错。

纠错要求任务在执行中，卡无有效产出且未人工作废。混合结算及已有上下游重叠归因的记录保留历史口径。既有纯报废若缺少原站依据，允许依据原实扣与原编码整笔作废，更正数量或换码须能确定原结算口径。既往已完成交接的数量快照保留。异常与盘量按各自版本在同一卡锁内校验，纠错、编码归属、盘量、状态及成功审计原子提交。

标签字典跨任务共享，新标签按摘要稳定顺序登记，再按用户选择顺序保存关联；写后不可变标签使用共享锁当前读，避免不同卡因外键共享锁升级互锁。兼容旧追踪卡幂等结果时，codec 严格识别完全没有标签字段的旧结构，将每条原始 description 原文投影为单标签，并由这些原结果汇总卡标签；不拆原文、不生成标签 ID、不读取当前业务状态，也不改持久化的旧快照。异常上报及处理使用新 scope，旧客户端意图不得自动迁入。

卡量为零且仍有历史 open 异常时保持原位置，继续办理已有异常结算。零量且全部结清后为整盘报废，保留此前交接，无产出或库存。误报纠错使零盘恢复正量时，有到站位置的回到原站流转，未到站的回到未用状态。

卡最终确认前必须处理全部未完成异常。异常结算不自动创建返工单、补产授权、物料需求或审批；实际需要更多物料时按[需求规则](demand-allocation-and-outbound.md)另行提需。产品新增报废由本节结算表达，与已领物料损耗分开。

## 末站最终确认与入库

末站扫码仍只登记到站并完成前站交接，不自动确认产出。登记现场人员并显式确认完成，批量卡请求不接受最终数量；服务器使用锁定后的当前剩余盘量生成一次最终产出。实际盘量错误须先独立留痕更正，质量损失须先按异常结算。整盘报废不走最终产出确认。

确认命令在卡版本锁内复核任务仍在执行、卡位于冻结末站、全部异常已处理，并通过 Identity 公开能力核验所选人员当前启用且未删除。登录账号还必须独立具备最终确认权限，选择登记人员不授予业务权限。

确认事实写入 `production_tracking_output`；末站完成事实、卡 completed 状态及成功审计同事务提交，正数进入待入库，暂不创建库存单据或批次。工单及任务只汇总未撤销产出，不受计划量限制，不读取库存余额或后续调整作为产出依据。人工合批入库见[成品入库](finished-goods-inbound.md)。

研发任务不建追踪卡、路线或到站记录，在任务级登记现场人员、手填实际产出，可分多次确认。每次记录独立，允许零；正数待入库，零数不生成库存。`tracking_card_id` 为空，不设每任务一次的限制。

尚未入库的有效产出可填写原因撤销；命令在任务、卡及产出锁内核验没有实际入库，追加不可变撤销事实，不改原产出。批量卡回到末站 in_progress，原到站及首次末站完成快照保留；再次确认产生新产出，不能改写旧交接记录。已结束任务须先恢复执行；所属工单已终态时不再撤销生产事实。撤销与入库共享来源锁，二者互斥。

| 卡状态转换                     | 触发与边界                                                     |
| ------------------------------ | -------------------------------------------------------------- |
| 新建 → unused                  | 批量预制，只建卡，不记到站                                     |
| 新建 → in_progress             | 首工序现场单盘建卡，以同一人员只记首站到站                     |
| unused → in_progress           | 预制卡或已有未用卡首站扫码，只记到站                           |
| in_progress → in_progress      | 无 open 异常时按冻结顺序交接到下一站                           |
| unused／in_progress → 原状态   | 登记异常、独立改量、结算后仍有正量或零量未结异常；均推进卡版本 |
| unused／in_progress → scrapped | 结算后卡量为零且无 open 异常                                   |
| scrapped → unused／in_progress | 更正或作废原报废登记后恢复正量，回到原到站位置                   |
| in_progress → completed        | 已到末站、无 open 异常、正量，登记现场人员并显式确认           |
| unused／in_progress → voided   | 正量卡明确作废，保留全部已形成事实；任务结束不自动作废         |
| completed → in_progress        | 未入库产出明确撤销，保留原末站到站与完成快照                   |

completed 仅可通过撤销未入库产出恢复。scrapped 只可因有据的异常纠错恢复盘量，voided 保留终态。整盘报废期间不能扫码。

## HTTP、权限与并发边界

请求和响应结构以 [tracking-card.ts](../../../../../../../packages/contracts/src/production/tracking-card.ts) 及 [class DTO](../../presentation/http/dto/production-tracking.dto.ts) 为准。异常详情返回单个 `handling|null`，关联只含来源 handlingId 和数量；终检的批量与研发输入分别建模。所有新写命令要求 Idempotency-Key，完整语义 path 和规范化 body 参与指纹，成功结果完整重放；scope 由[模块契约](../../application/idempotency/production-idempotency-scopes.contract.ts)唯一维护，沿用平台至少保证窗口。同键重放不重复审计、产出或库存。异常登记及盘量更正的语义调整遵守[平台 scope 升级边界](../../../../../docs/idempotency.md#13-scope-版本与保留升级)，发布前结束旧上报及盘量更正表单并刷新，已有异常及持久化结果不改写。

| 接口                                                                                                                  | 权限与合法消费者                                                |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| GET tracking-cards、tracking-cards/:cardId                                                                            | tracking:view 或 workbench:view；卡列表、追踪详情和工作台       |
| GET batches/:batchId/tracking-workbench                                                                               | tasks:view、tracking:view 或 workbench:view；任务内工作台和卡页 |
| GET tracking-reports                                                                                                  | tracking:view 或 workbench:view；逐站交接历史                   |
| POST batches/:batchId/tracking-cards                                                                                  | tracking:manage 且 workbench:operate；现场建卡并首站到站         |
| POST batches/:batchId/tracking-cards/bulk、PATCH tracking-cards/:cardId/quantity、POST tracking-cards/:cardId/actions/void | tracking:manage；批量预制、留痕更正和作废                       |
| POST tracking-cards/scan、abnormalities、handlings、更正报废与作废登记 | workbench:operate；现场办理与误报纠错 |
| POST tracking-cards/:cardId/actions/confirm-output、batches/:batchId/actions/confirm-research-output                  | tracking:confirm-output；登记现场人员并显式确认最终产出         |
| GET batches/:batchId/step-records/:recordId/sop                                                                       | tasks:view、tracking:view 或 workbench:view；冻结 SOP 下载      |

上表权限均带 production 前缀；现场单盘建卡要求两项权限同时满足，其余列出的多项权限为 any-of。卡列表的 keyword 搜索卡号、任务号、工单号、成品编码或名称；精确筛选包括任务、卡状态、当前工序及是否具有指定状态的异常。交接历史按完成时间、ID 倒序分页，可按任务、工序和登记人员筛选。列表筛选不授予任何命令资格。

命令按工单 → 任务 → 卡 → 现场人员资格及相关事实 → Inventory 所需库存对象锁定，共享同池事务。实际命令重新校验状态和版本，扫码用每卡每站唯一约束和卡根锁防重；不能依赖浏览器缓存。展示读取仅访问本模块表，不通过人员当前姓名覆盖历史快照。标签由管理端从真实卡号生成，不把条码解析为新的业务身份。

刻码分页 `GET tracking-item-marks` 接受 tracking:view、workbench:view 或 workbench:operate 任一权限；绑定及误绑撤销均独立要求 workbench:operate，权限同样带 production 前缀。契约见 [tracking-item-mark.ts](../../../../../../../packages/contracts/src/production/tracking-item-mark.ts)，查询和选中记录不授予写入资格。

## 数据库逐表设计

本章是冻结工序与追踪事实表的唯一结构所有者。数量、ID、时间和审计列遵守[数据库公共规则](../../../../../../../docs/database-conventions.md)。迁移新增表为 `202611090010-production-tracking-workbench`，旧执行退役及不可变触发器为 `202611090040-retire-production-execution`，数量结算及关联事实为 `202611090060-tracking-abnormality-disposition`；均为追加，旧基线不改写。结构升级不转换旧报工、产出或无法推导影响数量的异常；0060 在任何追踪卡、追踪事实或研发产出非空时于 DDL 前拒绝，必须使用独立空库。0060 的配对 down 同样只允许追踪子系统为空；已有事实须恢复配套备份，不自动丢弃或重造。

`202611130010-task-tracking-card-sequence` 在已有数据上只追加任务内技术计数表及计数保护，不改旧卡、到站或日计数。迁移先检查历史卡是否占用任一现有任务的 `任务号-k-` 命名空间，命中即在永久 DDL 前停止，须明确处置而非猜造初始序号。停写、备份、中断恢复及 down 边界见[迁移安全](../../../../../../../packages/database/docs/migration-safety.md#任务内追踪卡编号)。

## batch_step_records

保存批量任务正式下达时一次生成的路线工序及 SOP 快照，草稿没有本表记录，下达后不可替换。每张卡独立流转，本表不承担派工、工序状态或数量。

一任务同一路线步骤唯一，id+production_batch_id供追踪事实组合引用。actual_sop_*表示生成快照时显式覆盖的 SOP，既有创建快照保持原样；下载优先该快照，否则使用默认 SOP 快照。当前主数据变化不回写历史。

下达在保存每条工序快照的同一事务内，以该 `batch_step_records.id` 为 owner ID，分别追加 `production_batch_step/default_sop` 和 `production_batch_step/actual_sop` 统一附件引用；即使两者指向同一文件也保留两个槽。无文件的槽不造引用。任务取消、结束、恢复和路线归档均不解除这些历史保留引用。附件对象及清理由 [Attachment](../../../attachment/README.md) 唯一拥有；历史下载经其公开能力核验冻结文件 ID 与对象键，业务外键和快照不替代统一保留引用。

### 字段

| 字段                             | SQL定义                                                                   | 含义                                                 |
| -------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------- |
| `id`                             | `bigint unsigned NOT NULL AUTO_INCREMENT`                                 | 主键，自增                                           |
| `production_batch_id`            | `bigint unsigned NOT NULL`                                                | 生产批次 ID                                          |
| `route_step_id`                  | `bigint unsigned NOT NULL`                                                | 路线步骤 ID                                          |
| `step_order_snapshot`            | `int NOT NULL`                                                            | 工序顺序快照                                         |
| `step_code_snapshot`             | `varchar(100) NOT NULL`                                                   | 工序编码快照                                         |
| `step_name_snapshot`             | `varchar(100) NOT NULL`                                                   | 工序名称快照                                         |
| `sop_file_id_snapshot`           | `bigint unsigned DEFAULT NULL`                                            | 路线默认 SOP 文件 ID 快照，可为空                    |
| `sop_file_name_snapshot`         | `varchar(255) DEFAULT NULL`                                               | 路线默认 SOP 文件名快照                              |
| `sop_object_key_snapshot`        | `varchar(500) DEFAULT NULL`                                               | 路线默认 SOP 对象键快照                              |
| `sop_version_no_snapshot`        | `varchar(64) DEFAULT NULL`                                                | 路线默认 SOP 版本号快照                              |
| `actual_sop_file_id`             | `bigint unsigned DEFAULT NULL`                                            | 下达任务时显式覆盖的 SOP 文件 ID；为空时使用默认快照 |
| `actual_sop_file_name_snapshot`  | `varchar(255) DEFAULT NULL`                                               | 下达任务时覆盖的 SOP 文件名快照                      |
| `actual_sop_object_key_snapshot` | `varchar(500) DEFAULT NULL`                                               | 下达任务时覆盖的 SOP 对象键快照                      |
| `actual_sop_version_no_snapshot` | `varchar(64) DEFAULT NULL`                                                | 下达任务时覆盖的 SOP 版本号快照                      |
| `unit_snapshot`                  | `varchar(20) NOT NULL`                                                    | 该任务逐站交接数量的单位快照                         |
| `remark`                         | `text`                                                                    | 冻结工序备注，不是单盘交接事实                       |
| `version`                        | `int NOT NULL DEFAULT '0'`                                                | 乐观锁版本号，默认 `0`                               |
| `created_by`                     | `bigint unsigned DEFAULT NULL`                                            | 创建人                                               |
| `created_at`                     | `datetime NOT NULL DEFAULT CURRENT_TIMESTAMP`                             | 创建时间                                             |
| `updated_by`                     | `bigint unsigned DEFAULT NULL`                                            | 最近修改人                                           |
| `updated_at`                     | `datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最近修改时间                                         |

### 约束与索引

```sql
PRIMARY KEY (`id`);
UNIQUE KEY `uk_batch_step_records_route_step` (`production_batch_id`,`route_step_id`);
UNIQUE KEY `uk_batch_step_records_id_batch` (`id`,`production_batch_id`);
KEY `fk_batch_step_records_route_step` (`route_step_id`);
KEY `fk_batch_step_records_sop` (`sop_file_id_snapshot`);
KEY `fk_batch_step_records_created_by` (`created_by`);
KEY `fk_batch_step_records_updated_by` (`updated_by`);
KEY `idx_batch_step_records_actual_sop` (`actual_sop_file_id`);
CONSTRAINT `fk_batch_step_records_actual_sop` FOREIGN KEY (`actual_sop_file_id`) REFERENCES `attachments` (`id`) ON DELETE SET NULL;
CONSTRAINT `fk_batch_step_records_batch` FOREIGN KEY (`production_batch_id`) REFERENCES `production_batches` (`id`);
CONSTRAINT `fk_batch_step_records_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);
CONSTRAINT `fk_batch_step_records_route_step` FOREIGN KEY (`route_step_id`) REFERENCES `process_route_steps` (`id`);
CONSTRAINT `fk_batch_step_records_sop` FOREIGN KEY (`sop_file_id_snapshot`) REFERENCES `attachments` (`id`) ON DELETE SET NULL;
CONSTRAINT `fk_batch_step_records_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);
CONSTRAINT `chk_batch_step_records_order` CHECK ((`step_order_snapshot` > 0));
CONSTRAINT `chk_batch_step_records_version` CHECK ((`version` >= 0));
```

## production_tracking_card

表示任务下一盘实物的稳定执行身份，维护当前剩余盘量、当前位置、五种状态和作废信息；历史事实另行追加。

卡号永久唯一，复合来源键供到站、异常和产出引用。整盘报废量必须为零，completed 与 voided 的盘量必须为正。未用或流转中的零量仅供历史未结异常收尾。卡根锁保护位置及盘量，已用卡不可删除。

### 字段

| 字段                      | SQL定义                                                                   | 含义                                                        |
| ------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `id`                      | `bigint unsigned NOT NULL AUTO_INCREMENT`                                 | 主键，数据库自增                                            |
| `production_batch_id`     | `bigint unsigned NOT NULL`                                                | 所属生产任务；与其他来源ID通过组合外键保持同源              |
| `card_no`                 | `varchar(100) NOT NULL`                                                   | 不可修改、永久唯一的服务端追踪卡号                          |
| `quantity`                | `int NOT NULL`                                                            | 当前剩余盘量；建卡正数，结算可扣为零                        |
| `status`                  | `varchar(20) NOT NULL DEFAULT 'unused'`                                   | 本表的封闭业务状态，值域由下方CHECK限定，转换由应用命令校验 |
| `current_step_record_id`  | `bigint unsigned DEFAULT NULL`                                            | 当前到站工序，未到站为空；不替代不可变到站历史              |
| `personnel_id`            | `bigint unsigned NOT NULL`                                                | 登记时选择的现场人员ID，不是登录账号                        |
| `personnel_code_snapshot` | `varchar(100) NOT NULL`                                                   | 登记时现场人员编码快照                                      |
| `personnel_name_snapshot` | `varchar(100) NOT NULL`                                                   | 登记时现场人员姓名快照                                      |
| `remark`                  | `text`                                                                    | 原始备注，与后续处理或作废说明分别保存                      |
| `void_reason`             | `text`                                                                    | 作废原因；仅voided状态存在                                  |
| `voided_by`               | `bigint unsigned DEFAULT NULL`                                            | 执行作废命令的登录账号                                      |
| `voided_at`               | `datetime DEFAULT NULL`                                                   | 作废时间                                                    |
| `version`                 | `int NOT NULL DEFAULT '0'`                                                | 可变业务单据的乐观版本号，每次合法命令递增                  |
| `created_by`              | `bigint unsigned NOT NULL`                                                | 实际登录操作者，引用users.id                                |
| `created_at`              | `datetime NOT NULL DEFAULT CURRENT_TIMESTAMP`                             | 事实或单据创建时间，北京时间                                |
| `updated_by`              | `bigint unsigned NOT NULL`                                                | 最近一次合法命令的登录操作者                                |
| `updated_at`              | `datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最近修改时间，北京时间，由数据库维护                        |

### 约束与索引

```sql
PRIMARY KEY (`id`);
UNIQUE KEY `uk_tracking_card_no` (`card_no`);
UNIQUE KEY `uk_tracking_card_batch` (`id`,`production_batch_id`);
KEY `idx_tracking_card_batch_status` (`production_batch_id`,`status`,`created_at`,`id`);
KEY `fk_tracking_card_step` (`current_step_record_id`,`production_batch_id`);
KEY `fk_tracking_card_personnel` (`personnel_id`);
KEY `fk_tracking_card_created_by` (`created_by`);
KEY `fk_tracking_card_updated_by` (`updated_by`);
KEY `fk_tracking_card_voided_by` (`voided_by`);
CONSTRAINT `fk_tracking_card_batch` FOREIGN KEY (`production_batch_id`) REFERENCES `production_batches` (`id`);
CONSTRAINT `fk_tracking_card_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);
CONSTRAINT `fk_tracking_card_personnel` FOREIGN KEY (`personnel_id`) REFERENCES `personnel` (`id`);
CONSTRAINT `fk_tracking_card_step` FOREIGN KEY (`current_step_record_id`, `production_batch_id`) REFERENCES `batch_step_records` (`id`, `production_batch_id`);
CONSTRAINT `fk_tracking_card_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);
CONSTRAINT `fk_tracking_card_voided_by` FOREIGN KEY (`voided_by`) REFERENCES `users` (`id`);
CONSTRAINT `chk_tracking_card_quantity` CHECK ((`quantity` between 0 and 99999999));
CONSTRAINT `chk_tracking_card_status` CHECK ((`status` in ('unused','in_progress','completed','scrapped','voided')));
CONSTRAINT `chk_tracking_card_scrapped` CHECK (status<>'scrapped' OR quantity=0);
CONSTRAINT `chk_tracking_card_terminal_quantity` CHECK (status NOT IN ('completed','voided') OR quantity>0);
CONSTRAINT `chk_tracking_card_version` CHECK ((`version` >= 0));
CONSTRAINT `chk_tracking_card_void` CHECK ((((`status` = 'voided') and (`void_reason` is not null) and (`voided_by` is not null) and (`voided_at` is not null)) or ((`status` <> 'voided') and (`void_reason` is null) and (`voided_by` is null) and (`voided_at` is null))));
```

trg_tracking_card_output_guard 保护卡号、建卡身份和版本，并校验已确认产出的撤销与整盘报废后的纠错恢复。trg_tracking_card_used_no_delete 保护已用卡的历史。跨行异常和编码资格由持锁命令复核。

## production_tracking_card_sequence

职责：保存每个任务在新规则下最后已分配的追踪卡序号，为现场单盘和批量预制提供同一事务锁定点。不记录业务产量或旧卡张数，不是库存或生产需求的事实来源。升级时保持空表，首次取号时按任务懒建 0 值行；同一事务随后增加完整张数。

### 字段

| 字段                  | SQL 定义                                                                   | 含义                                   |
| --------------------- | -------------------------------------------------------------------------- | -------------------------------------- |
| `production_batch_id` | `BIGINT UNSIGNED NOT NULL`                                                 | 任务 ID，也是唯一计数主键，不自增     |
| `last_sequence`       | `BIGINT UNSIGNED NOT NULL DEFAULT 0`                                       | 最后已提交分配序号，准备行允许 0       |
| `created_at`          | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`                             | 该任务计数首次创建时间                 |
| `updated_at`          | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最近计数写入时间                       |

技术计数不使用业务 version、软删除或操作者字段，实际操作者沿卡和成功审计追溯。表使用 InnoDB、utf8mb4_0900_ai_ci；每任务至多一行，没有额外二级索引。任务生命周期不删除计数。

### 约束与生命周期

```sql
PRIMARY KEY (production_batch_id);
CONSTRAINT fk_tracking_card_sequence_batch FOREIGN KEY (production_batch_id)
 REFERENCES production_batches(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
CONSTRAINT chk_tracking_card_sequence_nonnegative CHECK (last_sequence >= 0);
```

`trg_tracking_card_sequence_update_guard` 固定任务 ID 与创建时间并拒绝序号减少；`trg_tracking_card_sequence_no_delete` 拒绝删除计数，防止卡号复用。区间分配、100 字符卡号与溢出校验由事务内 helper 保证，卡号唯一性继续由 `production_tracking_card.uk_tracking_card_no` 保证。配对 down 仅在所有计数尚为 0 或没有计数行时允许删除该表；任何已提交分配都阻止结构回退，不能通过删除卡或清空计数绕过。

## production_tracking_visit

保存每卡每站的一次到站及至多一次交接完成。登记人员为到站时所选人员，后续扫码只补完工事实，不替换人员。

uk_tracking_visit_card_step防重复扫码。任务和工序组合外键保证同源；CHECK限制到站未完成和已完成字段组合。完成从空写入一次；完成数量与盘量后续更正相互独立。报告索引用于任务／工序和人员的时间分页。

### 字段

| 字段                      | SQL定义                                       | 含义                                                 |
| ------------------------- | --------------------------------------------- | ---------------------------------------------------- |
| `id`                      | `bigint unsigned NOT NULL AUTO_INCREMENT`     | 主键，数据库自增                                     |
| `tracking_card_id`        | `bigint unsigned NOT NULL`                    | 所属追踪卡，必填；研发不建立到站事实                 |
| `production_batch_id`     | `bigint unsigned NOT NULL`                    | 所属生产任务；与其他来源ID通过组合外键保持同源       |
| `batch_step_record_id`    | `bigint unsigned NOT NULL`                    | 涉及的任务冻结工序，组合外键保证属于同一任务         |
| `personnel_id`            | `bigint unsigned NOT NULL`                    | 登记时选择的现场人员ID，不是登录账号                 |
| `personnel_code_snapshot` | `varchar(100) NOT NULL`                       | 登记时现场人员编码快照                               |
| `personnel_name_snapshot` | `varchar(100) NOT NULL`                       | 登记时现场人员姓名快照                               |
| `arrived_by`              | `bigint unsigned NOT NULL`                    | 登记该次到站的实际登录账号                           |
| `arrived_at`              | `datetime NOT NULL DEFAULT CURRENT_TIMESTAMP` | 首次到站时间，之后不覆盖                             |
| `completed_by`            | `bigint unsigned DEFAULT NULL`                | 完成交接或末站确认的实际登录账号，未完成为空         |
| `completed_at`            | `datetime DEFAULT NULL`                       | 交接或末站完成时间，未完成为空                       |
| `reported_quantity`       | `int DEFAULT NULL`                            | 完成该站时的当前盘量快照，未完成为空，后续改量不回写 |

### 约束与索引

```sql
PRIMARY KEY (`id`);
UNIQUE KEY `uk_tracking_visit_card_step` (`tracking_card_id`,`batch_step_record_id`);
KEY `idx_tracking_visit_report` (`production_batch_id`,`batch_step_record_id`,`completed_at`,`id`);
KEY `idx_tracking_visit_personnel` (`personnel_id`,`completed_at`,`id`);
KEY `fk_tracking_visit_card` (`tracking_card_id`,`production_batch_id`);
KEY `fk_tracking_visit_step` (`batch_step_record_id`,`production_batch_id`);
KEY `fk_tracking_visit_arrived_by` (`arrived_by`);
KEY `fk_tracking_visit_completed_by` (`completed_by`);
CONSTRAINT `fk_tracking_visit_arrived_by` FOREIGN KEY (`arrived_by`) REFERENCES `users` (`id`);
CONSTRAINT `fk_tracking_visit_card` FOREIGN KEY (`tracking_card_id`, `production_batch_id`) REFERENCES `production_tracking_card` (`id`, `production_batch_id`);
CONSTRAINT `fk_tracking_visit_completed_by` FOREIGN KEY (`completed_by`) REFERENCES `users` (`id`);
CONSTRAINT `fk_tracking_visit_personnel` FOREIGN KEY (`personnel_id`) REFERENCES `personnel` (`id`);
CONSTRAINT `fk_tracking_visit_step` FOREIGN KEY (`batch_step_record_id`, `production_batch_id`) REFERENCES `batch_step_records` (`id`, `production_batch_id`);
CONSTRAINT `chk_tracking_visit_completion` CHECK ((((`completed_at` is null) and (`completed_by` is null) and (`reported_quantity` is null)) or ((`completed_at` is not null) and (`completed_by` is not null) and (`reported_quantity` between 1 and 99999999))));
```

数据库触发器：trg_tracking_visit_no_delete、trg_tracking_visit_complete_once。旧有触发器来源为基线 production-triggers，新追踪与损耗保护来源为追加的202611090040；触发器用于上述不可变／字段保护，业务资格与数量跨行比较仍由命令事务保证。

## production_tracking_quantity_change

每次改量追加更正前量、新量、原因、账号和时间，保留实际盘量更正依据。

仅追加，不更新或删除。数量正整数且必须改变；卡量更新、历史、版本和审计同事务提交，CHECK不能替代这一原子性。

### 字段

| 字段                | SQL定义                                       | 含义                                     |
| ------------------- | --------------------------------------------- | ---------------------------------------- |
| `id`                | `bigint unsigned NOT NULL AUTO_INCREMENT`     | 主键，数据库自增                         |
| `tracking_card_id`  | `bigint unsigned NOT NULL`                    | 所属追踪卡，必填；研发不建立盘量更正事实 |
| `previous_quantity` | `int NOT NULL`                                | 更正前的盘量快照                         |
| `quantity`          | `int NOT NULL`                                | 该卡当前盘量或本次更正后的盘量，正整数   |
| `reason`            | `text NOT NULL`                               | 必须保留的更正原因                       |
| `created_by`        | `bigint unsigned NOT NULL`                    | 实际登录操作者，引用users.id             |
| `created_at`        | `datetime NOT NULL DEFAULT CURRENT_TIMESTAMP` | 事实或单据创建时间，北京时间             |

### 约束与索引

```sql
PRIMARY KEY (`id`);
KEY `idx_tracking_quantity_card` (`tracking_card_id`,`id`);
KEY `fk_tracking_quantity_actor` (`created_by`);
CONSTRAINT `fk_tracking_quantity_actor` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);
CONSTRAINT `fk_tracking_quantity_card` FOREIGN KEY (`tracking_card_id`) REFERENCES `production_tracking_card` (`id`);
CONSTRAINT `chk_tracking_quantity_next` CHECK (((`quantity` between 1 and 99999999) and (`quantity` <> `previous_quantity`)));
CONSTRAINT `chk_tracking_quantity_previous` CHECK ((`previous_quantity` between 1 and 99999999));
```

数据库触发器：trg_tracking_quantity_no_update、trg_tracking_quantity_no_delete。旧有触发器来源为基线 production-triggers，新追踪与损耗保护来源为追加的202611090040；触发器用于上述不可变／字段保护，业务资格与数量跨行比较仍由命令事务保证。

## production_tracking_abnormality

统一保存随盘发现、可选关联工序、影响数量、原始说明和处理状态。原始发现与一次最终结算分表，避免处理覆盖发现。

卡和关联工序以同任务组合外键保证归属。工序选择及空值语义见[随盘异常](#随盘异常)。解决状态和时间成组，版本保护处理并发；卡根锁保护扫码、异常和最终确认之间的竞态。

### 字段

| 字段                      | SQL定义                                                                   | 含义                                                        |
| ------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `id`                      | `bigint unsigned NOT NULL AUTO_INCREMENT`                                 | 主键，数据库自增                                            |
| `tracking_card_id`        | `bigint unsigned NOT NULL`                                                | 所属追踪卡，必填；研发不建立随盘异常                        |
| `production_batch_id`     | `bigint unsigned NOT NULL`                                                | 所属生产任务；与其他来源ID通过组合外键保持同源              |
| `batch_step_record_id`    | `bigint unsigned DEFAULT NULL`                                            | 关联的任务冻结工序，未关联为空；组合外键保证属于同一任务    |
| `affected_quantity`       | `int NOT NULL`                                                            | 登记时影响数量，正整数；未处理占量见[随盘异常](#随盘异常)   |
| `status`                  | `varchar(20) NOT NULL DEFAULT 'open'`                                     | 本表的封闭业务状态，值域由下方CHECK限定，转换由应用命令校验 |
| `description`             | `mediumtext NOT NULL`                                                     | 原始报告展示快照；旧原文保留，新报告连接各标签供阅读，不作为标签来源 |
| `personnel_id`            | `bigint unsigned NOT NULL`                                                | 登记时选择的现场人员ID，不是登录账号                        |
| `personnel_code_snapshot` | `varchar(100) NOT NULL`                                                   | 登记时现场人员编码快照                                      |
| `personnel_name_snapshot` | `varchar(100) NOT NULL`                                                   | 登记时现场人员姓名快照                                      |
| `resolved_at`             | `datetime DEFAULT NULL`                                                   | 明确完成处理的时间，open状态为空                            |
| `version`                 | `int NOT NULL DEFAULT '0'`                                                | 可变业务单据的乐观版本号，每次合法命令递增                  |
| `created_by`              | `bigint unsigned NOT NULL`                                                | 实际登录操作者，引用users.id                                |
| `created_at`              | `datetime NOT NULL DEFAULT CURRENT_TIMESTAMP`                             | 事实或单据创建时间，北京时间                                |
| `updated_by`              | `bigint unsigned NOT NULL`                                                | 最近一次合法命令的登录操作者                                |
| `updated_at`              | `datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最近修改时间，北京时间，由数据库维护                        |

### 约束与索引

```sql
PRIMARY KEY (`id`);
KEY `idx_tracking_abnormality_card_status` (`tracking_card_id`,`status`,`id`);
KEY `fk_tracking_abnormality_card` (`tracking_card_id`,`production_batch_id`);
KEY `fk_tracking_abnormality_step` (`batch_step_record_id`,`production_batch_id`);
KEY `fk_tracking_abnormality_personnel` (`personnel_id`);
KEY `fk_tracking_abnormality_created_by` (`created_by`);
KEY `fk_tracking_abnormality_updated_by` (`updated_by`);
CONSTRAINT `fk_tracking_abnormality_card` FOREIGN KEY (`tracking_card_id`, `production_batch_id`) REFERENCES `production_tracking_card` (`id`, `production_batch_id`);
CONSTRAINT `fk_tracking_abnormality_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);
CONSTRAINT `fk_tracking_abnormality_personnel` FOREIGN KEY (`personnel_id`) REFERENCES `personnel` (`id`);
CONSTRAINT `fk_tracking_abnormality_step` FOREIGN KEY (`batch_step_record_id`, `production_batch_id`) REFERENCES `batch_step_records` (`id`, `production_batch_id`);
CONSTRAINT `fk_tracking_abnormality_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);
CONSTRAINT `chk_tracking_abnormality_resolution` CHECK ((((`status` = 'open') and (`resolved_at` is null)) or ((`status` = 'resolved') and (`resolved_at` is not null))));
CONSTRAINT `chk_tracking_abnormality_affected` CHECK (affected_quantity BETWEEN 1 AND 99999999);
CONSTRAINT `chk_tracking_abnormality_status` CHECK ((`status` in ('open','resolved')));
CONSTRAINT `chk_tracking_abnormality_version` CHECK ((`version` >= 0));
```

202611090060 的 trg_tracking_abnormality_resolve_once 只允许 open → resolved、resolved_at 非空及 version 恰好加一，并保护原始发现、数量、人员、工序与来源身份。最终状态不可再改；一次结算的存在性及数量关系仍由事务与 handling 唯一键共同保证。

## production_tracking_abnormality_label

保存某标准工序曾实际登记过的一枚完整描述。它是不可变观察字典，不是可编辑的工序配置或第二套异常记录；关联表保存每次发现选择了哪些标签。`process_step_id` 为空表示一般异常域，生成的 `scope_key=0` 只用于唯一键与查询，不是虚构的工序 ID。非空域引用 Product 的稳定工序身份；工序更名、路线换版及停用不改变已有标签归属。

| 字段 | SQL 定义 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 字典主键 |
| `process_step_id` | `BIGINT UNSIGNED NULL` | 标准工序 ID；无工序为 NULL |
| `scope_key` | `BIGINT UNSIGNED GENERATED ALWAYS AS (COALESCE(process_step_id,0)) STORED` | 同一工序／一般异常域的技术唯一键分组 |
| `label_hash` | `BINARY(32) NOT NULL` | 完整原文 UTF-8 字节的 SHA-256 摘要，用于有界唯一索引 |
| `label` | `TEXT NOT NULL` | 完整标签原文，不按排序规则折叠大小写或删减历史文字 |
| `created_by` | `BIGINT UNSIGNED NOT NULL` | 首次观察的实际登录操作者，引用 users.id |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 首次观察时间；回填使用最早已有发现的真实时间 |

主键 `(id)`；`uk_tracking_label_scope_hash(scope_key,label_hash)` 限制同域摘要唯一，命令在摘要命中后仍逐字校验原文，冲突拒绝，不合并不同文字。`idx_tracking_label_scope_order(scope_key,id)` 支撑同域候选稳定分页；`fk_tracking_label_step(process_step_id)`、`fk_tracking_label_actor(created_by)` 为对应外键支撑索引，外键分别引用 `process_steps.id` 与 `users.id`，不级联删除。`trg_tracking_label_hash_guard` 在 INSERT 核验摘要，`trg_tracking_label_no_update/no_delete` 拒绝修改与删除。表采用不可变事实审计列，不设 version、软删除或更新列；新字典与实际异常、关联及审计同事务写入，失败不留下未使用候选。

## production_tracking_abnormality_label_assignment

保存一次异常报告的独立标签及选择顺序。标签不是每件实物的身份，不对每枚重复分配异常影响数量；操作者沿所属异常追溯。只有上报时追加，没有事后改标签或删除关联的命令。

| 字段 | SQL 定义 | 含义 |
| --- | --- | --- |
| `abnormality_id` | `BIGINT UNSIGNED NOT NULL` | 所属发现，引用 production_tracking_abnormality.id |
| `label_id` | `BIGINT UNSIGNED NOT NULL` | 独立描述，引用 production_tracking_abnormality_label.id |
| `label_order` | `INT NOT NULL` | 本次报告内从 1 开始的标签顺序 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 关联事实建立时间；回填沿原发现时间 |

复合主键 `(abnormality_id,label_id)` 防止一条异常重复选同一标签，`uk_tracking_label_assignment_order(abnormality_id,label_order)` 防止顺序重叠；`fk_tracking_label_assignment_label(label_id)` 为标签外键支撑索引。两项外键均不级联删除，`chk_tracking_label_assignment_order` 限定顺序为 1–20；标签域必须与本次已核验工序一致，由应用事务保证。`trg_tracking_label_assignment_no_update/no_delete` 保护不可变关联，表不设独立操作者、更新列、软删除或 version。

### 标签数据升级

`202611180010-tracking-abnormality-description-labels` 追加上述两表，并仅拓宽原 `description` 为 MEDIUMTEXT 以保存多标签报告展示快照。每条旧 description 按原字节作为一枚标签回填，不 trim、不按标点或换行拆分；依既有冻结工序 → 路线步骤 → 标准工序的真实外键归属分域，无工序的旧记录留在一般异常域。相同域、相同原文共用字典行；首次观察操作者和时间取最早真实发现，所有异常各自保留关联。无法解析非空工序身份或发现摘要冲突时，在永久 DDL 前拒绝。旧描述、状态、影响数量、盘量、处理及报废引用、产出、审计与幂等内容保持原值。

执行前停止追踪卡、任务状态及 Product 路线写入，备份匹配旧应用的数据库并验证隔离恢复。新应用在迁移完成后启动，旧客户端须结束异常上报／处理意图并刷新，不将旧意图自动迁入新 scope。升级核对每条旧异常恰有一个字节相等标签、标签域与真实工序一致、一般异常未被丢弃，以及全部原表行摘要；另核对两项新表外键、索引、生成列、五项触发器及 description 列容量。多步 DDL 中断后保持停写，核对实际结构、关联和迁移登记，不能自动重跑或修改登记；通用恢复见[迁移安全](../../../../../../../packages/database/docs/migration-safety.md)。down 只接受字典与关联均为空且描述仍可容纳于 TEXT 的环境；已有观察事实不删除，不兼容降级使用迁移前匹配备份与应用。

## production_tracking_abnormality_handling

保存某异常唯一的一次最终结算、人员快照、返修和新增报废数量，以及扣减前后卡量快照。关联已有报废另由下表逐来源记录。

仅追加，不更新或删除，abnormality_id 唯一。处理事实与原异常转态、异常和卡版本、扣量、引用及成功审计同事务提交。数据库检查数量范围、扣减恒等式及新增处置不超过扣减前卡量；跨表影响数量总和、来源资格与逐来源上限由卡锁内命令保证，不累计消耗其他异常的引用额度。

### 字段

| 字段                      | SQL定义                                       | 含义                                   |
| ------------------------- | --------------------------------------------- | -------------------------------------- |
| `id`                      | `bigint unsigned NOT NULL AUTO_INCREMENT`     | 主键，数据库自增                       |
| `abnormality_id`          | `bigint unsigned NOT NULL`                    | 所属原始异常；处理记录追加于此ID       |
| `content`                 | `text NOT NULL`                               | 本次处理说明，不覆盖原始发现或之前处理 |
| `repaired_quantity`       | `int NOT NULL`                                | 返修数量，不增加卡量                   |
| `scrapped_quantity`       | `int NOT NULL`                                | 原始结算时实际扣减的报废数量 |
| `scrap_mode` | `varchar(16) NULL` | 首次结算的报废规则：`optional_marks` 允许前道按实物选码，`item_marked` 要求逐件选码，`quantity_only` 为历史仅扣数量；旧结算缺少可证口径时为 NULL |
| `previous_card_quantity`  | `int NOT NULL`                                | 本次处理前锁定的剩余盘量               |
| `remaining_card_quantity` | `int NOT NULL`                                | 本次处理后盘量，等于前量减新增报废     |
| `personnel_id`            | `bigint unsigned NOT NULL`                    | 登记时选择的现场人员ID，不是登录账号   |
| `personnel_code_snapshot` | `varchar(100) NOT NULL`                       | 登记时现场人员编码快照                 |
| `personnel_name_snapshot` | `varchar(100) NOT NULL`                       | 登记时现场人员姓名快照                 |
| `created_by`              | `bigint unsigned NOT NULL`                    | 实际登录操作者，引用users.id           |
| `created_at`              | `datetime NOT NULL DEFAULT CURRENT_TIMESTAMP` | 事实或单据创建时间，北京时间           |

### 约束与索引

```sql
PRIMARY KEY (`id`);
UNIQUE KEY `uk_tracking_handling_abnormality` (`abnormality_id`);
KEY `fk_tracking_handling_personnel` (`personnel_id`);
KEY `fk_tracking_handling_actor` (`created_by`);
CONSTRAINT `fk_tracking_handling_abnormality` FOREIGN KEY (`abnormality_id`) REFERENCES `production_tracking_abnormality` (`id`);
CONSTRAINT `fk_tracking_handling_actor` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);
CONSTRAINT `fk_tracking_handling_personnel` FOREIGN KEY (`personnel_id`) REFERENCES `personnel` (`id`);
CONSTRAINT `chk_tracking_handling_quantities` CHECK (repaired_quantity BETWEEN 0 AND 99999999 AND scrapped_quantity BETWEEN 0 AND 99999999);
CONSTRAINT `chk_tracking_handling_scrap_mode` CHECK (scrap_mode IN ('quantity_only','item_marked','optional_marks'));
CONSTRAINT `chk_tracking_handling_card_quantities` CHECK (previous_card_quantity BETWEEN 0 AND 99999999 AND remaining_card_quantity BETWEEN 0 AND 99999999 AND remaining_card_quantity=previous_card_quantity-scrapped_quantity AND repaired_quantity+scrapped_quantity<=previous_card_quantity);
```

数据库触发器：trg_tracking_handling_no_update、trg_tracking_handling_no_delete。旧有触发器来源为基线 production-triggers，新追踪与损耗保护来源为追加的202611090040；触发器用于上述不可变／字段保护，业务资格与数量跨行比较仍由命令事务保证。

## production_tracking_scrap_reference

保存某次最终结算对同卡其他 handling 新增报废的数量归因；这是不可变关联事实，不是报废余额或再次扣量记录。同一来源可以出现在不同异常的处理下，复合主键只限制同次处理不重复。来源同卡、属于其他异常、已 resolved、实际新增报废为正且单次引用不超来源数量，由锁卡后的命令校验；不建立跨异常总消耗上限。

### 字段

| 字段                     | SQL定义                                       | 含义                                       |
| ------------------------ | --------------------------------------------- | ------------------------------------------ |
| `handling_id`            | `bigint unsigned NOT NULL`                    | 本次异常最终结算ID，与来源组成主键         |
| `referenced_handling_id` | `bigint unsigned NOT NULL`                    | 其他异常已完成结算的新增报废来源ID         |
| `quantity`               | `int NOT NULL`                                | 本次归因数量，正整数，不扣卡量             |
| `created_at`             | `datetime NOT NULL DEFAULT CURRENT_TIMESTAMP` | 关联事实建立时间；操作者沿所属handling追溯 |

### 约束与索引

```sql
PRIMARY KEY (handling_id,referenced_handling_id);
KEY idx_tracking_scrap_reference_source (referenced_handling_id);
CONSTRAINT fk_tracking_scrap_reference_handling FOREIGN KEY (handling_id) REFERENCES production_tracking_abnormality_handling(id);
CONSTRAINT fk_tracking_scrap_reference_source FOREIGN KEY (referenced_handling_id) REFERENCES production_tracking_abnormality_handling(id);
CONSTRAINT chk_tracking_scrap_reference_quantity CHECK (quantity BETWEEN 1 AND 99999999);
CONSTRAINT chk_tracking_scrap_reference_other CHECK (handling_id<>referenced_handling_id);
```

表与 trg_tracking_scrap_reference_no_update、trg_tracking_scrap_reference_no_delete 由 202611090060 新增。引用记录仅随最终结算同事务追加，不修改、删除或转移来源；普通下游查询不取得写入资格。

## production_tracking_item_mark

保存已登记的单件及原始登记人员快照。任务和产品经卡关联，完整追溯码派生。待绑名额不写表。单件处置由生效报废关联推导，所属卡状态及产出事实决定能否清空，解除占用后保留原登记供核查。

| 字段 | SQL 定义 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 绑定身份 |
| `tracking_card_id` | `BIGINT UNSIGNED NOT NULL` | 所属追踪卡 |
| `mark_code` | `VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL` | 规范化数字字符串，历史记录可含 `0` |
| `occupied_mark_code` | `VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL` | 当前独占的实物码；已释放的登记为 NULL |
| `version` | `INT UNSIGNED NOT NULL DEFAULT 0` | 单件乐观锁版本；改号及已有行换码递增 |
| `personnel_id` | `BIGINT UNSIGNED NOT NULL` | 登记时选择的现场人员 |
| `personnel_code_snapshot` | `VARCHAR(100) NOT NULL` | 人员编码快照 |
| `personnel_name_snapshot` | `VARCHAR(100) NOT NULL` | 人员姓名快照 |
| `created_by` | `BIGINT UNSIGNED NOT NULL` | 实际登录操作者 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 绑定时间 |

主键 `id`。`uk_tracking_item_mark_occupied_code(occupied_mark_code)` 保证当前实物码全局唯一，CHECK 约束生效占用值等于登记码。`idx_tracking_item_mark_card_order(tracking_card_id,created_at,id)` 支持按卡分页。直接外键分别指向 `production_tracking_card.id`、`personnel.id`、`users.id`，人员和账号具有外键支撑索引，均不级联删除。刻码格式、当前任务／卡资格、人员和容量在应用事务校验。

## production_tracking_item_mark_correction

保存同一件实物的录入更正前后值及原因。更正当前码、递增单件版本、追加历史及成功审计同事务，不更新卡版本或终态卡事实。更正次数仅表示本表记录数。换绑仅记全局操作日志，因此并发校验使用单件版本；涉及绑定名额或号码互换时同时核对卡版本。

| 字段 | SQL 定义 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 更正事实主键 |
| `item_mark_id` | `BIGINT UNSIGNED NOT NULL` | 原单件身份 |
| `previous_mark_code` | `VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL` | 更正前错误输入 |
| `corrected_mark_code` | `VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL` | 本次正确刻码 |
| `reason` | `TEXT NOT NULL` | 更正原因 |
| `created_by` | `BIGINT UNSIGNED NOT NULL` | 实际登录操作者 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 更正时间 |

主键 `id`，按 `item_mark_id,created_at,id` 索引读取历史；`item_mark_id` 和 `created_by` 直接外键分别引用绑定与账号，不级联删除。历史值不加唯一键，不提供修改删除命令，不新增触发器。原始登记人员仍沿绑定读取，本次更正操作者沿本表读取。

## production_tracking_item_mark_cancellation

保存一次误绑定撤销。撤销与释放当前占码同事务提交，保留原登记供历史核查。实物报废独立归属原异常。

| 字段 | SQL 定义 | 含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 撤销事实主键 |
| `item_mark_id` | `BIGINT UNSIGNED NOT NULL` | 被撤销绑定 |
| `reason` | `TEXT NOT NULL` | 撤销原因 |
| `created_by` | `BIGINT UNSIGNED NOT NULL` | 实际登录操作者 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 撤销时间 |

主键 `id`；`uk_tracking_item_mark_cancellation(item_mark_id)` 保证只撤销一次；绑定与账号直接外键分别指向 `production_tracking_item_mark.id`、`users.id`，账号具有外键支撑索引，均不级联删除。原因合法性、卡版本、当前状态及与报废互斥由卡锁内应用命令核验；仅追加，不提供修改、删除或恢复命令，不新增触发器。

## production_tracking_item_mark_scrap

把已绑定实物关联到实际新增报废的原异常处理，不保存第二份报废数量、原因或人员。

| 字段 | SQL 定义 | 含义 |
| --- | --- | --- |
| `item_mark_id` | `BIGINT UNSIGNED NOT NULL` | 本次实际报废的绑定 |
| `handling_id` | `BIGINT UNSIGNED NOT NULL` | 原异常最终结算 |
| `mark_code_snapshot` | `VARCHAR(32) ASCII COLLATE ascii_bin NULL` | 登记报废时的刻码文本，旧资料缺失时留空 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 关联时间，操作者沿 handling 追溯 |

复合主键 `(item_mark_id,handling_id)` 唯一确定该次原始报废关联。按 handling_id 的索引支持回查。两列分别外键到单件与结算。原始关联只追加，当前生效状态结合最近纠错取得。

## production_tracking_abnormality_adjustment

每次更正或作废留一条不可变记录。原始 handling 存第一次结算，按异常版本最大的调整记录读取有效结果。

| 字段 | SQL 定义 | 用途 |
| --- | --- | --- |
| `id` | BIGINT UNSIGNED NOT NULL AUTO_INCREMENT | 纠错事实主键 |
| `abnormality_id`, `version` | BIGINT UNSIGNED NOT NULL, INT NOT NULL | 原异常及纠错后的异常版本，成对唯一 |
| `kind` | VARCHAR(8) NOT NULL | correct 更正或 void 整笔作废 |
| `previous_scrapped_quantity`, `scrapped_quantity` | INT NOT NULL | 此次操作前后的有效报废数 |
| `previous_card_version` | INT NOT NULL | 提交依据的卡版本 |
| `previous_card_quantity`, `card_quantity` | INT NOT NULL | 操作前后盘量 |
| `reason` | TEXT NOT NULL | 核实后的更正或作废原因 |
| `created_by`, `created_at` | BIGINT UNSIGNED NOT NULL, DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP | 登录操作者和办理时间 |

异常与操作者分别外键到 production_tracking_abnormality 和 users。按异常与版本的唯一键用于取最新结果，created_by 有外键索引。CHECK 校验操作种类、版本和数量范围，强制前盘量＋原报废数－新报废数＝后盘量，更正前后均有正数报废，作废后为零。更新与删除触发器保护事实。原报废操作的扣量、原到站与后续交接快照继续供追溯。

## production_tracking_abnormality_adjustment_item_mark

记录每笔纠错生效前后完整的编码集合。通过单件身份与刻码快照，可以在同一件实物后续更正刻码或再次登记报废后还原这笔纠错。

| 字段 | SQL 定义 | 用途 |
| --- | --- | --- |
| `adjustment_id` | BIGINT UNSIGNED NOT NULL | 所属纠错 |
| `set_kind` | VARCHAR(6) NOT NULL | before 或 after，CHECK 限定 |
| `item_mark_id` | BIGINT UNSIGNED NOT NULL | 原卡的单件绑定身份 |
| `mark_code_snapshot` | VARCHAR(32) ASCII COLLATE ascii_bin NOT NULL | 纠错时的实物编码 |

主键为 (adjustment_id,set_kind,item_mark_id)，同一集合内每件只记录一次。纠错和单件分别外键到上述主表及 production_tracking_item_mark，单件有独立外键索引。更新与删除触发器保护快照。同卡归属、有效性、末站码数及盘量差额由持锁的纠错命令统一核对。升级与回退条件见[迁移安全](../../../../../../../packages/database/docs/migration-safety.md#随盘异常纠错)。

## production_tracking_output_item_mark

保存某次产出确认时的有效单件集合。产出撤销不删除关联；重新确认使用新的产出 ID，以免后来更正绑定覆盖旧产出当时的单件范围。

| 字段 | SQL 定义 | 含义 |
| --- | --- | --- |
| `production_output_id` | `BIGINT UNSIGNED NOT NULL` | 该次终检产出 |
| `item_mark_id` | `BIGINT UNSIGNED NOT NULL` | 该次确认包含的有效绑定 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 关联时间，操作者沿产出追溯 |

复合主键 `(production_output_id,item_mark_id)` 保证同次确认不重复关联，`fk_tracking_output_item_mark_mark(item_mark_id)` 支持单件反查。两个直接外键分别指向 `production_tracking_output.id`、`production_tracking_item_mark.id`，不级联删除。相同绑定可出现在已撤销产出及其后重新确认的产出中；应用在原任务／卡锁内复核同卡、有效状态与齐码数量后，同事务写产出和关联。仅追加，不新增触发器。

### 单件刻码数据升级

`202611190010-tracking-item-marking` 直接建立绑定、更正、撤销、原报废及终检关联五张空表。当前占码唯一键和单件版本自首次绑定起生效。旧任务、卡、盘量和已确认产出保持原值，迁移不从数量推断实物编码。未确认的批量卡，以及撤销产出后重新确认的批量卡，均按当前规则齐码。

切换前结束旧表单的提交意图并刷新。绑定、撤销和更正按各自的幂等作用域办理。旧成功结果保留原文，重放时忽略已退出契约的任务开关，缺少刻码摘要的旧结果按当时的零摘要解码。

核验五表初始为空、占码唯一键及直接外键生效，且旧产出数量未变。逆序撤回后续迁移后，刻码 down 仅在五表均为空时允许。已有实物登记的不兼容降级使用匹配备份，见[迁移安全](../../../../../../../packages/database/docs/migration-safety.md#单件刻码)。

## production_tracking_output

不可变产出确认事实。批量同一卡最多一条未撤销产出，数量等于锁定卡的正数剩余量；研发同任务可多笔，手填实际数量且允许0。正数待人工入库，整盘报废不建立本表记录。

组合外键保证任务、工单、成品及卡归属一致。202611120010 移除旧卡唯一键、研发唯一键和 research_batch_id 生成列，保留原 fk_tracking_output_card 卡／任务索引支持历史查询；有效产出唯一性由任务／卡锁及插入守卫核验，撤销后允许再次确认。末站、异常清零、人员资格及当前剩余盘量由命令复核。Inventory 使用本表 ID 追溯对应的全部原始入库明细，历史分次入库与库存调整不能改写本表。

### 字段

| 字段                      | SQL定义                                       | 含义                                                   |
| ------------------------- | --------------------------------------------- | ------------------------------------------------------ |
| `id`                      | `bigint unsigned NOT NULL AUTO_INCREMENT`     | 主键，数据库自增                                       |
| `production_batch_id`     | `bigint unsigned NOT NULL`                    | 所属生产任务；与其他来源ID通过组合外键保持同源         |
| `tracking_card_id`        | `bigint unsigned DEFAULT NULL`                | 所属追踪卡，批量事实使用该ID；研发最终产出允许为空     |
| `work_order_id`           | `bigint unsigned NOT NULL`                    | 所属任务的工单ID，组合外键保证与任务及成品同源         |
| `product_id`              | `bigint unsigned NOT NULL`                    | 最终产出的成品ID，固定沿所属任务和工单，不接受自由拼接 |
| `quantity`                | `int NOT NULL`                                | 显式确认的最终可用产出，允许0，不是交接报工累计        |
| `personnel_id`            | `bigint unsigned NOT NULL`                    | 登记时选择的现场人员ID，不是登录账号                   |
| `personnel_code_snapshot` | `varchar(100) NOT NULL`                       | 登记时现场人员编码快照                                 |
| `personnel_name_snapshot` | `varchar(100) NOT NULL`                       | 登记时现场人员姓名快照                                 |
| `confirmed_by`            | `bigint unsigned NOT NULL`                    | 执行最终产出确认的登录账号                             |
| `confirmed_at`            | `datetime NOT NULL DEFAULT CURRENT_TIMESTAMP` | 最终确认时间，不可改写                                 |
| `remark`                  | `text`                                        | 原始备注，与后续处理或作废说明分别保存                 |

### 约束与索引

```sql
PRIMARY KEY (`id`);
KEY `idx_tracking_output_work_order` (`work_order_id`,`confirmed_at`,`id`);
KEY `idx_tracking_output_batch` (`production_batch_id`,`confirmed_at`,`id`);
KEY `fk_tracking_output_batch` (`production_batch_id`,`work_order_id`,`product_id`);
KEY `fk_tracking_output_card` (`tracking_card_id`,`production_batch_id`);
KEY `fk_tracking_output_personnel` (`personnel_id`);
KEY `fk_tracking_output_actor` (`confirmed_by`);
CONSTRAINT `fk_tracking_output_actor` FOREIGN KEY (`confirmed_by`) REFERENCES `users` (`id`);
CONSTRAINT `fk_tracking_output_batch` FOREIGN KEY (`production_batch_id`, `work_order_id`, `product_id`) REFERENCES `production_batches` (`id`, `work_order_id`, `product_id`);
CONSTRAINT `fk_tracking_output_card` FOREIGN KEY (`tracking_card_id`, `production_batch_id`) REFERENCES `production_tracking_card` (`id`, `production_batch_id`);
CONSTRAINT `fk_tracking_output_personnel` FOREIGN KEY (`personnel_id`) REFERENCES `personnel` (`id`);
CONSTRAINT `chk_tracking_output_quantity` CHECK ((`quantity` between 0 and 99999999));
```

数据库触发器：trg_tracking_output_insert_guard、trg_tracking_output_no_update、trg_tracking_output_no_delete。插入守卫核验执行中任务、末站剩余量及当前有效产出唯一性；原确认内容保持不可变。旧有触发器来源为基线 production-triggers，新追踪与损耗保护来源为追加的202611090040；触发器用于上述不可变／字段保护，业务资格与数量跨行比较仍由命令事务保证。

## production_tracking_output_cancellation

追加产出撤销事实，保留原确认内容，避免用更新或删除抹去历史。每条产出最多撤销一次；取消后不恢复原记录，需要重新确认。生产产出统计排除此表引用的记录。

| 字段                 | SQL 定义                                    | 含义                                                 |
| -------------------- | ------------------------------------------- | ---------------------------------------------------- |
| id                   | BIGINT UNSIGNED NOT NULL AUTO_INCREMENT     | 主键                                                 |
| production_output_id | BIGINT UNSIGNED NOT NULL                    | 被撤销的产出，唯一引用 production_tracking_output.id |
| reason               | TEXT NOT NULL                               | 必填非空白原因                                       |
| created_by           | BIGINT UNSIGNED NOT NULL                    | 实际操作者，引用 users.id                            |
| created_at           | DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP | 撤销时间                                             |

由 202611120010 新建。主键 id，production_output_id 唯一；产出和账号外键均 RESTRICT，created_by 具有外键支撑索引，chk_tracking_output_cancellation_reason 限制去除空白后的原因长度为 1–5000。插入守卫取得来源任务／卡／产出锁并拒绝已经关联入库明细的产出；更新和删除触发器拒绝改写。恢复卡状态、撤销、任务版本及成功审计同事务提交，不创建库存反向流水。
