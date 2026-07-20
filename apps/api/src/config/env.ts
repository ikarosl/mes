import { config } from 'dotenv';
config();

export interface AppConfig {
  port: number;
  jwtSecret: Uint8Array;
  jwtIssuer: string;
  jwtAudience: string;
  refreshCookiePath: string;
  refreshCookieSecure: boolean;
}

export const loadAppConfig = (): AppConfig => {
  const secret = required('JWT_SECRET');
  if (secret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters');
  return {
    port: integer('APP_PORT', 3000),
    jwtSecret: new TextEncoder().encode(secret),
    jwtIssuer: required('JWT_ISSUER'),
    jwtAudience: required('JWT_AUDIENCE'),
    refreshCookiePath: process.env.REFRESH_TOKEN_COOKIE_PATH ?? '/api/auth',
    refreshCookieSecure: process.env.REFRESH_TOKEN_COOKIE_SECURE === 'true',
  };
};

const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};
const integer = (name: string, fallback: number) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
};
