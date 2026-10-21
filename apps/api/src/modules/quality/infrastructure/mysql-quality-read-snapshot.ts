import type { Pool, PoolConnection } from 'mysql2/promise';

/** 仅为本次聚合读取设置隔离级别，不让连接池后续命令继承只读属性。 */
export async function readQualitySnapshot<T>(
  pool: Pool,
  read: (db: PoolConnection) => Promise<T>,
): Promise<T> {
  const db = await pool.getConnection();
  let started = false,
    reusable = false;
  try {
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    await db.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
    started = true;
    const result = await read(db);
    await db.commit();
    reusable = true;
    return result;
  } catch (error) {
    if (started) {
      try {
        await db.rollback();
        reusable = true;
      } catch {
        // 回滚失败时销毁连接，保留最初错误。
      }
    }
    throw error;
  } finally {
    if (reusable) db.release();
    else db.destroy();
  }
}
