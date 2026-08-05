# HTTP 幂等闭环实施方案

> **实施状态（2026-08-05）**：阶段 A（平台闭环：`202608050001` migration、规范化指纹 + JSON-safe 校验、
> MySQL `IdempotencyExecutor` 与平台 module、架构门禁、`@IdempotentEndpoint()` 端点门禁、
> `AuditInterceptor` 409 修复）与阶段 B（createBatch 试点：Service/Controller 接线、前端
> `useIdempotentIntent` 意图、契约测试）已按本文落地；真实 MySQL 集成测试
> `tests/integration/idempotency/http-idempotency.mysql.test.ts` 已编写，跑通前不宣布闭环完成。下文 §1
> 的“尚未完成”清单与 §10 分期描述保留为规划基线，以 `docs/todo.md` 4.1 的“当前状态”为最新事实。

本文描述 `docs/todo.md` 4.1 的后续具体实现。通用规则以
[`concurrency-and-idempotency.md`](concurrency-and-idempotency.md) 为准，数据库结构以
[`new.md`](new.md) 为准，本文只给出落地顺序、伪代码、测试和启用门槛。

## 0. 阶段术语约定

正文在 §10 才给出「阶段 A / 阶段 B / 阶段 C」的完整定义，但 §1 起就会引用，先在此约定三阶段属于
**HTTP 幂等闭环**的落地顺序：

- **阶段 A：平台闭环** —— 后端平台基础设施全部落地（幂等表 migration、`requestId` 首次审计关联、端点级启用
  元数据、规范化指纹、JSON-safe 结果 codec、MySQL executor、错误映射、架构门禁、到期清理和真实 MySQL
  集成测试）。此阶段明确**不要求任何业务接口发送幂等键**（§10 阶段 A 第 9 条）。
- **阶段 B：Production 试点** —— 首个业务端点「后端自动生成批次号的创建批次」端到端接入，并落地前端键生命周期。
- **阶段 C：按风险扩展** —— 工单下达/取消/关闭、批次状态确认、物料分配/领料/库存流水等命令按风险逐项启用。

这三阶段只属于 HTTP 幂等闭环，与 `docs/todo.md` §4.2、`docs/migration-readiness.md` 中的「Production
业务迁移阶段」（`work_orders` → `production_item_demand` → `item_scrap`）不是同一概念，不要混淆。

## 1. 当前落地范围

本次只建立后端框架契约：

- `common/idempotency/idempotency-executor.ts` 定义幂等命令快照、执行结果和
  `IdempotencyExecutor` 抽象端口；
- 端口当前只接收稳定 `scope`、必填 `key`、已认证 `actorId`、规范化请求快照、结果 codec 和业务
  handler；阶段 A（平台闭环）为关联首次成功审计，还需增加当前 `requestId`，首次登记时保存、重放时不覆盖；
- 端口不暴露 MySQL 连接、事务 executor、NestJS HTTP 对象或数据库错误码；
- 单元测试锁定“首次执行 handler”“重放时不得再次执行 handler”以及“坏结果不得靠重执行业务自愈”语义。

本次明确**没有**完成以下能力：

- 没有新增数据库 migration，也没有创建 `http_idempotency_records`；
- 没有 MySQL `IdempotencyExecutor` 适配器和 NestJS provider；
- 没有业务 Service/Controller 接入；
- 没有把任何接口的 `Idempotency-Key` 改为必填；
- 没有前端 UUID 生命周期、请求头或不安全方法自动重试；
- 没有缓存、Redis 或定时清理任务。

因此当前客户端仍不得发送 `Idempotency-Key`。项目也不提供“直通执行”的假实现；缺少真实适配器时，
业务代码无法注入该端口，避免把未闭环能力误认为已经启用。

当前过渡代码尚未实现端点级启用元数据：使用 `CurrentCommandContext` 的 Production 命令会读取合法键但
没有消费方，非法键会提前返回 400；仍使用 `CurrentAuditContext` 的端点则不会解析该头。这不是正式 API
契约。阶段 A（平台闭环）必须统一为：已启用端点要求合法键，未启用端点一旦收到该头就返回
`400 IDEMPOTENCY_NOT_SUPPORTED`，不得静默忽略并让客户端误以为请求受到幂等保护。

## 2. 项目级决定

1. 幂等键由前端使用 `crypto.randomUUID()` 生成，服务端不提供“领取幂等键”预请求接口。
2. 一个键表示**一次尚未确认结果的提交意图**，不是一次点击、一次 HTTP 尝试或一次弹窗打开周期；只有
   第一次正式提交才生成键，原请求、超时重试和用户点击“重试”复用同一键。
