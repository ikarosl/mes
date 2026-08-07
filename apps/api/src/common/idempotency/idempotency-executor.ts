/**
 * 已规范化、可参与请求指纹计算的命令快照。
 *
 * 调用方只传递会改变业务语义的输入；请求 ID、幂等键、IP、User-Agent 和时间戳不得放入该快照。
 * 具体序列化、指纹计算与持久化由后续基础设施适配器负责。
 */
export interface IdempotencyRequestSnapshot {
  readonly params?: Readonly<Record<string, unknown>>;
  readonly query?: Readonly<Record<string, unknown>>;
  readonly body?: unknown;
}

/** 递归 JSON 基本值；`encode` 的输出目标，写入前必须通过运行时校验。 */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { readonly [key: string]: JsonValue };

/**
 * 由命令边界负责的结果序列化契约（canonical 快照语义）；decode 必须校验未知/损坏持久化值。
 *
 * encode 允许规范化：trim 字段、删除冗余字段、日期转换等均为合法实现——encode 的产物就是
 * 持久化与返回的唯一 canonical 快照。executor 框架级保证首次执行与重放返回同一产物：首次
 * 执行保存 `encode(handler 结果)` 后返回 `decode(encode(handler 结果))`，重放返回
 * `decode(已保存 JSON)`，两条路径产物严格一致，不依赖 codec 自觉；codec 即使改写结果形状，
 * 首次执行也会在保存 completed 记录前完成 decode，失败则整个事务回滚，绝不出现首次响应与
 * 重放响应不同的情况。
 *
 * 约束：
 *  - encode 输出必须是递归 JSON 值（JsonValue），禁止输出 `undefined`、`bigint`、循环引用
 *    或未经转换的类实例；
 *  - decode 必须校验未知/损坏的持久化值，校验失败抛错而非静默放行。
 *
 * 业务要求：具体业务 codec 应对完整响应样本做 JSON 往返测试——
 * `decode(JSON.parse(JSON.stringify(encode(sample))))` 能成功解析且形状符合对外契约，
 * 因为 executor 以 JSON 字符串持久化 encode 产物，重放时再解析回未知值交给 decode。
 */
export interface IdempotencyResultCodec<TResult> {
  /** 序列化为递归 JSON 值；禁止输出 `undefined`、`bigint`、循环引用或未经转换的类实例。 */
  readonly encode: (result: TResult) => JsonValue;
  /** 从持久化值恢复结果；必须校验未知/损坏的持久化值，校验失败抛错而非静默放行。 */
  readonly decode: (stored: unknown) => TResult;
}

/**
 * 一次已显式启用 HTTP 幂等能力的命令。
 *
 * actorId 在当前第一阶段必须是已认证用户 ID；匿名命令不属于该框架的启用范围。
 * requestId 为当前 HTTP 请求 ID，首次登记时作为 `initial_request_id` 保存，用于关联首次成功审计。
 */
export interface IdempotentCommand<TResult> {
  /** 稳定命令名必须携带契约版本，例如 production.batch.create.v1。 */
  readonly scope: string;
  readonly key: string;
  readonly actorId: string;
  readonly requestId: string;
  readonly request: IdempotencyRequestSnapshot;
  readonly resultCodec: IdempotencyResultCodec<TResult>;
  readonly handler: () => Promise<TResult>;
}

export interface IdempotencyExecution<TResult> {
  readonly result: TResult;
  readonly isReplay: boolean;
}

/**
 * 跨业务模块复用的幂等执行端口。
 *
 * 当前只定义调用契约，不注册直通或内存实现。只有 MySQL 适配器完成原子登记、业务执行、结果保存与
 * 重放后，具体业务端点才允许注入并调用该端口。
 *
 * 响应一致性保证：首次执行与重放返回完全相同的 canonical 结果，该保证由 executor 自身承担、
 * 不依赖 codec 自觉——首次执行保存 `encode(handler 结果)` 后返回
 * `decode(encode(handler 结果))`，重放返回 `decode(已保存 JSON)`，两条路径产物严格一致；
 * codec 的字段删除/日期转换/规范化在任何路径上都返回同一形状。codec 只需保证 encode 输出
 * 合法 JsonValue，且 decode 能解析自己的 encode 产物（未知/损坏值抛错）。
 */
export abstract class IdempotencyExecutor {
  abstract execute<TResult>(
    command: IdempotentCommand<TResult>,
  ): Promise<IdempotencyExecution<TResult>>;
}
