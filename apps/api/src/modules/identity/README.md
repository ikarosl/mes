# Identity

负责认证、用户、部门、角色、权限关系、业务场景人员候选配置和 Refresh Token，并提供项目级操作日志的查询入口。Product、Production 和平台审计写入不属于本模块。

公开用户目录见 [`public.ts`](public.ts)。数据库设计见 [`docs/database.md`](docs/database.md)，事务审计规则见 [API 审计专题](../../../docs/audit.md)。

## 认证与管理边界

权限目录来源、版本化发布、分组与逐接口鉴权规则由[权限目录设计](docs/database.md#14-permissions)维护；页面入口及其接口消费者由各所有者文档记录。权限目录只读；创建用户可分配初始角色，角色权限替换为整体覆盖。已关联用户或被业务人员配置引用的角色不可删除；重置密码同时撤销 Refresh Token。

登录凭据读取排除已删除账号，先验证密码，再判断账号启停。用户名不存在、账号已删除或密码错误统一提示“用户名或密码错误”；仅在密码正确且账号停用时提示“账号已停用，请联系管理员”，不更新最近登录时间或签发令牌。刷新令牌与 Access Token 认证仍要求账号当前启用且未删除。

密码只保存 bcrypt 哈希，审计脱敏与同事务写入遵守[平台规则](../../../docs/audit.md)。

操作日志的 `createdAtFrom/createdAtTo` 是包含端点的时刻筛选，须提交带 `Z` 或显式时区偏移的 ISO 8601 时间。

## 数据与平台边界

认证用例通过 [PasswordHasher](application/ports/password-hasher.ts) 和 [TokenService](application/ports/token.service.ts) 使用密码与令牌能力；bcrypt、JWT SDK 和密钥只在适配器中处理。当前 bcrypt 成本为 12，令牌算法为 HS256，issuer、audience 和 TTL 来自配置。

Identity 表的身份与约束见[数据库设计](docs/database.md)。操作日志属于平台，Identity 只提供查询，业务模块经[唯一审计 Writer](../../../docs/audit.md)写入。

## 审批资格公开能力

[公开目录](public.ts)提供审批角色选项、指定用户候选及实时资格。角色仅表示职责分组，不表示职级；角色节点的候选必须是所配置有效角色的成员，账号启用且未删除，用户全部有效角色的权限并集须匹配 `approval:decide`，包括既有通配权限。配置角色本身不必独占审批权限，管理员也仍须属于角色节点所选角色；指定用户节点按固定账号及其当前审批权限判断，不要求属于某个指定角色。

审批资格查询复用调用者事务，以当前锁定读复核账号、角色、成员关系和权限；历史姓名查询保持包括停用用户的展示语义，不用于授权。角色选项人数与实际待办候选使用同一规则。Identity 不写审批任务或业务状态，审批规则不改变 Identity 的表所有权。

## 业务场景人员候选

`UserCandidateService` 提供按受控场景获取当前候选及事务内资格复核，场景目录、角色集合、默认拒绝、公开能力、HTTP 权限及并发规则由[业务人员候选](docs/user-candidates.md)维护；表结构由[数据库设计](docs/database.md#18-user_candidate_configs)维护。业务模块固定自身场景调用公开服务，历史姓名继续使用 `IdentityDirectoryService`。

## 验证

验证命令见[API 入口](../../../README.md#验证)，交付及正式测试阶段见[测试策略](../../../../../docs/testing-strategy.md)。
