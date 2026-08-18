# HTTP 幂等闭环实施方案

> **实施状态（2026-08-07）**：阶段 A（平台闭环：`202608050001` migration、规范化指纹 + JSON-safe 校验、
> MySQL `IdempotencyExecutor` 与平台 module、架构门禁、`@IdempotentEndpoint({ scope })` 端点门禁、
> `AuditInterceptor` 409 修复、**到期清理 + 运行观测**）与阶段 B（createBatch 试点：Service/Controller
> 接线、前端 `useIdempotentIntent` 意图、契约测试）已按本文落地，当前进度 **released**（代码契约启用
> 层面，口径见下文「进度口径」一节；2026-08-07 本地（当前可复现命令见根 README，
> WSL Docker 使用宿主 `3307` 端口与 `easy_mes_test` 专用库）
> 全量集成套件实测通过，
> 5 文件 / 29 用例，含 HTTP 管线、真实锁等待与过期清理用例，见 §11；CI 已新增 `integration-mysql`
> 作业在专用测试库 `easy_mes_next_test` 上执行同一套件，待首次运行确认）。瞬态错误契约已覆盖完整
> 事务边界：登记 INSERT、handler 内业务 SQL（含网络中断，事务内查询由数据库包来源标记）、重放 SELECT、
> completed UPDATE 以及取连接/开启事务/提交的瞬态错误统一映射 retryable 503；rollback 失败 best-effort
> 记录不覆盖原始异常；handler 内其他 SDK
> 网络错误原样冒泡不误判；firstRun/replay 成功指标只在 commit 成功后记录。阶段 A 第 7/8 条（到期清理
> 与异常 processing 告警、真实 MySQL 过期清理集成测试）与 §12 观测门槛已在代码与用例层面满足：新增
> `infrastructure/idempotency/idempotency-housekeeping.service.ts`（平台到期清理唯一写入口，小批次删除
> 已到期 completed、持久化 processing 只告警不处置）与 `idempotency.metrics.ts`（重放/冲突/失败计数，
> housekeeping 周期性输出重放率/冲突率/失败率摘要），executor 在重放/冲突/损坏/可重试失败路径记录指标，
> 日志只携带 requestId、scope 和脱敏键摘要。下文 §1 的「规划基线」清单与 §10 分期描述保留为历史起点，
> 最新事实以 `docs/todo.md` 4.1 与本文「进度口径」为准。

本文描述 `docs/todo.md` 4.1 的后续具体实现。通用规则以
[`concurrency-and-idempotency.md`](concurrency-and-idempotency.md) 为准，数据库结构以
[`database/README.md`](database/README.md) 及其领域章节为准，本文只给出落地顺序、伪代码、测试和启用门槛。

## 进度口径（四级状态）

本文与 `docs/todo.md` 4.1 统一使用以下四级进度口径，所有「已完成 / 已验证」表述都必须能落到某一级：

| 状态     | 含义                                                                                                                                                                                               |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| planned  | 方案已确定，尚未接线：只有设计、伪代码、待办项或 migration 草案，代码未接入。                                                                                                                      |
| wired    | 代码已接线并通过单元 / 契约 / 架构门禁；真实 MySQL 集成用例已落地，但尚无机器可复现的跑通记录。                                                                                                    |
| verified | 真实 MySQL 集成测试跑通且有可复现运行记录（注明环境与日期，如 `RUN_MYSQL_INTEGRATION=1` 本地执行记录）。                                                                                           |
| released | 代码契约启用层面完成：该端点契约已正式声明 `Idempotency-Key` 必填，接口文档与前端发送方同步，§12 验收门槛（含 `pnpm verify` 与真实 MySQL 集成套件）满足。与「部署完成/上线」无关，部署是独立决策。 |

「released」只表示**代码契约启用层面**：该端点契约已正式声明 `Idempotency-Key` 必填，接口文档与前端发送方
同步，§12 验收门槛（含 `pnpm verify` 与真实 MySQL 集成套件）满足；与「部署完成/上线」无关，部署是独立决策。

当前状态：**released**（代码契约启用层面：`api-conventions.md` §7 与 `concurrency-and-idempotency.md` §3.3
已声明 `Idempotency-Key` 必填、前端 `useIdempotentIntent` 已发送、§12 验收门槛满足）。支撑证据：
2026-08-07 `pnpm verify` 全绿（18/18 任务，apps/api 42 文件 / 310 用例、admin-web 43 文件 / 257 用例），且
本地实测通过（当前可复现命令见根 README；先经
`scripts/assert-mysql-integration-enabled.mjs` 校验显式开关与专用测试端点/库门禁：
`TEST_DB_HOST/PORT/NAME` 必填，`DB_HOST/PORT/NAME` 必须分别与之完全相等，且库名必须以 `_test` 结尾，本地在
`easy_mes_test` 上完成；构建 utils/constants/database 后通过 `db:init` 完成 migration、系统 seed 和
管理员初始化，复验 seed 幂等性后运行 `tests/integration` 全套，5 文件 / 29 用例，覆盖项见 §11）。
瞬态错误契约覆盖完整事务边界：事务内语句（登记 INSERT、handler 内业务 SQL、重放 SELECT、completed
UPDATE）的 mysql2 服务器形态瞬态错误与事务边界操作（取连接/开启事务/提交，经 `@company/database`
`withTransaction` 包装为 `DatabaseError` 后按 `cause` 分类）统一映射 retryable 503；rollback 失败
best-effort 记录不覆盖原始异常；handler 内其他 SDK 网络错误（无 mysql2 形态）原样冒泡不误判；
firstRun/replay 成功指标只在事务 commit 成功后记录。所有集成测试文件均以
`process.env.RUN_MYSQL_INTEGRATION === '1' ? describe : describe.skip` 门禁；CI（`.github/workflows/ci.yml`）
已新增 `integration-mysql` 作业在专用测试库 `easy_mes_next_test` 上执行同一套件，待首次运行确认。
released 只表示代码契约启用层面，与「部署完成/上线」无关；阶段 C 其余端点按风险逐项评估，满足 §12
门槛前不得标记 released。

## 0. 阶段术语约定

正文在 §10 才给出「阶段 A / 阶段 B / 阶段 C」的完整定义，但 §1 起就会引用，先在此约定三阶段属于
**HTTP 幂等闭环**的落地顺序：

