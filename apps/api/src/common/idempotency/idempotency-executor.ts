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

/** 由命令边界负责的稳定结果序列化契约；decode 必须校验未知持久化值。 */
export interface IdempotencyResultCodec<TResult> {
  /** 序列化为递归 JSON 值；禁止输出 `undefined`、`bigint`、循环引用或未经转换的类实例。 */
  readonly encode: (result: TResult) => JsonValue;
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
 */
export abstract class IdempotencyExecutor {
  abstract execute<TResult>(
    command: IdempotentCommand<TResult>,
  ): Promise<IdempotencyExecution<TResult>>;
}
