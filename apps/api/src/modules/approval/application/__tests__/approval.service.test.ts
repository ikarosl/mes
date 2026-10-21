import { describe, expect, it, vi } from 'vitest';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import { ApprovalService } from '../approval.service.js';

const context: CommandContext = {
  actorId: '7',
  requestId: 'approval-test',
  ip: null,
  userAgent: null,
};
const submission = { sceneCode: 'product.bom.approve', subjectId: '11', expectedVersion: 0 };

describe('ApprovalService caller boundaries', () => {
  it('rejects list and detail queries without an authenticated actor before accessing storage', () => {
    const repository = { listInstances: vi.fn(), getInstance: vi.fn() };
    const service = new ApprovalService(repository as never, {} as never);
    expect(() => service.listInstances({ scope: 'all' }, '', true)).toThrow('缺少当前用户上下文');
    expect(() => service.getInstance('11', '', true)).toThrow('缺少当前用户上下文');
    expect(repository.listInstances).not.toHaveBeenCalled();
    expect(repository.getInstance).not.toHaveBeenCalled();
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648])(
    'rejects invalid submitted business version %s',
    (expectedVersion) => {
      const repository = { submit: vi.fn() };
      const service = new ApprovalService(repository as never, {} as never);
      expect(() => service.submit({ ...submission, expectedVersion }, context)).toThrow(
        '请提供有效的业务对象版本',
      );
      expect(repository.submit).not.toHaveBeenCalled();
    },
  );

  it('rejects submission without an actor even when the submitted version is valid', () => {
    const repository = { submit: vi.fn() };
    const service = new ApprovalService(repository as never, {} as never);
    expect(() => service.submit(submission, { ...context, actorId: null })).toThrow(
      '缺少当前用户上下文',
    );
    expect(repository.submit).not.toHaveBeenCalled();
  });

  it('passes an unchanged business version to the shared submission engine', async () => {
    const result = { id: '15', currentStepId: '21', status: 'pending' };
    const repository = { submit: vi.fn().mockResolvedValue(result) };
    const service = new ApprovalService(repository as never, {} as never);
    await expect(service.submit(submission, context)).resolves.toBe(result);
    expect(repository.submit).toHaveBeenCalledWith(submission, context);
  });
});