- **阶段 A：平台闭环** —— 后端平台基础设施全部落地（幂等表 migration、`requestId` 首次审计关联、端点级启用
  元数据、规范化指纹、JSON-safe 结果 codec、MySQL executor、错误映射、架构门禁、到期清理和真实 MySQL
  集成测试）。此阶段明确**不要求任何业务接口发送幂等键**（§10 阶段 A 第 9 条）。
- **阶段 B：Production 试点** —— 首个业务端点「后端自动生成批次号的创建批次」端到端接入，并落地前端键生命周期。
- **阶段 C：按风险扩展** —— 报工创建/更正、物料分配、领料出库创建/确认和外购物料入库创建/确认已经启用；工单下达/取消/关闭及未来批次状态确认仍按风险逐项评审。

这三阶段只属于 HTTP 幂等闭环，与 `docs/todo.md` §4.2、`docs/migration-readiness.md` 中的「Production
业务迁移阶段」（`work_orders` → `production_item_demand` → `item_scrap`）不是同一概念，不要混淆。

## 1. 当前落地范围

> **规划基线（历史起点）**：本节是本文编写时的起点范围描述，**不反映当前状态**。阶段 A 与阶段 B 已
> 按 §10 落地，现状以头部「实施状态」、本文 §4/§5/§10/§13 与「进度口径」以及 `docs/todo.md` 4.1 为准。

规划起点只建立后端框架契约：

- `common/idempotency/idempotency-executor.ts` 定义幂等命令快照、执行结果和
  `IdempotencyExecutor` 抽象端口；
- 端口只接收稳定 `scope`、必填 `key`、已认证 `actorId`、规范化请求快照、结果 codec 和业务
  handler；阶段 A（平台闭环）为关联首次成功审计，还需增加当前 `requestId`，首次登记时保存、重放时不覆盖；
- 端口不暴露 MySQL 连接、事务 executor、NestJS HTTP 对象或数据库错误码；
- 单元测试锁定“首次执行 handler”“重放时不得再次执行 handler”以及“坏结果不得靠重执行业务自愈”语义。

规划起点明确**没有**完成以下能力，均已在阶段 A/B 落地，此处仅作历史对照，不再代表现状：

- 没有新增数据库 migration，也没有创建 `http_idempotency_records`（现已有
  `202608050001-http-idempotency-records`）；
- 没有 MySQL `IdempotencyExecutor` 适配器和 NestJS provider（现已有 `infrastructure/idempotency` 平台 module）；
- 没有业务 Service/Controller 接入（createBatch 试点已接入）；
- 没有把任何接口的 `Idempotency-Key` 改为必填（仅 createBatch 一个启用端点声明必填）；
- 没有前端 UUID 生命周期、请求头或不安全方法自动重试（现已有 `useIdempotentIntent` 意图闭环）；
- 没有缓存、Redis 或定时清理任务（Redis/缓存仍不引入；到期清理已由 housekeeping 落地）。

当时基于该基线推断「当前客户端仍不得发送 `Idempotency-Key`」与「过渡代码尚未实现端点级启用元数据」。
现状与这些推断相反：未启用端点携带幂等键返回 `400 IDEMPOTENCY_NOT_SUPPORTED`（`IdempotencyKeyGuard`
已落地并接入全局守卫），启用端点（createBatch）缺少或携带非法键返回 `400 VALIDATION_ERROR`；这些已是
正式契约而非过渡行为，详见 §4、§8 与 §13。平台始终不提供“直通执行”的假实现，业务注入的是真实
MySQL executor。

当前命令上下文模型已完成收口：普通 `CommandContext` 不含幂等键；Guard 校验并规范化 header 后，只有
createBatch 通过 `CurrentIdempotentCommandContext` 获得 `IdempotentCommandContext`。Identity/Product 的
`AuditContext`/`CurrentAuditContext` 已删除；application port 与 Repository 仍只接收 `CommandContext`。
Product 文件上传因对象存储副作用不在 MySQL 单事务内，保持非幂等。

## 2. 项目级决定

1. 幂等键由前端使用 `crypto.randomUUID()` 生成，服务端不提供“领取幂等键”预请求接口。
2. 一个键表示**一次尚未确认结果的提交意图**，不是一次点击、一次 HTTP 尝试或一次弹窗打开周期；只有
   第一次正式提交才生成键，原请求、超时重试和用户点击“重试”复用同一键。
3. 用户修改有效载荷、上一次已明确成功，或主动发起第二次相同业务动作时生成新键。
4. API 包装函数只接收调用方传入的键，禁止在每次请求内部临时生成 UUID。
5. 后端以 MySQL 为唯一协调与事实来源；幂等记录、业务写入和成功审计处于同一事务，不引入 Redis。
6. 只保存成功业务结果。认证、权限、DTO、请求头和纯格式校验（只由请求内容决定）在登记之前完成；
   会受数据库状态影响的业务校验（如负责人是否启用）在首次执行的 handler 内进行，重放不重复执行；
   业务失败或数据库失败使事务整体回滚。
7. 初期只支持已认证写命令，`actorId` 必须存在；匿名命令不接入此框架。
8. 每个接口逐项启用。没有完成迁移、适配器、前端生命周期和真实 MySQL 测试的接口不得声明必填键。

服务端生成键不能解决重试识别：请求丢失后再次调用会得到新键。根据请求内容生成键也不合适：两次
内容完全相同但由用户明确发起的业务动作可能都是合法意图。前端 UUID 不增加额外 HTTP 请求，适合当前
50 人以内的轻量 MES。

## 3. 完整请求流程

```text
用户第一次正式提交某次业务意图
  -> 前端生成 K1，并绑定当前有效载荷签名
  -> POST/PATCH + Idempotency-Key: K1
  -> 后端完成认证、权限、DTO 和请求头校验
  -> application 组装稳定 scope 与规范化请求快照
  -> IdempotencyExecutor 在 MySQL 外层事务中登记 K1 和请求指纹
       -> 首次出现：执行业务 handler -> 写成功审计 -> 保存业务结果 -> 提交
       -> 已有相同指纹：不执行 handler -> 读取并返回原业务结果
       -> 已有不同指纹：抛出 IDEMPOTENCY_CONFLICT
  -> 当前 HTTP 请求按端点固定成功状态返回结果，并生成自己的 X-Request-Id
```

关键场景：

```text
第一次请求 K1 已提交，但响应在网络中丢失
  -> 前端保留 K1
  -> 重试仍发送 K1 和相同有效载荷
  -> 后端命中 completed 记录
  -> 返回第一次保存的业务结果，不再建批、不再流转状态、不再写第二条成功审计
```

