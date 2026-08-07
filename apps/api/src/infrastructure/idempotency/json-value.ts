import type { JsonValue } from '../../common/idempotency/idempotency-executor.js';

/**
 * JSON-safe 运行时校验：确认 unknown 输入是递归 JSON value。
 *
 * 允许：string、有限 number、boolean、null、JSON 数组、普通对象（原型为 `Object.prototype`
 * 或 null，且属性递归为 JSON value）。
 * 拒绝：`undefined`、`NaN`、`±Infinity`、bigint、symbol、function、Date、Map、Set、Buffer、
 * 自定义类实例、循环引用、稀疏数组（含空槽）。失败抛 `TypeError`，消息为中文。
 */
export function assertJsonValue(value: unknown): asserts value is JsonValue {
  check(value, '$', new Set());
}

const ERROR_PREFIX = '[json-value]';

function reject(path: string, message: string): never {
  throw new TypeError(`${ERROR_PREFIX} 路径 ${path}：${message}`);
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function check(value: unknown, path: string, seen: Set<object>): void {
  if (value === undefined) reject(path, '不允许 undefined：JSON 序列化会丢弃该字段');
  if (value === null) return;

  if (typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return;
    reject(path, `数字必须是有限值，收到 ${String(value)}`);
  }
  if (typeof value === 'bigint') reject(path, '不允许 bigint：超出 JSON 数字范围');
  if (typeof value === 'symbol') reject(path, '不允许 symbol：JSON 无法表示 symbol');
  if (typeof value === 'function') reject(path, '不允许 function：JSON 无法表示函数');

  // 到达此处 value 必为 object
  if (value instanceof Date) {
    reject(path, '不允许 Date 实例：必须显式转换为字符串或时间戳');
  }
  if (value instanceof Map || value instanceof Set) {
    const name = value instanceof Map ? 'Map' : 'Set';
    reject(path, `不允许 ${name} 实例：必须显式转换为 JSON 数组或普通对象`);
  }
  if (Buffer.isBuffer(value)) {
    reject(path, '不允许 Buffer：必须显式转换为字符串或字节数组');
  }
  if (seen.has(value)) {
    reject(path, '存在循环引用');
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index++) {
        if (!(index in value)) {
          reject(`${path}[${index}]`, '数组存在空槽（稀疏数组）：表示不稳定');
        }
        check(value[index], `${path}[${index}]`, seen);
      }
      return;
    }
    if (!isPlainObject(value)) {
      reject(path, '只允许普通对象：自定义类实例和非普通对象不能作为 JSON value');
    }
    for (const key of Object.keys(value)) {
      check((value as Record<string, unknown>)[key], `${path}.${key}`, seen);
    }
  } finally {
    // 到达此处 value 必为 object（原始值与 Date/Map/Set/Buffer 均已提前返回或拒绝）；try/finally 会丢失
    // 控制流收窄，Set.delete 需要显式断言。
    seen.delete(value as object);
  }
}
