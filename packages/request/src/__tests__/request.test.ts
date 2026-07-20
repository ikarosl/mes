import { describe, expect, it } from 'vitest';
import { toRequestError } from '../index.js';

describe('request errors', () => {
  it('preserves regular Error instances', () => {
    const error = new Error('failed');
    expect(toRequestError(error)).toBe(error);
  });
});
