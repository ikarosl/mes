# Easy MES Next 架构规范

本文维护模块划分、依赖、数据所有权和跨模块事务规则。产品范围见[产品范围](product-scope.md)，数据库、HTTP、编码和前端细节分别由对应规范维护。

## 1. 架构风格与当前范围

项目采用模块化单体与端口适配器，一个 NestJS API 进程承载业务；不为完整 MES 预建空模块，不提前拆微服务。各模块入口见[文档索引](README.md#应用与模块)，已实现、待实施及未批准范围分别见[产品范围](product-scope.md)与[路线图](roadmap.md)。

## 2. 模块与功能的划分

独立模块应具备独立业务语言、规则与状态、明确数据所有权、少量公开能力及独立测试价值。共享业务语言、所有权和事务的功能留在同一模块，按变化原因拆 Controller、Service、Port 和 Adapter；一张表、一个页面或文件过长都不是建模块的充分理由。

Product 的目录、技术文件、工序和路线仍属于同一模块。只有工艺能力形成独立生命周期、所有权或大量外部调用时才评估提取；Production 与 Inventory 的分工见[生产职责](../apps/api/src/modules/production/docs/module-boundaries.md)。

`common` 只放跨模块且不含业务知识的抽象与工具，不拥有业务表。审计 Writer 是下节明确登记的例外；HTTP 幂等抽象放 `common/idempotency`，MySQL 实现与装配放 `infrastructure/idempotency`，不能把 `common` 变成绕过模块边界的入口。

## 3. 模块内部依赖

```text
presentation -> application -> domain
infrastructure -> application ports + domain
```

| 层 | 允许依赖 | 禁止依赖 |
| --- | --- | --- |
| domain | 本模块纯规则、纯共享契约 | 其他内部层、框架、数据库、HTTP 与 SDK |
| application | 本模块 domain、ports、contracts | presentation、infrastructure、连接与 SDK |
| presentation | 本模块 application、公共 HTTP 能力 | infrastructure、SQL、数据库连接 |
| infrastructure | 本模块 application ports、domain、基础设施包 | 其他模块内部实现 |

Controller 只做 DTO、协议映射、鉴权声明和响应转换，不写 SQL、不开事务、不处理 Token 密钥。Identity 密码与令牌通过应用端口访问，bcrypt/JWT SDK 和密钥配置归其 infrastructure。

## 4. 模块公开边界与数据所有权

- 跨模块代码只导入目标模块根级 `public.ts` 的稳定契约、Facade 或注入 token，不导入内部 Repository、domain 或其他深层实现。组合根 `AppModule` 同样通过公开装配对象接入模块和平台设施，不写业务逻辑。
- 每张业务表由一个模块所有；跨模块命令与资格读取通过所属模块公开能力。业务表的当前结构由模块文档维护，所有权及允许的展示读登记在 [api-data-ownership.mjs](../scripts/api-data-ownership.mjs)。migration 集中存放不改变所有权，已删除表的历史登记不授权恢复该表。
- application port 和 `@company/contracts` 不暴露数据库行、连接、事务 executor、SQL 或 SDK 类型。
- 公开查询按用途区分当前写入资格与历史展示。历史引用可包含停用／软删除资料，但不得用于新增或写入校验；名称和返回类型应体现用途，分别验证状态过滤。具体采购／生产资格由 [Product](../apps/api/src/modules/product/README.md) 所有。
- 库存由 Inventory 唯一记账，生产需求由 Production 所有；仓库页面或 HTTP 路径不创建独立 Warehouse 账本。跨模块事务、来源与锁序见[库存协作协议](inventory-extraction-design.md)，采购链路见[采购技术设计](procurement-inbound-technical-design.md)。

平台表有以下独立边界：

| 表 | 所有权与访问 |
| --- | --- |
| `operation_logs` | 平台审计；唯一写入口为 `common/audit/transactional-audit-writer`，模块在自身事务直接调用，无需 public 转发。这是跨模块写入规则的显式例外；其他 Repository／Controller 不得直接写。Identity 提供审计查询。 |
| `http_idempotency_records` | 平台 HTTP 幂等；只允许 `infrastructure/idempotency` 的 executor 登记／重放及 housekeeping 到期清理，业务 Controller、Service、Repository 不直接读写。Guard 通过平台装配公开。 |

平台表不因最初 migration 位置而归属 Identity 或 `common`。审计完整规则见[事务审计](../apps/api/docs/audit.md)，幂等上下文、scope、结果重放及脱敏观测见[幂等契约](../apps/api/docs/idempotency.md)；成功重放不制造第二条业务审计。

### 展示查询的跨模块读取

选择理由见 [ADR-0005](adr/0005-controlled-display-reads.md)。

- 读取放在登记的 `infrastructure/queries/` 专用目录，目标表及字段通过 `API_DISPLAY_READ_ACCESS` 明确授权。固定 SQL 片段可在本模块 infrastructure 组合，不向 application、Controller 或前端泄漏 SQL。
- 只用于展示、搜索、排序和分页；禁止跨模块写入、DDL、锁定或存储过程调用，也不能替代命令权限、状态、版本和数量资格。按查询实际用途判定，不能仅凭方法名含 Query 放行。
- 筛选先于分页，不逐行查名称。物料名称及历史身份统一遵守[数据库规则](database-conventions.md#基础物料名称与历史身份)。Product 获取用户候选仍经 Identity 公开目录，不直接读 `users`。
- 改表必须核对登记调用方，保持公开查询的筛选、行数与分页语义。不因展示读取开放深层 import、第二套读库或业务写能力。

## 5. Port、Adapter 与文件拆分

Port 按调用者需要和变化原因保持窄而明确；一个 Adapter 可以实现多个紧密相关的 Port。Repository 超过 500 行、Vue 超过 1000 行是维护性警告，按聚合、事务和独立变化原因拆分，不机械搬移代码压行数。Controller、Service 与 SQL 不混写。

## 6. 事务与审计

- application 描述业务用例，infrastructure 执行数据库事务，Controller 不开启事务。核心业务写入与成功审计原子提交，审计失败整体回滚，禁止 fire-and-forget 核心写操作。
- 跨模块用例通过公开能力复用同池事务，不预建分布式事务。启用幂等的命令由平台 executor 开启外层事务，幂等记录、业务和审计复用同一连接；Repository 只接普通 `CommandContext`。
- 通用请求、认证拒绝和失败日志采用 best-effort，日志失败不覆盖原响应或异常。
- 站内消息及收件人与业务同事务；提交后扩展仅在最外层成功提交并释放连接后调度，回滚丢弃。钩子失败不改变已提交结果，进程内钩子不保证可靠外部送达；协议见[通知设计](notification-design.md)。

## 7. 基础设施

- MySQL 是业务事实来源，HTTP 幂等使用其唯一约束与事务，不增加服务端幂等键预领取入口。
- Redis 只在多实例协调等需求获批后通过窄端口引入，见 [ADR-0002](adr/0002-optional-redis.md)。
- 技术文件统一使用 S3，业务保存对象身份和元数据；SDK 只在 infrastructure，详见[技术文件](../apps/api/src/modules/product/docs/technical-files.md)。
- 数据库和接口时间遵守[统一类型与状态规则](database-conventions.md#统一类型与状态规则)。

## 8. 前端结构

前端数据所有权、局部候选、请求生命周期与缓存由[管理端架构](../apps/admin-web/docs/architecture.md)维护，页面展示由[视觉规范](../apps/admin-web/docs/visual-design.md)维护。页面权限覆盖菜单、路由和整页，不要求按钮级权限隐藏；业务状态仍可禁用操作，每个后端接口独立鉴权。

## 9. 自动约束

依赖与公开边界由 ESLint 和 [check-api-architecture.mjs](../scripts/check-api-architecture.mjs)检查；新增表／视图须登记所有者。脚本检查已登记展示目录的目标表、字段及常见写入／锁定 SQL，不能完整解析动态 SQL 或判断业务用途；动态表名使用固定白名单并人工评审，检查通过不替代 SQL 审查。

分层、唯一审计写入口、命令上下文与幂等能力分离遵守架构门禁；DTO／分页／错误以及事务原子性按[测试策略](testing-strategy.md)验证。文档链接用 `pnpm docs:check` 检查。新增模块先明确业务能力、所有权和公开入口，再实现并验证边界。
