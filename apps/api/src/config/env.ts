import { loadWorkspaceEnv } from '@company/config';

/** API 运行时配置：只包含服务端使用的端口、签发者和 Cookie 安全选项。 */
export interface AppConfig {
  port: number;
  jwtSecret: Uint8Array;
  jwtIssuer: string;
  jwtAudience: string;
  refreshCookiePath: string;
  refreshCookieSecure: boolean;
  trustProxyHops: number;
}

export const loadAppConfig = (): AppConfig => {
  // 启动 API 前统一加载工作区根目录 .env，避免受 Turbo 包工作目录影响。
  loadWorkspaceEnv();
  const secret = required('JWT_SECRET');
  if (secret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters');
  return {
    port: integer('APP_PORT', 3000),
    jwtSecret: new TextEncoder().encode(secret),
    jwtIssuer: required('JWT_ISSUER'),
    jwtAudience: required('JWT_AUDIENCE'),
    refreshCookiePath: process.env.REFRESH_TOKEN_COOKIE_PATH ?? '/api/auth',
    refreshCookieSecure: process.env.REFRESH_TOKEN_COOKIE_SECURE === 'true',
    trustProxyHops: nonNegativeInteger('TRUST_PROXY_HOPS', 0),
  };
};

/** 读取非空环境变量，避免带着不完整配置启动服务。 */
const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};
/** 读取正整数环境变量；端口等数值配置缺失时使用安全默认值。 */
const integer = (name: string, fallback: number) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
};
const nonNegativeInteger = (name: string, fallback: number) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 0)
    throw new Error(`${name} must be a non-negative integer`);
  return value;
};