交互层 `submitting`/行级 pending 仍需保留。它减少同页面重复点击；服务端只负责在客户端确实再次提交
同一 K1 时识别和重放，不会替客户端保存已丢失的 K1。两者不是替代关系。

## 4. 后端目标结构

后续实现建议使用以下目录，不新建业务模块：

```text
apps/api/src/
  common/idempotency/
    idempotency-executor.ts             # 已落地：跨模块调用契约
    idempotency.errors.ts               # 已落地：协议无关存储/持久化结果错误
  infrastructure/idempotency/
    idempotency.module.ts               # 已落地：平台 provider 装配，公开导出 IdempotencyKeyGuard
    idempotency-key.guard.ts            # 已落地：端点级启用门禁（项目级基础设施，不归属业务模块）
    mysql-idempotency.executor.ts       # 已落地：唯一合法表写入器与外层事务
    canonical-request-fingerprint.ts    # 已落地：稳定 JSON + SHA-256
```

`common` 只放稳定端口和协议无关错误，不写表。`infrastructure/idempotency` 是项目级平台基础设施，
拥有 `http_idempotency_records` 的唯一写入口。业务模块只依赖 `IdempotencyExecutor`，不得直接查询或
修改该表，也不得识别 `ER_DUP_ENTRY` 等驱动错误码。

幂等键复用冲突继续使用现有 `common/persistence/optimistic-lock.ts` 中的 `idempotencyConflict()`；不得在
`idempotency.errors.ts` 再定义第二套同码错误。

业务接入位置应在 application Service/命令协调器，而不是 Controller：

```ts
const execution = await idempotencyExecutor.execute({
  scope: 'production.batch.create.v1',
  key: requiredContext.idempotencyKey,
  actorId: requiredContext.actorId,
  requestId: requiredContext.requestId,
  request: {
    params: { workOrderId },
    body: normalizedPayload,
  },
  resultCodec: productionBatchResultCodec,
  handler: () => productionBatchRepository.create(workOrderId, payload, context),
});

return execution.result;
```

Controller 仍只负责 DTO、权限、上下文和响应映射。当前端口的 `result` 是协议无关的业务结果，不保存
任意 HTTP header。成功状态码由端点契约固定；`X-Request-Id` 等易变响应头按每次请求重新生成。

第一阶段只接入完全位于同一 MySQL 事务内的命令。handler 不得包含无法随数据库回滚的消息发送、外部
HTTP 调用或对象存储写入；存在外部副作用的命令必须先设计 outbox 或明确补偿，不能直接套用该 executor
后宣称幂等。

当前 `uploadTechnicalFile`、`uploadProcessStepSop` 会先写对象存储，明确不属于第一阶段接入对象。
`deleteTechnicalFile` 当前只是数据库软删除且保留对象内容，不属于“对象存储删除”案例，但仍须按响应丢失
后的重试语义单独评估，不能仅凭 HTTP method 统一启用。

## 5. 数据库记录

计划表 `http_idempotency_records` 的正式字段和约束见
[`database/10-system-rbac-auth.md`](database/10-system-rbac-auth.md) §1.9。核心唯一标识为：

```text
UNIQUE (scope, idempotency_key)
```

请求指纹必须包含 `actorId`，因此其他用户即使提交相同键也只会得到稳定冲突，不会重放原用户结果。
第一阶段所有接入接口本身必须要求认证和权限校验，并在查询幂等记录之前完成授权。

首次 INSERT 同时保存 `initial_request_id`，值来自当前 `CommandContext.requestId`，且后续重放不得覆盖。
首次业务成功审计继续使用同一 request ID，因此可以从幂等记录关联 `operation_logs.request_id`。原始幂等键
不重复写入 `operation_logs`；重放和冲突通过带当前 request ID、scope 和脱敏键摘要的平台日志/指标观测，
成功重放不得伪造第二条业务成功审计。

**观测与脱敏（已落地）**：`MysqlIdempotencyExecutor` 在重放、冲突、结果损坏、可重试存储失败路径分别调用
`infrastructure/idempotency/idempotency.metrics.ts` 计数，日志只携带 `requestId`、`scope` 和脱敏键摘要
（`idempotency-key-digest.ts` 的 SHA-256 前缀），不打印原始幂等键；`IdempotencyHousekeepingService` 周期性
输出重放率/冲突率/失败率摘要并重置窗口。`isReplay` 在产生点即被观测，不依赖业务层转发，也不伪造第二条
业务动作或审计。

记录状态只允许 `processing`、`completed`。采用单事务方案时，`processing` 只在未提交事务中可见；业务
失败会连同记录一起回滚，不留下“失败占位”。正常提交后对外可见的记录必须已经是 `completed`。

第一阶段 completed 记录从完成时起保证重放至少 12 小时（代码内常量 `IDEMPOTENCY_RETENTION_HOURS`，当前硬编码 12 小时，非环境变量；需要调整时改 executor 常量并同步本约定），`expires_at` 只表示允许清理，不表示读取时可以提前
忽略。清理器（`idempotency-housekeeping.service.ts`，`http_idempotency_records` 平台内到期清理唯一写入口）
按小批次（每次上限 500）删除已到期 completed 记录；清理周期由环境变量 `IDEMPOTENCY_SWEEP_INTERVAL_MS`
控制（默认 1 小时，单位毫秒；值为非法非正数时跳过自动清理，与
`idempotency-housekeeping.service.ts` 行为一致）。如果发现持久化的 processing 记录，应告警并停止自动
处置，因为按单事务设计它本不应对其他事务可见。具体端点需要更长人工重试窗口时必须延长保留期并写入
模块 API 契约。

到达 `expires_at` 不会自动让键失效：记录尚未被物理删除时仍然重放；只有清理器实际删除后，同 scope/key
才可能作为新请求再次执行。API 对客户端只保证声明的最短保留窗口，不保证已清理记录还能重放。

不持久化原始请求体、Authorization、Cookie、Token、签名、IP、User-Agent 或完整 HTTP headers。
只保存 SHA-256 指纹和经评审可重放的成功业务结果。结果 JSON 不得包含临时下载签名、凭证或其他短期
密钥；存在此类结果的接口不能直接接入，必须先设计安全的结果重建方式。

