# 业务场景数据工具

本目录通过公开业务 API 准备可重复定位的人工验收数据，不直接写业务事实表。工具不属于应用初始化、部署或正式测试；源码职责见[编码规范](../../docs/coding-standards.md#工程脚本与临时文件)。

| 工具 | 用途 |
| --- | --- |
| [仓库简化](prepare-warehouse-simplification-demo.mjs) | 无数量到货、独立检查报告、先入库后报告、独立补购／补发、仅说明和跨供应商共批 |
| [采购金额](prepare-procurement-amount-demo.mjs) | 报价、含税总额、舍入、正式单更正及审计 |
| [追踪卡](prepare-tracking-workbench-demo.mjs) | 扫码、异常结算、末站产出与库存 |

## 前置准备

使用根 [README](../../README.md#仓库简化实验分支) 指定的新空实验库，完成 db:init 后显式加载[演示种子](../../packages/database/demo/README.md)，再以同一配置启动 API。工具由 @company/config 加载根 .env，进程环境变量优先；不在脚本中保存密码。ADMIN_USERNAME／ADMIN_PASSWORD 应与初始化管理员一致，DEMO_USER_PASSWORD 用于演示职责账号。

所有工具的 prepare 与 report 均须 ALLOW_DEMO_SEED=1，NODE_ENV=production 时拒绝。report 只读业务数据；登录会建立会话及认证记录。prepare 会创建业务单据、检查报告和库存流水，不代表正式测试或用户验收通过。

## 仓库简化样例

在根目录运行，API默认使用 http://127.0.0.1:3003/api；WAREHOUSE_DEMO_API_BASE_URL 可修改本地地址，工具拒绝远程主机、URL凭证、查询串、片段和重定向。

```powershell
$env:ALLOW_DEMO_SEED='1'
$env:WAREHOUSE_DEMO_TAG='acceptance_01'
node tools/demo/prepare-warehouse-simplification-demo.mjs prepare
node tools/demo/prepare-warehouse-simplification-demo.mjs report
```

WAREHOUSE_DEMO_TAG 默认 sample，只接受1～40位字母、数字、下划线或连字符。标记 [demo-warehouse-v1:TAG] 写入采购与到货备注；不要手工删除标记后重复 prepare。相同TAG已存在任何采购时只输出当前报告，不覆盖、补缺或继续写入。

| 场景 | 留下的记录 |
| --- | --- |
| 免费赠送 | 原采购20，检查21合格／1不合格，到货行独立记录退回与赠送说明，再实际入库21 |
| 收费补购 | 在检查和入库前补购1，实际入21后在到货行独立登记说明及报告；补单不新增到货或库存 |
| 仅其他处理 | 未检查未入库也可先建立质量补发约定，再在到货行独立记录全批线下处理说明，不调用入库接口 |
| 待人工办理 | 只登记采购及到货，供手工检查／收货／补单 |
| 跨供应商共批 | 两家供应商的到货分别入4和6，共用一个新库存批次，保留两条来源 |

报告列出实际单号、来源、采购量、已入数量、处理说明和报告记录；它只描述当前数据，不以初始样例预期替代用户后续修改。

## 其他工具配置

采购金额工具使用 PROCUREMENT_AMOUNT_DEMO_API_BASE_URL（默认 http://127.0.0.1:3002/api）、PROCUREMENT_AMOUNT_DEMO_TAG（缺省为原工具数据标记）；本实验可显式把 API 基址改为3003。工具需要演示共批供应商和 demo-stock-multi 两个精确版本。远程执行仅在HTTPS并显式设置 PROCUREMENT_AMOUNT_DEMO_ALLOW_REMOTE=1 时允许。

追踪卡工具使用 TRACKING_DEMO_API_BASE_URL（默认 http://127.0.0.1:3002/api）、TRACKING_DEMO_TAG（默认sample）和必填 TRACKING_DEMO_BATCH_ID；在本实验使用3003。远程同样要求HTTPS及 TRACKING_DEMO_ALLOW_REMOTE=1。具体生产前提见下节。

## 重复执行和中断

每次业务写入携带独立幂等键；工具不会在未知结果后用新键自动重试，也没有跨请求事务。失败会保留此前成功写入，先用同TAG report核对。需要另一组样例时换新TAG，不通过删数据或重跑demo绕过迁移或业务错误。报告输出可保存到temp，禁止将密码、Token或Cookie写入输出。

## 追踪卡工作台样例

追踪卡工具使用独立现场人员目录，要求至少一名启用人员，各登记动作均使用统一目录。先通过正常产品 BOM 审批、任务创建和物料初配，再明确开始批量任务；缺料开工仍须填写原因。工具不创建替代主数据、不跳过上述业务资格，也不自动结束任务。

```powershell
$env:ALLOW_DEMO_SEED='1'
$env:TRACKING_DEMO_BATCH_ID='<已有执行中批量任务ID>'
$env:TRACKING_DEMO_TAG='acceptance_01'
node tools/demo/prepare-tracking-workbench-demo.mjs prepare
```

七盘分别是正常流转按剩余10件入库、已交接后盘量5改7再结算异常后按剩余5件入库、首站未结异常阻止流转、未使用待打印、已用作废保留到站、整盘报废保留交接历史，以及零盘量仍有异常待人工关联报废结算。

第二盘先登记影响3件的异常，按返修1件与新增报废2件一次结算；另两条各影响2件的异常分别引用相同的已有报废，不再次扣量，也不累计耗用引用额度。场景记录同幂等键重放的盘量、未结异常扫码拒绝、最终剩余量产出和全报废无产出的观察结果。盘量更正与报废结算分别留痕，历史过站5件保持原值。前两盘实际入库合计15件；全报废卡无产出和库存。

`prepare` 通过公开 API 写入以上单据、处理事实及库存，不自动结束任务；留下正量未结、零量未结和未用卡供人工继续办理。重复同 TAG 只读取报告，不覆盖、修复或续写已存在的样例，准备中断后换新 TAG 建立另一组。`report` 只读取该组当前状态，不重新执行历史观察；准备时输出的 `preparedObservations` 可保存到 `temp/`。业务语义见[追踪卡所有者](../../apps/api/src/modules/production/docs/database/execution-traceability-quality.md)。
