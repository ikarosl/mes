/** 跨模块稳定错误契约，不包含数据库或 HTTP 类型。 */
export class QualityCommandError extends Error {
  constructor(
    readonly code: 'NOT_FOUND' | 'INVALID_INPUT' | 'INVALID_STATE' | 'CONCURRENT_MODIFICATION',
    message: string,
  ) {
    super(message);
  }
}
