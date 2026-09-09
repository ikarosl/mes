import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import type { AuthTokenKind } from '@company/contracts';
import { loadAppConfig } from '../../../config/env.js';
import { AuthenticationError } from '../domain/auth.errors.js';
import {
  TokenService,
  type IssuedTokenPair,
  type TokenSubject,
  type VerifiedTokenIdentity,
} from '../application/ports/token.service.js';

@Injectable()
export class JwtTokenService extends TokenService {
  private readonly config = loadAppConfig();

  async issue(subject: TokenSubject): Promise<IssuedTokenPair> {
    const now = Math.floor(Date.now() / 1000);
    const refreshTokenId = randomUUID();
    const accessExpiresAt = now + this.config.accessTokenTtlSeconds;
    const refreshExpiresAt = now + this.config.refreshTokenTtlSeconds;
    const accessToken = await this.sign(subject, 'access', accessExpiresAt);
    const refreshToken = await this.sign(subject, 'refresh', refreshExpiresAt, refreshTokenId);
    return {
      accessToken,
      refreshToken,
      accessExpiresAt: new Date(accessExpiresAt * 1000),
      refreshExpiresAt: new Date(refreshExpiresAt * 1000),
      refreshTokenId,
    };
  }

  async verify(token: string, kind: AuthTokenKind): Promise<VerifiedTokenIdentity> {
    try {
      const { payload } = await jwtVerify(token, this.config.jwtSecret, {
        algorithms: ['HS256'],
        issuer: this.config.jwtIssuer,
        audience: this.config.jwtAudience,
      });
      if (payload.kind !== kind || typeof payload.sub !== 'string' || !payload.sub)
        throw new Error('kind');
      return { userId: payload.sub, tokenId: payload.jti };
    } catch {
      throw new AuthenticationError('TOKEN_INVALID', '令牌已过期或无效');
    }
  }

  private sign(
    subject: TokenSubject,
    kind: AuthTokenKind,
    exp: number,
    jti?: string,
  ): Promise<string> {
    let jwt = new SignJWT({ username: subject.username, kind })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(subject.id)
      .setIssuer(this.config.jwtIssuer)
      .setAudience(this.config.jwtAudience)
      .setIssuedAt()
      .setExpirationTime(exp);
    if (jti) jwt = jwt.setJti(jti);
    return jwt.sign(this.config.jwtSecret);
  }
}
