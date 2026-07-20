import {
  AUTH_API,
  type LoginRequest,
  type TokenResponse,
  type UserProfile,
} from '@company/contracts';
import {
  AuthClient,
  type AuthApi,
  type AuthClientOptions,
  type AuthRequestConfig,
} from '@company/auth-client';
import { toRequestError } from '@company/request';
import { httpClient } from './http';
const request = async <T>(config: AuthRequestConfig) => {
  try {
    return (await httpClient.request<T>(config)).data;
  } catch (error) {
    throw toRequestError(error);
  }
};
export const authApi: AuthApi = {
  login: (payload: LoginRequest) =>
    request<TokenResponse>({
      url: AUTH_API.login,
      method: 'POST',
      data: payload,
      skipAuth: true,
      skipRefresh: true,
      withCredentials: true,
      skipRetry: true,
    }),
  refresh: () =>
    request<TokenResponse>({
      url: AUTH_API.refresh,
      method: 'POST',
      skipAuth: true,
      skipRefresh: true,
      withCredentials: true,
      skipRetry: true,
    }),
  logout: () =>
    request<void>({
      url: AUTH_API.logout,
      method: 'POST',
      skipAuth: true,
      skipRefresh: true,
      withCredentials: true,
      skipRetry: true,
    }),
  me: () => request<UserProfile>({ url: AUTH_API.me, method: 'GET' }),
};
export const createAuthClient = (accessors: Pick<AuthClientOptions, 'getSession' | 'setSession'>) =>
  new AuthClient({ request: httpClient, api: authApi, ...accessors });
