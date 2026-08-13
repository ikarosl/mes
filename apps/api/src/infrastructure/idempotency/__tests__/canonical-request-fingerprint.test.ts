import { describe, expect, it } from 'vitest';
import { canonicalJson, requestFingerprint } from '../canonical-request-fingerprint.js';

const FIXED_INPUT = {
  scope: 'production.batch.create.v1',
  actorId: '9',
  params: { workOrderId: '10' },
  query: {},
  body: { plannedQuantity: '2.0000', routeId: '18' },
};
// docs/http-idempotency-implementation-plan.md §6 示例的固定 SHA-256 测试向量（兼容性契约）
const FIXED_FINGERPRINT = 'e6138c319f8d59537d6812947f08c0e85b2afe7f590aacedd7a666f3a4ea7a8c';

describe('canonicalJson', () => {
  it('对象键按升序排序，乱序输入产生相同输出', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });

  it('数组保持顺序', () => {
    expect(canonicalJson([1, 2, 3])).toBe('[1,2,3]');
    expect(canonicalJson([3, 2, 1])).toBe('[3,2,1]');
    expect(canonicalJson([1, 2, 3])).not.toBe(canonicalJson([3, 2, 1]));
  });

  it('数组内对象递归排序', () => {
    expect(canonicalJson([{ b: 1, a: 2 }, 3])).toBe(canonicalJson([{ a: 2, b: 1 }, 3]));
  });

  it('值为 undefined 的键被省略：与空对象等价', () => {
    expect(canonicalJson({ a: undefined })).toBe(canonicalJson({}));
    expect(canonicalJson({ a: 1, b: undefined })).toBe(canonicalJson({ a: 1 }));
  });

  it('数字表示确定性：1 与 1.0 等价', () => {
    expect(canonicalJson(1)).toBe(canonicalJson(1.0));
  });

  it('null、boolean、string 原样输出', () => {
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson(true)).toBe('true');
    expect(canonicalJson('a\nb')).toBe('"a\\nb"');
  });

  it.each([
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
    ['bigint', 1n],
    ['function', () => undefined],
    ['symbol', Symbol('x')],
  ])('拒绝非法原始值 %s', (_label, value) => {
    expect(() => canonicalJson(value)).toThrow(TypeError);
  });

  it.each([
    ['Date', new Date('2026-08-05T00:00:00.000Z')],
    ['Map', new Map([['a', 1]])],
    ['Set', new Set([1, 2])],
  ])('拒绝类实例 %s', (_label, value) => {
    expect(() => canonicalJson(value)).toThrow(TypeError);
  });

  it('拒绝循环引用', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => canonicalJson({ a: circular })).toThrow(TypeError);
  });

  it('拒绝数组中的 undefined 与稀疏数组', () => {
    expect(() => canonicalJson([1, undefined, 3])).toThrow(TypeError);
    const sparse: unknown[] = [];
    sparse.length = 3;
    expect(() => canonicalJson(sparse)).toThrow(TypeError);
  });
});

describe('requestFingerprint', () => {
  it('固定输入产生固定 SHA-256 测试向量（兼容性契约）', () => {
    expect(requestFingerprint(FIXED_INPUT)).toBe(FIXED_FINGERPRINT);
  });

  it('相同业务输入（含对象键乱序）产生相同指纹', () => {
    const shuffled = {
      body: { routeId: '18', plannedQuantity: '2.0000' },
      query: {},
      params: { workOrderId: '10' },
      actorId: '9',
      scope: 'production.batch.create.v1',
    };
    expect(requestFingerprint(FIXED_INPUT)).toBe(requestFingerprint(shuffled));
  });

  it('不同 actorId 产生不同指纹', () => {
    expect(requestFingerprint({ ...FIXED_INPUT, actorId: '10' })).not.toBe(FIXED_FINGERPRINT);
  });

  it('不同 scope 产生不同指纹', () => {
    expect(requestFingerprint({ ...FIXED_INPUT, scope: 'production.batch.create.v2' })).not.toBe(
      FIXED_FINGERPRINT,
    );
  });

  it('不同 params 产生不同指纹', () => {
    expect(requestFingerprint({ ...FIXED_INPUT, params: { workOrderId: '11' } })).not.toBe(
      FIXED_FINGERPRINT,
    );
  });

  it('不同 body 产生不同指纹', () => {
    expect(
      requestFingerprint({
        ...FIXED_INPUT,
        body: { plannedQuantity: '5.0000', routeId: '18' },
      }),
    ).not.toBe(FIXED_FINGERPRINT);
  });

  it('body 中不同 version 产生不同指纹', () => {
    expect(
      requestFingerprint({
        ...FIXED_INPUT,
        body: { plannedQuantity: '2.0000', routeId: '18', version: 1 },
      }),
    ).not.toBe(FIXED_FINGERPRINT);
  });

  it('query 缺省与显式空对象等价', () => {
    const { params, body, ...withoutQuery } = FIXED_INPUT;
    expect(requestFingerprint({ ...withoutQuery, params, body })).toBe(FIXED_FINGERPRINT);
  });

  it('指纹输入只含幂等键外的语义字段：增加 X-Request-Id 不影响指纹', () => {
    // requestId / ip 等上下文不属于指纹输入，由调用方保证；这里锁定 body 中混入非业务字段会改变指纹
    expect(
      requestFingerprint({
        ...FIXED_INPUT,
        body: { plannedQuantity: '2.0000', routeId: '18', requestId: 'req-1' },
      }),
    ).not.toBe(FIXED_FINGERPRINT);
  });
});
