import { describe, expect, it, vi } from 'vitest';
import { DATABASE_TIME_ZONE, initializeDatabaseConnection } from '../index.js';

describe('database timezone', () => {
  it('initializes every database connection in Beijing time', () => {
    const query = vi.fn();

    initializeDatabaseConnection({ query } as never);

    expect(DATABASE_TIME_ZONE).toBe('+08:00');
    expect(query).toHaveBeenCalledWith("SET time_zone = '+08:00'");
  });
});
