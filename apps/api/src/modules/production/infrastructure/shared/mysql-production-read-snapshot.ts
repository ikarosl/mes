import type { Pool, PoolConnection } from 'mysql2/promise';

/** 仅影响下一只读事务；隔离设置不留在连接池会话供后续写命令继承。 */
export async function readProductionSnapshot<T>(
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
        // 回滚失败时销毁连接；保留原异常，不把有未知事务状态的会话放回池。
      }
    }
    throw error;
  } finally {
    // 设置成功但开始事务失败时，下一事务特征仍可能未消费，必须销毁会话。
    if (reusable) db.release();
    else db.destroy();
  }
}
