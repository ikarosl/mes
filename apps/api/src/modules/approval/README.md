# Approval

本次只接入 Product 的 BOM 场景 `product.bom.approve`。流程配置、申请、节点、待办和处理记录属于 Approval；Product 保有 BOM、送审冻结与永久锁定事实。工单审批和 Notification 尚未接入。

## 配置与操作

1. 管理员进入 `/approval/flows`，为 BOM 配置顺序节点，每级选择一个启用角色，保存并发布。
2. 产品页保存完整 BOM 后提交审批。进入 `/approval/inbox` 查看待办或本人申请。
3. 当前节点的任一合格用户明确通过后进入下一级；末级通过与 BOM 永久锁定同事务。
4. 任一级驳回结束申请；仅申请人可撤回待审申请。修改后从第一级重新提交，旧证据保留。
5. 节点无人可审时保留申请；补齐角色成员后，有重新分派权限的人员填写原因再分派。

角色只限定候选成员，当前账号及角色必须有效，合并授权须包含 `approval:decide`（支持既有通配匹配）。允许申请人自审、同一人逐级处理，但各级必须单独点击和记录。角色有效人数在发布和提交时逐级检查，已分派任务处理时重新校验当前资格。

## HTTP 与权限

接口前缀 `/api/approval`，body/query/param 使用 class DTO；写操作经共享事务和成功审计。

| 方法与路径 | 权限与含义 |
| --- | --- |
| `GET /scenes`、`GET /role-options`、`GET /scenes/:sceneCode/flow` | `approval:configure`；只暴露已注册场景和角色配置 |
| `PUT /scenes/:sceneCode/flow/draft` | `approval:configure`；完整有序节点，核对 `draftId + version`，无草稿时两者为 null |
| `POST /scenes/:sceneCode/flow/publish` | `approval:configure`；核对草稿 ID 和版本，发布后内容不可改 |
| `GET /instances`、`GET /instances/:id` | 审批查看、处理、配置、重新分派或 BOM 管理任一权限；普通用户只看本人申请或参与申请 |
| `POST /bom/:productId/submit` | `product:products:manage-bom`；提交产品聚合版本 |
| `POST /instances/:id/approve`、`.../reject` | `approval:decide`；提交申请版本和本人当前 taskId，驳回原因必填 |
| `POST /instances/:id/withdraw` | 与申请详情相同入口权限，额外严格校验申请人本人 |
| `POST /instances/:id/reassign` | `approval:reassign`；版本和原因必填，只按原节点角色重新解析 |

列表 scope 为 `todo/mine/all`，API 未传 scope 时默认 todo；管理页默认显式请求 all，包含所有状态。todo 只返回当前有资格处理的待办，结束后消失是正常行为；mine 包含本人发起的全部历史；普通用户的 all 包含本人发起或曾分派审批任务给本人的申请，不按任务当前状态或当前角色成员关系删除历史可见性。申请人和曾分派的审批人均可打开同一申请的完整节点、任务和操作记录，接口入口权限仍须满足。配置或重新分派管理权限可读全部申请；`approval:view` 本身不授予全局读取。所有决定的请求都带申请 `version`，重分派及非末级审批也递增版本。本次未启用 HTTP Idempotency-Key，不自动重试审批写请求。

## 模块与事务边界

Product 静态声明场景并注册类型化 handler，Approval Registry 仅负责装配能力，不存 SQL、任意回调地址或前端组件路径。ApprovalModule 依赖 Identity；ProductModule 依赖 Approval 的公开注册端口，Approval 不反向导入 Product。

阅读场景与业务调用时，区分以下入口：

| 入口 | 职责 |
| --- | --- |
| `ApprovalSubjectHandlerRegistry.register(handler)` | 启动时把处理器实例及其场景定义放入内存，不写数据库，也不执行审批 |
| `Registry.listSceneDefinitions()` / `getSceneDefinition(code)` | 读取代码声明的场景定义，不包含流程配置状态 |
| `Registry.getHandler(sceneCode, subjectType)` | 取得业务处理器实例，用于校验、冻结、恢复或最终生效 |
| `ApprovalService.listScenes()` → `MysqlApprovalFlowRepository.listScenes()` | 管理页查询：合并 Registry 定义与数据库发布状态，保留尚未配置的场景 |

`GET /scenes` 经 Controller、Service 到配置 Repository，再调用 `Registry.listSceneDefinitions()`；保存与发布流程才写配置表。BOM HTTP 入口 `submitBom()` 固定场景并鉴权后，调用 `ApprovalService.submit({ sceneCode, subjectId, expectedVersion }, audit)`，由通用 `MysqlApprovalRepository.submit()` 执行提交。`approve()` / `reject()` 共用 `decide()`：非末级通过只推进节点，末级通过调用 `finalizeApproval()`，驳回调用 `restoreAfterApprovalEnd()`；申请人撤回也调用恢复方法。

