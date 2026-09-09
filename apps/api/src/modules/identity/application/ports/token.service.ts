import type { AuthTokenKind } from '@company/contracts';

export interface TokenSubject {
  id: string;
  username: string;
}

export interface IssuedTokenPair {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  refreshTokenId: string;
}

export interface VerifiedTokenIdentity {
  userId: string;
  tokenId?: string;
}

/** 认证用例只接收身份和有效期；签名算法、密钥、SDK 声明留在 Adapter。 */
export abstract class TokenService {
  abstract issue(subject: TokenSubject): Promise<IssuedTokenPair>;
  abstract verify(token: string, kind: AuthTokenKind): Promise<VerifiedTokenIdentity>;
}
