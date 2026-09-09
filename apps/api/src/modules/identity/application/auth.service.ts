import { Injectable } from '@nestjs/common';
import type { LoginRequest, TokenResponse, UserProfile } from '@company/contracts';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { AuthenticationError } from '../domain/auth.errors.js';
import { AuthRepository } from './ports/auth.repository.js';
import { PasswordHasher } from './ports/password-hasher.js';
import { TokenService } from './ports/token.service.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly passwords: PasswordHasher,
    private readonly tokens: TokenService,
  ) {}
  async login(payload: LoginRequest) {
    const user = await this.repository.findCredentials(payload.username);
    if (!user || !(await this.passwords.verify(payload.password, user.passwordHash)))
      throw new AuthenticationError('INVALID_CREDENTIALS', '用户名或密码错误');
    const profile = await this.requireProfile(user.id);
    await this.repository.touchLastLogin(user.id);
    const pair = await this.issue(profile);
    await this.repository.saveRefreshToken(pair.record);
    return { response: pair.response, refreshToken: pair.refreshToken };
  }
  async refresh(token: string) {
    const identity = await this.tokens.verify(token, 'refresh');
    if (!identity.tokenId) throw new AuthenticationError('REFRESH_TOKEN_INVALID', '刷新令牌无效');
    const profile = await this.requireProfile(identity.userId);
    const pair = await this.issue(profile);
    const rotated = await this.repository.rotateRefreshToken(
      identity.tokenId,
      identity.userId,
      pair.record,
    );
    if (!rotated) throw new AuthenticationError('REFRESH_TOKEN_EXPIRED', '刷新令牌已失效');
    return { response: pair.response, refreshToken: pair.refreshToken };
  }
  async logout(token: string | null) {
    if (!token) return;
    try {
      const identity = await this.tokens.verify(token, 'refresh');
      if (identity.tokenId) await this.repository.revokeRefreshToken(identity.tokenId);
    } catch {
      return;
    }
  }
  async authenticate(token: string) {
    const identity = await this.tokens.verify(token, 'access');
    return this.requireProfile(identity.userId);
  }
  private async requireProfile(userId: string) {
    const profile = await this.repository.findProfile(userId);
    if (!profile) throw new AuthenticationError('USER_DISABLED', '用户已停用或不存在');
    return profile;
  }
  private async issue(profile: UserProfile) {
    const pair = await this.tokens.issue(profile);
    return {
      refreshToken: pair.refreshToken,
      record: { userId: profile.id, jti: pair.refreshTokenId, expiresAt: pair.refreshExpiresAt },
      response: {
        user: profile,
        accessToken: pair.accessToken,
        accessTokenExpiresAt: toBeijingISOString(pair.accessExpiresAt),
        refreshTokenExpiresAt: toBeijingISOString(pair.refreshExpiresAt),
      } satisfies TokenResponse,
    };
  }
}