配置聚合由 `ApprovalFlowRepository` / `MysqlApprovalFlowRepository` 负责；申请、节点、任务和操作记录由 `ApprovalRepository` / `MysqlApprovalRepository` 负责。运行仓储在提交事务内调用配置仓储的 `lockPublishedFlow()` 固定选版，该内部协作只发生在 infrastructure，不向 application port 暴露连接类型。配置读取共用 `loadFlow()`；首级、下一级和重分派共用 `createTasks()`；成功审计共用 `writeApprovalAudit()` 并继续经过平台事务审计 writer。

通用提交先调用 `prepareForApproval()` 获取业务快照及其结构版本，创建申请后调用 `bindApproval()`，以其返回值保存冻结后的 `subject_version`，不假设所有业务版本都加一。申请及绑定版本在同一事务内完成，提交后的证据不改写。详情读取只由 Approval 解码 JSON，再交给 handler 的 `readSnapshotForDisplay()` 校验本场景证据版本和结构、补充当前展示引用；BOM 物料解析归 Product。

新增场景需由业务模块声明并注册 handler，提供独立鉴权且固定场景的业务提交入口，再复用通用 `submit()`。不得新增一份场景专属提交 SQL，也不开放让客户端自由指定场景的提交路由。当前 `ApprovalSubjectType`、`ApprovalSubjectSnapshot` 及管理端详情仍只覆盖 BOM；接入新业务时须扩展明确的契约和详情展示、核对实例接口权限入口，不能仅注册场景便宣称完整接入。

提交先锁产品根、校验受审内容，再固定发布版本、创建申请及节点和首级任务，Product 绑定申请，所有核心落库及成功审计共用一个事务。后续操作先只读定位，再经 Product 公开 handler 锁并校验当前申请引用和冻结版本，再锁申请、节点及待办。Product 的原生错误在 handler 转换为公开失败契约，不泄漏内部 domain 类。

所有表结构见[数据库设计](docs/database.md)，BOM 字段与门禁见[Product](../product/docs/database.md)。已发布配置供历史读取，不被新草稿覆盖。材料名称按当前 ID 解析，不在证据内保存名称快照。

## 开发验证与手工验收

项目处于开发阶段，允许重建数据库，不保留兼容影子表。迁移 `202609100001-approval-bom-pilot` 在任何 DDL 之前拒绝已有旧任务锁定 BOM；这些数据没有人工审批证据，不能伪造为批准。原开发库须按统一初始化流程重建，或使用独立试探库。

手工联调可使用独立库，例如 `easy_mes_approval_probe`。从仓库根执行以下命令，每条数据库命令都显式指定目标库；连接凭证与管理员配置仍从 `.env` 读取。`db:init` 会执行迁移、系统种子与管理员初始化，将目标库的管理员密码设置为 `.env` 中的配置值：

```bash
DB_NAME=easy_mes_approval_probe corepack pnpm db:init
DB_NAME=easy_mes_approval_probe ALLOW_DEMO_SEED=1 DEMO_USER_PASSWORD='<至少 6 位的演示密码>' corepack pnpm db:seed:demo
DB_NAME=easy_mes_approval_probe APP_PORT=3100 corepack pnpm --filter @company/api exec node dist/main.js
APP_PORT=3100 corepack pnpm --filter @company/admin-web exec vite --host 0.0.0.0 --port 5174
```

源码修改后先执行 `corepack pnpm --filter @company/api build`。常规启动仍使用根 `dev:api/dev:admin`，其数据库必须已迁移至新结构。演示数据由统一种子生成，可自行新增成品体验送审；不依赖任何机器上已有的临时资料。

自动化验证覆盖应用/接口规则、前端配置与待办交互，以及真实 MySQL 下的并发决定、角色变化、事务回滚和证据固定；构建与组件测试不替代浏览器 UI 验收。

相邻后端测试通过 `corepack pnpm --filter @company/api test` 执行，测试类型使用 `corepack pnpm --filter @company/api typecheck:test` 检查。跨模块审批用例位于根 `tests/integration/approval`，BOM 字段移除迁移用例位于 `tests/integration/product`，均由现有 `corepack pnpm test:production:mysql` 入口执行；必须配置专用测试库，环境门禁见根[测试策略](../../../../../docs/testing-strategy.md)。
