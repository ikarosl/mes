# @company/contracts

前后端共享的 TypeScript 传输契约和 API 路径常量，当前覆盖通用分页/错误结构、认证、System、Product、Production、Approval 和 Notification。

本包当前只提供编译期 interface、type 与常量，不包含 Zod 等运行时 schema，也没有 OpenAPI 生成或兼容性检查能力。HTTP 入参的运行时校验由 API 的 class DTO 与 ValidationPipe 所有；如果未来引入生成式契约，必须先明确唯一事实来源并迁移现有 DTO，不能把计划描述成当前能力。

## 验证

```text
corepack pnpm --filter @company/contracts typecheck
corepack pnpm --filter @company/contracts test
```

路线步骤、生产快照和员工任务均不包含是否报工字段；所有工序统一报工，员工任务不提供手工完成工序能力字段。

产品 BOM 批量替换使用 `ReplaceProductMaterialsCommand`（必填 `version` 与 `items`），前端请求和后端 DTO 共用这一结构；审批只接收已保存的 BOM。

审批详情通过 `ApprovalSubjectSnapshot` 表达已接入场景的证据类型，目前只有 `BomApprovalSnapshot`。新增业务场景时扩展明确的快照联合及前端展示；证据的运行时结构校验由所属业务模块的审批 handler 实现。

BOM 明细、审批证据展示和生产需求/补料契约均不提供关键物料或记录批次开关。

Approval 流程节点通过 `ApprovalAssignee` 明确 `assigneeType`、`roleId` 与 `assigneeUserId`，角色/指定用户二选一，另一字段为 null。决定命令使用 `stepId + version`；详情提供 `currentStepId`、实时 `eligibleUsers` 和操作能力，不再提供个人任务、myTaskId、分派轮次或重新分派能力。历史决定记录保存实际操作者，通知接收记录不授予审批资格。
