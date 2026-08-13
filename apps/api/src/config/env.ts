import { loadWorkspaceEnv } from '@company/config';

/** API 运行时配置：只包含服务端使用的端口、签发者和 Cookie 安全选项。 */
export interface AppConfig {
  port: number;
  jwtSecret: Uint8Array;
  jwtIssuer: string;
  jwtAudience: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  refreshCookieName: string;
  refreshCookiePath: string;
  refreshCookieSecure: boolean;
  trustProxyHops: number;
}

export interface TechnicalFileStorageConfig {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  forcePathStyle: boolean;
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
    accessTokenTtlSeconds: integer('ACCESS_TOKEN_TTL_SECONDS', 15 * 60),
    refreshTokenTtlSeconds: integer('REFRESH_TOKEN_TTL_SECONDS', 7 * 24 * 60 * 60),
    refreshCookieName: process.env.REFRESH_TOKEN_COOKIE_NAME?.trim() || 'company_refresh_token',
    refreshCookiePath: process.env.REFRESH_TOKEN_COOKIE_PATH ?? '/api/auth',
    refreshCookieSecure: process.env.REFRESH_TOKEN_COOKIE_SECURE === 'true',
    trustProxyHops: nonNegativeInteger('TRUST_PROXY_HOPS', 0),
  };
};

/** 加载唯一的 S3 协议存储配置；本地开发通过 endpoint 连接 MinIO/AIStor。 */
export const loadTechnicalFileStorageConfig = (): TechnicalFileStorageConfig => {
  loadWorkspaceEnv();
  const endpoint = optionalUrl('S3_ENDPOINT');
  return {
    ...(endpoint ? { endpoint } : {}),
    region: process.env.S3_REGION?.trim() || 'us-east-1',
    bucket: required('S3_BUCKET'),
    accessKeyId: required('S3_ACCESS_KEY_ID'),
    secretAccessKey: required('S3_SECRET_ACCESS_KEY'),
    ...(process.env.S3_SESSION_TOKEN?.trim()
      ? { sessionToken: process.env.S3_SESSION_TOKEN.trim() }
      : {}),
    forcePathStyle: boolean('S3_FORCE_PATH_STYLE', Boolean(endpoint)),
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

const boolean = (name: string, fallback: boolean) => {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be true or false`);
};

const optionalUrl = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  try {
    return new URL(value).toString().replace(/\/$/, '');
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
};
