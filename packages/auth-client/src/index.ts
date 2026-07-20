import { AxiosHeaders, type AxiosError, type AxiosInstance } from 'axios';
import type { LoginRequest, TokenResponse, UserProfile } from '@company/contracts';
import { toRequestError, type RetryRequestConfig } from '@company/request';

export interface AuthSession {
  user: UserProfile;
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
}
export interface AuthApi {
  login(payload: LoginRequest): Promise<TokenResponse>;
  refresh(): Promise<TokenResponse>;
  logout(): Promise<void>;
  me(): Promise<UserProfile>;
}
export interface AuthRequestConfig extends RetryRequestConfig {
  skipAuth?: boolean;
  skipRefresh?: boolean;
}
export interface AuthClientOptions {
  request: AxiosInstance;
  api: AuthApi;
  getSession(): AuthSession | null;
  setSession(session: AuthSession | null): void;
}

const REFRESH_LEEWAY_MS = 30_000;
export class AuthClient {
  private refreshPromise: Promise<AuthSession> | null = null;
  private sessionVersion = 0;
  constructor(private readonly options: AuthClientOptions) {
    this.installInterceptors();
  }
  async login(payload: LoginRequest) {
    const version = this.sessionVersion;
    return this.apply(await this.options.api.login(payload), version);
  }
  async restoreSession() {
    const version = this.sessionVersion;
    return this.apply(await this.options.api.refresh(), version);
  }
  async me() {
    const user = await this.options.api.me();
    const session = this.options.getSession();
    if (session) this.options.setSession({ ...session, user });
    return user;
  }
  async logout() {
    this.clearSession();
    await this.options.api.logout().catch(() => undefined);
  }
  clearSession() {
    this.sessionVersion += 1;
    this.refreshPromise = null;
    this.options.setSession(null);
  }
  private installInterceptors() {
    this.options.request.interceptors.request.use(async (config) => {
      const authConfig = config as typeof config & AuthRequestConfig;
      if (!authConfig.skipAuth) {
        const session = await this.freshSession();
        authConfig.headers = AxiosHeaders.from(authConfig.headers);
        authConfig.headers.set('Authorization', `Bearer ${session.accessToken}`);
      }
      return authConfig;
    });
    this.options.request.interceptors.response.use(undefined, async (error: AxiosError) => {
      const config = error.config as
        (NonNullable<AxiosError['config']> & AuthRequestConfig) | undefined;
      if (config && error.response?.status === 401 && !config.skipAuth && !config.skipRefresh) {
        try {
          const session = await this.refresh();
          config.headers = AxiosHeaders.from(config.headers);
          config.headers.set('Authorization', `Bearer ${session.accessToken}`);
          config.skipRefresh = true;
          return this.options.request.request(config);
        } catch (refreshError) {
          this.clearSession();
          throw toRequestError(refreshError);
        }
      }
      throw error;
    });
  }
  private freshSession() {
    const session = this.options.getSession();
    if (!session) throw new Error('Not authenticated');
    const expiresAt = Date.parse(session.accessTokenExpiresAt);
    return Number.isNaN(expiresAt) || expiresAt - Date.now() <= REFRESH_LEEWAY_MS
      ? this.refresh()
      : Promise.resolve(session);
  }
  private refresh() {
    const session = this.options.getSession();
    if (!session) return Promise.reject(new Error('Not authenticated'));
    const version = this.sessionVersion;
    this.refreshPromise ??= this.options.api
      .refresh()
      .then((data) => this.apply(data, version))
      .catch((error: unknown) => {
        this.clearSession();
        throw error;
      })
      .finally(() => {
        this.refreshPromise = null;
      });
    return this.refreshPromise;
  }
  private apply(data: TokenResponse, version: number) {
    if (version !== this.sessionVersion)
      throw new Error('Session changed before token response was applied');
    const session: AuthSession = {
      user: data.user,
      accessToken: data.accessToken,
      accessTokenExpiresAt: data.accessTokenExpiresAt,
      refreshTokenExpiresAt: data.refreshTokenExpiresAt,
    };
    this.options.setSession(session);
    return session;
  }
}
