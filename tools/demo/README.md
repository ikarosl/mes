# 业务场景数据工具

本目录通过公开业务 API 准备可重复定位的人工验收数据，不直接写业务事实表。工具不属于应用初始化、部署或正式测试；源码职责见[编码规范](../../docs/coding-standards.md#工程脚本与临时文件)。

| 工具                                                  | 用途                                                                         |
| ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| [仓库简化](prepare-warehouse-simplification-demo.mjs) | 无数量到货、独立检查报告、先入库后报告、独立补购／补发、仅说明和跨供应商共批 |
| [采购金额](prepare-procurement-amount-demo.mjs)       | 报价、含税总额、舍入、正式单更正及审计                                       |
| [追踪卡](prepare-tracking-workbench-demo.mjs)         | 扫码、异常结算、末站产出与库存                                               |
| [单件刻码](prepare-item-marking-demo.mjs)             | 独立批量任务、跨卡输入、选码报废／撤销／更正及90件整盘入库人工验收       |
| [审批开关](prepare-optional-approval-demo.mjs)         | 独立 BOM 草稿及研发人工需求，保留给人工提交、更正与关闭                      |
| [统一附件](prepare-attachment-demo.mjs)               | 真实 PDF／图片、当前工序引用、替换后无引用文件、归档路线保留、回收与物理清理 |
| [仓库单据](prepare-warehouse-documents-demo.mjs) | 物料／成品单种多行其他入出库、草稿／确认／取消、方向共号及直接流水单号 |

## 前置准备

使用根 [README](../../README.md#仓库简化实验分支) 指定的独立实验库，或已增量升级到匹配版本的隔离恢复副本。首次初始化与[演示种子](../../packages/database/demo/README.md)按各自入口执行，已有副本不为运行工具重建或重跑种子；再以同一配置启动 API。工具由 @company/config 加载根 .env，进程环境变量优先；不在脚本中保存密码。ADMIN_USERNAME／ADMIN_PASSWORD 应与初始化管理员一致，DEMO_USER_PASSWORD 用于演示职责账号。

所有工具的 prepare 与 report 均须 ALLOW_DEMO_SEED=1，NODE_ENV=production 时拒绝。report 只读业务数据；登录会建立会话及认证记录。prepare 的写入范围由各工具下方说明，不代表正式测试或用户验收通过。

## 仓库简化样例

在根目录运行，API默认使用 http://127.0.0.1:3003/api；WAREHOUSE_DEMO_API_BASE_URL 可修改本地地址，工具拒绝远程主机、URL凭证、查询串、片段和重定向。

```powershell
$env:ALLOW_DEMO_SEED='1'
$env:WAREHOUSE_DEMO_TAG='acceptance_01'
node tools/demo/prepare-warehouse-simplification-demo.mjs prepare
node tools/demo/prepare-warehouse-simplification-demo.mjs report
```

WAREHOUSE_DEMO_TAG 默认 sample，只接受1～40位字母、数字、下划线或连字符。标记 [demo-warehouse-v1:TAG] 写入采购与到货备注；不要手工删除标记后重复 prepare。相同TAG已存在任何采购时只输出当前报告，不覆盖、补缺或继续写入。

| 场景         | 留下的记录                                                                             |
| ------------ | -------------------------------------------------------------------------------------- |
| 免费赠送     | 原采购20，检查21合格／1不合格，到货行独立记录退回与赠送说明，再实际入库21              |
| 收费补购     | 在检查和入库前补购1，实际入21后在到货行独立登记说明及报告；补单不新增到货或库存        |
| 仅其他处理   | 未检查未入库也可先建立质量补发约定，再在到货行独立记录全批线下处理说明，不调用入库接口 |
| 待人工办理   | 只登记采购及到货，供手工检查／收货／补单                                               |
| 跨供应商共批 | 两家供应商的到货分别入4和6，共用一个新库存批次，保留两条来源                           |

报告列出实际单号、来源、采购量、已入数量、处理说明和报告记录；它只描述当前数据，不以初始样例预期替代用户后续修改。

## 审批开关样例

审批工具只提供 `prepare`／`report`，省略模式时为 `report`；不提交 BOM 或需求更正，不切换场景开关、不发布流程或处理审批申请。API 默认 `http://127.0.0.1:3003/api`，`OPTIONAL_APPROVAL_DEMO_API_BASE_URL` 可修改本机地址；拒绝远程主机、URL 凭证、查询串、片段和重定向。

```powershell
$env:ALLOW_DEMO_SEED='1'
$env:OPTIONAL_APPROVAL_DEMO_TAG='approval_off_01'
node tools/demo/prepare-optional-approval-demo.mjs prepare
node tools/demo/prepare-optional-approval-demo.mjs report
```

准备前须已有启用自制成品 `p-micro-20-30`、物料 `m1.077.012` 的启用版本，以及工单／任务负责人当前候选。负责人各选择对应场景返回的首位合格人员；工具不修改人员配置。默认复用来源成品已关联的真实启用规格书，来源尚未关联时可按下段显式指定现有文件 ID，无需修改来源成品。SQL demo 本身不提供此文件，补充方式见[规格书准备](../../packages/database/demo/README.md#规格书的人工验收准备)。

可用 `OPTIONAL_APPROVAL_DEMO_SOURCE_PRODUCT_CODE`、`OPTIONAL_APPROVAL_DEMO_MATERIAL_CODE` 指定现有来源；`OPTIONAL_APPROVAL_DEMO_VARIANT_CODE` 可固定精确版本，省略则选对应物料首个启用版本。`OPTIONAL_APPROVAL_DEMO_SPECIFICATION_FILE_ID` 可显式指定已登记、启用且未删除的真实规格书，省略则复用来源成品当前规格书。所有候选与文件前置均在首次写入前读取核对，命令仍由后端复核资格。

| 新建样例 | 写入及保留内容 |
| --- | --- |
| BOM | 新成品 `demo-optional-approval-TAG` 复用来源分类、单位、规格参数与规格书，保存一行单位用量为 1 的 BOM 草稿 |
| 需求数量更正 | 为新成品新建并下达独立研发工单、研发任务，人工追加 10 件需求；原因含 `quantity`，初始报告建议总量改为 6 |
| 单条关闭 | 同一新研发任务另行人工追加 5 件独立需求；原因含 `close`，保留给人工关闭 |

工具不开始生产、不分配或领料，不生成库存事实，也不改动既有需求。`OPTIONAL_APPROVAL_DEMO_TAG` 默认 `sample`，接受 1～40 位字母、数字、下划线或连字符并统一为小写；备注标记为 `[demo-optional-approval-v1:TAG]`，工单外部订单号同新成品编码。发现同 TAG 任一成品或工单后，`prepare` 只报告现状，不覆盖、补缺或继续上次写入；中断后先 `report`，另一组准备使用新 TAG，不移除原标记。

在审批配置页人工选择待验收开关与已发布流程，再从成品 BOM 页面和新任务的物料需求入口手工提交。开启／关闭可各用不同 TAG，数量更正和关闭使用上述两条独立需求。`report` 读取两个场景当前开关、BOM 当前版本／锁定／审批关联，以及各需求的当前可更正条件、数量、替代历史和生效状态；建议数量仅随当前事实计算，不自动执行，提交时仍须由页面重新核对。业务语义分别由 [Product](../../apps/api/src/modules/product/docs/product-rules.md#bom-命令与审批) 和 [Production](../../apps/api/src/modules/production/docs/database/demand-allocation-and-outbound.md#正式需求更正与替代)维护。

## 统一附件样例

附件工具只提供 `prepare`／`report`，省略模式时为 `report`。须先完成增量 migration、附件权限目录发布及 S3 Bucket 准备，并启动匹配 API；不因附件模块变更重建既有库。API 默认 `http://127.0.0.1:3003/api`，`ATTACHMENT_DEMO_API_BASE_URL` 可指定其他本机地址；拒绝远程主机、URL 凭证、查询串、片段及重定向。登录管理员须具备技术文件上传／绑定、工序／路线维护和系统附件查看／管理权限，工具不修改角色授权。

```powershell
$env:ALLOW_DEMO_SEED='1'
$env:ATTACHMENT_DEMO_TAG='attachment_01'
node tools/demo/prepare-attachment-demo.mjs prepare
node tools/demo/prepare-attachment-demo.mjs report
```

`ATTACHMENT_DEMO_TAG` 默认 `sample`，接受 1～40 位字母、数字、下划线或连字符并转为小写。新工序和路线使用 `demo-attachment-TAG` 编码，备注带 `[demo-attachment-v1:TAG]`；上传文件名使用 `demo-attachment-TAG--` 前缀。发现同 TAG 任一附件、工序或路线后，`prepare` 仅报告现状，不覆盖、补缺或续写；中断后先 `report`，另一组样例使用新 TAG。

| 样例文件 | 准备行为与人工观察 |
| --- | --- |
| `route-retained.pdf` | 先作为工序默认 SOP，冻结到独立路线并启用、归档；工序后来换文件，旧文件仍由路线步骤保留 |
| `replaced-old-unreferenced.pdf` | 短暂绑定工序后再次替换，留下无引用的正常附件 |
| `current-process-sop.pdf` | 工序最终当前 SOP，引用指向新建工序 |
| `unattached-image.png` | 未关联的真实 240×120 PNG，可下载检查图片内容 |
| `trashed.pdf` | 新建独立规格书后移入回收站，保留对象供回收状态验收 |
| `purged.pdf` | 新建独立规格书后回收并请求物理清理；目录保留元数据，报告读取实际清理结果 |

PDF 均为工具生成的可打开单页样例，PNG 包含真实 RGB 像素，全部通过正式上传入口写入对象存储，不伪造 locator、不直接写 SQL。回收和清理只允许本次执行中新上传的附件 ID；不选取、清理或替换既有业务附件。对象存储未能确认物理删除时保留实际失败／处理中状态，不声称完成，也不自动重试。

`report` 只读取本组附件当前生命周期、清理结果、引用明细、工序当前 SOP 和路线快照，不以初始预期覆盖用户后续修改。工具不创建产品、BOM、工单、任务或库存；生产下达后的默认／实际 SOP 历史保留须在已有合格任务上另行人工验收。本工具是人工验收数据准备，不代表正式测试通过。附件生命周期与业务保留边界分别见 [Attachment](../../apps/api/src/modules/attachment/README.md) 和 [Product](../../apps/api/src/modules/product/docs/technical-files.md)。

## 其他工具配置

采购金额工具使用 PROCUREMENT_AMOUNT_DEMO_API_BASE_URL（默认 http://127.0.0.1:3002/api）、PROCUREMENT_AMOUNT_DEMO_TAG（缺省为原工具数据标记）；本实验可显式把 API 基址改为3003。工具需要演示共批供应商和 demo-stock-multi 两个精确版本。远程执行仅在HTTPS并显式设置 PROCUREMENT_AMOUNT_DEMO_ALLOW_REMOTE=1 时允许。

追踪卡工具使用 TRACKING_DEMO_API_BASE_URL（默认 http://127.0.0.1:3002/api）、TRACKING_DEMO_TAG（默认sample）和必填 TRACKING_DEMO_BATCH_ID；在本实验使用3003。远程同样要求HTTPS及 TRACKING_DEMO_ALLOW_REMOTE=1。具体生产前提见下节。

## 重复执行和中断

已启用 HTTP 幂等的业务写入携带独立幂等键；未启用的端点不附带该请求头。工具不会在未知结果后用新键自动重试，也没有跨请求事务。失败会保留此前成功写入，先用同TAG report核对。需要另一组样例时换新TAG，不通过删数据或重跑demo绕过迁移或业务错误。报告输出可保存到temp，禁止将密码、Token或Cookie写入输出。

## 追踪卡工作台样例

追踪卡工具使用独立现场人员目录，要求至少一名启用人员，各登记动作均使用统一目录。先通过正常产品 BOM 审批、任务创建和物料初配，再明确开始批量任务；缺料开工仍须填写原因。工具不创建替代主数据、不跳过上述业务资格，也不自动结束任务。

```powershell
$env:ALLOW_DEMO_SEED='1'
$env:TRACKING_DEMO_BATCH_ID='<已有执行中批量任务ID>'
$env:TRACKING_DEMO_TAG='acceptance_01'
node tools/demo/prepare-tracking-workbench-demo.mjs prepare
```

十盘覆盖正常产出、数量更正后的产出、前道无码报废、未用卡、已用作废、末道整盘报废、可换码和改数的末道报废，以及追加入同库批、待入库和撤销产出。办理终检的盘先逐件绑定按本卡 ID 派生并全局避重的示例码。两笔产出合计 15 件进入新库批，随后完整 4 件追加到该库批。

第二盘在末站更正为 7 件，绑定后报废第 2、3 个示例码，另登记 1 件返修，最终以 5 件和 5 个有效码确认产出。报告保留同一报废请求重放的结果。整盘报废样例选择全部 3 个编码，保留到站与交接历史。另留可编辑的终检样例供人工核对同数换码、少报或多报的差额及作废。

`prepare` 通过公开 API 写入上述单据、实物结果和库存，保留任务供手工验收。已有同 TAG 的卡继续只读报告，不补码、改写或续写。准备中断后可换新 TAG 建立另一组。确认入库需要 warehouse:inbound:confirm-finished，工具不改授权。`report` 只读，准备时的 `preparedObservations` 可保存到 `temp/`。

## 单件刻码样例

[刻码工具](prepare-item-marking-demo.mjs)只提供 `prepare`／`report`，省略模式为 `report`。先将已有演示库增量升级并启动匹配 API；首次准备时用 `ITEM_MARKING_DEMO_SOURCE_BATCH_ID` 显式指定一张已下达、完整初配的批量任务。工具只读复用其有效自制成品、已批准锁定的 BOM、当前启用路线和已冻结且仍启用的精确物料版本，不修改来源任务、主数据或角色授权。工单／任务负责人各取对应场景当前首位合格候选，登记人取首位启用现场人员；缺少任一前提时，在首次业务写入前拒绝。

```powershell
$env:ALLOW_DEMO_SEED='1'
$env:ITEM_MARKING_DEMO_API_BASE_URL='http://127.0.0.1:3005/api'
$env:ITEM_MARKING_DEMO_SOURCE_BATCH_ID='<已有完整初配的批量任务ID>'
$env:ITEM_MARKING_DEMO_TAG='marking_01'
node tools/demo/prepare-item-marking-demo.mjs prepare
node tools/demo/prepare-item-marking-demo.mjs report
```

API 默认本机 3005，拒绝远程主机、URL 凭证、查询串、片段及重定向。TAG 默认 `sample`，接受 1～40 位字母、数字、下划线或连字符并转为小写；工单外部订单号为 `demo-item-marking-TAG`，本组备注标记为 `[demo-item-marking-v1:TAG]`。相同 TAG 任一工单已存在时，`prepare` 只报告现状，不补缺、续写或覆盖；中断后先同 TAG `report`，另一组准备使用新 TAG。`report` 不需要来源任务参数。

工具新建一张计划 102 件的批量工单，分别新建计划 9 件的常规追踪任务、计划 3 件的通用追踪任务和计划 90 件的整盘入库任务。任务各自下达、按真实 BOM 完整初配，再填写未领料说明明确缺料开工；不预留、领料或生成库存。八张卡中七张通过真实扫码到达冻结末站，一张保留未到站并预先绑定。仅90件卡自动绑齐并确认终检，留下完整待入库产出；其余卡留待手工办理，工具不结束任务。

| 场景键 | 初始留下的数据 | 手工入口 |
| --- | --- | --- |
| `single-first`、`single-next` | 同一任务的两张单件卡，均未绑定 | 使用报告中各卡 `suggestedCodes` 连续输入并切换卡，观察全局码身份 |
| `partial` | 三件卡仅绑定一个示例码 | 观察未齐码终检限制，可先手工更正错码并查询历史，再补齐另外两件 |
| `scrapped` | 三件先绑不同示例码，选中第2个码同次异常报废；剩余盘量 2，两个有效码及一个报废码 | 查询报废历史，按剩余两件办理终检 |
| `cancelled` | 单件卡绑定示例码后以原因撤销，当前未绑定 | 查询原登记及撤销历史，用释放的号码重新绑定到正确的卡 |
| `general` | 通用任务的一件卡，没有刻码 | 同样先绑定齐码，再办理终检 |
| `unused` | 通用任务的一张 2 件预生成卡，未到站即绑定一个示例码，仍为 unused | 查询未到站绑定历史，继续绑定或在首站扫码，不因绑定生成到站事实 |
| `inbound-90` | 独立90件任务的一盘，90个不同码均已绑定并终检，尚未入库 | 在成品入库页勾选本盘完整90件，按盘查看真实入库单 |

示例码由新建卡ID派生，不带前导零；写入前读取全部当前刻码避重，包含报废件的当前码，不复用已有号码或改动来源任务。报告中的 `suggestedCodes` 也按当前全局码避重，但不预占，手工提交仍由服务端复核。真实绑定、报废、撤销、更正历史和所属盘的实际入库记录均按当前记录报告；同 TAG 重跑只读，不给旧样例补码、新增90件任务或改写用户后续操作，另一组使用新 TAG。

90件卡的 `inboundPlan` 给出完整产出的 `outputIds`；到 `/warehouse/inbound-orders/finished` 选择本组任务并勾选整盘90件，可共建新批次或选择同任务已有批次。工具不自动入库，提交后重新 `report` 查看实时 `receivedQuantity`、`pendingQuantity` 和全部真实 `receipts`；已有入库记录时不再提供本盘待选 ID。旧 TAG 及已经存在的25/25/25/15四笔历史仅按事实报告，不改写、合并或继续包装分次办理。工序终检仍在员工工作台“工序作业”选择末站办理，编码绑定使用 `/production/workbench/code-binding`，编码只关联所属盘并沿盘查看单据。输出可保存在 `temp/`，不含认证凭据；这些场景与报告不代表正式测试或用户验收通过。业务规则由[追踪卡所有者](../../apps/api/src/modules/production/docs/database/execution-traceability-quality.md)与[成品入库所有者](../../apps/api/src/modules/production/docs/database/finished-goods-inbound.md)维护。

## 仓库单据整合样例

[仓库单据工具](prepare-warehouse-documents-demo.mjs)只通过其他入／出库命令，为物料、成品各准备一张多行草稿、一张多行已确认单及一张多行已取消单，共十二张主单。确认入库使用新批次，出库只引用本组已入库的批次；所有样例先保存一次草稿修改。工具不新增采购、生产或质量来源，不覆盖其他单据和库存。

```powershell
$env:ALLOW_DEMO_SEED='1'
$env:WAREHOUSE_DOCUMENTS_DEMO_API_BASE_URL='http://127.0.0.1:3005/api'
$env:WAREHOUSE_DOCUMENTS_DEMO_TAG='acceptance_01'
node tools/demo/prepare-warehouse-documents-demo.mjs prepare
node tools/demo/prepare-warehouse-documents-demo.mjs report
```

地址默认本机 3005，拒绝远程主机、URL 凭证、查询串、片段及重定向。TAG 默认 sample，接受 1～40 位字母、数字、下划线或连字符并统一小写；备注标记为 `[demo-warehouse-documents-v1:TAG]`。运行前要求已有 `demo-stock-multi-v1-A/B` 两个启用物料版本，以及 `demo-stock-product`、`demo-stock-product-second` 两个启用成品。所有主数据候选在首次写入前读取，资格仍由各命令核验。

创建顺序交错物料与成品，以方向日序列展示共同取号；报告读取统一单据列表、详情及批次流水，列出当前单据状态、两条明细和实际主单编号引用。编号不要求无缺口，报告不将用户后续操作改回初始样例。相同 TAG 任一单据已存在时，prepare 只输出当前报告，不补缺、续写或覆盖；中断后先 report，再用新 TAG 准备另一组。报告输出可保存在 `temp/`，场景准备和观测不代表正式测试或用户验收通过。