`resultCodec.encode` 的目标返回类型必须收紧为递归 JSON value，并在写入前做运行时校验：只允许
`string`、有限 `number`、`boolean`、`null`、JSON 数组和普通 JSON 对象。`undefined`、`bigint`、循环引用
及未经 codec 显式转换的 `Date`/类实例一律拒绝，序列化失败必须使整个事务回滚。

createBatch 试点已落地为 Zod 完整嵌套 schema（`production-batch-result.codec.ts`）：encode/decode 都经
`productionBatchDetailSchema` 校验，不使用 `coerce`/`preprocess`、不做隐式类型转换，结构错误一律拒绝——
首次执行结果结构错误在保存前抛错使事务整体回滚，重放记录结构损坏走 `corrupt`（500 + 告警），绝不伪造
200。结果结构冻结在 scope `production.batch.create.v1`：指纹规则、结果结构、Zod schema 三者随 scope 版本
共同冻结，形状变更必须 bump scope 并引入新 codec，不允许用新 schema 去猜旧记录。

## 6. 规范化请求指纹

指纹由后端计算，调用方不得直接提交 hash。输入包含：

- 稳定 `scope`；
- 已认证 `actorId`；
- 会改变语义的 path params；
- 会改变语义的 query；
- DTO 转换和 trim 后的 body，包括乐观锁 `version`。

输入明确排除：

- `Idempotency-Key`；
- `X-Request-Id`；
- IP、User-Agent；
- 客户端或服务端时间戳（除非时间本身是业务字段）；
- Authorization、Cookie 和任何凭证。

规范化算法必须递归排序对象键，保持数组顺序，按业务 DTO 先统一等价的小数/空值表示，再统一 JSON
基本类型表示，并拒绝 `undefined`、`NaN`、`Infinity`、`bigint` 和无法稳定序列化的对象。最终对 UTF-8
稳定 JSON 计算 SHA-256，保存 64 位小写十六进制字符串。算法与测试向量一经发布即成为兼容性契约；
变更算法时必须通过新的 scope 版本隔离，不能让旧记录与新算法混用。

示例：

```ts
fingerprint = sha256(
  stableJson({
    scope: 'production.batch.create.v1',
    actorId: '9',
    params: { workOrderId: '10' },
    query: {},
    body: { plannedQuantity: '2.0000', routeId: '18' },
  }),
);
```

## 7. MySQL Executor 伪代码

```ts
async function execute(command) {
  const fingerprint = fingerprintOf(command);

  return withTransaction(pool, async () => {
    try {
      await insertRecord({
        scope: command.scope,
        key: command.key,
        actorId: command.actorId,
        fingerprint,
        status: 'processing',
      });
    } catch (error) {
      if (!isDuplicateKey(error)) throw mapInfrastructureError(error);

      // 锁定读属于当前读，可看到唯一键竞争方刚提交的记录，避免 RR 快照读空。
      const existing = await selectForUpdate(command.scope, command.key);
      if (!existing) throw retryableIdempotencyStorageError();
      if (existing.fingerprint !== fingerprint) throw idempotencyConflict();
      if (existing.status !== 'completed') throw retryableIdempotencyStorageError();

      return { result: command.resultCodec.decode(existing.resultJson), isReplay: true };
    }

    const result = await command.handler();
    const storedResult = command.resultCodec.encode(result);
    await markCompletedAndSaveResult(command.scope, command.key, storedResult);
    return { result, isReplay: false };
  });
}
```

`withTransaction` 已通过 AsyncLocalStorage 在同一 pool 上复用外层连接。MySQL executor 开启外层事务后，
现有 Repository 内部再次调用 `withTransaction` 必须加入同一连接，才能保证以下三者原子提交：

1. 幂等记录；
2. 业务写入；
3. 成功操作日志。

唯一键并发时，第二个 INSERT 通常等待第一个事务结束：第一个提交后第二个收到重复键并重放；第一个
回滚后第二个可以成为真正执行者。

**瞬态错误契约覆盖完整事务边界（已落地并经真实 MySQL 实测验证）**：

- 事务内语句（登记 INSERT、handler 内业务 SQL、重放 SELECT、completed UPDATE）的 mysql2 服务器形态
  瞬态错误（锁等待 1205 / 死锁 1213 / `PROTOCOL_CONNECTION_LOST` 连接中断等，带
  errno/sqlState/sqlMessage）统一映射 `IdempotencyStorageError('retryable')` →
  `503 IDEMPOTENCY_STORAGE_RETRYABLE`；
- 事务边界操作（取连接、开启事务、提交）由 `@company/database` 的 `withTransaction` 包装为
  `DatabaseError`，executor 按 `cause` 做瞬态分类后同样映射 retryable 503；
- 事务内经 `withActiveConnection` / 嵌套 `withTransaction` 的查询错误由数据库包标记为
  `DatabaseError`（来源明确，`code`/`errno`/`sqlState`/`sqlMessage` 从 `cause` 透传），executor 按
  `cause` 分类——handler 内业务 SQL 的网络中断（`ECONNRESET`/`EPIPE`/`ETIMEDOUT`，无 errno 形态）
  同样映射 retryable 503；handler 内其他 SDK 错误无标记、不误判；
- rollback 失败由事务包装 best-effort 记录，不覆盖原始异常；锁等待/死锁/连接中断不得被伪装为成功
  重放，也不会留下中毒键（由测试验证）；
- handler 内其他 SDK 的网络错误（无 mysql2 错误形态，如 ECONNRESET）原样冒泡，绝不误判为可重试；
- 成功指标（firstRun/replay）只在事务 commit 成功后记录，commit 失败不虚增。

## 8. 错误与保存语义

| 场景                                                | 处理                                                                                           |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 未启用端点携带任意幂等键（含 `@Public()` 匿名端点） | `400 IDEMPOTENCY_NOT_SUPPORTED`，不登记                                                        |
| 缺少必填键                                          | `400 VALIDATION_ERROR`，不登记                                                                 |
| 键长度或格式非法                                    | `400 VALIDATION_ERROR`，不登记                                                                 |
| 同 scope、同键、同指纹                              | 返回原成功业务结果                                                                             |
| 同 scope、同键、不同指纹                            | `409 IDEMPOTENCY_CONFLICT`                                                                     |
| DTO/权限失败                                        | 保持原 4xx，不登记                                                                             |
| 业务规则/乐观锁冲突                                 | 保持原业务错误，事务与幂等记录一起回滚                                                         |
| 数据库/审计/结果序列化失败                          | 整体回滚；不得保存 completed；可重试存储失败映射 `503 IDEMPOTENCY_STORAGE_RETRYABLE`           |
| 并发首请求尚未完成                                  | 依赖唯一键等待；超时按可重试基础设施失败处理（`503 IDEMPOTENCY_STORAGE_RETRYABLE`）            |
| 已完成记录的结果无法反序列化                        | `500 IDEMPOTENCY_RESULT_CORRUPT`，服务端告警；前端阻塞意图、提示人工处理，不重试、不自动换新键 |

