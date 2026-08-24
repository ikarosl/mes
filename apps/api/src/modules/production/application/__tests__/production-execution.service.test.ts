import { describe, expect, it, vi } from 'vitest';
import { ProductionExecutionService } from '../production-execution.service.js';

const context = { actorId: '7', requestId: 'request-1', ip: null, userAgent: null };

describe('ProductionExecutionService', () => {
  it('only assigns an active employee and forwards a narrow command context', async () => {
    const execution = { assignStep: vi.fn().mockResolvedValue({ stepStatus: 'assigned' }) };
    const identity = {
      listActiveUserOptionsByIds: vi.fn().mockResolvedValue([{ id: '9', displayName: 'Operator' }]),
    };
    const service = new ProductionExecutionService(
      execution as never,
      identity as never,
      {} as never,
    );

    await expect(service.assignStep('1', '2', '9', 0, context)).resolves.toEqual({
      stepStatus: 'assigned',
    });
    expect(execution.assignStep).toHaveBeenCalledWith('1', '2', '9', 0, context);
  });

  it('rejects an inactive assignee before opening the production transaction', async () => {
    const execution = { assignStep: vi.fn() };
    const identity = { listActiveUserOptionsByIds: vi.fn().mockResolvedValue([]) };
    const service = new ProductionExecutionService(
      execution as never,
      identity as never,
      {} as never,
    );

    await expect(service.assignStep('1', '2', '9', 0, context)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(execution.assignStep).not.toHaveBeenCalled();
  });

  it('uses the authenticated actor for worker queries, start, and completion commands', async () => {
    const execution = {
      listWorkerTasks: vi.fn().mockResolvedValue([]),
      startStep: vi.fn().mockResolvedValue({ stepStatus: 'doing' }),
      completeStep: vi.fn().mockResolvedValue({ stepStatus: 'completed' }),
    };
    const service = new ProductionExecutionService(execution as never, {} as never, {} as never);

    await service.listMyTasks(context);
    await service.startStep('1', '2', 3, context);
    await service.completeStep('1', '2', 4, context);
    expect(execution.listWorkerTasks).toHaveBeenCalledWith('7');
    expect(execution.startStep).toHaveBeenCalledWith('1', '2', 3, context);
    expect(execution.completeStep).toHaveBeenCalledWith('1', '2', 4, context);
  });

  it('forwards completion checks and completion with the authenticated command context', async () => {
    const execution = {
      getCompletionCheck: vi.fn().mockResolvedValue({ canComplete: true }),
      completeExecution: vi.fn().mockResolvedValue({ batchStatus: 'completed' }),
    };
    const service = new ProductionExecutionService(execution as never, {} as never, {} as never);

    await service.getCompletionCheck('1');
    await service.completeExecution('1', 3, context);
    expect(execution.getCompletionCheck).toHaveBeenCalledWith('1');
    expect(execution.completeExecution).toHaveBeenCalledWith('1', 3, context);
  });

  it('loads admin and employee SOP content through the frozen snapshot locator', async () => {
    const snapshot = {
      fileId: '5',
      fileName: 'SOP-v1.pdf',
      versionNo: 'V1',
      objectKey: 'sop/v1.pdf',
    };
    const execution = { getStepSopSnapshot: vi.fn().mockResolvedValue(snapshot) };
    const content = {
      readHistoricalSnapshot: vi.fn().mockResolvedValue({
        mimeType: 'application/pdf',
        sizeBytes: 12,
        stream: 'stream',
      }),
    };
    const service = new ProductionExecutionService(
      execution as never,
      {} as never,
      content as never,
    );

    await expect(service.getStepSopContent('1', '2')).resolves.toEqual({
      file: { ...snapshot, mimeType: 'application/pdf', sizeBytes: 12 },
      stream: 'stream',
    });
    await service.getMyStepSopContent('1', '2', context);

    expect(execution.getStepSopSnapshot).toHaveBeenNthCalledWith(1, '1', '2', undefined);
    expect(execution.getStepSopSnapshot).toHaveBeenNthCalledWith(2, '1', '2', '7');
    expect(content.readHistoricalSnapshot).toHaveBeenCalledWith(snapshot);
  });
});
