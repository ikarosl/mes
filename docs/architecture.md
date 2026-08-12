# Company MES Next 架构规范

本文是项目代码架构与模块边界的唯一基准。数据库业务设计以 `database/README.md` 及其列出的领域章节为准，HTTP 接口以
`api-conventions.md` 为准，编码细节以 `coding-standards.md` 为准，管理端视觉交互以根目录
`design.md` 为准；管理端前端分层、数据所有权、共享状态、缓存和异步生命周期以
`frontend-architecture.md` 为准。

## 1. 架构风格与当前范围

项目采用“模块化单体 + 端口适配器”。一个 NestJS API 进程承载当前模块，不拆微服务，不为
完整 MES 预建空模块。

当前正式范围：

- Identity/System：认证、RBAC、操作日志和管理端权限基础设施。
- Product：产品分类、产品主数据、产品物料、技术文件、工序和工艺路线。
- Production：生产工单、生产批次、工序报工追溯，以及其依赖的生产物料需求、分配和领料出库链路；按状态机分阶段迁移。

Inventory（库存批次、出入库、盘点）、Quality（检验、返工）和 Traceability（全流程追溯）只能在后续迁移阶段明确更新后追加，不得仅凭已有 UI 原型提前实现。

## 2. 模块与功能的划分

独立业务模块应同时具备多数条件：独立业务术语、独立规则和状态、明确数据所有权、少量公开
能力以及独立测试价值。不能因为只有一张表、一个页面或文件过长就建立模块。

共享同一业务语言、数据所有权和事务的能力保留在同一模块，按功能拆分 Controller、Service、
Port 和 Adapter。当前 Product 保持一个 NestJS 模块，内部划分 technical-file、catalog、
process-step 和 process-route；只有工艺能力出现独立生命周期、团队所有权或大量外部调用时才
提取 ProcessModule。

`common` 仅存放真正跨模块且不含业务知识的能力，例如审计上下文、HTTP 安全装饰器和时间格式。
`common` 不拥有业务表，也不得成为绕过模块边界的万能目录。`operation_logs` 是项目级平台审计
基础设施，不归属 `common` 或任何业务模块（见 §4）。common 对模块边界规则的唯一豁免是审计写入：
`common/audit/transactional-audit-writer`
是写 `operation_logs` 的唯一合法咽喉，任何模块在自身事务 executor 内直接调用它追加成功审计，
不经过目标模块 public 能力转发（见 §4 与 §6）。

HTTP 幂等也是跨业务模块的平台能力：`common/idempotency` 只定义协议无关的
`IdempotencyExecutor` 调用契约，不拥有表、不实现事务；MySQL 适配器统一放在
`infrastructure/idempotency`（`mysql-idempotency.executor`、`idempotency-housekeeping.service`、
`IdempotencyKeyGuard` 与平台 module，见 §4 数据所有权）。`http_idempotency_records` 的 migration
（`202608050001-http-idempotency-records`）已追加，平台表写入口已限定 executor 与 housekeeping；
业务代码不注册直通实现，未启用端点收到幂等键一律返回 `400 IDEMPOTENCY_NOT_SUPPORTED`，不静默放行。
命令上下文与幂等能力分离：`CommandContext` 仅承载 actor/requestId/IP/User-Agent；只有已声明并验收的
application 用例接收 `IdempotentCommandContext`。幂等键不得进入 application port 或 Repository，Service
调用业务 Repository 前必须收窄回 `CommandContext`。当前白名单包括 Production createBatch、物料分配创建、
待出库单创建、生产领料整单确认、报工创建和报工更正；新增命令仍须逐一登记 scope、完整结果 codec 和闭环测试。
具体实施边界见 [`http-idempotency-implementation-plan.md`](http-idempotency-implementation-plan.md)。

## 3. 模块内部依赖

```text
presentation -> application -> domain
infrastructure -> application ports + domain
domain -> 纯 TypeScript，不依赖 NestJS、MySQL、HTTP、存储 SDK
```

| 来源层         | 可以依赖                                     | 禁止依赖                                              |
| -------------- | -------------------------------------------- | ----------------------------------------------------- |
| domain         | 本模块 domain、纯共享契约                    | application、presentation、infrastructure、框架和 SDK |
| application    | 本模块 domain、ports、contracts              | presentation、infrastructure、数据库连接和 SDK        |
| presentation   | 本模块 application、公共 HTTP 能力           | infrastructure、SQL、数据库连接                       |
| infrastructure | 本模块 application ports、domain、基础设施包 | 其他模块内部实现                                      |

