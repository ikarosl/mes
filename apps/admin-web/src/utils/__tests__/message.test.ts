import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestError } from '@company/request';

const { errorMessage, infoMessage, warningMessage } = vi.hoisted(() => ({
  errorMessage: vi.fn(),
  infoMessage: vi.fn(),
  warningMessage: vi.fn(),
}));

vi.mock('element-plus', () => ({
  ElMessage: {
    error: errorMessage,
    info: infoMessage,
    success: vi.fn(),
    warning: warningMessage,
  },
}));

import { handleHttpError } from '../../api/error-handler.js';
import { EMessage, resetErrorMessageMergeForTests } from '../message.js';

describe('EMessage.error', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    errorMessage.mockReset();
    infoMessage.mockReset();
    warningMessage.mockReset();
    resetErrorMessageMergeForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not notify an error already handled by the global HTTP interceptor', () => {
    const error = new RequestError('编码或版本已存在', 409, undefined, 'CONFLICT');
    handleHttpError(error, {
      notify: (message) => errorMessage(message),
      onForbidden: vi.fn(),
      onUnauthorized: vi.fn(),
    });

    EMessage.error(error, '分类保存失败');

    expect(errorMessage).toHaveBeenCalledOnce();
    expect(errorMessage).toHaveBeenCalledWith('编码或版本已存在');
  });

  it('continues to notify local page errors', () => {
    EMessage.error(new Error('本地处理失败'), '分类保存失败');

    expect(errorMessage).toHaveBeenCalledOnce();
    expect(errorMessage).toHaveBeenCalledWith('本地处理失败');
  });

  it('merges repeated identical errors inside the window into one summary', () => {
    const networkError = '网络连接失败，请检查网络后重试';

    EMessage.error(networkError);
    EMessage.error(networkError);
    EMessage.error(new Error(networkError));
    expect(errorMessage).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(3_000);
    expect(infoMessage).toHaveBeenCalledOnce();
    expect(infoMessage).toHaveBeenCalledWith('另有 2 条相同错误，已合并提示');
  });

  it('shows distinct error texts immediately without swallowing any of them', () => {
    EMessage.error('网络连接失败，请检查网络后重试');
    EMessage.error('服务器内部错误，请稍后重试');

    expect(errorMessage).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(3_000);
    expect(infoMessage).not.toHaveBeenCalled();
  });

  it('stops merging once the window has elapsed', () => {
    EMessage.error('网络连接失败，请检查网络后重试');
    vi.advanceTimersByTime(3_000);
    EMessage.error('网络连接失败，请检查网络后重试');

    expect(errorMessage).toHaveBeenCalledTimes(2);
  });

  it('keeps warnings unthrottled', () => {
    EMessage.warning('选项加载失败');
    EMessage.warning('选项加载失败');

    expect(warningMessage).toHaveBeenCalledTimes(2);
    expect(infoMessage).not.toHaveBeenCalled();
  });
});
