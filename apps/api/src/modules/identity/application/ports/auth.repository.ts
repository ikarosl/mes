import type {
  CredentialUser,
  IdentityProfile,
  RefreshTokenRecord,
} from '../../domain/identity.types.js';

export abstract class AuthRepository {
  abstract findCredentials(username: string): Promise<CredentialUser | null>;
  abstract findProfile(userId: string): Promise<IdentityProfile | null>;
  abstract touchLastLogin(userId: string): Promise<void>;
  abstract saveRefreshToken(token: RefreshTokenRecord): Promise<void>;
  abstract rotateRefreshToken(
    oldJti: string,
    userId: string,
    replacement: RefreshTokenRecord,
  ): Promise<boolean>;
  abstract revokeRefreshToken(jti: string): Promise<void>;
}