第一阶段不缓存失败响应。这样不会把临时数据库失败长期绑定到键，但客户端在收到明确业务 4xx 后应结束该意图；
只有无响应、超时、连接中断和按契约可重试的 5xx 才保留原键。`IDEMPOTENCY_RESULT_CORRUPT`（结果损坏）是例外：
它是确定性的 5xx，请求层必须跳过自动重试，客户端不得保留原键重试、也不得清除意图自动换新键，应阻塞当前
意图并提示人工处理（首次结果是否成功不可知）。

协议无关幂等错误必须同时接入全局 `HttpExceptionFilter` 与 best-effort `AuditInterceptor` 的错误识别，确保
冲突在响应和失败审计中都表现为 409/`IDEMPOTENCY_CONFLICT`，不得被后者误记为 500。当前全局 Filter
已经识别 `ConcurrencyError`，但 `AuditInterceptor` 仍只识别 `HttpException`，这是阶段 A（平台闭环）必须修复并测试
的现存缺口。成功重放不再写第二条业务成功审计；重放次数通过独立指标观测，不伪造一次新的业务动作。

## 9. 前端键生命周期

前端后续应新增通用的“业务意图”composable，但实例仍由页面或弹窗局部持有，不放入跨页面 Pinia Store。
API 文件不得拥有键状态。K1 的所有者是“一次尚未确认结果的提交意图”，而不是按钮点击次数或弹窗
visible 状态。

```ts
type PendingIntent = {
  key: string;
  requestSignature: string;
  firstAttemptAt: number; // 第一次正式提交（生成 K1）的时刻，与服务端 12 小时重放保证窗口对齐
};

async function submit(workOrderId, payload) {
  const normalizedBody = normalizeCreateBatchPayload(payload);
  const intentSnapshot = {
    intentType: 'production.batch.create', // 本地意图名，不是服务端 scope：scope 由后端独占定义（见 §13）
    params: { workOrderId },
    query: {},
    body: normalizedBody, // 必须包含 version 等全部业务语义字段
  };
  const signature = stableClientSignature(intentSnapshot);

  if (!intent) {
    // 从未提交的草稿：第一次正式提交才生成 K1，12 小时窗口从此刻起算。
    intent = { key: crypto.randomUUID(), requestSignature: signature, firstAttemptAt: Date.now() };
  } else if (intent.requestSignature !== signature) {
    // 已提交但结果未知的意图修改了业务内容：不得静默替换 K1（首次结果是否成功不可知，自动换键盲发
    // 会制造重复批次），提示先核对业务结果，由用户显式放弃后重新提交。
    throw new Error('上次提交结果未知，修改内容后重新提交可能生成重复批次，请先核对结果');
  }
  if (Date.now() - intent.firstAttemptAt > IDEMPOTENT_INTENT_TTL_MS) {
    // 超过服务端 12 小时重放保证窗口：不复用旧键重试（记录可能已被清理），也不自动换新键盲发
    // （首次结果是否成功不可知），提示先核对业务结果、由用户显式放弃后重新提交。
    throw new Error('该提交已超出幂等重试窗口（12 小时），请先在批次列表中核对结果后重新发起');
  }

  try {
    const result = await apiCommand(workOrderId, normalizedBody, intent.key);
    intent = undefined; // 已明确成功；下次相同操作属于新意图
    return result;
  } catch (error) {
    if (isAmbiguousNetworkFailure(error) || isRetryableServerFailure(error)) {
      // 保留 intent，下一次重试复用同一 key。
    } else {
      intent = undefined; // 明确 4xx/业务失败；本次意图已经结束。
    }
    throw error;
  }
}
```

补充规则：

- 幂等键生成只依赖 Web Crypto（`crypto.randomUUID()`，不可用时经 `getRandomValues` 拼接 UUID v4）：
  环境不支持时直接抛错阻止提交，绝不降级为 `Math.random` 等非加密随机数——弱随机键可预测/碰撞会制造
  重复批次风险（已落地，见 `useIdempotentIntent.ts`）；
- 从未提交的草稿（idle）允许任意修改：第一次正式提交才生成 K1，`firstAttemptAt`（12 小时窗口起点）也
  从这次点击起算；打开弹窗本身不生成键、不计时；
- 已明确成功或收到按契约明确无副作用的 4xx 后旧意图已清除，修改表单并在下次提交自然生成新键；
- **已模糊失败、结果未确认的意图（pending/blocked/expired）修改业务内容时，不得静默替换 K1**：首次结果
  是否成功不可知，自动换新键盲发会制造重复批次。必须提示先核对业务结果，由用户显式放弃（reset）后重新
  提交才生成新键；
- 前端签名不是服务端安全指纹，但其字段覆盖范围必须包含服务端指纹中的全部客户端业务输入，即
  `intentType`（本地意图名）、语义 path params、query、规范化 body 和 version；字段清单由具体接口契约
  给出。漏掉任一字段会让内容已变化的请求错误复用旧键并得到 409；
- 用户会话切换必须销毁旧意图，服务端专有的 `actorId` 仍由后端指纹负责；
- Axios 自动重试必须复用调用方已经放入请求配置的同一键；请求 interceptor 不得生成 UUID；
  `IDEMPOTENCY_RESULT_CORRUPT` 是确定性失败，请求层必须跳过自动重试（同键重试必然再次失败），立即交回
  composable 阻塞意图；
- 接口若明确返回“仍在处理”，该结果仍属于未闭环，后续重试继续使用原键。当前单事务方案尚未定义
  `202` 或 `IDEMPOTENCY_REQUEST_PROCESSING`，未来增加时必须同步 API 契约；
- 用户明确成功、收到按当前契约不会产生副作用的 4xx、修改业务内容或主动放弃操作时结束旧意图；
- 意图超过服务端重放保证窗口（键创建后 12 小时，`IDEMPOTENT_INTENT_TTL_MS`）后，既不能继续复用旧键重试
  （记录可能已被清理），也不能自动换新键盲发（首次结果是否成功不可知）；阻塞并提示先核对业务结果，由
  用户显式放弃后重新提交；
