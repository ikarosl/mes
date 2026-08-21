import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { HealthController } from '../health.controller.js';

describe('HealthController readiness', () => {
  it('returns 200 and the health payload when dependencies are up', async () => {
    const health = {
      check: vi.fn().mockResolvedValue({
        status: 'ok',
        database: { status: 'up' },
        objectStorage: { status: 'up' },
      }),
    };
    const status = vi.fn();
    const response = { status };

    await expect(new HealthController(health as never).ready(response as never)).resolves.toEqual({
      status: 'ok',
      database: { status: 'up' },
      objectStorage: { status: 'up' },
    });
    expect(status).toHaveBeenCalledWith(200);
  });

  it('returns 503 when any dependency is down', async () => {
    const health = {
      check: vi.fn().mockResolvedValue({
        status: 'degraded',
        database: { status: 'down', error: 'ECONNREFUSED' },
        objectStorage: { status: 'up' },
      }),
    };
    const status = vi.fn();
    const response = { status };

    await new HealthController(health as never).ready(response as never);

    expect(status).toHaveBeenCalledWith(503);
  });
});
