import { Inject, Injectable } from '@nestjs/common';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '@company/database';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { type AuthRepository } from '../application/ports/auth.repository.js';
import type {
  CredentialUser,
  IdentityProfile,
  RefreshTokenRecord,
} from '../domain/identity.types.js';

type UserRow = RowDataPacket & {
  id: number;
  username: string;
  password_hash: string;
  display_name: string;
};

@Injectable()
export class MysqlAuthRepository implements AuthRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async findCredentials(username: string): Promise<CredentialUser | null> {
    const [rows] = await this.pool.query<UserRow[]>(
      'SELECT id,username,password_hash,display_name FROM users WHERE username=? AND status=1 AND deleted_at IS NULL LIMIT 1',
      [username],
    );
    const row = rows[0];
    return row
      ? {
          id: String(row.id),
          username: row.username,
          passwordHash: row.password_hash,
          displayName: row.display_name,
        }
      : null;
  }

  async findProfile(userId: string): Promise<IdentityProfile | null> {
    const [rows] = await this.pool.query<UserRow[]>(
      'SELECT id,username,password_hash,display_name FROM users WHERE id=? AND status=1 AND deleted_at IS NULL LIMIT 1',
      [userId],
    );
    const row = rows[0];
    if (!row) return null;
    const [roleRows] = await this.pool.query<(RowDataPacket & { code: string })[]>(
      'SELECT r.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=? AND r.status=1 AND r.deleted_at IS NULL ORDER BY r.code',
      [userId],
    );
    const [permissionRows] = await this.pool.query<(RowDataPacket & { code: string })[]>(
      'SELECT DISTINCT p.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id JOIN role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.id=rp.permission_id WHERE ur.user_id=? AND r.status=1 AND r.deleted_at IS NULL AND p.status=1 AND p.deleted_at IS NULL ORDER BY p.code',
      [userId],
    );
    return {
      id: String(row.id),
      username: row.username,
      displayName: row.display_name,
      roles: roleRows.map((item) => item.code),
      permissions: permissionRows.map((item) => item.code),
    };
  }

  async touchLastLogin(userId: string): Promise<void> {
    await this.pool.execute('UPDATE users SET last_login_at=NOW() WHERE id=?', [userId]);
  }

  async saveRefreshToken(token: RefreshTokenRecord): Promise<void> {
    await this.pool.execute('INSERT INTO refresh_tokens (user_id,jti,expires_at) VALUES (?,?,?)', [
      token.userId,
      token.jti,
      token.expiresAt,
    ]);
  }

  async rotateRefreshToken(
    oldJti: string,
    userId: string,
    replacement: RefreshTokenRecord,
  ): Promise<boolean> {
    return withTransaction(this.pool, async (connection) => {
      const [result] = await connection.execute<ResultSetHeader>(
        'UPDATE refresh_tokens SET revoked_at=NOW(),replaced_by_jti=? WHERE jti=? AND user_id=? AND revoked_at IS NULL AND expires_at>NOW()',
        [replacement.jti, oldJti, userId],
      );
      if (result.affectedRows !== 1) return false;
      await connection.execute(
        'INSERT INTO refresh_tokens (user_id,jti,expires_at) VALUES (?,?,?)',
        [replacement.userId, replacement.jti, replacement.expiresAt],
      );
      return true;
    });
  }

  async revokeRefreshToken(jti: string): Promise<void> {
    await this.pool.execute(
      'UPDATE refresh_tokens SET revoked_at=COALESCE(revoked_at,NOW()) WHERE jti=?',
      [jti],
    );
  }
}