3. 用户修改有效载荷、上一次已明确成功，或主动发起第二次相同业务动作时生成新键。
4. API 包装函数只接收调用方传入的键，禁止在每次请求内部临时生成 UUID。
5. 后端以 MySQL 为唯一协调与事实来源；幂等记录、业务写入和成功审计处于同一事务，不引入 Redis。
6. 只保存成功业务结果。DTO、鉴权和请求头校验在登记之前完成；业务失败或数据库失败使事务整体回滚。
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
    idempotency.errors.ts               # 待实现：协议无关存储/持久化结果错误
  infrastructure/idempotency/
    idempotency.module.ts               # 待实现：平台 provider 装配
    mysql-idempotency.executor.ts       # 待实现：唯一合法表写入器与外层事务
    canonical-request-fingerprint.ts    # 待实现：稳定 JSON + SHA-256
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

计划表 `http_idempotency_records` 的正式字段和约束见 `docs/new.md` §1.9。核心唯一标识为：

```text
UNIQUE (scope, idempotency_key)
```

请求指纹必须包含 `actorId`，因此其他用户即使提交相同键也只会得到稳定冲突，不会重放原用户结果。
第一阶段所有接入接口本身必须要求认证和权限校验，并在查询幂等记录之前完成授权。

首次 INSERT 同时保存 `initial_request_id`，值来自当前 `CommandContext.requestId`，且后续重放不得覆盖。
首次业务成功审计继续使用同一 request ID，因此可以从幂等记录关联 `operation_logs.request_id`。原始幂等键
不重复写入 `operation_logs`；重放和冲突通过带当前 request ID、scope 和脱敏键摘要的平台日志/指标观测，
成功重放不得伪造第二条业务成功审计。

记录状态只允许 `processing`、`completed`。采用单事务方案时，`processing` 只在未提交事务中可见；业务
失败会连同记录一起回滚，不留下“失败占位”。正常提交后对外可见的记录必须已经是 `completed`。

第一阶段 completed 记录从完成时起至少保留 30 天，`expires_at` 只表示允许清理，不表示读取时可以提前
忽略。清理器按小批次删除已到期 completed 记录；如果发现持久化的 processing 记录，应告警并停止自动
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
回滚后第二个可以成为真正执行者。锁等待超时、死锁和连接中断不得被伪装为成功重放，应映射为可重试
基础设施失败，并由测试验证不会留下中毒键。

## 8. 错误与保存语义

| 场景                         | 处理                                         |
| ---------------------------- | -------------------------------------------- |
| 未启用端点携带任意幂等键     | `400 IDEMPOTENCY_NOT_SUPPORTED`，不登记      |
| 缺少必填键                   | `400 VALIDATION_ERROR`，不登记               |
| 键长度或格式非法             | `400 VALIDATION_ERROR`，不登记               |
| 同 scope、同键、同指纹       | 返回原成功业务结果                           |
| 同 scope、同键、不同指纹     | `409 IDEMPOTENCY_CONFLICT`                   |
| DTO/权限失败                 | 保持原 4xx，不登记                           |
| 业务规则/乐观锁冲突          | 保持原业务错误，事务与幂等记录一起回滚       |
| 数据库/审计/结果序列化失败   | 整体回滚；不得保存 completed                 |
| 并发首请求尚未完成           | 依赖唯一键等待；超时按可重试基础设施失败处理 |
| 已完成记录的结果无法反序列化 | 服务端错误并告警；不得再次执行 handler“修复” |

第一阶段不缓存失败响应。这样不会把临时数据库失败长期绑定到键，但客户端在收到明确业务 4xx 后应结束该意图；
只有无响应、超时、连接中断和按契约可重试的 5xx 才保留原键。

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
};

