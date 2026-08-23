import { describe, expect, it } from 'vitest';
import {
  fixedIntegerQuantity,
  integerQuantity,
  multiplyIntegerQuantities,
} from '../integer-quantity.js';

describe('integer quantity', () => {
  it('accepts integers and the legacy four-zero database representation', () => {
    expect(integerQuantity(12)).toBe(12);
    expect(integerQuantity('12.0000')).toBe(12);
    expect(fixedIntegerQuantity('12')).toBe('12.0000');
  });

  it('rejects fractional, unsafe and out-of-range values', () => {
    expect(() => integerQuantity('0.0001')).toThrow(RangeError);
    expect(() => integerQuantity(1.5)).toThrow(RangeError);
    expect(() => integerQuantity(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
  });

  it('multiplies with integer arithmetic and rejects database overflow', () => {
    expect(multiplyIntegerQuantities('25.0000', '4')).toBe('100.0000');
    expect(() => multiplyIntegerQuantities(99_999_999, 2)).toThrow(RangeError);
  });
});
