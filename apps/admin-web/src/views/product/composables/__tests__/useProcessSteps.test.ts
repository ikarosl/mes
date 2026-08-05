import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProcessSteps } from '../useProcessSteps';

const { processSteps, error } = vi.hoisted(() => ({
  processSteps: vi.fn(),
  error: vi.fn(),
}));
vi.mock('../../../../api/product', () => ({
  productApi: { processSteps },
}));
vi.mock('../../../../utils/message', () => ({ EMessage: { error } }));

const pageResult = (items: unknown[], total: number, page: number) => ({
  items,
  total,
  page,
  pageSize: 10,
});

describe('useProcessSteps', () => {
  beforeEach(() => {
    processSteps.mockReset();
    error.mockReset();
    processSteps.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
  });

  it('loads the step list with trimmed page query', async () => {
    const state = useProcessSteps();
    state.query.keyword = '  焊接 ';
    state.query.status = 'disabled';

    await state.loadSteps();

    expect(processSteps).toHaveBeenCalledWith({
      page: 1,
      pageSize: 10,
      keyword: '焊接',
      status: 0,
    });
    expect(state.steps.value).toEqual([]);
    expect(state.total.value).toBe(0);
  });

  it('resets the query to first page and reloads', async () => {
    const state = useProcessSteps();
    state.query.keyword = 'x';
    await state.handlePageChange(3);

    await state.resetQuery();

    expect(state.currentPage.value).toBe(1);
    expect(state.query.keyword).toBe('');
    expect(processSteps).toHaveBeenCalledTimes(2);
  });

  it('discards a late response after the query changes', async () => {
    let resolvePage1!: (value: unknown) => void;
    processSteps.mockImplementation((params: { page: number }) =>
      params.page === 1
        ? new Promise((resolve) => {
            resolvePage1 = resolve;
          })
        : Promise.resolve(pageResult([{ id: '2' }], 1, 2)),
    );
    const state = useProcessSteps();

    const pendingPage1 = state.loadSteps();
    const pendingPage2 = state.handlePageChange(2);
    await pendingPage2;
    resolvePage1(pageResult([{ id: '1' }], 5, 1));
    await pendingPage1;

    expect(state.steps.value).toEqual([{ id: '2' }]);
    expect(state.total.value).toBe(1);
    expect(state.loading.value).toBe(false);
  });

  it('keeps loading until the latest request settles', async () => {
    let resolvePage1!: (value: unknown) => void;
    let resolvePage2!: (value: unknown) => void;
    processSteps.mockImplementation((params: { page: number }) =>
      params.page === 1
        ? new Promise((resolve) => {
            resolvePage1 = resolve;
          })
        : new Promise((resolve) => {
            resolvePage2 = resolve;
          }),
    );
    const state = useProcessSteps();

    const pendingPage1 = state.loadSteps();
    const pendingPage2 = state.handlePageChange(2);
    resolvePage1(pageResult([], 0, 1));
    await pendingPage1;
    expect(state.loading.value).toBe(true); // 旧请求不得提前结束 loading

    resolvePage2(pageResult([{ id: '2' }], 1, 2));
    await pendingPage2;
    expect(state.loading.value).toBe(false);
    expect(state.steps.value).toEqual([{ id: '2' }]);
  });

  it('does not surface a stale request failure', async () => {
    let rejectPage1!: (reason: unknown) => void;
    processSteps.mockImplementation((params: { page: number }) =>
      params.page === 1
        ? new Promise((_, reject) => {
            rejectPage1 = reject;
          })
        : Promise.resolve(pageResult([], 0, 2)),
    );
    const state = useProcessSteps();

    const pendingPage1 = state.loadSteps();
    const pendingPage2 = state.handlePageChange(2);
    await pendingPage2;
    rejectPage1(new Error('500'));
    await pendingPage1;

    expect(error).not.toHaveBeenCalled();
    expect(state.loading.value).toBe(false);
  });
});
