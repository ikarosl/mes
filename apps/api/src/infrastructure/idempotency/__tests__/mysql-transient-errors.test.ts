import { describe, expect, it } from 'vitest';
import { isTransientMysqlError } from '../mysql-transient-errors.js';

/**
 * 构造 mysql2 驱动错误形态：服务器错误 `{ code, errno }`，网络错误只有 code。
 * 逐码断言判定结果，覆盖清单与判断依据见 mysql-transient-errors.ts 顶部注释。
 */
const driverError = (code: string, errno?: number): Error =>
  Object.assign(new Error(`driver error ${code}`), {
    code,
    ...(errno === undefined ? {} : { errno }),
  });

describe('isTransientMysqlError', () => {
  it.each([
    { code: 'ER_LOCK_DEADLOCK', errno: 1213 },
    { code: 'ER_LOCK_WAIT_TIMEOUT', errno: 1205 },
    { code: 'PROTOCOL_CONNECTION_LOST', errno: 2013 },
    { code: 'ECONNRESET' },
    { code: 'EPIPE' },
    { code: 'ETIMEDOUT' },
    { code: 'POOL_CLOSED' },
  ])('$code 判为瞬态', ({ code, errno }) => {
    expect(isTransientMysqlError(driverError(code, errno))).toBe(true);
  });

  it('mysql2 3.23.1 池关闭错误形态（无 code，仅固定消息 "Pool is closed."）判为瞬态', () => {
    expect(isTransientMysqlError(new Error('Pool is closed.'))).toBe(true);
  });

  it('服务器 SQL 错误码（ER_DUP_ENTRY / ER_PARSE_ERROR / ER_NO_SUCH_TABLE）判为非瞬态', () => {
    expect(isTransientMysqlError(driverError('ER_DUP_ENTRY', 1062))).toBe(false);
    expect(isTransientMysqlError(driverError('ER_PARSE_ERROR', 1064))).toBe(false);
    expect(isTransientMysqlError(driverError('ER_NO_SUCH_TABLE', 1146))).toBe(false);
  });

  it('仅有 errno 没有 code 的形态不误判（mysql2 服务器错误总是带 code，不按 errno 猜测）', () => {
    const errnoOnly = Object.assign(new Error('lock wait'), { errno: 1205 });
    expect(isTransientMysqlError(errnoOnly)).toBe(false);
  });

  it('普通业务错误、无 code 错误与相似消息错误判为非瞬态', () => {
    expect(isTransientMysqlError(new Error('业务失败'))).toBe(false);
    expect(isTransientMysqlError(new Error('Pool is closed now?'))).toBe(false);
  });

  it('非错误对象一律判为非瞬态', () => {
    expect(isTransientMysqlError(null)).toBe(false);
    expect(isTransientMysqlError(undefined)).toBe(false);
    expect(isTransientMysqlError('ER_LOCK_DEADLOCK')).toBe(false);
    expect(isTransientMysqlError(1213)).toBe(false);
    expect(isTransientMysqlError({ code: 1213 })).toBe(false);
    expect(isTransientMysqlError({ message: 'Pool is closed.' })).toBe(false);
  });
});
