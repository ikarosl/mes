# 业务场景数据工具

本目录通过公开业务 API 准备可重复定位的人工验收数据，不直接写业务事实表。工具不属于应用初始化、部署或正式测试；源码职责见[编码规范](../../docs/coding-standards.md#工程脚本与临时文件)。

| 工具                                                  | 用途                                                                         |
| ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| [仓库简化](prepare-warehouse-simplification-demo.mjs) | 无数量到货、独立检查报告、先入库后报告、独立补购／补发、仅说明和跨供应商共批 |
| [采购金额](prepare-procurement-amount-demo.mjs)       | 报价、含税总额、舍入、正式单更正及审计                                       |
| [追踪卡](prepare-tracking-workbench-demo.mjs)         | 扫码、异常结算、末站产出与库存                                               |
| [审批开关](prepare-optional-approval-demo.mjs)         | 独立 BOM 草稿及研发人工需求，保留给人工提交、更正与关闭                      |

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

十盘包括正常流转10件、交接后改量并结算异常剩余5件、首站未结异常、未使用待打印、已用作废、整盘报废、零盘量待异常结算，以及追加同批4件、待入库6件、撤销产出后待重新终检2件。前两盘终检后先保留待入库，再通过人工归批接口合入一个新批次；追加4件选择本任务该批次继续入库。

第二盘先登记影响3件的异常，按返修1件与新增报废2件一次结算；另两条各影响2件的异常分别引用相同的已有报废，不再次扣量，也不累计耗用引用额度。场景记录同幂等键重放的盘量、未结异常扫码拒绝、最终剩余量产出和全报废无产出的观察结果。盘量更正与报废结算分别留痕，历史过站5件保持原值。本组有效产出25件、入库19件、待入库6件，另保留一条2件已撤销记录及回到末站的卡；全报废卡无产出和库存。数量不包含任务原有事实，计划量不阻止这些样例实际产出。

`prepare` 通过公开 API 写入以上单据、处理事实及库存，不自动结束任务；留下正量未结、零量未结和未用卡供人工继续办理。重复同 TAG 只读取报告，不覆盖、修复或续写已存在的样例，准备中断后换新 TAG 建立另一组；确认成品入库需要 warehouse:inbound:confirm-finished，工具不自动修改角色授权。`report` 只读取该组当前状态，不重新执行历史观察；准备时输出的 `preparedObservations` 可保存到 `temp/`。业务语义见[追踪卡所有者](../../apps/api/src/modules/production/docs/database/execution-traceability-quality.md)。