- 收到 `IDEMPOTENCY_RESULT_CORRUPT`（结果损坏）时既不能当作模糊失败保留原键重试，也不能清除意图自动换
  新键；阻塞当前意图并提示人工处理，直到用户显式放弃。由于首次结果是否成功不可知，重新发起（新键）可能
  生成重复批次，提示必须先核对批次列表是否已生成，不能把“关闭并重新发起”当作安全路径；
- 结果未知（网络模糊失败/提交在途/结果损坏/超出重试窗口）的高风险提交关闭弹窗前必须弹确认：用户确认才
  放弃（reset），取消则保留弹窗与 K1 以便安全重试；不能把关闭静默等同于“后端一定没有执行”，也不能静默
  丢弃 K1 后让用户重新发起生成重复批次；
- UUID 不是凭证，但不得写入日志时连带打印请求体、Token 或 Cookie；
- 只有明确启用的 API 才传 header，并只对这些接口设置 `retryUnsafe: true`；重试次数保持小且可观测；
- 行内 pending、弹窗 `submitting` 和禁用关闭仍保留，不能因为有后端幂等就允许连续点击。

生命周期矩阵：

| 用户行为                                        | K1 处理                     | 当前项目边界                                          |
| ----------------------------------------------- | --------------------------- | ----------------------------------------------------- |
| 请求超时/断网后再次提交                         | 保留                        | 同一存活 composable 内可实现                          |
| Axios 自动重试                                  | 保留                        | 复用同一键；`IDEMPOTENCY_RESULT_CORRUPT` 跳过自动重试 |
| 切换 KeepAlive 缓存路由后返回                   | 保留                        | 仅当持有意图的页面/弹窗实例仍存活                     |
| 服务端明确返回“仍在处理”                        | 保留                        | 尚无此响应契约，后续新增时实现                        |
| 修改数量、路线等业务字段（草稿态，未提交）      | 无 K1，不受影响             | 第一次正式提交才生成 K1                               |
| 修改数量、路线等业务字段（结果未知的意图）      | 保留 K1，不静默换键         | 提交被拦截，提示先核对结果；显式放弃后才生成新键      |
| 收到明确成功                                    | 清除                        | 本次意图闭环                                          |
| 收到当前契约下明确且无副作用的业务 4xx          | 清除；修改后提交生成 K2     | 后端第一阶段不缓存失败结果                            |
| 结果已确认时关闭弹窗                            | 清除                        | 关闭守卫直接放行                                      |
| 结果未知时关闭弹窗（模糊失败/在途/损坏/超窗口） | 确认后清除，取消则保留      | 守卫提示重复批次风险；确认才放弃、不静默丢 K1         |
| 浏览器硬刷新                                    | 当前会丢失 K1，不能自动恢复 | 无草稿持久化、待提交日志和结果查询                    |
| 关闭标签页后重新打开                            | 通常生成新键                | 当前不提供跨标签交互会话恢复                          |

### 9.1 当前硬刷新限制

当前管理端的表单草稿、幂等意图和 K1 都没有持久化 Store。KeepAlive 只能覆盖应用内部路由切换，不能覆盖
浏览器硬刷新；刷新后组件内存被销毁，原表单内容和 K1 一起丢失。此时用户重新填写并提交会生成 K2；如果
K1 对应的首次请求实际上已经成功，仍可能产生第二条数据。

仅把 `{ key, payloadSignature }` 写入 `sessionStorage` 不足以恢复，因为 hash/签名不能还原原请求，也没有
代码负责恢复表单、核对当前内容和继续提交。要覆盖硬刷新，必须另行选择并完整实现一种机制：

1. **待提交恢复日志**：按 endpoint/scope 保存 K1、经过安全评审的完整规范化 payload、目标 ID、创建时间
   和版本，并提供启动恢复、过期清理、退出登录清理和用户确认 UI；这是一项新的提交恢复能力，不等同于
   普通表单草稿 Store，当前项目也没有该能力；或
2. **服务端结果查询**：前端至少持久化 K1 与 scope，刷新后通过受鉴权端点查询 processing/completed 结果，
   再决定展示结果或继续原请求。该能力不是“预领取键”，但会增加新 API、授权和信息泄露评审。

两种机制当前都不存在，也未在本次框架中实现。因此第一阶段内存方案只能声明“当前页面/KeepAlive 实例
存活期间安全重试”，不能声明“浏览器刷新后安全恢复”。创建批次、报工、分配、领料和库存流水等高风险
命令在正式宣称前后端完整闭环前，必须把硬刷新恢复作为独立验收项；若分阶段试点暂不实现，界面和接口
文档必须明确该覆盖缺口。

## 10. 分阶段接入顺序

### 阶段 A：平台闭环

1. 为 `http_idempotency_records` 追加 up/down migration，不修改历史 migration；
2. 扩展端口传入当前 `requestId`，首次登记保存 `initial_request_id`，并建立与首次成功审计的调查链路；
3. 在 `packages/constants` 登记 `IDEMPOTENCY_NOT_SUPPORTED`，并实现端点级启用元数据：启用端点必填，
   未启用端点收到键明确拒绝；
4. 实现规范化指纹、JSON-safe 结果 codec 约束和测试向量；
5. 实现 MySQL executor、全局响应/失败审计错误映射和平台 module；
6. 增加架构门禁：只有平台 executor 可以写幂等表；
7. 实现至少保留 12 小时的小批次到期清理和异常 processing 记录告警；
8. 完成真实 MySQL 并发、回滚、重放和过期清理集成测试；
9. 此阶段仍不要求任何业务接口发送键。

**完成标记**：第 6 条门禁已放行为「`infrastructure/idempotency` 平台内部写入口」（executor 业务登记/更新

- housekeeping 到期清理，见 `scripts/check-api-architecture.mjs` 与 `docs/architecture.md` §4）；第 7 条已由
  `idempotency-housekeeping.service.ts` 落地（小批次删除到期 completed、持久化 processing 只告警不处置）；
  第 8 条由 `http-idempotency.mysql.test.ts`（含新增 housekeeping 到期清理用例）、
  `create-batch-closed-loop.mysql.test.ts` 与新增 `create-batch-http-pipeline.mysql.test.ts` 覆盖（用例已
  落地并经 2026-08-07 本地全量套件与 `pnpm verify` 实测通过，当前进度 released，见「进度口径」）。

### 阶段 B：Production 试点

