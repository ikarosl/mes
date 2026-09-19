# @company/contracts

前后端共享的 TypeScript 传输契约和 API 路径常量，当前覆盖通用分页/错误结构、认证、System、Product、Production、Approval 和 Notification。

本包当前只提供编译期 interface、type 与常量，不包含 Zod 等运行时 schema，也没有 OpenAPI 生成或兼容性检查能力。HTTP 入参的运行时校验由 API 的 class DTO 与 ValidationPipe 所有；如果未来引入生成式契约，必须先明确唯一事实来源并迁移现有 DTO，不能把计划描述成当前能力。

供应商配置契约见 `procurement/suppliers.ts`：只提供名称、稳定 ID、版本和审计时间；正式列表分页，选项为关键词前 50 项加最多 100 个 `includeIds` 显式解析的远程窗口。创建和修改均返回 `SupplierItem`，修改携 `version`，没有启停或删除入口。

采购需求来源见 `procurement/demand-candidates.ts`：候选为带工单／任务资料的分页需求叶子；显式 ID 解析返回历史需求、当前资格及阻断原因，数量使用整数字符串。采购关联由需求 ID 逐条表达，不在该契约引入采购分摊量或库存齐套门禁。

外购入库的 `procurement/inbounds.ts` 表达当前有效放行范围与原子批量确认；`scopeIds` 显式解析已选范围，`receiptLineId` 定位到货。历史 `production/inbound.ts` 只读详情公开明细保存的采购到货、修订、范围及检验 ID，内部批号仍关联已有库存批次；来源追溯不以当前余额替代累计入库事实。

## 验证

```text
corepack pnpm --filter @company/contracts typecheck
corepack pnpm --filter @company/contracts test
```

路线步骤、生产快照和员工任务均不包含是否报工字段；所有工序统一报工，员工任务不提供手工完成工序能力字段。

生产需求纠错见 `production/demand-correction.ts`，逐项收尾及证据见 `production/closeout.ts`，产出草稿、质检记录、批准清单及更正见 `production/output.ts`。正常与提前结束任务共用结案审批；批次执行完成量与最终批准产出分开，工单按当前批准版本汇总。需求 `closed` 与审批中冻结分别表达，批次 `closing`、工序 `terminated` 纳入共享状态；Approval 证据为明确的 BOM／更正／收尾联合类型。现有库存契约不因产出处置生成库存。

收尾详情的 `demands/pendingItems/materialReviews` 分别提供原需求履约、模块依赖及物料实核反馈，只属于当前操作页投影，审批仍使用原有冻结证据结构。

产品 BOM 批量替换使用 `ReplaceProductMaterialsCommand`（必填 `version` 与 `items`），前端请求和后端 DTO 共用这一结构；审批只接收已保存的 BOM。

审批详情通过 `ApprovalSubjectSnapshot` 表达已接入场景的证据类型，包含 BOM、需求更正及批次收尾证据。新增业务场景时扩展明确的快照联合及前端展示；证据的运行时结构校验由所属业务模块的审批 handler 实现。

BOM 明细、审批证据展示和生产需求/补料契约均不提供关键物料或记录批次开关。

Approval 流程节点通过 `ApprovalAssignee` 明确 `assigneeType`、`roleId`、`assigneeUserId` 与 `assigneeSourceCode`，角色／指定用户／业务来源三选一，其余字段为 null。场景返回来源选项及必需末级；实例额外返回 `resolvedAssigneeUserId/Name`，不将运行时人员混入模板固定用户字段。决定命令使用 `stepId + version`；详情提供 `currentStepId`、实时 `eligibleUsers` 和操作能力，不再提供个人任务、myTaskId、分派轮次或重新分派能力。历史决定记录保存实际操作者，通知接收记录不授予审批资格。

成品入库见 `production/finished-inbound.ts`，区分任务候选、待确认单与实际采用／当前批准版本。库存批次契约显式返回 `itemKind`；成品有 productId、物料字段为空，物料有 itemId 与精确版本。空身份不能序列化成字符串 null，业务查询必须按身份读取。

工单物料配置契约见 `production/work-order-material-configuration.ts`，保存提交完整选版、原因和工单版本，返回最小幂等结果。`WorkOrderItem.assignedQuantity` 为有效任务计划量，`terminatedPlannedQuantity` 为不占额度的终止历史计划量；需求中的精确版本快照不随工单配置更新。

`ProductionBatchItem.finalOutput` 仅返回当前有效批准版及其计划内／计划外／报废量，未批准为 `null`，不把报工量或更正草稿当作批准数量。任务、追溯及执行确认结果以 `lastStepReportedQuantity` 表达从末工序有效正常报工派生的数量，不再提供批次 `completedQuantity/qualifiedQuantity`。工序记录用 `normalQuantity` 表达 `effective_normal`，代表自检正常而非最终质检合格，不再返回原 `qualifiedQuantity` 别名。`WorkOrderOption` 同时返回计划、有效已分配、已终止计划、剩余额度及 `WorkOrderFinalOutput`，供新增任务核对。可用产出合计只含计划内、计划外；工单既有 `totalQuantity` 含报废，不能解释为合格量或已入库量。
