# 批准产出与成品分次入库

Production 拥有结案草稿、办理轮次、不可变批准版及授权明细，并锁内判定当前可执行资格；Inventory 拥有入库主从、库存批次和唯一流水事实。完整跨模块关系见[已批准方案](../../../../../../../docs/finished-inbound-redesign-proposal.md)和[结案规则](production-termination.md)。本章维护 Production 的入库命令及公开边界。

## 当前授权与数量

`production_output_round` 固定开始时同任务全部历史实际已入计划内／外基准、剩余申报范围、前轮和前版。开始定稿更正或明确复检时，旧轮立即标为 `superseded`；旧批准、授权和入库事实均不改写。取消更正、审批驳回或撤回不会恢复旧轮授权；可重新发起更正或复检，再经负责人审批产生当前轮新授权。

批准时为累计计划内／外目标分别减去本轮固定已入基准，仅为正数的类别建立一条 `production_output_allocation`。授权行不可变；同一授权可多次、同次多明细执行。批准版 API 的累计数量由本轮基准＋对应授权派生，`production_output_revision` 不另存两份累计物理列。累计目标各自不得低于任务历史已入事实，计划内仍不得超过任务计划。已执行量取 Inventory 实际完成的入库明细及匹配正流水，不用库存批次当前余额；当前可执行余额为授权量减该授权已执行量，且仅当前轮 `finalized` 与当前批准版一致时有效。耗尽的授权退出候选。

质检 G/F 与明确放行结论不能直接授予入库资格。仅 Production 定稿引用 `full+released` 检验时，使用**检验所在轮**固定已入基准加 G 核对累计目标，差额只提示；沿用旧检验的纯定稿更正不能改用新定稿轮基准。抽检不推算整批差异。复检针对同任务全部剩余实物所在轮次，须开始新轮并登记新检验；待复检和不放行均不能用旧授权继续入库。

## 直接确认事务

`POST /api/production/finished-goods-inbounds/actions/confirm` 使用 `production:inbounds:confirm-finished`，输入 `productionBatchId`、可选备注以及非空 `details`。每条明细含唯一 `detailKey`、当前 `allocationId/revisionId`、正整数 `quantity`、目标 `{mode:new,clientKey}` 或 `{mode:existing,batchId}`。同次可混合计划内／外，把同一授权拆入多个批次，并以相同 `clientKey` 把多明细归到同一新批次。新库存批次由 Inventory 在实际插入时分配 IB 编号；复用已有批次不取新 IB，每次确认入库另分配 FI 单号，详见[统一编号](../../../../../docs/business-numbering.md)。没有持久化待确认入库草稿，旧创建、编辑、取消命令不开放。

锁序为工单 → 生产任务 → 结案根 → 当前授权 → Inventory 批次。Production 在同一事务核验任务已结案、轮次已定稿且仍为当前轮、版本是当前批准版、无审批冻结，并按授权聚合本次数量，通过 Inventory public 能力取得各授权历史已执行量后检查剩余额度。随后调用 `InventoryInboundCommand.confirmFinishedOutput`；Inventory 核验产品与目标批次，写主单、多明细、批次、正流水及成功审计。入库单主表的 `finished_product` 只表示成品来源，类别和批准版由每条明细所引用的授权确定。Inventory 批次可承接多次来源，来源查询沿明细追溯，不从库存余额倒推某版本已入量。

任何一项失败均回滚整次确认；幂等键和业务事实一起提交。Production 不直接写 Inventory 表，也不查询其内部表做业务写资格。候选和历史展示在已登记的专用只读查询中读取批准字段及入库事实；每条历史明细返回授权、批准版、检验依据、数量、批次和流水。批号从 `item_batch.batch_code` 读，废弃 `requested_batch_code`。

## HTTP 查询与权限

| 路径（`/api/production/finished-goods-inbounds`） | 权限与结果 |
| --- | --- |
| `GET /` | `warehouse:inbound:view`；已确认单据分页，按明细显示类别与来源 |
| `GET /candidates` | 同上；当前未耗尽授权、各授权量／已执行／剩余额度及阻断原因 |
| `GET /:inboundId` | 同上；每条明细实际批次、原批准版、质检与审批证据 |
| `POST /actions/confirm` | `production:inbounds:confirm-finished`；直接多明细确认 |

列表保留单据概览和实际执行明细，完整批准与检验依据由单据详情提取并去重各明细引用的 `outputRevisionId`，在所属结案范围内批量读取这些历史版本。批准快照解析、授权读取与已执行量查询仅覆盖所引用版本，不读取任务全部版本；任务产出清单的完整版本历史查询独立保留。缺少本单引用的批准依据时明确报错，不替换为任务最新版本。详情响应中的确认人、批准人及检验人展示名通过 Identity 公开能力批量补齐；姓名为查询时展示投影，不改写批准版或检验快照中的人员标识与业务事实。批准版授权的累计已入／剩余量仍表示查询时执行情况，本次历史入库数量以对应入库明细为准。

页面权限不代替上述后端独立鉴权。库存、批次、归批资格及约束由[Inventory 所有者](../../../inventory/docs/database/inventory-ledger-and-inbound.md)维护；本章不复制其结构。迁移只追加成对文件，开发数据按[迁移安全](../../../../../../../packages/database/docs/migration-safety.md)和统一初始化入口重建。正式测试与用户验收状态见[路线图](../../../../../../../docs/roadmap.md)。
