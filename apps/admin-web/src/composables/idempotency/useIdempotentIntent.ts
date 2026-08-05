import { RequestError } from '@company/request';

/**
 * 客户端业务输入快照（http-idempotency-implementation-plan.md §9）：
 * 仅用于前端内容变化判定，不是安全指纹；服务端指纹见实现方案 §6，actorId 等上下文由后端计算。
 */
export interface ClientIntentSnapshot {
  scope: string;
  params: Record<string, unknown>;
  query: Record<string, unknown>;
  body: unknown;
}

interface PendingIntent {
  key: string;
  signature: string;
}

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
 * 模糊失败：无响应/断网（status 0）或按契约可重试的 5xx，重试应复用原键；
 * 其余（4xx 业务错误、409 冲突、非 RequestError 异常等）视为明确失败，意图结束。
 */
export const isAmbiguousFailure = (error: unknown): boolean => {
  if (!(error instanceof RequestError)) return false;
  return error.status === 0 || error.status >= 500;
};

interface CryptoWithRandomUuid {
  randomUUID?: () => string;
  getRandomValues?: (array: Uint8Array) => Uint8Array;
}

/** UUID v4：优先 Web Crypto randomUUID，退化为 getRandomValues 拼接，最后兜底非加密随机串（保证可用）。 */
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
  // 极低概率兜底：非加密随机数，仅保证 UUID 字符串可用（非安全场景）
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
};

/**
 * 业务意图幂等键生命周期：
 *  - 实例由页面/弹窗局部持有，不得放入 Pinia Store；
 *  - 第一次正式提交才生成键；模糊失败（断网/无响应/可重试 5xx）复用原键；
 *  - 业务内容变化、明确成功或明确失败后清除；
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
    if (!intent || intent.signature !== signature) {
      intent = { key: createUuid(), signature };
    }
    const key = intent.key;
    try {
      const result = await submit(key);
      intent = null;
      return result;
    } catch (error) {
      if (!isAmbiguousFailure(error)) intent = null;
      throw error;
    }
  };

  const reset = (): void => {
    intent = null;
  };

  return { execute, reset };
};
