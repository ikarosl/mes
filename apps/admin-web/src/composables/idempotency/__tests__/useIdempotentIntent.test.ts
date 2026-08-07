import { describe, expect, it, vi } from 'vitest';
import { RequestError } from '@company/request';
import { IDEMPOTENCY_RESULT_CORRUPT } from '@company/constants';
import {
  isAmbiguousFailure,
  isCorruptFailure,
  isIntentExpired,
  stableClientSignature,
  useIdempotentIntent,
} from '../useIdempotentIntent';

const snapshot = {
  intentType: 'production.batch.create',
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

  it('模糊失败保留意图时，修改 body 后不换键不提交：提示核对结果，reset 后才生成新键', async () => {
    const submit = vi
      .fn()
      .mockRejectedValueOnce(new RequestError('网络断开', 0))
      .mockResolvedValueOnce('ok');
    const intent = useIdempotentIntent();

    await expect(intent.execute(snapshot, submit)).rejects.toBeInstanceOf(RequestError);

    // 修改 body：不静默换键 K2、不盲发新请求，提示先核对结果
    await expect(
      intent.execute({ ...snapshot, body: { plannedQuantity: '5.0000', routeId: '18' } }, submit),
    ).rejects.toThrow(/结果未知/);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(intent.getStatus()).toBe('pending');

    // 显式放弃（确认核对后重新发起）→ 生成新键并提交成功
    intent.reset();
    await intent.execute(
      { ...snapshot, body: { plannedQuantity: '5.0000', routeId: '18' } },
      submit,
    );
    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[1][0]).not.toBe(submit.mock.calls[0][0]);
  });

  it('模糊失败保留意图时，修改 params 后不换键不提交：同样要求先核对结果', async () => {
    const submit = vi
      .fn()
      .mockRejectedValueOnce(new RequestError('网络断开', 0))
      .mockResolvedValueOnce('ok');
    const intent = useIdempotentIntent();

    await expect(intent.execute(snapshot, submit)).rejects.toBeInstanceOf(RequestError);
    await expect(
      intent.execute({ ...snapshot, params: { workOrderId: '11' } }, submit),
    ).rejects.toThrow(/结果未知/);
    expect(submit).toHaveBeenCalledTimes(1);
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

  it('结果损坏后阻塞意图：同内容/改内容重试都不再提交，reset() 显式放弃后恢复', async () => {
    const submit = vi
      .fn()
      .mockRejectedValueOnce(
        new RequestError(
          '已保存的幂等结果无法反序列化',
          500,
          undefined,
          IDEMPOTENCY_RESULT_CORRUPT,
        ),
      );
    const intent = useIdempotentIntent();

    await expect(intent.execute(snapshot, submit)).rejects.toMatchObject({
      code: IDEMPOTENCY_RESULT_CORRUPT,
    });

    // 同内容重试：不调用 submit，直接抛阻塞错误（不进入"同键重试仍失败"死循环）
    await expect(intent.execute(snapshot, submit)).rejects.toThrow(/结果已损坏/);
    expect(submit).toHaveBeenCalledTimes(1);

    // 修改内容也不自动换新键：仍然阻塞，直到用户显式放弃
    await expect(
      intent.execute({ ...snapshot, body: { plannedQuantity: '5.0000', routeId: '18' } }, submit),
    ).rejects.toThrow(/结果已损坏/);
    expect(submit).toHaveBeenCalledTimes(1);

    // 显式放弃（关闭弹窗/重新发起）后恢复，下一次为新意图
    intent.reset();
    const okSubmit = vi.fn().mockResolvedValue('ok');
    await intent.execute(snapshot, okSubmit);
    expect(okSubmit).toHaveBeenCalledTimes(1);
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

  it('Web Crypto 不可用时阻止提交（幂等键安全边界不降级），环境恢复后正常执行', async () => {
    const submit = vi.fn().mockResolvedValue('ok');
    const intent = useIdempotentIntent();

    // 模拟不支持 Web Crypto 的环境：execute 必须拒绝，且不调用 submit
    vi.stubGlobal('crypto', undefined);
    try {
      await expect(intent.execute(snapshot, submit)).rejects.toThrow(/Web Crypto/);
      expect(submit).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }

    // 环境恢复后再次调用：正常生成键并提交
    await intent.execute(snapshot, submit);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(typeof submit.mock.calls[0][0]).toBe('string');
  });
});

describe('getStatus', () => {
  it('初始无提交为 idle', () => {
    const intent = useIdempotentIntent();
    expect(intent.getStatus()).toBe('idle');
  });

  it('模糊失败（网络/可重试 5xx）后为 pending：同键可安全重试', async () => {
    const submit = vi
      .fn()
      .mockRejectedValueOnce(new RequestError('网络断开', 0))
      .mockResolvedValueOnce('ok');
    const intent = useIdempotentIntent();

    await expect(intent.execute(snapshot, submit)).rejects.toBeInstanceOf(RequestError);
    expect(intent.getStatus()).toBe('pending');

    await intent.execute(snapshot, submit);
    expect(intent.getStatus()).toBe('idle'); // 重试成功闭环
  });

  it('结果损坏后为 blocked：不因内容变化恢复，reset 显式放弃后回 idle', async () => {
    const submit = vi
      .fn()
      .mockRejectedValueOnce(
        new RequestError('结果损坏', 500, undefined, IDEMPOTENCY_RESULT_CORRUPT),
      );
    const intent = useIdempotentIntent();

    await expect(intent.execute(snapshot, submit)).rejects.toMatchObject({
      code: IDEMPOTENCY_RESULT_CORRUPT,
    });
    expect(intent.getStatus()).toBe('blocked');

    // 修改内容也不会自动换键恢复提交
    await expect(
      intent.execute({ ...snapshot, body: { plannedQuantity: '9.0000', routeId: '18' } }, submit),
    ).rejects.toThrow(/结果已损坏/);
    expect(intent.getStatus()).toBe('blocked');

    intent.reset();
    expect(intent.getStatus()).toBe('idle');
  });

  it('明确失败（4xx）后为 idle', async () => {
    const submit = vi.fn().mockRejectedValueOnce(new RequestError('业务冲突', 409));
    const intent = useIdempotentIntent();

    await expect(intent.execute(snapshot, submit)).rejects.toBeInstanceOf(RequestError);
    expect(intent.getStatus()).toBe('idle');
  });

  it('成功提交后为 idle', async () => {
    const submit = vi.fn().mockResolvedValue('ok');
    const intent = useIdempotentIntent();

    await intent.execute(snapshot, submit);
    expect(intent.getStatus()).toBe('idle');
  });
});

describe('isIntentExpired', () => {
  it('未超过 12 小时视为未过期', () => {
    expect(isIntentExpired({ firstAttemptAt: Date.now() - 11 * 60 * 60 * 1000 })).toBe(false);
  });

  it('恰好 12 小时不视为过期（服务端保证窗口内）', () => {
    expect(isIntentExpired({ firstAttemptAt: Date.now() - 12 * 60 * 60 * 1000 })).toBe(false);
  });

  it('超过 12 小时视为过期', () => {
    expect(isIntentExpired({ firstAttemptAt: Date.now() - (12 * 60 * 60 * 1000 + 1) })).toBe(true);
  });
});

describe('意图超时（expired）', () => {
  it('超过 12 小时的模糊意图：不再发送 K1、不自动换键，提示核对结果，reset 后重新发起', async () => {
    vi.useFakeTimers();
    try {
      const submit = vi
        .fn()
        .mockRejectedValueOnce(new RequestError('网络断开', 0))
        .mockResolvedValue('ok');
      const intent = useIdempotentIntent();

      await expect(intent.execute(snapshot, submit)).rejects.toBeInstanceOf(RequestError);
      expect(intent.getStatus()).toBe('pending');

      // 超过 12 小时重试窗口：不再发送旧键，也不自动创建新键
      vi.advanceTimersByTime(12 * 60 * 60 * 1000 + 1);
      await expect(intent.execute(snapshot, submit)).rejects.toThrow(/重试窗口/);
      expect(submit).toHaveBeenCalledTimes(1);
      expect(intent.getStatus()).toBe('expired');

      // 修改内容也不会自动换键盲发
      await expect(
        intent.execute({ ...snapshot, body: { plannedQuantity: '5.0000', routeId: '18' } }, submit),
      ).rejects.toThrow(/重试窗口/);
      expect(submit).toHaveBeenCalledTimes(1);

      // 用户显式放弃后重新提交为新意图
      intent.reset();
      await intent.execute(snapshot, submit);
      expect(submit).toHaveBeenCalledTimes(2);
      expect(intent.getStatus()).toBe('idle');
    } finally {
      vi.useRealTimers();
    }
  });

  it('getStatus：超过窗口的 blocked 意图显示 expired（先核对结果再放弃）', async () => {
    vi.useFakeTimers();
    try {
      const submit = vi
        .fn()
        .mockRejectedValueOnce(
          new RequestError('结果损坏', 500, undefined, IDEMPOTENCY_RESULT_CORRUPT),
        );
      const intent = useIdempotentIntent();

      await expect(intent.execute(snapshot, submit)).rejects.toMatchObject({
        code: IDEMPOTENCY_RESULT_CORRUPT,
      });
      expect(intent.getStatus()).toBe('blocked');

      vi.advanceTimersByTime(12 * 60 * 60 * 1000 + 1);
      expect(intent.getStatus()).toBe('expired');

      intent.reset();
      expect(intent.getStatus()).toBe('idle');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('stableClientSignature', () => {
  it('对象键乱序产生相同签名', () => {
    const a = stableClientSignature({
      intentType: 's',
      params: { a: 1, b: 2 },
      query: {},
      body: { x: 1, y: 2 },
    });
    const b = stableClientSignature({
      body: { y: 2, x: 1 },
      query: {},
      params: { b: 2, a: 1 },
      intentType: 's',
    });
    expect(a).toBe(b);
  });

  it('值为 undefined 的键被忽略', () => {
    const a = stableClientSignature({
      intentType: 's',
      params: { a: 1, b: undefined },
      query: {},
      body: null,
    });
    const b = stableClientSignature({ intentType: 's', params: { a: 1 }, query: {}, body: null });
    expect(a).toBe(b);
  });

  it('值为 undefined 的 body 被省略，与空对象 body 区分', () => {
    const a = stableClientSignature({ intentType: 's', params: {}, query: {}, body: undefined });
    const b = stableClientSignature({ intentType: 's', params: {}, query: {}, body: {} });
    expect(a).not.toBe(b);
  });

  it('数组顺序敏感', () => {
    const a = stableClientSignature({
      intentType: 's',
      params: { list: [1, 2] },
      query: {},
      body: null,
    });
    const b = stableClientSignature({
      intentType: 's',
      params: { list: [2, 1] },
      query: {},
      body: null,
    });
    expect(a).not.toBe(b);
  });

  it('null 与空对象区分', () => {
    const a = stableClientSignature({ intentType: 's', params: {}, query: {}, body: null });
    const b = stableClientSignature({ intentType: 's', params: {}, query: {}, body: {} });
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

  it('结果损坏（IDEMPOTENCY_RESULT_CORRUPT）不是模糊失败，即使状态是 500', () => {
    expect(
      isAmbiguousFailure(new RequestError('结果损坏', 500, undefined, IDEMPOTENCY_RESULT_CORRUPT)),
    ).toBe(false);
  });

  it('isCorruptFailure 仅识别 IDEMPOTENCY_RESULT_CORRUPT 错误码', () => {
    expect(
      isCorruptFailure(new RequestError('结果损坏', 500, undefined, IDEMPOTENCY_RESULT_CORRUPT)),
    ).toBe(true);
    expect(isCorruptFailure(new RequestError('普通 500', 500))).toBe(false);
    expect(isCorruptFailure(new Error('boom'))).toBe(false);
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
