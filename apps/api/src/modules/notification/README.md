# Notification

通用站内通知模块，拥有消息、固定收件集合和首次已读状态。Approval 是首个调用方；业务模块决定事件、具体用户与真实来源/目标，Notification 不重查角色、账号启停或业务资格。历史正文不因业务权限变化隐藏，详情和操作仍由目标模块鉴权。

## 公开能力

其他模块仅导入 `public.ts` 的 `NotificationService.publish(input, context)`。输入及提交后事件定义在 `application/notification-publish.ts`，不暴露数据库连接或请求对象。不开放通用 HTTP 发送接口，也不提供公告管理页、删除、全部已读、外部投递或自动补发。

- 事件键先 trim，长度 2–150，格式 `[a-z][a-z0-9_.:-]+`，使用业务命名空间和稳定动作身份；不得用每次新生成的随机数、当前时间或原始 HTTP 幂等键代替。区分大小写的数据库唯一键最终防并发重复。
- 标题、正文 trim 后必填，分别最多 255、4000 个 Unicode 字符，作为纯文本保存和展示，不持久化 HTML、Markdown 链接、URL、完整单据或敏感详情。每条至多一个结构化目标；未知目标映射只显示正文，不猜地址。
- 来源表示触发动作，目标表示详情对象，可以不同或分别为空；每对类型/正整数 ID 同时传值或 null，类型在共享 constants 登记，业务事件仍遵守自身必填约束。ID 使用规范十进制字符串，不接受零或前导零，范围不超过 BIGINT UNSIGNED。
- 收件 ID 去重并排序，不排除操作者。用户存在性由外键保证；停用或软删除不丢失收件历史。
- 返回 `created/reused` 和通知 ID；新空事件返回 `no_recipients`、null，不写表或审计、不登记钩子。已有同键先比较全部规范化内容及收件集合，空集合不能绕过冲突。
- 同键内容不同返回 `NOTIFICATION_EVENT_CONFLICT`，不覆盖、补收件或重新调度。创建人和请求 ID 不参与事件内容比较，复用时保持原始审计。

## 事务与钩子

业务、通知、收件与 `notification.publish` 成功审计同事务。Notification 复用同一 pool 的活动事务；业务未开启外层事务时，发布本身创建事务。只有实际新建消息登记 `registerAfterCommit`；同键复用和 HTTP 成功结果重放不会登记。

数据库包在最外层确认提交成功并释放连接后，通过 `setImmediate` 调度，清除事务 ALS 上下文。回滚、提交未确认及被放弃重试的待触发事件丢弃。按通知 ID 合并登记，业务响应不等待处理器；调度失败、同步抛错和异步 rejection 独立捕获。日志仅含通知 ID、事件类型、requestId 和固定错误分类，不记录正文或原始错误。

`NotificationAfterCommitHook` 为本模块端口，默认 `NoopNotificationHook`。事件及收件数组运行时冻结，不携带连接、HTTP Request、凭证或正文。未来处理器必须使用异步 I/O，接入时另行定义超时、并发、积压上限和过载处理；进程内 best-effort 不保证宕机补发或外部送达。

## 接口及权限登记

前缀 `/api/notifications`。三个接口均使用全局 AuthGuard 登录鉴权，仓储强制限定当前用户；不设置可撤销的业务权限条目，不往权限目录增加 `notification:*`。用户身份只取认证上下文，前端不能指定其他收件人。接口 DTO 拒绝未知输入字段。

| 接口 | 输入与结果 |
| --- | --- |
| `GET /` | `page=1`、`pageSize=10`（1–100）、`read=all/unread`（默认 all）；返回标准 PageResult，按收件 `created_at DESC,id DESC` 排序 |
| `GET /unread-count` | 返回 `{ count }`，只计算本人 `read_at IS NULL`，与审批待办数无关 |
| `POST /:id/read` | `id` 是本人收件记录 ID，body `{ version }`；返回 200 `{ id,readAt,version }` |

消息列表提供纯文本、可选目标、创建时间、首次阅读时间和收件版本。GET 不写阅读状态。首次已读在锁内核对版本并以版本条件更新，version 从 0 变为 1，`updated_by` 为本人，同时写 `notification.read` 成功审计。已读记录重复点击直接返回首次时间及当前版本，即使提交旧版本也成功，不再写审计；仍未读且版本不符返回 `409 CONCURRENT_MODIFICATION`。不存在与他人收件统一返回 `404 NOT_FOUND`，不得泄漏他人记录存在性。非法输入为 400，未登录为 401。未启用 HTTP Idempotency-Key，误带该头由全局幂等 guard 拒绝，不自动重试写请求。

## 阅读与历史保留

GET、预览或打开入口不标记已读，点击具体消息或详情时才写本人首次阅读；已读与目标是否可访问独立。失败保留未读状态，成功后更新已读状态和未读数。通知正文不因目标失效、停用或权限变化隐藏；详情和操作仍由目标模块实时鉴权，不把已读理解为业务完成。

消息及收件长期保留，不提供用户删除、自动到期或年度清理任务。人工备份不等于可以清空；未来清理须另定恢复验证、跨期追溯和事件去重身份保留策略。纯系统通知可以无来源和目标，但仍由有身份的发布用例记录创建者，不预设定时作业或虚构操作者。

数据库定义见[数据库设计](docs/database.md)，跨模块事务及可靠性边界见[通知协议](../../../../../docs/notification-design.md)。前端拉取、会话隔离及导航约束见[管理端架构](../../../../admin-web/docs/architecture.md)，不在后端文档维护铃铛布局。

## 自动化验证

后端相邻测试覆盖发布规范化、事件与引用校验、DTO、本人身份传递及错误映射；审批适配器测试验证业务事件到发布契约的转换。真实 MySQL 用例位于根 `tests/integration/notification`，覆盖发布与首次已读并发、事务回滚、成功审计、本人访问和迁移保护；审批联动由 `tests/integration/approval` 验证。数据库包测试负责通用提交后任务生命周期，管理端相邻测试负责轮询、会话竞态、已读与详情跳转。

执行 `corepack pnpm --filter @company/api test` 和 `corepack pnpm --filter @company/api typecheck:test` 验证后端相邻测试；根 `corepack pnpm verify` 执行常规门禁。真实 MySQL 测试使用 `corepack pnpm test:production:mysql`，专用测试库与环境变量要求见[测试策略](../../../../../docs/testing-strategy.md)。不把进程内钩子测试解释为外部可靠投递保证。

专项验收还须覆盖非审批形态与无来源／目标、成对空值、空收件、同键不同集合、HTTP 重放不调度、提交结果未知不触发、重试废弃事件、慢处理器和同步／异步异常隔离，以及权限变化后的历史阅读。验证公开契约不授权新增实际业务通知；不把 best-effort 钩子解释为可靠外部投递。
