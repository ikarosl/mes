# Identity

负责认证、用户、部门、角色、权限关系和 Refresh Token，并提供项目级操作日志的查询入口。Product、Production 和平台审计写入不属于本模块。

跨模块只能使用 [`public.ts`](public.ts) 暴露的用户目录能力，不得直接访问 Identity Repository 或业务表。数据库设计见 [`docs/database.md`](docs/database.md)，事务审计规则见 [API 审计专题](../../../docs/audit.md)。

## 认证与管理边界

管理端路由与权限配置、HTTP Controller 和共享常量分别维护页面入口与逐接口授权，不在本文重复端点清单。权限目录只读；创建用户可分配初始角色，角色权限替换为整体覆盖。已关联用户的角色不可删除；重置密码同时撤销 Refresh Token。

写操作均由应用服务构造审计上下文，Repository 在同一数据库事务内写入业务数据和 `operation_logs`。密码只以 bcrypt 哈希写入，审计数据不包含密码、Token 或 Cookie。

用户与角色列表遵守公共分页及筛选契约。写接口独立校验权限，不以页面入口可见性代替授权。

## 数据与平台边界

认证用例通过 [`PasswordHasher`](application/ports/password-hasher.ts) 验证或生成密码哈希，通过
[`TokenService`](application/ports/token.service.ts) 签发令牌对、验证令牌并取得身份。`AuthService` 负责账号
状态校验和 Refresh Token 轮换，`RbacService` 负责用户及权限用例；两者不依赖 bcrypt、JWT SDK 或密钥配置。
`IdentityModule` 把端口绑定到 `BcryptPasswordHasher`（成本参数 12）和 `JwtTokenService`（HS256、现有
issuer/audience/TTL 配置）。端口不暴露 JWT SDK 类型或签名密钥，HTTP 契约和 Cookie 传输方式保持一致。

System 现有 `departments`、`users`、`roles`、`permissions`、`user_roles`、`role_permissions` 和
`refresh_tokens` 已满足业务数据结构，无需新增业务表。`operation_logs` 是项目级平台审计基础设施，
不属于 System 业务数据；System 仅提供当前审计查询入口，业务模块写入时可直接调用唯一事务审计
Writer，无需通过 Identity `public.ts`。`operation_logs` 的字段和唯一写入口由[审计专题](../../../docs/audit.md)维护；业务表字段由[Identity 数据库设计](docs/database.md)维护。

## 审批资格公开能力

`IdentityDirectoryService` 提供审批角色选项、指定用户候选及实时资格。`listApprovalEligibleUserIds(roleId?)` 返回指定角色或全体当前合格用户，`listApprovalUserOptions()` 提供指定用户选择器，`getApprovalActorEligibility(userId)` 返回当前有效角色 ID 和 `canDecide`，均不暴露数据库类型。角色仅表示职责分组，不表示职级；角色节点的候选必须是所配置有效角色的成员，账号启用且未删除，用户全部有效角色的权限并集须匹配 `approval:decide`，包括既有通配权限。配置角色本身不必独占审批权限，管理员也仍须属于角色节点所选角色；指定用户节点按固定账号及其当前审批权限判断，不要求属于某个指定角色。

审批资格查询复用调用者事务，以当前锁定读复核账号、角色、成员关系和权限；历史姓名查询保持包括停用用户的展示语义，不用于授权。角色选项人数与实际待办候选使用同一规则。Identity 不写审批任务或业务状态，审批规则不改变 Identity 的表所有权。

## 验证

开发交付先运行 `corepack pnpm --filter @company/api typecheck`、构建与启动检查，供用户黑盒和 UI 验收。Identity 相邻单元测试、HTTP 契约测试及正式测试调整遵守根[测试策略](../../../../../docs/testing-strategy.md)的阶段约定。
