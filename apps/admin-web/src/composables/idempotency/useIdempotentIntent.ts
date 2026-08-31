import { RequestError } from '@company/request';
import { IDEMPOTENCY_RESULT_CORRUPT } from '@company/constants';

/**
 * 客户端业务输入快照（idempotency.md §9）：
 * 仅用于前端内容变化判定，不是安全指纹；服务端指纹见实现方案 §6，actorId 等上下文由后端计算。
 *
 * `intentType` 是本地业务意图名（如 `production.batch.create`），不是服务端 scope：scope 由后端
 * `production-idempotency-scopes.contract.ts` 独占定义并携带契约版本，客户端只发送 `Idempotency-Key`，
 * 不传输、不协商 scope，也不能决定服务端存储命名空间。
 */
export interface ClientIntentSnapshot {
  intentType: string;
  params: Record<string, unknown>;
  query: Record<string, unknown>;
  body: unknown;
}

interface PendingIntent {
  key: string;
  signature: string;
  /** 第一次正式提交（生成 K1）的时刻（ms），用于判定意图是否超出服务端重放保证窗口。 */
  firstAttemptAt: number;
  /** 服务端幂等结果损坏（IDEMPOTENCY_RESULT_CORRUPT）后置位：阻止继续提交，直到用户显式 reset。 */
  blocked?: boolean;
}

/**
 * 意图有效期与服务端重放保证窗口对齐：`expires_at = completed_at + 12 小时`（MySQL executor）。
 * 超过该窗口的模糊意图既不能继续复用旧键重试（服务端可能已物理清理），也不能自动换新键盲发
 * （首次结果是否成功不可知），必须提示先核对业务结果、由用户显式放弃后重新提交。
 */
export const IDEMPOTENT_INTENT_TTL_MS = 12 * 60 * 60 * 1000;

/** 意图超过有效期（含 blocked：结果损坏的意图也随窗口到期，由用户核对结果后重新发起）。 */
export const isIntentExpired = (intent: Pick<PendingIntent, 'firstAttemptAt'>): boolean =>
  Date.now() - intent.firstAttemptAt > IDEMPOTENT_INTENT_TTL_MS;

/**
 * 意图生命周期状态，供页面在关闭弹窗等边界决策是否允许丢弃 K1：
 *  - idle：无在途意图（未提交的草稿、已成功、明确失败或已 reset）；
 *  - pending：已提交但结果未知（网络模糊失败/在途），同键可安全重试；修改表单不得静默换键；
 *  - blocked：结果损坏，必须人工核对结果后显式放弃；
 *  - expired：意图已超出服务端 12 小时重放保证窗口，同键重试与自动换键都不可行，需核对业务结果后
 *    显式放弃再重新提交。
 */
export type IdempotentIntentStatus = 'idle' | 'pending' | 'blocked' | 'expired';

/**
 * 递归规范化 JSON 后返回稳定字符串：
 *  - 对象键按升序排序；
 *  - 值为 undefined 的键省略；
 *  - 数组保序。
 * 用于判断业务有效载荷是否变化；漏掉任一语义字段会让内容已变化的请求错误复用旧键并被后端 409 拒绝。
 */
export const stableClientSignature = (snapshot: ClientIntentSnapshot): string => {
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map((item) => normalize(item));
    }
    if (value !== null && typeof value === 'object') {
      const entries: Array<[string, unknown]> = [];
      for (const [key, item] of Object.entries(value)) {
        if (item === undefined) continue;
        entries.push([key, normalize(item)]);
      }
      entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return Object.fromEntries(entries);
    }
    return value;
  };
  return JSON.stringify(normalize(snapshot));
};

/**
 * 幂等结果损坏是确定性服务端数据错误：同键重试必然再次失败，且首次结果是否成功不可知。
 * 必须阻止继续提交并提示人工处理，既不能当作模糊失败保留原键死循环，也不能清除意图自动换新键。
 */
export const isCorruptFailure = (error: unknown): boolean =>
  error instanceof RequestError && error.code === IDEMPOTENCY_RESULT_CORRUPT;

/**
 * 模糊失败：无响应/断网（status 0）或按契约可重试的 5xx，重试应复用原键；
 * 结果损坏（IDEMPOTENCY_RESULT_CORRUPT）除外——它需要人工处理而非自动重试。
 */
export const isAmbiguousFailure = (error: unknown): boolean => {
  if (!(error instanceof RequestError)) return false;
  return (error.status === 0 || error.status >= 500) && !isCorruptFailure(error);
};