首个接口选择“后端自动生成批次号的创建批次”，因为它已存在明确重复创建缺口：

1. application 接入 executor；
2. Controller 对该端点声明 `Idempotency-Key` 必填；
3. 模块 API 文档增加 header、scope 和重放语义；
4. 前端在批次第一次正式提交时生成 UUID，在同一存活 composable 内按结果/内容规则复用；
5. 明确试点是否只覆盖 KeepAlive，还是同时实现 §9.1 的硬刷新恢复；未实现时不得宣称刷新后安全；
6. 增加 API、组件和真实 MySQL 的响应丢失重试测试；如实现恢复，再补浏览器刷新恢复测试；
7. 观察冲突率、重放率、执行延迟和存储增长后再扩展。

### 阶段 C：按风险扩展

依次评估报工创建/管理员更正、工单下达/取消/关闭、批次状态确认，以及后续 4.2 的物料分配、领料出库和库存流水命令。报工与更正会新增不可变事实，不能把业务 `report_no` 当作 HTTP 重试身份；接口开放前必须完成同事务的事实写入、成功审计和幂等结果保存，并验证响应丢失重放。
`generateMaterialDemands` 已有可复现业务稳定键，应先用真实 MySQL 双事务测试验证天然幂等，再决定是否
同时需要 HTTP 结果重放；不得为了“统一”而给所有 PATCH/POST 无差别加键。当前 application 在进入
Repository 的 `material_pending` 短路之前，会先重新查询批次产品和实时 BOM；第一次成功后若 BOM 被修改、
停用或清空，响应丢失重试仍可能在命中短路前失败。因此现阶段只能认定 Repository 写入路径具备天然幂等
候选，不能断言整个 HTTP 端点已经返回等价成功结果。只有调整短路边界或证明前置读取不会破坏重试语义，
并通过完整 application/API 重试测试后，才能决定不接入 HTTP 幂等。

## 11. 必需测试矩阵

### 单元测试

- 稳定 JSON 对象键排序、数组顺序、空值和非法值；
- 固定输入的 SHA-256 测试向量；
- 同业务输入得到同指纹，不同 actor/scope/params/body/version 得到不同指纹；
- 保存结果 codec 的往返和非法结果拒绝；
- codec encode 输出仅允许 JSON value，拒绝 undefined、bigint、循环引用和未显式转换的对象；
- 前端同意图复用键，任一语义 params/query/body/version 改变时换键，成功/明确失败清理、模糊失败保留。
- KeepAlive 所有者实例存活时切换路由不丢键；当前未实现恢复时，测试和文档不得伪造硬刷新覆盖。
- 若后续实现待提交日志或结果查询，补完整 payload 恢复、过期/退出清理、内容不一致换键和硬刷新旅程。

### API/契约测试

- 试点端点缺少/非法 header 返回 400；
- 未启用端点携带 header 返回 `400 IDEMPOTENCY_NOT_SUPPORTED`，不得静默执行；
- 相同键相同请求返回相同业务结果；
- 相同键不同请求返回 409 `IDEMPOTENCY_CONFLICT`；
- 鉴权与权限先于记录读取，未授权请求不能探测键是否存在；
- HTTP Filter 与失败审计对冲突都记录 409/`IDEMPOTENCY_CONFLICT`；
- 首次请求 ID 可以关联幂等记录与首次成功审计，重放不新增业务成功审计；
- `@IdempotentEndpoint({ scope })` 元数据携带 scope，架构门禁交叉校验启用端点 scope 与模块契约常量一致。

### 真实 MySQL 集成测试

> 以下用例均已落地（进度 released，见「进度口径」）；执行需显式设置 `RUN_MYSQL_INTEGRATION=1` 且满足
> 专用测试端点/库门禁：`TEST_DB_HOST/PORT/NAME` 必填、`DB_HOST/PORT/NAME` 必须分别与之完全相等、库名必须以 `_test`
> 结尾（由 `scripts/assert-mysql-integration-enabled.mjs` 强制校验，开发/生产库名一律拒绝）。2026-08-07
> 本地在 `easy_mes_test` 上全量套件实测通过（5 文件 / 29 用例），命令（PowerShell）：
>
> ```powershell
> $env:RUN_MYSQL_INTEGRATION='1'
> $env:TEST_DB_HOST='127.0.0.1'
> $env:TEST_DB_PORT='3307'
> $env:TEST_DB_NAME='easy_mes_test'
> $env:DB_HOST=$env:TEST_DB_HOST
> $env:DB_PORT=$env:TEST_DB_PORT
> $env:DB_NAME=$env:TEST_DB_NAME
> pnpm test:production:mysql
> ```
>
> Bash 等价形式见根 README；本地 WSL Docker 默认使用 `3307:3306`，CI 服务容器使用 `3306`；
> CI 已新增 `integration-mysql` 作业在专用测试库 `easy_mes_next_test` 上执行同一套件（待首次运行确认）。
> 集成套件运行说明：`vitest.mysql.config.ts` 使用 SWC 变换（esbuild 不发射 `emitDecoratorMetadata`，Nest 构造器注入
> 会得到 undefined；与 apps/api tsconfig 开启的 tsc 构建行为一致）；HTTP 管线用例以 jose 用同一
> JWT_SECRET/JWT_ISSUER/JWT_AUDIENCE 为真实存在且经 roles→role_permissions→permissions 拥有
> `production:batches:create` 权限的用户签发 token（不经 `/api/auth/login`，不写 refresh_tokens），该
> 权限行由生产核心 migration 作为代码绑定的权限目录提供，未跑 migration 时用例会显式报错提示。

- 同键两个并发事务只产生一次业务写入和一次成功业务审计；
- 两个调用都得到同一业务结果，一个标记为重放；
- 首次事务回滚后不留下记录，下一次同键可以正常执行；
- 首次事务已提交但模拟响应丢失，重试返回原结果；
- 同键不同指纹稳定冲突；
- 到期但未清理仍重放，物理清理后同键按新请求处理；
- housekeeping 到期清理：只物理删除已到期 completed（同键再执行按新请求）、未到期 completed 仍重放、
  持久化 processing 只告警不处置；
- executor 瞬态错误分类已落地并覆盖完整事务边界（登记 INSERT、handler 内业务 SQL、重放 SELECT、
  completed UPDATE，以及取连接/开启事务/提交 → `IdempotencyStorageError('retryable')` →
  `503 IDEMPOTENCY_STORAGE_RETRYABLE`；rollback 失败 best-effort 记录不覆盖原始异常；handler 内其他
  SDK 网络错误不误判；firstRun/replay 指标 commit 成功后记录），含真实双事务锁等待（1205）用例：
  锁等待/死锁不会返回错误的历史结果或重复执行，也不留下中毒键；
