import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestError } from '@company/request';

const { errorMessage } = vi.hoisted(() => ({ errorMessage: vi.fn() }));

vi.mock('element-plus', () => ({
  ElMessage: {
    error: errorMessage,
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

import { handleHttpError } from '../../api/error-handler.js';
import { EMessage } from '../message.js';

describe('EMessage.error', () => {
  beforeEach(() => {
    errorMessage.mockReset();
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
});
