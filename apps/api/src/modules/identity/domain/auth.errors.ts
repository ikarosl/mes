/**
 * 认证失败的协议无关错误。application 层不抛 Nest HTTP 异常；401 的 HTTP 语义
 * 由 presentation 层（auth.controller / auth.guard）捕获后映射为 401 响应。
 */
export type AuthenticationErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'REFRESH_TOKEN_INVALID'
  | 'REFRESH_TOKEN_EXPIRED'
  | 'USER_DISABLED'
  | 'TOKEN_INVALID';

export class AuthenticationError extends Error {
  constructor(
    readonly code: AuthenticationErrorCode,
    message: string,
  ) {
    super(message);
  }
}
