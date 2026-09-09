import { fixedIntegerQuantity, integerQuantity } from '../domain/integer-quantity.js';

export const fixed = fixedIntegerQuantity;
export const add = (left: number | string, right: number | string): string =>
  fixed(integerQuantity(left) + integerQuantity(right));
export const subtract = (left: number | string, right: number | string): string =>
  fixed(integerQuantity(left) - integerQuantity(right));
