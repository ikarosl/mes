import { describe, expect, it } from 'vitest';
import { assertJsonValue } from '../json-value.js';

describe('assertJsonValue', () => {
  it('接受 JSON 基本值与嵌套结构', () => {
    expect(() => assertJsonValue('text')).not.toThrow();
    expect(() => assertJsonValue(0)).not.toThrow();
    expect(() => assertJsonValue(1.5)).not.toThrow();
    expect(() => assertJsonValue(false)).not.toThrow();
    expect(() => assertJsonValue(null)).not.toThrow();
    expect(() => assertJsonValue({ a: [1, 'x', null, { b: true }], c: 0 })).not.toThrow();
    expect(() => assertJsonValue([])).not.toThrow();
    expect(() => assertJsonValue({})).not.toThrow();
  });

  it.each([
    ['undefined', undefined],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
    ['bigint', 10n],
    ['symbol', Symbol('x')],
    ['function', () => undefined],
  ])('拒绝非法原始值 %s', (_label, value) => {
    expect(() => assertJsonValue(value)).toThrow(TypeError);
  });

  it.each([
    ['Date', new Date('2026-08-05T00:00:00.000Z')],
    ['Map', new Map([['a', 1]])],
    ['Set', new Set([1])],
  ])('拒绝类实例/不可序列化对象 %s', (_label, value) => {
    expect(() => assertJsonValue(value)).toThrow(TypeError);
  });

  it('拒绝自定义类实例（非普通对象）', () => {
    class CustomType {
      a = 1;
    }
    expect(() => assertJsonValue(new CustomType())).toThrow(TypeError);
  });

  it('拒绝循环引用', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => assertJsonValue({ a: circular })).toThrow(TypeError);
  });

  it('拒绝稀疏数组（含空槽）', () => {
    const sparse: unknown[] = [];
    sparse.length = 3;
    expect(() => assertJsonValue(sparse)).toThrow(TypeError);
  });

  it('拒绝对象中的 undefined 字段（隐式丢弃语义不安全）', () => {
    expect(() => assertJsonValue({ a: undefined })).toThrow(TypeError);
  });
});