- createBatch application/database 闭环（`create-batch-closed-loop.mysql.test.ts`，直接构造
  Controller/ProductionService/executor/真实仓库，未经过 HTTP 管线）三表同事务：成功三表同提交、业务失败
  三表同回滚、重放不新增写入且返回冻结快照；
- createBatch HTTP 管线集成用例（`create-batch-http-pipeline.mysql.test.ts`，启动 Nest 测试应用 +
  supertest）：覆盖 AuthGuard/IdempotencyKeyGuard 顺序、DTO Pipe、CurrentIdempotentCommandContext、AuditInterceptor
  与 HttpExceptionFilter 的最终错误信封（含缺键 400、合法键放行）；
- 真实批次详情 JSON-safe：`mapBatch`/`mapWorkOrder` 将 DATE/DATETIME 列统一为字符串，codec `encode` 以 JSON
  序列化往返固化最终响应快照；
- 每个用例前清空 scratch 与 scope 幂等记录，绝对计数断言不依赖用例顺序或上次运行残留；
- `generateMaterialDemands` 双事务复验，并从完整 application/API 路径验证响应丢失后前置 BOM 读取不会
  把已成功操作变成失败。

## 12. 启用验收门槛

一个接口只有同时满足以下条件才算完成幂等闭环：

- 数据库领域章节、migration、代码和接口文档一致；
- scope 稳定且不会被路由重命名意外改变；
- 请求指纹覆盖全部业务语义输入；
- 前端意图签名覆盖相同的客户端语义 params/query/body/version；
- 幂等记录、业务写入和成功审计在同一真实 MySQL 事务；
- 未启用端点拒绝意外幂等键，启用端点才声明必填；
- 重放不再次执行 handler 和成功业务审计；
- 结果 codec 只保存经过运行时校验的 JSON value；
- 前端同一意图稳定复用键，API wrapper 不自行生成；
- 接口文档明确前端恢复范围；高风险命令只有实现并验证 §9.1 后才能宣称支持硬刷新后的安全恢复；
- 单元、API、组件和真实 MySQL 并发测试通过；
- 有保留/清理策略和重放率、冲突率、失败率观测；（已满足：housekeeping 小批次到期清理 +
  `idempotency.metrics.ts` 周期性输出重放率/冲突率/失败率摘要）
- 首次 request ID 可关联幂等记录与成功审计，响应与失败审计使用一致的冲突状态和错误码；
- `pnpm verify` 以及专用 MySQL 集成测试通过。

在上述门槛全部满足前，框架存在不等于接口已启用；`docs/todo.md` 4.1 的进度按本文「进度口径」标记
（createBatch 已 released；其余端点满足 §12 门槛前不得标记 released/已完成）。

## 13. scope 服务端独占与版本兼容方案

### 13.1 当前契约：客户端只传键，scope 完全由服务端控制

- API 路径与 HTTP 契约固定为 `POST /api/production/work-orders/:workOrderId/batches` +
  `Idempotency-Key: <uuid>`；不增加 `Idempotency-Scope`、`X-Api-Version`、`X-Idempotency-Version`，
  也不做前端构建版本协商。客户端只能提供键，不能决定服务端存储命名空间。
- scope 由后端集中定义：`CREATE_BATCH_IDEMPOTENCY_SCOPE`（当前为 `production.batch.create.v2`，位于
  `apps/api/src/modules/production/application/idempotency/create-batch-idempotency.contract.ts`），
  被 `ProductionService.createBatch`、`productionBatchResultCodec`（codec 附带 `scope` 字段并与执行
  契约共用同一常量）、后端单元测试与 MySQL 集成测试共同引用，是模块内唯一事实来源。
- scope **不放入**前后端共享的 `packages/constants`：前端只使用本地意图名 `intentType`
  （如 `production.batch.create`，不带版本号），只参与本地签名、不发送给后端，避免被误认为需要传输的
  协议字段。前端 `ClientIntentSnapshot` 的字段名与后端 scope 明确区分（见 §9 伪代码）。
- 服务端最短重放保证窗口为 12 小时（executor 代码内常量 `IDEMPOTENCY_RETENTION_HOURS`，硬编码 12 小时，非环境变量；`expires_at = completed_at + 12
小时`），前端意图 TTL（`IDEMPOTENT_INTENT_TTL_MS`）与之对齐：12 小时内同键同指纹保证重放；到期但
  未清理仍重放；清理器物理删除后不再保证；客户端不得在 12 小时后自动重试旧键或自动换新键，应先核对
  业务结果（见 §5、§9）。

### 13.2 不兼容升级：旧 scope 重放兼容窗口

当前不实现版本化路由，也不提前扩充 executor。发生不兼容变更（如请求/结果 DTO 形状变化）时，
按以下顺序处理，不改变 Controller 路径、请求 body、RBAC、数据库表或前后端部署方式：

```text
请求到达现有路径
  ├─ 找到 12 小时内（保留期 + 清理缓冲内）的 v1/K1 记录 → 使用 v1 指纹和 v1 codec 重放
  └─ 没有旧记录 → 按 v2 执行
```

1. 服务端把 scope 从 `production.batch.create.v1` bump 为 `production.batch.create.v2`：请求指纹规则、
   结果结构、Zod schema 随新 scope 引入新 codec（`productionBatchDetailSchema` v2）；v1 记录永远只由
   v1 schema 解析，不允许用新 schema 去猜旧记录（见 §5）。
2. 同一路径下按 scope 分发：命中 v1 scope 的记录用 v1 指纹和 v1 codec 重放（12 小时保证窗口 +
   清理缓冲内仍有效），未命中旧记录的请求按 v2 执行并保存 v2 记录。保留窗口与清理缓冲过后移除 v1
   兼容。只有新旧请求 DTO 本身无法在同一路径兼容时，才需要新增版本化路由。
3. 前端 `intentType` 是本地意图名，不随服务端 scope bump 变化；只有在业务意图本身改变时才调整。

> 4.2-B 移除了创建批次时逐工序 `responsibleUserId`，新请求固定使用
> `production.batch.create.v2`；前端仍使用 `production.batch.create` 本地意图名，服务端最短重放保证
> 12 小时。
