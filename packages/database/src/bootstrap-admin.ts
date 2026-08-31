import { loadWorkspaceEnv } from '@company/config';
import bcrypt from 'bcryptjs';
import { createDatabasePool, withTransaction } from './index.js';
import type { RowDataPacket } from 'mysql2/promise';

// 初始化管理员前统一加载工作区根目录 .env，保证账号配置与数据库连接一致。
loadWorkspaceEnv();
const username = process.env.ADMIN_USERNAME ?? 'admin';
const password = process.env.ADMIN_PASSWORD;
const displayName = process.env.ADMIN_DISPLAY_NAME ?? '系统管理员';
if (!password || password.length < 6) throw new Error('ADMIN_PASSWORD 长度必须至少为 6 个字符');
const pool = createDatabasePool();
try {
  await withTransaction(pool, async (connection) => {
    const [roles] = await connection.query<(RowDataPacket & { id: number })[]>(
      `SELECT role.id
       FROM roles AS role
       JOIN role_permissions AS role_permission ON role_permission.role_id = role.id
       JOIN permissions AS permission ON permission.id = role_permission.permission_id
       WHERE role.code = 'admin' AND role.status = 1 AND role.deleted_at IS NULL
         AND permission.code = '*' AND permission.status = 1 AND permission.deleted_at IS NULL
       LIMIT 1
       FOR UPDATE`,
    );
    const adminRole = roles[0];
    if (!adminRole) throw new Error('系统权限种子数据缺失，请先运行 pnpm db:seed');

    const passwordHash = await bcrypt.hash(password, 12);
    await connection.execute(
      `INSERT INTO users (username, password_hash, display_name, status)
       VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), display_name = VALUES(display_name), status = 1, deleted_at = NULL`,
      [username, passwordHash, displayName],
    );
    await connection.execute(
      `INSERT IGNORE INTO user_roles (user_id, role_id)
       SELECT id, ? FROM users WHERE username = ?`,
      [adminRole.id, username],
    );
  });
  console.log(`管理员已就绪：${username}`);
} finally {
  await pool.end();
}
