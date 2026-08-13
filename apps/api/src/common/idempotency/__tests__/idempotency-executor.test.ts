import { describe, expect, it, vi } from 'vitest';
import {
  IdempotencyExecutor,
  type IdempotencyExecution,
  type IdempotencyResultCodec,
  type IdempotentCommand,
} from '../idempotency-executor.js';

class ExecutingTestExecutor extends IdempotencyExecutor {
  async execute<TResult>(
    command: IdempotentCommand<TResult>,
  ): Promise<IdempotencyExecution<TResult>> {
    return { result: await command.handler(), isReplay: false };
  }
}

class ReplayingTestExecutor extends IdempotencyExecutor {
  constructor(private readonly savedResult: unknown) {
    super();
  }

  async execute<TResult>(
    command: IdempotentCommand<TResult>,
  ): Promise<IdempotencyExecution<TResult>> {
    return {
      result: command.resultCodec.decode(this.savedResult),
      isReplay: true,
    };
  }
}

/**
 * 按接口契约实现 canonical 化语义的适配器（与 MySQL 适配器一致）：首次执行保存
 * `encode(handler 结果)` 并返回 `decode(encoded)`，重放返回 `decode(已保存 JSON)`——
 * 两条路径返回同一 canonical 产物。
 */
class CanonicalizingTestExecutor extends IdempotencyExecutor {
  private readonly saved = new Map<string, unknown>();

  async execute<TResult>(
    command: IdempotentCommand<TResult>,
  ): Promise<IdempotencyExecution<TResult>> {
    const stored = this.saved.get(command.key);
    if (stored !== undefined) {
      return { result: command.resultCodec.decode(stored), isReplay: true };
    }
    const result = await command.handler();
    const encoded = command.resultCodec.encode(result);
    this.saved.set(command.key, encoded);
    return { result: command.resultCodec.decode(encoded), isReplay: false };
  }
}

const command = (handler: IdempotentCommand<{ id: string }>['handler']) => ({
  scope: 'production.batch.create.v1',
  key: '018f14a8-8f10-7d3a-a825-3d7ce6c9bc41',
  actorId: '9',
  requestId: 'req-9-batch-create-1',
  request: { params: { workOrderId: '10' }, body: { plannedQuantity: '2.0000' } },
  resultCodec: {
    encode: (result: { id: string }) => result,
    decode: (stored: unknown) => {
      if (
        typeof stored !== 'object' ||
        stored === null ||
        !('id' in stored) ||
        typeof stored.id !== 'string'
      ) {
        throw new Error('invalid stored result');
      }
      return { id: stored.id };
    },
  },
  handler,
});

describe('IdempotencyExecutor contract', () => {
  it('returns a newly executed business result through the protocol-independent port', async () => {
    const handler = vi.fn().mockResolvedValue({ id: '20' });

    await expect(new ExecutingTestExecutor().execute(command(handler))).resolves.toEqual({
      result: { id: '20' },
      isReplay: false,
    });
    expect(handler).toHaveBeenCalledOnce();
  });

  it('allows an adapter to replay a saved result without invoking the business handler', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('must not execute'));
    const executor = new ReplayingTestExecutor({ id: '20' });

    await expect(executor.execute(command(handler))).resolves.toEqual({
      result: { id: '20' },
      isReplay: true,
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects an invalid saved result instead of executing the business handler again', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('must not execute'));
    const executor = new ReplayingTestExecutor({ unknown: true });

    await expect(executor.execute(command(handler))).rejects.toThrow('invalid stored result');
    expect(handler).not.toHaveBeenCalled();
  });

  it('首次返回与重放返回完全相同的 canonical 结果：encode 会改写数据的 codec 也由首次即规范化', async () => {
    // 会改写数据的假 codec：encode 时 trim 字段值并丢弃冗余字段，decode 后形状与 handler 原始
    // 结果不同——用于证明框架层保证不依赖 codec 自觉（canonical 化由 executor 承担）。
    const rewritingCodec: IdempotencyResultCodec<{
      id: string;
      name: string;
      extra?: string;
    }> = {
      encode: (result) => ({ id: result.id.trim(), name: result.name.trim() }),
      decode: (stored) => {
        if (typeof stored !== 'object' || stored === null) throw new Error('invalid stored result');
        const value = stored as { id?: unknown; name?: unknown };
        if (typeof value.id !== 'string' || typeof value.name !== 'string')
          throw new Error('invalid stored result');
        return { id: value.id, name: value.name };
      },
    };
    const makeRewritingCommand = (
      handler: IdempotentCommand<{ id: string; name: string; extra?: string }>['handler'],
    ): IdempotentCommand<{ id: string; name: string; extra?: string }> => ({
      scope: 'production.batch.create.v1',
      key: '018f14a8-8f10-7d3a-a825-3d7ce6c9bc41',
      actorId: '9',
      requestId: 'req-9-batch-create-1',
      request: { params: { workOrderId: '10' }, body: { plannedQuantity: '2.0000' } },
      resultCodec: rewritingCodec,
      handler,
    });

    const executor = new CanonicalizingTestExecutor();
    const first = await executor.execute(
      makeRewritingCommand(
        vi.fn().mockResolvedValue({ id: ' 20 ', name: ' 张三 ', extra: 'ignored' }),
      ),
    );
    const replay = await executor.execute(
      makeRewritingCommand(vi.fn().mockRejectedValue(new Error('must not execute'))),
    );

    // 首次与重放返回同一 canonical 值：trim 与删字段在首次即生效，而不是首次返回原始结果
    expect(first).toEqual({ result: { id: '20', name: '张三' }, isReplay: false });
    expect(replay).toEqual({ result: { id: '20', name: '张三' }, isReplay: true });
    expect(first.result).toEqual(replay.result);
  });
});
