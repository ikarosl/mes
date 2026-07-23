import { Injectable, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { jwtVerify, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import type { JwtClaims, LoginRequest, TokenResponse, UserProfile } from '@company/contracts';
import { toBeijingISOString } from '../../../common/time/beijing-time.js';
import { loadAppConfig } from '../../../config/env.js';
import { IdentityRepository } from './ports/identity.repository.js';

@Injectable()
export class AuthService {
  private readonly config = loadAppConfig();
  constructor(private readonly repository: IdentityRepository) {}
  async login(payload: LoginRequest) {
    const user = await this.repository.findCredentials(payload.username);
    if (!user || !(await bcrypt.compare(payload.password, user.passwordHash)))
      throw new UnauthorizedException('用户名或密码错误');
    const profile = await this.requireProfile(user.id);
    await this.repository.touchLastLogin(user.id);
    const pair = await this.issue(profile);
    await this.repository.saveRefreshToken(pair.record);
    return { response: pair.response, refreshToken: pair.refreshToken };
  }
  async refresh(token: string) {
    const claims = await this.verify(token, 'refresh');
    if (!claims.jti) throw new UnauthorizedException('刷新令牌无效');
    const profile = await this.requireProfile(claims.sub);
    const pair = await this.issue(profile);
    const rotated = await this.repository.rotateRefreshToken(claims.jti, claims.sub, pair.record);
    if (!rotated) throw new UnauthorizedException('刷新令牌已失效');
    return { response: pair.response, refreshToken: pair.refreshToken };
  }
  async logout(token: string | null) {
    if (!token) return;
    try {
      const claims = await this.verify(token, 'refresh');
      if (claims.jti) await this.repository.revokeRefreshToken(claims.jti);
    } catch {
      return;
    }
  }
  async authenticate(token: string) {
    const claims = await this.verify(token, 'access');
    return this.requireProfile(claims.sub);
  }
  private async requireProfile(userId: string) {
    const profile = await this.repository.findProfile(userId);
    if (!profile) throw new UnauthorizedException('用户已停用或不存在');
    return profile;
  }
  private async issue(profile: UserProfile) {
    const now = Math.floor(Date.now() / 1000);
    const jti = randomUUID();
    const accessExpiresAt = now + this.config.accessTokenTtlSeconds;
    const refreshExpiresAt = now + this.config.refreshTokenTtlSeconds;
    const accessToken = await this.sign(profile, 'access', accessExpiresAt);
    const refreshToken = await this.sign(profile, 'refresh', refreshExpiresAt, jti);
    return {
      refreshToken,
      record: { userId: profile.id, jti, expiresAt: new Date(refreshExpiresAt * 1000) },
      response: {
        user: profile,
        accessToken,
        accessTokenExpiresAt: toBeijingISOString(accessExpiresAt * 1000),
        refreshTokenExpiresAt: toBeijingISOString(refreshExpiresAt * 1000),
      } satisfies TokenResponse,
    };
  }
  private sign(profile: UserProfile, kind: 'access' | 'refresh', exp: number, jti?: string) {
    let jwt = new SignJWT({ username: profile.username, kind })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(profile.id)
      .setIssuer(this.config.jwtIssuer)
      .setAudience(this.config.jwtAudience)
      .setIssuedAt()
      .setExpirationTime(exp);
    if (jti) jwt = jwt.setJti(jti);
    return jwt.sign(this.config.jwtSecret);
  }
  private async verify(token: string, kind: 'access' | 'refresh') {
    try {
      const { payload } = await jwtVerify(token, this.config.jwtSecret, {
        algorithms: ['HS256'],
        issuer: this.config.jwtIssuer,
        audience: this.config.jwtAudience,
      });
      const claims = payload as unknown as JwtClaims;
      if (claims.kind !== kind || !claims.sub) throw new Error('kind');
      return claims;
    } catch {
      throw new UnauthorizedException('令牌已过期或无效');
    }
  }
}