Controller 只负责协议映射、DTO、权限装饰器和响应转换，不写 SQL、不管理事务、不处理 Token 密钥。

## 4. 模块公开边界与数据所有权

- 可被其他模块使用的模块必须提供根级 `public.ts`。
- 跨模块只能引用目标模块 `public.ts` 导出的 Facade、抽象 token 或稳定契约。
- 禁止引用其他模块的 Repository、domain、presentation、infrastructure 或深层 application 文件。
- `@company/contracts` 只保存传输契约，不保存 Pool、PoolConnection、事务 executor 或 SDK 类型。
- 每张业务表有唯一所属模块；模块不能直接查询或修改其他模块的表。
- `operation_logs` 是项目级平台审计基础设施，不属于 Identity/System、Product、Production 或 `common`
  的业务数据。其结构由项目数据库规范定义，变更统一在 `packages/database/migrations` 追加 migration；
  历史上与 RBAC 表位于同一初始 migration 不构成 Identity/System 所有权。写入通道由
  `common/audit/transactional-audit-writer` 统一承担，是跨模块 `public.ts` 规则的显式且唯一豁免：各模块
  可在自身事务 executor 中直接调用该 writer，无需经任何模块的 `public.ts` 转发。除该 writer 外，任何
  模块、Repository 或 Controller 禁止直接写该表。审计查询当前仍由 Identity/System 对外提供公开能力。
- `http_idempotency_records` 是项目级 HTTP 幂等基础设施，不归属任何业务模块或 `common`。
  业务 application 只依赖 `common/idempotency` 的抽象端口；平台内表写入入口限于
  `infrastructure/idempotency`：`mysql-idempotency.executor`（业务登记/更新/重放）与
  `idempotency-housekeeping.service`（到期物理清理）。全局 `IdempotencyKeyGuard` 同属该平台
  基础设施，由 `infrastructure/idempotency` 装配并公开导出，组合根只经该装配对象引用。业务
  Controller、Service 和 Repository 均不得直接查询或修改该表。重放、冲突与失败通过平台 in-memory
  指标（`idempotency.metrics`）与带脱敏键摘要的日志观测，不伪造第二条业务成功审计。
- 跨模块读通过目标模块公开 Query/Directory Facade；跨模块写通过目标模块公开应用服务。
- 组合根 `AppModule` 只能引用业务模块 `public.ts` 公开的装配对象，以及项目级基础设施/展示装配，不得
  深入模块内部层（application/domain/presentation/infrastructure），也不写业务逻辑；该规则由
  `scripts/check-api-architecture.mjs` 强制执行。

当前数据所有权：

| 所有者/类别      | 拥有或管理的数据                                                                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Identity/System  | departments、users、roles、permissions、关联表、refresh_tokens                                                                           |
| Product          | product_categories、products、product_materials、technical_files、process_steps、process_routes 及关联表                                 |
| Production       | work_orders、production_batches、batch_step_records、batch_step_reports、batch_step_abnormal_dispositions、production_item_demand、production_item_allocation、inbound_order、inbound_detail、outbound_order、outbound_detail，以及当前生产物料切片内部的窄库存账本 item_batch、inventory_transaction |
| 平台审计基础设施 | operation_logs                                                                                                                           |
| 平台幂等基础设施 | http_idempotency_records（已落地）                                                                                                       |
| common           | 不拥有业务表                                                                                                                             |

`operation_logs` 的唯一写入能力由 `common/audit/transactional-audit-writer` 承担（见 §4 审计豁免与
§6）；目录位置表示共享基础设施入口，不表示 `common` 拥有该表。

Product 获取用户选项必须调用 Identity 的公开目录服务，不能直接查询 `users`。

当前 Production 对 `item_batch`、`inventory_transaction`、`inbound_order`、`inbound_detail` 的所有权只覆盖外购物料入库、生产物料分配和
`production_material_outbound` 领料流水；它们与 allocation/outbound 五表共享同一 Production 外层事务，
SQL 集中在 material adapter。不得据此新增 Warehouse Controller、通用入库/退料/报废/盘点写入口。
未来通用库存正式进入范围后，再评审经公开能力提取 Inventory 模块，迁移前禁止形成第二写入口。

## 5. Port、Adapter 与文件拆分

Port 按调用者需要和变化原因设计，应保持窄而明确。一个 Adapter 可以实现多个紧密相关的 Port；
接口数量不是单一职责的判定标准。

Repository（`modules/*/infrastructure`）超过 500 行、Vue 视图文件超过 1000 行（ESLint `max-lines`）只产生
维护性警告。拆分必须依据业务能力、事务边界、测试隔离或独立变化原因，禁止为了满足行数机械移动代码。
Controller、Service 和 SQL 不得混写在同一文件。

