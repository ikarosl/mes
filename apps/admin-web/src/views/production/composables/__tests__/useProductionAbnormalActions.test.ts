import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestError } from '@company/request';
import { useProductionAbnormalActions } from '../useProductionAbnormalActions';

const EMessage = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}));
vi.mock('../../../../utils/message', () => ({ EMessage }));

const disposition = { dispositionId: '8', version: 2 };
const rework = { reworkId: '5' };

const createActions = (overrides: Record<string, ReturnType<typeof vi.fn>> = {}) => {
  const actions = {
    approveRework: vi.fn(async () => undefined),
    rejectDisposition: vi.fn(async () => undefined),
    approveScrapSupplement: vi.fn(async () => undefined),
    startRework: vi.fn(async () => undefined),
    completeRework: vi.fn(async () => undefined),
    ...overrides,
  };
  return { actions, handlers: useProductionAbnormalActions(actions) };
};

describe('useProductionAbnormalActions', () => {
  beforeEach(() => {
    Object.values(EMessage).forEach((mock) => mock.mockReset());
  });

  it('approves rework with the review remark and reports success', async () => {
    const { actions, handlers } = createActions();
    await handlers.handleApproveRework(disposition as never, ' 返工备注 ');
    expect(actions.approveRework).toHaveBeenCalledWith(disposition, ' 返工备注 ');
    expect(EMessage.success).toHaveBeenCalledWith('异常已批准返工');
  });

  it('reports an approve-rework failure with the refresh fallback', async () => {
    const error = new RequestError('网络断开', 0);
    const { handlers } = createActions({
      approveRework: vi.fn(async () => {
        throw error;
      }),
    });
    await handlers.handleApproveRework(disposition as never, '备注');
    expect(EMessage.error).toHaveBeenCalledWith(error, '批准返工失败，请刷新后重试');
  });

  it('rejects the disposition and reports success', async () => {
    const { actions, handlers } = createActions();
    await handlers.handleRejectDisposition(disposition as never, '原因');
    expect(actions.rejectDisposition).toHaveBeenCalledWith(disposition, '原因');
    expect(EMessage.success).toHaveBeenCalledWith('异常处置已驳回');
  });

  it('approves the scrap supplement with the staged plan version and reports success', async () => {
    const { actions, handlers } = createActions();
    await handlers.handleApproveScrapSupplement(disposition as never, 3);
    expect(actions.approveScrapSupplement).toHaveBeenCalledWith(disposition, 3);
    expect(EMessage.success).toHaveBeenCalledWith('异常已批准报废并生成补料需求');
  });

  it('reports a scrap-confirm failure (including version conflicts) with the candidate check fallback', async () => {
    const error = new RequestError('方案版本已变化', 409);
    const { handlers } = createActions({
      approveScrapSupplement: vi.fn(async () => {
        throw error;
      }),
    });
    await expect(handlers.handleApproveScrapSupplement(disposition as never, 3)).rejects.toBe(
      error,
    );
    expect(EMessage.error).toHaveBeenCalledWith(
      error,
      '报废补料批准失败，请刷新后核对候选物料和数量',
    );
  });

  it('starts and completes reworks with success messages', async () => {
    const { actions, handlers } = createActions();
    await handlers.handleStartRework(rework as never);
    expect(actions.startRework).toHaveBeenCalledWith(rework);
    expect(EMessage.success).toHaveBeenCalledWith('返工已开始');
    await handlers.handleCompleteRework(rework as never, 1, 1, ' 备注 ');
    expect(actions.completeRework).toHaveBeenCalledWith(rework, 1, 1, ' 备注 ');
    expect(EMessage.success).toHaveBeenCalledWith('返工已完成并生成报工事实');
  });
});
