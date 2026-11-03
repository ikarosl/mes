import { QUALITY_INSPECTION_TEMPLATE_CHANGED } from '@company/constants';

/** 跨模块稳定错误契约，不包含数据库或 HTTP 类型。 */
export class QualityCommandError extends Error {
  constructor(
    readonly code:
      | 'NOT_FOUND'
      | 'INVALID_INPUT'
      | 'INVALID_STATE'
      | 'CONCURRENT_MODIFICATION'
      | typeof QUALITY_INSPECTION_TEMPLATE_CHANGED,
    message: string,
  ) {
    super(message);
  }
}
