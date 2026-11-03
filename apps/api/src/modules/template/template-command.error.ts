export type TemplateErrorCode = 'VALIDATION_ERROR' | 'NOT_FOUND' | 'CONFLICT' | 'FORBIDDEN';

/** 跨模块稳定错误契约，不包含数据库或 HTTP 类型。 */
export class TemplateCommandError extends Error {
  constructor(
    readonly code: TemplateErrorCode,
    message: string,
  ) {
    super(message);
  }
}
