import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMessage } from '../../../utils/message';
import { useRefreshableOptions } from '../useRefreshableOptions';

vi.mock('../../../utils/message', () => ({
  EMessage: { warning: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

describe('useRefreshableOptions', () => {
  const warning = vi.mocked(EMessage.warning);

  beforeEach(() => {
    warning.mockReset();
  });

  it('每次 refresh() 都重新请求 API', async () => {
    const request = vi.fn().mockResolvedValue(['a']);
    const source = useRefreshableOptions(request, '失败提示');

    expect(source.status.value).toBe('idle');
    await source.refresh();
    await source.refresh();

    expect(request).toHaveBeenCalledTimes(2);
    expect(source.options.value).toEqual(['a']);
    expect(source.status.value).toBe('ready');
  });

  it('后请求先返回时，旧响应不覆盖（last-request-wins）', async () => {
    let resolveFirst!: (v: string[]) => void;
    const request = vi
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce(['second']);
    const source = useRefreshableOptions(request, '失败提示');

    const first = source.refresh();
    const second = source.refresh();
    resolveFirst(['first']);
    await Promise.all([first, second]);

    expect(source.options.value).toEqual(['second']);
  });

  it('旧请求失败不产生错误提示', async () => {
    let rejectFirst!: (e: unknown) => void;
    const request = vi
      .fn()
      .mockImplementationOnce(() => new Promise((_, reject) => (rejectFirst = reject)))
      .mockResolvedValueOnce(['ok']);
    const source = useRefreshableOptions(request, '失败提示');

    const first = source.refresh();
    const second = source.refresh();
    rejectFirst(new Error('old fail'));
    await Promise.all([first, second]);

    expect(warning).not.toHaveBeenCalled();
    expect(source.options.value).toEqual(['ok']);
  });

  it('最新刷新失败保留上一次成功候选并提示', async () => {
    const request = vi.fn().mockResolvedValueOnce(['a']).mockRejectedValueOnce(new Error('fail'));
    const source = useRefreshableOptions(request, '失败提示');

    await source.refresh();
    await source.refresh();

    expect(source.options.value).toEqual(['a']);
    expect(source.status.value).toBe('error');
    expect(warning).toHaveBeenCalledWith('失败提示');
  });

  it('每次调用得到独立状态实例', async () => {
    const request = vi.fn().mockResolvedValue(['a']);
    const sourceA = useRefreshableOptions(request, '失败提示');
    const sourceB = useRefreshableOptions(request, '失败提示');

    await sourceA.refresh();

    expect(sourceA.status.value).toBe('ready');
    expect(sourceB.status.value).toBe('idle');
    expect(sourceA.options).not.toBe(sourceB.options);
  });
});
