import { loadWorkspaceEnv } from '@company/config';
import bcrypt from 'bcryptjs';
import { createDatabasePool, withTransaction } from './index.js';

// 初始化管理员前统一加载工作区根目录 .env，保证账号配置与数据库连接一致。
loadWorkspaceEnv();
const username = process.env.ADMIN_USERNAME ?? 'admin';
const password = process.env.ADMIN_PASSWORD;
const displayName = process.env.ADMIN_DISPLAY_NAME ?? '系统管理员';
if (!password || password.length < 12)
  throw new Error('ADMIN_PASSWORD must contain at least 12 characters');
const pool = createDatabasePool();
try {
  await withTransaction(pool, async (connection) => {
    const passwordHash = await bcrypt.hash(password, 12);
    await connection.execute(
      `INSERT INTO users (username, password_hash, display_name, status)
       VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), display_name = VALUES(display_name), status = 1, deleted_at = NULL`,
      [username, passwordHash, displayName],
    );
    await connection.execute(`INSERT INTO roles (name, code, description, status) VALUES ('系统管理员', 'admin', '系统内置管理员', 1)
      ON DUPLICATE KEY UPDATE name = VALUES(name), status = 1, deleted_at = NULL`);
    await connection.execute(`INSERT INTO permissions (name, code, type, status) VALUES ('全部权限', '*', 'api', 1)
      ON DUPLICATE KEY UPDATE name = VALUES(name), status = 1, deleted_at = NULL`);
    await connection.execute(
      `INSERT IGNORE INTO user_roles (user_id, role_id)
      SELECT u.id, r.id FROM users u JOIN roles r ON r.code = 'admin' WHERE u.username = ?`,
      [username],
    );
    await connection.execute(`INSERT IGNORE INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code = '*' WHERE r.code = 'admin'`);
  });
  console.log(`Administrator ready: ${username}`);
} finally {
  await pool.end();
}