interface CryptoWithRandomUuid {
  randomUUID?: () => string;
  getRandomValues?: (array: Uint8Array) => Uint8Array;
}

/**
 * UUID v4：优先 Web Crypto randomUUID，其次 getRandomValues 拼接。
 * 幂等键是防重复提交的安全边界，只接受加密随机数；Web Crypto 不可用时直接抛错阻止提交，
 * 绝不降级为 Math.random 非加密随机数（弱随机键可预测/碰撞会制造重复批次风险）。
 */
const createUuid = (): string => {
  const cryptoApi = globalThis.crypto as CryptoWithRandomUuid | undefined;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  if (cryptoApi?.getRandomValues) {
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  // 不降级：幂等键是安全边界，非加密随机数不可接受，阻止提交直到运行环境提供 Web Crypto。
  throw new Error(
    '当前环境不支持 Web Crypto（randomUUID/getRandomValues），无法生成安全幂等键，已阻止提交以免重复批次风险',
  );
};

/**
 * 业务意图幂等键生命周期：
 *  - 实例由页面/弹窗局部持有，不得放入 Pinia Store；
 *  - 第一次正式提交才生成键；模糊失败（断网/无响应/可重试 5xx）复用原键；
 *  - 业务内容变化、明确成功或明确失败后清除；
 *  - 意图超出服务端 12 小时重放保证窗口后不再发送旧键、也不自动换新键，提示核对业务结果后由用户
 *    显式 reset 放弃（见 IDEMPOTENT_INTENT_TTL_MS / isIntentExpired）；
 *  - API wrapper 只接收并转发键，不生成、不保存。
 * 不能替代弹窗 submitting / 行级 pending 守卫。
 */
export const useIdempotentIntent = () => {
  let intent: PendingIntent | null = null;

  const execute = async <TResult>(
    snapshot: ClientIntentSnapshot,
    submit: (key: string) => Promise<TResult>,
  ): Promise<TResult> => {
    const signature = stableClientSignature(snapshot); // 归一化快照生成稳定签名
    if (!intent) {
      // 从未提交的草稿（idle）：第一次正式提交才生成 K1，12 小时窗口从此刻起算。
      intent = { key: createUuid(), signature, firstAttemptAt: Date.now() };
    }
    // intent 一旦存在就代表「已正式提交但结果未知」（成功或明确失败后都会置 null）。
    // 此时修改业务内容不能静默替换 K1：首次结果是否成功不可知，自动换键会制造重复批次。
    // 必须提示先核对业务结果，由用户显式 reset 放弃后重新提交（生成新键）。
    const current = intent;
    if (current.blocked) {
      throw new Error(
        '该提交的幂等结果已损坏，已阻止继续提交；无法确认本次是否已创建批次，重新发起可能生成重复批次，请先在批次列表中核对结果',
      );
    }
    if (isIntentExpired(current)) {
      // 超过服务端重放保证窗口：旧键可能已被清理（同键重试不再保证重放），自动换新键又可能造成
      // 重复批次（首次结果是否成功不可知）。必须提示人工核对，不能静默继续。
      throw new Error(
        '该提交已超出幂等重试窗口（12 小时），继续提交无法保证安全重试；请先在批次列表中核对是否已创建批次，确认后重新发起',
      );
    }
    if (current.signature !== signature) {
      // 模糊失败（pending）后修改表单：不换键、不盲发，提示核对结果后由用户显式放弃。
      throw new Error(
        '上次提交结果未知（网络异常或服务端未确认）。修改内容后重新提交可能生成重复批次，请先在批次列表中核对是否已创建批次，确认后关闭并重新发起',
      );
    }
    const key = current.key;
    try {
      const result = await submit(key);
      intent = null;
      return result;
    } catch (error) {
      if (isCorruptFailure(error)) {
        // 结果损坏：阻塞当前意图并保留原键供人工处理，不重试、不自动换新键。
        current.blocked = true;
      } else if (!isAmbiguousFailure(error)) {
        intent = null;
      }
      throw error;
    }
  };

  const reset = (): void => {
    intent = null;
  };

  /** 当前意图状态：页面据此在关闭弹窗等场景决定是否提示用户，避免静默丢弃 K1 / 静默放行重复提交。 */
  const getStatus = (): IdempotentIntentStatus => {
    if (!intent) return 'idle';
    if (isIntentExpired(intent)) return 'expired';
    return intent.blocked ? 'blocked' : 'pending';
  };

  return { execute, reset, getStatus };
};
