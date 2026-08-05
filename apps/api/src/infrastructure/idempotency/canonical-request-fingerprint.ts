import { createHash } from 'node:crypto';

/**
 * 规范化请求指纹（docs/http-idempotency-implementation-plan.md §6）。
 *
 * 指纹由后端计算，调用方不得直接提交 hash。输入包含稳定 `scope`、已认证 `actorId`、会改变语义的
 * path params、query，以及 DTO 转换和 trim 后的 body（含乐观锁 `version`）。明确排除
 * Idempotency-Key、X-Request-Id、IP、User-Agent、时间戳、Authorization/Cookie 和任何凭证。
 *
 * 算法与测试向量一经发布即成为兼容性契约；变更时必须通过新的 scope 版本隔离，不能让旧记录与新算法混用。
 */

const ERROR_PREFIX = '[request-fingerprint]';

function reject(message: string): never {
  throw new TypeError(`${ERROR_PREFIX} ${message}`);
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * 递归规范化任意值为稳定普通 JSON 结构：
 *  - 对象键按升序排序；值为 `undefined` 的键省略（`{a:undefined}` 与 `{}` 等价）；
 *  - 数组保序；`undefined` 元素或空槽拒绝；
 *  - 数字必须是有限值；`NaN`/`±Infinity`/bigint/symbol/function/Date/Map/Set/类实例/循环引用一律拒绝。
 * 最终交给 JSON.stringify 得到稳定字符串。
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value, new Set<object>()));
}

function normalize(value: unknown, seen: Set<object>): unknown {
  if (value === undefined) reject('不允许 undefined 作为指纹值');
  if (value === null) return null;

  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) reject(`数字必须是有限值，收到 ${String(value)}`);
    return value;
  }
  if (typeof value === 'bigint') reject('不允许 bigint');
  if (typeof value === 'symbol') reject('不允许 symbol');
  if (typeof value === 'function') reject('不允许 function');

  // 到达此处 value 必为 object
  if (value instanceof Date) reject('不允许 Date 实例，必须显式转换为字符串或时间戳');
  if (value instanceof Map || value instanceof Set)
    reject('不允许 Map/Set，必须显式转换为 JSON 数组或普通对象');
  if (Buffer.isBuffer(value)) reject('不允许 Buffer，必须显式转换为字符串或字节数组');
  if (seen.has(value)) reject('存在循环引用');
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const items = new Array<unknown>(value.length);
      for (let index = 0; index < value.length; index++) {
        if (!(index in value)) reject(`数组存在空槽（稀疏数组），下标 ${index} 表示不稳定`);
        items[index] = normalize(value[index], seen);
      }
      return items;
    }
    if (!isPlainObject(value)) reject('只允许普通对象：自定义类实例和非普通对象不能作为指纹输入');
    const entries: Array<[string, unknown]> = [];
    for (const key of Object.keys(value)) {
      const item = (value as Record<string, unknown>)[key];
      if (item === undefined) continue;
      entries.push([key, normalize(item, seen)]);
    }
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(entries);
  } finally {
    seen.delete(value);
  }
}

export interface FingerprintInput {
  scope: string;
  actorId: string;
  params?: Readonly<Record<string, unknown>>;
  query?: Readonly<Record<string, unknown>>;
  body: unknown;
}

/**
 * 计算稳定请求指纹：对 `{ scope, actorId, params, query, body }` 规范化后做 SHA-256，
 * 返回 64 位小写十六进制。params/query 缺省按 `{}` 处理。
 */
export function requestFingerprint(input: FingerprintInput): string {
  const canonical = canonicalJson({
    scope: input.scope,
    actorId: input.actorId,
    params: input.params ?? {},
    query: input.query ?? {},
    body: input.body,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
