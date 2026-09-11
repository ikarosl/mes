import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useApprovalInstances } from '../useApprovalInstances';
import { instanceListItem } from '../../__tests__/fixtures';

const { instances, error } = vi.hoisted(() => ({
  instances: vi.fn(),
  error: vi.fn(),
}));
vi.mock('../../../../api/approval', () => ({ approvalApi: { instances } }));
vi.mock('../../../../utils/message', () => ({ EMessage: { error } }));

describe('useApprovalInstances', () => {
  beforeEach(() => {
    instances.mockReset();
    error.mockReset();
    instances.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
  });

  it('uses all scope by default and sends an explicit status only when selected', async () => {
    const state = useApprovalInstances();

    await state.load();
    expect(instances).toHaveBeenNthCalledWith(1, {
      page: 1,
      pageSize: 10,
      scope: 'all',
      status: undefined,
      subjectId: undefined,
    });

    state.query.scope = 'mine';
    state.query.status = 'rejected';
    state.query.subjectId = ' product-2 ';
    await state.search();

    expect(instances).toHaveBeenNthCalledWith(2, {
      page: 1,
      pageSize: 10,
      scope: 'mine',
      status: 'rejected',
      subjectId: 'product-2',
    });
  });

  it('supports todo as a server scope and reset returns to all without a status filter', async () => {
    const state = useApprovalInstances();
    state.query.scope = 'todo';
    await state.load();

    expect(instances).toHaveBeenNthCalledWith(1, {
      page: 1,
      pageSize: 10,
      scope: 'todo',
      status: undefined,
      subjectId: undefined,
    });

    state.query.status = 'approved';
    await state.reset();
    expect(state.query).toEqual({ scope: 'all', status: '', subjectId: '' });
    expect(instances).toHaveBeenNthCalledWith(2, {
      page: 1,
      pageSize: 10,
      scope: 'all',
      status: undefined,
      subjectId: undefined,
    });
  });

  it('keeps the newest query result when responses arrive out of order', async () => {
    let resolveOld!: (value: unknown) => void;
    instances.mockImplementationOnce(() => new Promise((resolve) => (resolveOld = resolve)));
    instances.mockResolvedValueOnce({
      items: [instanceListItem({ id: 'new' })],
      total: 1,
      page: 1,
      pageSize: 10,
    });
    const state = useApprovalInstances();

    const oldLoad = state.load();
    state.query.scope = 'mine';
    const newLoad = state.load();
    await newLoad;
    resolveOld({ items: [instanceListItem({ id: 'old' })], total: 1, page: 1, pageSize: 10 });
    await oldLoad;

    expect(state.items.value.map((item) => item.id)).toEqual(['new']);
    expect(state.loading.value).toBe(false);
    expect(error).not.toHaveBeenCalled();
  });
});