## 6. 事务与审计

- Controller 不开启事务。
- application 描述业务动作；infrastructure 使用数据库连接执行原子写入。
- application port 不得暴露数据库连接类型。
- 核心业务写入和成功审计使用同一个事务 executor；审计失败时整体回滚并返回失败。
- 启用 HTTP 幂等的命令由平台 `IdempotencyExecutor` 开启外层事务；幂等记录、业务写入和成功审计必须
  复用同一数据库连接并原子提交。幂等端口不得暴露连接类型，Controller 不负责开启该事务。
- 审计写入不归属任何业务模块：所有模块在自身事务 executor 内直接调用
  `common/audit/transactional-audit-writer` 追加成功审计，不通过目标模块 public 能力转发（见 §4 豁免）。
- 通用 HTTP、登录、401/403 和失败日志采用 best-effort；写日志失败不能覆盖原响应或原异常。
- 禁止 fire-and-forget 核心写操作。
- 跨多个业务模块的写入在出现真实用例前不预建分布式事务；优先由一个明确用例通过公开 Facade 编排。

## 7. 基础设施

- MySQL 是业务事实来源；Redis 只在出现多实例协调需求后通过端口引入。
- HTTP 幂等闭环使用 MySQL 唯一约束和事务协调；当前轻量 MES 不为该能力引入 Redis，也不增加服务端
  幂等键预领取接口。
- 技术文件统一使用 S3 标准对象存储接口，业务只保存 bucket、objectKey、版本、校验和和元数据。
- domain、application 和 presentation 不得直接依赖具体数据库或存储 SDK；infrastructure adapter 可以。
- 数据库时间和公共接口时间遵守 `database/00-foundations.md` 的 `Asia/Shanghai / +08:00` 规则。

## 8. 前端结构

- 前端依赖方向为“页面/业务弹窗 -> list/options/editor composable -> `src/api`”；候选数据所有权为
  “composable 实现复用、所有者实例局部化”，详细的数据分类、所有权和刷新矩阵见 `frontend-architecture.md`。
- 正式分页列表属于页面，ID 绑定关键明细属于当前业务弹窗；同一候选接口被多个页面/弹窗消费时复用 composable
  实现，但实例局部持有，禁止模块级可变单例、进程级隐式缓存或跨页面 Pinia 候选缓存。
- 谁持有候选实例谁负责它的页面激活刷新；下拉展开只刷新自身资源；写操作成功只刷新受影响列表，禁止用全页面
  `loadData()` 或 `refreshAll()` 掩盖所有权不清。
- 异步请求必须具备与其作用域匹配的 last-request-wins 响应乱序和目标 ID 守卫；关键明细失败不得伪装成可保存的空数据。
- 前端权限统一作用于菜单、路由和整页入口，不要求对页面内操作按钮做细粒度权限隐藏；按钮是否可用仍可按业务状态控制。
- 前端可见性不是安全边界，每个后端接口必须独立声明并校验所需权限。
- 顶部栏根据路由 `meta.title` 显示当前页面名称，业务内容区不重复同名标题。
- 业务页通常从筛选区、工具栏或主体卡片开始。
- 可选说明只表达长期有效的业务规则、风险或帮助，不显示迁移验证和测试占位文案。
- 页面保持稳定路由名、组件名和 keep-alive 行为。
- 超长页面按筛选、表格、表单、详情弹窗和 composable 拆分，不机械拆纯展示片段。

## 9. 自动约束

| 规则                    | 自动措施                                                        |
| ----------------------- | --------------------------------------------------------------- |
| 分层反向依赖            | ESLint `no-restricted-imports`                                  |
| 跨模块深层 import       | ESLint `boundaries/dependencies`                                |
| domain 引入框架/数据库  | ESLint error                                                    |
| Repository/Vue 文件过长 | ESLint warning                                                  |
| DTO、分页和错误结构     | 单元测试、契约测试                                              |
| 核心写入与审计原子性    | Repository 事务测试                                             |
| 审计写入唯一咽喉        | 架构测试（仅 `transactional-audit-writer` 可写 operation_logs） |
| 命令上下文/幂等能力分离 | 架构测试（旧类型禁用、Repository 禁止幂等上下文、用例白名单）   |
| 数据表所有权            | 架构测试和代码评审                                              |
| 文档失效链接            | `pnpm docs:check`                                               |

新增模块时必须先登记业务能力、数据所有权和公开入口，再实现代码并补充边界测试。
