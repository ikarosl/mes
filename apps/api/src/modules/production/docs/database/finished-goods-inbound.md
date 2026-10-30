# 批准产出与成品分次入库

Production 拥有结案草稿、办理轮次、不可变批准版及授权明细，并锁内判定当前可执行资格；Inventory 拥有入库主从、库存批次和唯一流水事实。批准理由见 [ADR-0016](../../../../../../../docs/adr/0016-inbound-authorizations-and-stock-batches.md)，产出规则见[结案设计](production-termination.md)，分次办理见[数量示例](../../../../../../../docs/finished-inbound-redesign-proposal.md)。本章维护 Production 的入库命令及公开边界。

## 当前授权与数量

轮次、批准版、计划内／外授权及检验差异由[结案规则](production-termination.md#数量质检与更正)维护。入库只消费当前已定稿轮的当前批准授权；复检或清单更正开始即冻结旧剩余授权，取消或审批退回不恢复。

可执行余额为授权量减去该授权的历史实际已入量，耗尽后退出候选。历史已入取 Inventory 完成明细与匹配正流水，不从当前库存余额推算；同一授权可分次或在同次拆入多个目标批次。

## 直接确认事务

一次确认限定同一任务，可同时消费计划内／外授权，并将同一授权拆入多个批次；同次共建及已有批次资格见 [Inventory 目标契约](../../../inventory/docs/public-contracts.md#采购和批准成品实际入库)。没有可跨请求继续编辑的入库草稿。

Production 先锁工单、任务、结案根及当前授权，再由 Inventory 锁定目标库存。锁内核验任务已结案、当前轮已定稿、当前批准版及无审批冻结，按授权合计本次数量，并用实际已入事实重核余量；完整锁序遵守[库存协议](../../../../../../../docs/inventory-extraction-design.md#7-事务与锁序)。来源复核与入库主从、批次、正流水必须一次提交。

确认要求 `Idempotency-Key`，请求身份包含任务与各明细的授权、批准版、数量和目标；结果保留真实 `inboundId`，契约见[应用幂等定义](../../application/idempotency/)。每条历史明细固定原授权、批准版、检验依据及实际目标，不改绑最新批准版。

## HTTP 查询与权限

| 路径（`/api/production/finished-goods-inbounds`） | 权限与结果 |
| --- | --- |
| `GET /` | `warehouse:inbound:view`；已确认单据分页，按明细显示类别与来源 |
| `GET /candidates` | 同上；当前未耗尽授权、各授权量／已执行／剩余额度及阻断原因 |
| `GET /:inboundId` | 同上；每条明细实际批次、原批准版、质检与审批证据 |
| `POST /actions/confirm` | `warehouse:inbound:confirm-finished`；直接多明细确认 |

列表保留单据概览和实际执行明细，完整批准与检验依据由单据详情提取并去重各明细引用的 `outputRevisionId`，在所属结案范围内批量读取这些历史版本。批准快照解析、授权读取与已执行量查询仅覆盖所引用版本，不读取任务全部版本；任务产出清单的完整版本历史查询独立保留。缺少本单引用的批准依据时明确报错，不替换为任务最新版本。详情响应中的确认人、批准人及检验人展示名通过 Identity 公开能力批量补齐；姓名为查询时展示投影，不改写批准版或检验快照中的人员标识与业务事实。批准版授权的累计已入／剩余量仍表示查询时执行情况，本次历史入库数量以对应入库明细为准。

库存目标及归批资格由 [Inventory](../../../inventory/docs/database/inventory-ledger-and-inbound.md)维护；实施及验收状态见[路线图](../../../../../../../docs/roadmap.md)。
