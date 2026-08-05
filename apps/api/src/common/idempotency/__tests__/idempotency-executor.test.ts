import { describe, expect, it, vi } from 'vitest';
import {
  IdempotencyExecutor,
  type IdempotencyExecution,
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
});
