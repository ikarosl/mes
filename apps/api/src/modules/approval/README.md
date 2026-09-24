# Approval

接入 Product 的 BOM 场景 `product.bom.approve`，以及 Production 的 `production.demand.correct`、`production.batch.closeout`。流程配置、申请、节点、待办和处理记录属于 Approval；Product 保有 BOM、送审冻结与永久锁定事实；Production 保有需求更正、逐项收尾和产出处置。工单审批尚未接入；站内消息通过独立 Notification 公开能力发布。

批次结案的最后节点使用“业务关联人员 → 工单负责人”。流程保存来源规则，送审由 Production 在锁内解析具体负责人并保留工单来源证据，Approval 将其固化到本次节点；同一流程可处理不同负责人的工单。规则见[业务人员分派](docs/subject-integration.md#业务关联人员)。统一结案与产出清单已接入 Production，成品质检及放行由 Quality 所有；用户验收和正式测试仍见[路线图](../../../../../docs/roadmap.md)。

## 配置与操作

1. 管理员为对应业务场景配置顺序节点，每级选择启用角色、指定用户或场景支持的业务关联人员，保存并发布；结案的最后节点必须为工单负责人，前面可配置管理节点，不强制两级。
2. 产品页保存完整 BOM 后提交；生产任务需求总览中提交更正；批次收尾中处理全部事项、保存产出后提交。待办与本人申请分别按服务端授权范围读取。
3. 当前节点的任一合格用户明确通过后进入下一级；末级通过与所属业务生效同事务。
4. 任一级驳回结束申请；仅申请人可撤回待审申请。在审改内容须先撤回或驳回，修改后从第一级新建申请，旧证据保留；撤回与最终批准在同一业务根锁下互斥。
5. 节点无人可审时保留当前节点并显示提示；角色新增合格成员或原人员资格恢复后，自然进入其待办，无需重新分派。指定用户节点不会自动转给其他用户，申请人可撤回后按新流程重新提交。

每个节点只有一条共享执行记录，不按候选人复制任务。角色节点固定角色身份并实时解析成员；指定用户节点固定用户身份；业务节点固定送审解析的用户身份。三者均要求当前账号有效，合并授权包含 `approval:decide`（支持既有通配匹配）；角色节点还须属于该有效角色。允许申请人自审、同一人逐级处理，但各级必须单独点击和记录。发布时验证角色／用户当前资格及业务来源规则；提交时连同业务解析人逐级检查当前合格人员，待办查询及处理时重新校验；新发布流程不改变在途申请。

## HTTP 与权限

接口前缀 `/api/approval`，body/query/param 使用 class DTO；写操作经共享事务和成功审计。

| 方法与路径 | 权限与含义 |
| --- | --- |
| `GET /scenes`、`GET /role-options`、`GET /user-options`、`GET /scenes/:sceneCode/flow` | `approval:configure`；场景、启用角色及当前具备审批资格的用户候选 |
| `PUT /scenes/:sceneCode/flow/draft` | `approval:configure`；完整有序节点，核对 `draftId + version`，无草稿时两者为 null；每级提供 `assigneeType`、`roleId`、`assigneeUserId`，另含 `assigneeSourceCode`，角色／用户／业务来源三选一，不适用字段显式为 null |
| `POST /scenes/:sceneCode/flow/publish` | `approval:configure`；核对草稿 ID 和版本，发布后内容不可改 |
| `GET /instances`、`GET /instances/:id` | 审批查看、处理、配置、BOM 管理、生产需求更正或批次收尾任一权限；普通用户按下方范围过滤 |
| `POST /bom/:productId/submit` | `product:products:manage-bom`；提交产品聚合版本 |
| `POST /instances/:id/approve`、`.../reject` | `approval:decide`；提交申请 `version` 和当前 `stepId`，驳回原因必填 |
| `POST /instances/:id/withdraw` | 与申请详情相同入口权限，额外严格校验申请人本人 |

列表 scope 为 `todo/mine/all`，API 未传 scope 时默认 todo；管理页默认显式请求 all，包含所有状态。todo 在后端分页和计数前按申请未结束、节点当前活动及登录用户实时资格过滤；mine 包含本人发起的全部历史；普通用户的 all 包含本人发起、本人实际作出通过或驳回决定，以及本人当前可处理的申请。仅曾是候选人或通知收件人不保留历史全文访问权，新加入角色也不会获得已结束申请的历史权限。列表与详情使用同一授权范围，均须满足接口入口权限。`approval:configure` 可读全部申请；`approval:view` 本身不授予全局读取。

前端只传 scope、状态和普通分页筛选，不提供授权角色或用户列表。详情通过 `currentStepId`、`canApprove` 和 `canWithdraw` 表达当前操作；各节点分别展示角色/指定用户或业务来源规则、`resolvedAssigneeUserId/Name`、当前 `eligibleUsers` 和历史真实决定。所有决定都校验申请版本、当前节点与实时资格，非末级审批同样递增版本，迟到请求不得误批下一节点。重新分派接口与权限已经移除。通用批准／驳回／撤回仍不启用 HTTP Idempotency-Key，不自动重试决定请求；Production 两个业务送审入口使用各自的幂等命令，申请创建、绑定、审计和通知同事务。

## 模块与事务边界

场景声明、Handler 注册、受审证据版本、业务根锁序、绑定返回版本及负责人解析由[审批场景接入](docs/subject-integration.md)完整维护。Approval 不反向导入业务模块，也不越界读取或写入其表；数据库约束见[数据库设计](docs/database.md)。

## 开发验证与手工验收

初始化与演示数据使用[统一数据库入口](../../../../../ops/runbooks/database-initialization.md)，升级／回滚前置条件见[迁移安全](../../../../../packages/database/docs/migration-safety.md)。开发重置不得伪造不存在的人工审批证据。

相邻测试验证角色／指定用户／业务来源三选一、字符串 ID、节点与版本命令、拒绝客户端授权字段、接口权限和实时资格解析。真实 MySQL 套件验证节点共享待办、动态成员及指定用户资格、分页/历史范围、单节点并发决定、事务回滚和迁移约束。应用类型检查和构建排除相邻测试；测试类型使用对应应用的 `typecheck:test` 独立检查，不得把应用检查通过当作测试或用户验收通过；验证边界见根[测试策略](../../../../../docs/testing-strategy.md)。

相邻后端测试通过 `corepack pnpm --filter @company/api test` 执行，测试类型使用 `corepack pnpm --filter @company/api typecheck:test` 检查。跨模块审批用例位于根 `tests/integration/approval`，BOM 字段移除迁移用例位于 `tests/integration/product`，均由现有 `corepack pnpm test:production:mysql` 入口执行；必须配置专用测试库，环境门禁见根[测试策略](../../../../../docs/testing-strategy.md)。

## 通知事件

`ApprovalNotifications` 通过 NotificationService 在当前审批事务中发布，消息及收件不直接写入 Approval 表。事件键为 `approval:{actionId}:{eventType}[:{stepId}]`；来源为本事务真实 `approval_action`，目标为申请 `approval_instance`。文本标题使用共享通知事件标签，正文只包含申请标题及激活节点名，不复制 BOM 证据或审批意见。

- submitted 动作后：只通知首级当时合格人员，键包含首级节点 ID。
- 非末级 approved 动作后：只通知下一级激活时的合格人员，键包含下级节点 ID。无人时 Notification 返回 no_recipients，当前节点继续 pending 并派生无人提示，不撤销前级决定。
- 最终 approved 或 rejected 动作后：通知申请人，键不带节点。
- withdrawn 动作后：通知撤回命令在锁内、取消节点前实时解析的当前合格人员，不使用旧消息收件集合推断当前待办。

不排除本人，不向未来节点提前发送，不因角色新增成员补写历史收件。既有通知不随业务完成删除；历史收件不授予全文或处理权限。通知发布、业务动作、所属模块写入及成功审计整体提交，只有新消息在最外层提交后异步调度默认空钩子。发布规则及失败隔离由 [Notification](../notification/README.md) 所有。

产出清单提交人通过 `production:tasks:manage-output` 访问本人相关审批详情及撤回入口；接口仍检查实例可见范围和申请人资格，该权限不授予审批决定能力。
