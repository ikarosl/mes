import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StartupReadinessService } from '../startup-readiness.service.js';

afterEach(() => vi.restoreAllMocks());

describe('StartupReadinessService', () => {
  it('reports every required dependency when startup begins ready', async () => {
    const check = vi.fn().mockResolvedValue({
      status: 'ok',
      database: { status: 'up' },
      objectStorage: { status: 'up' },
    });
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    await expect(
      new StartupReadinessService({ check } as never).onApplicationBootstrap(),
    ).resolves.toBeUndefined();

    expect(check).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith('启动依赖检查通过：database=up objectStorage=up');
  });

  it('allows startup but warns that readiness is unavailable when dependencies are down', async () => {
    const readiness = {
      status: 'degraded' as const,
      database: { status: 'down' as const, error: 'ECONNREFUSED' },
      objectStorage: { status: 'down' as const, error: 'HTTP_503' },
    };
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const service = new StartupReadinessService({
      check: vi.fn().mockResolvedValue(readiness),
    } as never);

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      '启动依赖检查未通过；API 将继续启动，但就绪状态仍不可用：database=down(code=ECONNREFUSED) objectStorage=down(code=HTTP_503)',
    );
  });
});