async function submit(workOrderId, payload) {
  const normalizedBody = normalizeCreateBatchPayload(payload);
  const intentSnapshot = {
    scope: 'production.batch.create.v1',
    params: { workOrderId },
    query: {},
    body: normalizedBody, // 必须包含 version 等全部业务语义字段
  };
  const signature = stableClientSignature(intentSnapshot);

  if (!intent || intent.requestSignature !== signature) {
    intent = { key: crypto.randomUUID(), requestSignature: signature };
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

- 表单有效载荷发生业务变化时作废旧键；纯 UI 状态变化不影响键；
- 前端签名不是服务端安全指纹，但其字段覆盖范围必须包含服务端指纹中的全部客户端业务输入，即稳定
  scope、语义 path params、query、规范化 body 和 version；字段清单由具体接口契约给出。漏掉任一字段会
  让内容已变化的请求错误复用旧键并得到 409；
- 用户会话切换必须销毁旧意图，服务端专有的 `actorId` 仍由后端指纹负责；
- Axios 自动重试必须复用调用方已经放入请求配置的同一键；请求 interceptor 不得生成 UUID；
- 接口若明确返回“仍在处理”，该结果仍属于未闭环，后续重试继续使用原键。当前单事务方案尚未定义
  `202` 或 `IDEMPOTENCY_REQUEST_PROCESSING`，未来增加时必须同步 API 契约；
- 用户明确成功、收到按当前契约不会产生副作用的 4xx、修改业务内容或主动放弃操作时结束旧意图；
- 普通弹窗关闭通常视为放弃，但结果未知的高风险提交关闭前必须提示“关闭后当前项目无法安全恢复”，
  不能暗示后端一定没有执行；
- UUID 不是凭证，但不得写入日志时连带打印请求体、Token 或 Cookie；
- 只有明确启用的 API 才传 header，并只对这些接口设置 `retryUnsafe: true`；重试次数保持小且可观测；
- 行内 pending、弹窗 `submitting` 和禁用关闭仍保留，不能因为有后端幂等就允许连续点击。

生命周期矩阵：

| 用户行为                               | K1 处理                     | 当前项目边界                           |
| -------------------------------------- | --------------------------- | -------------------------------------- |
| 请求超时/断网后再次提交                | 保留                        | 同一存活 composable 内可实现           |
| Axios 自动重试                         | 保留                        | API wrapper 接收键，interceptor 不生成 |
| 切换 KeepAlive 缓存路由后返回          | 保留                        | 仅当持有意图的页面/弹窗实例仍存活      |
| 服务端明确返回“仍在处理”               | 保留                        | 尚无此响应契约，后续新增时实现         |
| 修改数量、路线等业务字段               | 作废；下次正式提交生成 K2   | 通过 payload signature 判定            |
| 收到明确成功                           | 清除                        | 本次意图闭环                           |
| 收到当前契约下明确且无副作用的业务 4xx | 清除；修改后提交生成 K2     | 后端第一阶段不缓存失败结果             |
| 关闭普通创建弹窗                       | 通常清除                    | 高风险未知结果需提示恢复缺口           |
| 浏览器硬刷新                           | 当前会丢失 K1，不能自动恢复 | 无草稿持久化、待提交日志和结果查询     |
| 关闭标签页后重新打开                   | 通常生成新键                | 当前不提供跨标签交互会话恢复           |

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
7. 实现至少保留 30 天的小批次到期清理和异常 processing 记录告警；
8. 完成真实 MySQL 并发、回滚、重放和过期清理集成测试；
9. 此阶段仍不要求任何业务接口发送键。

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

依次评估工单下达/取消/关闭、批次状态确认，以及后续 4.2 的物料分配、领料出库和库存流水命令。
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
- 首次请求 ID 可以关联幂等记录与首次成功审计，重放不新增业务成功审计。

### 真实 MySQL 集成测试

- 同键两个并发事务只产生一次业务写入和一次成功业务审计；
- 两个调用都得到同一业务结果，一个标记为重放；
- 首次事务回滚后不留下记录，下一次同键可以正常执行；
- 首次事务已提交但模拟响应丢失，重试返回原结果；
- 同键不同指纹稳定冲突；
- 到期但未清理仍重放，物理清理后同键按新请求处理；
- 锁等待/死锁不会返回错误的历史结果或重复执行；
- `generateMaterialDemands` 双事务复验，并从完整 application/API 路径验证响应丢失后前置 BOM 读取不会
  把已成功操作变成失败。

## 12. 启用验收门槛

一个接口只有同时满足以下条件才算完成幂等闭环：

- `docs/new.md`、migration、代码和接口文档一致；
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
- 有保留/清理策略和重放率、冲突率、失败率观测；
- 首次 request ID 可关联幂等记录与成功审计，响应与失败审计使用一致的冲突状态和错误码；
- `pnpm verify` 以及专用 MySQL 集成测试通过。

在上述门槛全部满足前，框架存在不等于接口已启用，`docs/todo.md` 4.1 也不得标记为“已完成”。
