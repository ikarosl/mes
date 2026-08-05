import { describe, expect, it, vi } from 'vitest';
import { RequestError } from '@company/request';
import {
  isAmbiguousFailure,
  stableClientSignature,
  useIdempotentIntent,
} from '../useIdempotentIntent';

const snapshot = {
  scope: 'production.batch.create.v1',
  params: { workOrderId: '10' },
  query: {},
  body: { plannedQuantity: '2.0000', routeId: '18' },
};

describe('useIdempotentIntent', () => {
  it('同一 snapshot 第一次生成键 K1，第二次复用同一键（不重新生成）', async () => {
    const submit = vi
      .fn()
      .mockRejectedValueOnce(new RequestError('网络断开', 0))
      .mockResolvedValueOnce('ok');
    const intent = useIdempotentIntent();

    await expect(intent.execute(snapshot, submit)).rejects.toBeInstanceOf(RequestError);
    await intent.execute(snapshot, submit);

    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[0][0]).toBe(submit.mock.calls[1][0]);
    expect(typeof submit.mock.calls[0][0]).toBe('string');
  });

  it('模糊失败保留意图时，修改 body 后生成新键 K2 ≠ K1', async () => {
    const submit = vi
      .fn()
      .mockRejectedValueOnce(new RequestError('网络断开', 0))
      .mockResolvedValueOnce('ok');
    const intent = useIdempotentIntent();

    await expect(intent.execute(snapshot, submit)).rejects.toBeInstanceOf(RequestError);
    await intent.execute(
      { ...snapshot, body: { plannedQuantity: '5.0000', routeId: '18' } },
      submit,
    );

    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[1][0]).not.toBe(submit.mock.calls[0][0]);
  });

  it('模糊失败保留意图时，修改 params 后生成新键 K2 ≠ K1', async () => {
    const submit = vi
      .fn()
      .mockRejectedValueOnce(new RequestError('网络断开', 0))
      .mockResolvedValueOnce('ok');
    const intent = useIdempotentIntent();

    await expect(intent.execute(snapshot, submit)).rejects.toBeInstanceOf(RequestError);
    await intent.execute({ ...snapshot, params: { workOrderId: '11' } }, submit);

    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[1][0]).not.toBe(submit.mock.calls[0][0]);
  });

  it('成功提交后清除意图，下一次相同 snapshot 生成新键', async () => {
    const submit = vi.fn().mockResolvedValue('ok');
    const intent = useIdempotentIntent();

    await intent.execute(snapshot, submit);
    await intent.execute(snapshot, submit);

    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[1][0]).not.toBe(submit.mock.calls[0][0]);
  });

  it.each([
    ['status 0 网络失败', new RequestError('网络断开', 0)],
    ['status 500 可重试 5xx', new RequestError('服务端错误', 500)],
  ])('模糊失败（%s）保留键：重试同一 snapshot 复用原键', async (_label, error) => {
    const submit = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce('ok');
    const intent = useIdempotentIntent();

    await expect(intent.execute(snapshot, submit)).rejects.toBe(error);
    await intent.execute(snapshot, submit);

    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[1][0]).toBe(submit.mock.calls[0][0]);
  });

  it('明确失败（4xx 业务错误）清除意图，重试生成新键', async () => {
    const submit = vi
      .fn()
      .mockRejectedValueOnce(new RequestError('业务冲突', 409))
      .mockResolvedValueOnce('ok');
    const intent = useIdempotentIntent();

    await expect(intent.execute(snapshot, submit)).rejects.toBeInstanceOf(RequestError);
    await intent.execute(snapshot, submit);

    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[1][0]).not.toBe(submit.mock.calls[0][0]);
  });

  it('非 RequestError 异常视为明确失败，重试生成新键', async () => {
    const submit = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('ok');
    const intent = useIdempotentIntent();

    await expect(intent.execute(snapshot, submit)).rejects.toThrow('boom');
    await intent.execute(snapshot, submit);

    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[1][0]).not.toBe(submit.mock.calls[0][0]);
  });

  it('reset() 清除意图，下一次执行生成新键', async () => {
    const submit = vi
      .fn()
      .mockRejectedValueOnce(new RequestError('网络断开', 0))
      .mockResolvedValueOnce('ok');
    const intent = useIdempotentIntent();

    await expect(intent.execute(snapshot, submit)).rejects.toBeInstanceOf(RequestError);
    intent.reset();
    await intent.execute(snapshot, submit);

    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[1][0]).not.toBe(submit.mock.calls[0][0]);
  });
});

describe('stableClientSignature', () => {
  it('对象键乱序产生相同签名', () => {
    const a = stableClientSignature({
      scope: 's',
      params: { a: 1, b: 2 },
      query: {},
      body: { x: 1, y: 2 },
    });
    const b = stableClientSignature({
      body: { y: 2, x: 1 },
      query: {},
      params: { b: 2, a: 1 },
      scope: 's',
    });
    expect(a).toBe(b);
  });

  it('值为 undefined 的键被忽略', () => {
    const a = stableClientSignature({
      scope: 's',
      params: { a: 1, b: undefined },
      query: {},
      body: null,
    });
    const b = stableClientSignature({ scope: 's', params: { a: 1 }, query: {}, body: null });
    expect(a).toBe(b);
  });

  it('值为 undefined 的 body 被省略，与空对象 body 区分', () => {
    const a = stableClientSignature({ scope: 's', params: {}, query: {}, body: undefined });
    const b = stableClientSignature({ scope: 's', params: {}, query: {}, body: {} });
    expect(a).not.toBe(b);
  });

  it('数组顺序敏感', () => {
    const a = stableClientSignature({
      scope: 's',
      params: { list: [1, 2] },
      query: {},
      body: null,
    });
    const b = stableClientSignature({
      scope: 's',
      params: { list: [2, 1] },
      query: {},
      body: null,
    });
    expect(a).not.toBe(b);
  });

  it('null 与空对象区分', () => {
    const a = stableClientSignature({ scope: 's', params: {}, query: {}, body: null });
    const b = stableClientSignature({ scope: 's', params: {}, query: {}, body: {} });
    expect(a).not.toBe(b);
  });
});

describe('isAmbiguousFailure', () => {
  it('status 0（无响应/断网）视为模糊失败', () => {
    expect(isAmbiguousFailure(new RequestError('网络失败', 0))).toBe(true);
  });

  it('status >= 500 视为模糊失败', () => {
    expect(isAmbiguousFailure(new RequestError('服务端错误', 500))).toBe(true);
    expect(isAmbiguousFailure(new RequestError('服务端错误', 502))).toBe(true);
  });

  it('4xx 业务错误视为明确失败', () => {
    expect(isAmbiguousFailure(new RequestError('参数错误', 400))).toBe(false);
    expect(isAmbiguousFailure(new RequestError('业务冲突', 409))).toBe(false);
  });

  it('非 RequestError 异常视为明确失败', () => {
    expect(isAmbiguousFailure(new Error('boom'))).toBe(false);
    expect(isAmbiguousFailure('string')).toBe(false);
    expect(isAmbiguousFailure(undefined)).toBe(false);
  });
});
