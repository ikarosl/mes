# Approval

接入 Product 的 BOM 场景 `product.bom.approve`，以及 Production 的 `production.demand.correct`、`production.batch.closeout`。流程配置、申请、节点、待办和处理记录属于 Approval；Product 保有 BOM、送审冻结与永久锁定事实；Production 保有需求更正、逐项收尾和产出处置。工单审批尚未接入；站内消息通过独立 Notification 公开能力发布。

批次结案的最后节点使用“业务关联人员 → 工单负责人”。流程保存来源规则，送审由 Production 在锁内解析具体负责人并保留工单来源证据，Approval 将其固化到本次节点；同一流程可处理不同负责人的工单。规则见[审批设计 §7](../../../../../docs/approval-design.md#7-业务关联人员分派)。统一结案产出清单与质检记录仍按路线图实施。

## 配置与操作

1. 管理员进入 `/approval/flows`，为对应业务场景配置顺序节点，每级选择启用角色、指定用户或场景支持的业务关联人员，保存并发布；结案的最后节点必须为工单负责人，前面可配置管理节点，不强制两级。
2. 产品页保存完整 BOM 后提交；生产任务需求总览中提交更正；批次收尾中处理全部事项、保存产出后提交。进入 `/approval/inbox` 查看待办或本人申请。
3. 当前节点的任一合格用户明确通过后进入下一级；末级通过与所属业务生效同事务。
4. 任一级驳回结束申请；仅申请人可撤回待审申请。修改后从第一级重新提交，旧证据保留。
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

Product、Production 分别声明场景并注册类型化 handler，Approval Registry 仅负责装配能力，不存 SQL、任意回调地址或前端组件路径。ApprovalModule 依赖 Identity 和 Notification；ProductModule、ProductionModule 依赖 Approval 公开注册和提交端口，Approval 不反向导入业务模块。

阅读场景与业务调用时，区分以下入口：

| 入口 | 职责 |
| --- | --- |
| `ApprovalSubjectHandlerRegistry.register(handler)` | 启动时把处理器实例及其场景定义放入内存，不写数据库，也不执行审批 |
| `Registry.listSceneDefinitions()` / `getSceneDefinition(code)` | 读取代码声明的场景定义，不包含流程配置状态 |
| `Registry.getHandler(sceneCode, subjectType)` | 取得业务处理器实例，用于校验、冻结、恢复或最终生效 |
| `ApprovalService.listScenes()` → `MysqlApprovalFlowRepository.listScenes()` | 管理页查询：合并 Registry 定义与数据库发布状态，保留尚未配置的场景 |

`GET /scenes` 经 Controller、Service 到配置 Repository，再调用 `Registry.listSceneDefinitions()`；保存与发布流程才写配置表。BOM HTTP 入口 `submitBom()` 固定场景并鉴权后，调用 `ApprovalService.submit({ sceneCode, subjectId, expectedVersion }, audit)`，由通用 `MysqlApprovalRepository.submit()` 执行提交。`approve()` / `reject()` 共用 `decide()`：非末级通过只推进节点，末级通过调用 `finalizeApproval()`，驳回调用 `restoreAfterApprovalEnd()`；申请人撤回也调用恢复方法。

配置聚合由 `ApprovalFlowRepository` / `MysqlApprovalFlowRepository` 负责；申请、节点和操作记录由 `ApprovalRepository` / `MysqlApprovalRepository` 负责。运行仓储在提交事务内调用配置仓储的 `lockPublishedFlow()` 固定选版，该内部协作只发生在 infrastructure，不向 application port 暴露连接类型。配置读取共用 `loadFlow()`；角色/用户配置校验与人员解析共用 `approval-assignees.ts`，资格只通过 Identity 公开能力取得，不越界查询 Identity 表；成功审计共用 `writeApprovalAudit()` 并继续经过平台事务审计 writer。

通用提交先调用 `prepareForApproval()` 获取业务快照及其结构版本、`businessAssigneeResolutions`，校验来源与末级规则、解析资格后实例化业务人员，创建申请后调用 `bindApproval()`，以其返回值保存冻结后的 `subject_version`，不假设所有业务版本都加一。申请及绑定版本在同一事务内完成，提交后的证据及解析人员不改写。账号失效时仍保持 pending、派生 blocked；不重新解析当前工单、不回退给他人。详情区分来源、送审确定人员和实际操作者；待办、分页计数、决定与通知共用这一资格。详情读取只由 Approval 解码 JSON，再交给 handler 的 `readSnapshotForDisplay()` 校验本场景证据版本和结构、补充当前展示引用；BOM 物料解析归 Product。

新增场景需由业务模块声明并注册 handler，提供独立鉴权且固定场景的业务提交入口，再复用通用 `submit()`。不得新增一份场景专属提交 SQL，也不开放让客户端自由指定场景的提交路由。`ApprovalSubjectType` 和 `ApprovalSubjectSnapshot` 明确区分 product、production_demand_correction、production_batch_closeout，管理端分别呈现 BOM、更正影响或逐项收尾结果；每个 handler 负责自己的证据结构校验。

提交先由业务 handler 锁所属聚合根并校验受审内容，再固定发布版本、创建申请及全部节点（首级 pending，其余 waiting），业务模块绑定申请，所有核心落库及成功审计共用一个事务。后续操作先只读定位，再经业务公开 handler 锁并校验当前申请引用和冻结版本，再锁申请和节点。单节点最多一条实际决定受唯一约束保护；没有合格人员只派生 blocked 展示，不因查询写表。Product 的原生错误在 handler 转换为公开失败契约，不泄漏内部 domain 类。

所有表结构见[数据库设计](docs/database.md)，BOM 字段与门禁见[Product](../product/docs/database.md)。已发布配置供历史读取，不被新草稿覆盖。材料名称按当前 ID 解析，不在证据内保存名称快照。

## 开发验证与手工验收

项目处于开发阶段，允许随时清空或重建数据库，不依赖现存业务数据，不保留兼容影子表。迁移 `202609100001-approval-bom-pilot` 拒绝已有旧任务锁定 BOM；这些数据没有人工审批证据，不能伪造为批准。迁移 `202609120001-approval-node-assignees` 追加角色/用户二选一约束，移除个人任务、分派轮次和重新分派权限，保留真实处理记录；执行时暂停相关 API，详见[迁移安全](../../../../../packages/database/docs/migration-safety.md)。原开发库可按统一初始化流程重建。

手工联调可使用独立库，例如 `easy_mes_approval_probe`。从仓库根执行以下命令，每条数据库命令都显式指定目标库；连接凭证与管理员配置仍从 `.env` 读取。`db:init` 会执行迁移、系统种子与管理员初始化，将目标库的管理员密码设置为 `.env` 中的配置值：

```bash
DB_NAME=easy_mes_approval_probe corepack pnpm db:init
DB_NAME=easy_mes_approval_probe ALLOW_DEMO_SEED=1 DEMO_USER_PASSWORD='<至少 6 位的演示密码>' corepack pnpm db:seed:demo
DB_NAME=easy_mes_approval_probe APP_PORT=3100 corepack pnpm --filter @company/api exec node dist/main.js
APP_PORT=3100 corepack pnpm --filter @company/admin-web exec vite --host 0.0.0.0 --port 5174
```

源码修改后先执行 `corepack pnpm --filter @company/api build`。常规启动仍使用根 `dev:api/dev:admin`，其数据库必须已迁移至新结构。演示数据由统一种子生成，可自行新增成品体验送审；不依赖任何机器上已有的临时资料。

相邻测试验证角色/指定用户二选一、字符串 ID、节点与版本命令、拒绝客户端授权字段、接口权限和实时资格解析。真实 MySQL 套件验证节点共享待办、动态成员及指定用户资格、分页/历史范围、单节点并发决定、事务回滚和迁移约束。前端完整类型检查包含组件测试，不得把单独 Vite 打包当作完整类型检查通过；验证边界见根[测试策略](../../../../../docs/testing-strategy.md)。

相邻后端测试通过 `corepack pnpm --filter @company/api test` 执行，测试类型使用 `corepack pnpm --filter @company/api typecheck:test` 检查。跨模块审批用例位于根 `tests/integration/approval`，BOM 字段移除迁移用例位于 `tests/integration/product`，均由现有 `corepack pnpm test:production:mysql` 入口执行；必须配置专用测试库，环境门禁见根[测试策略](../../../../../docs/testing-strategy.md)。

## 通知事件

`ApprovalNotifications` 通过 NotificationService 在当前审批事务中发布，消息及收件不直接写入 Approval 表。事件键为 `approval:{actionId}:{eventType}[:{stepId}]`；来源为本事务真实 `approval_action`，目标为申请 `approval_instance`。文本标题使用共享通知事件标签，正文只包含申请标题及激活节点名，不复制 BOM 证据或审批意见。

- submitted 动作后：只通知首级当时合格人员，键包含首级节点 ID。
- 非末级 approved 动作后：只通知下一级激活时的合格人员，键包含下级节点 ID。无人时 Notification 返回 no_recipients，当前节点继续 pending 并派生无人提示，不撤销前级决定。
- 最终 approved 或 rejected 动作后：通知申请人，键不带节点。
- withdrawn 动作后：通知撤回命令在锁内、取消节点前实时解析的当前合格人员，不使用旧消息收件集合推断当前待办。

不排除本人，不向未来节点提前发送，不因角色新增成员补写历史收件。既有通知不随业务完成删除；历史收件不授予全文或处理权限。通知发布、业务动作、所属模块写入及成功审计整体提交，只有新消息在最外层提交后异步调度默认空钩子。发布规则及失败隔离由 [Notification](../notification/README.md) 所有。

产出清单提交人通过 `production:tasks:manage-output` 访问本人相关审批详情及撤回入口；接口仍检查实例可见范围和申请人资格，该权限不授予审批决定能力。
