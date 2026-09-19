import type { PoolConnection, RowDataPacket } from 'mysql2/promise';

/** 调用者已处于创建工单事务；日计数、工单、审计和幂等结果一并提交。 */
export const allocateWorkOrderNumber = async (connection: PoolConnection): Promise<string> => {
  // 北京时间不依赖应用主机或连接的时区，也不要求 MySQL 安装命名时区表。
  const [[clock]] = await connection.query<(RowDataPacket & { number_date: string })[]>(
    "SELECT DATE_FORMAT(UTC_TIMESTAMP(3) + INTERVAL 8 HOUR, '%Y-%m-%d') number_date",
  );
  if (!clock) throw new Error('无法读取工单编号日期');
  await connection.execute(
    `INSERT INTO work_order_daily_sequence (number_date,last_sequence) VALUES (?,1)
     ON DUPLICATE KEY UPDATE last_sequence=last_sequence+1`,
    [clock.number_date],
  );
  // upsert 的排他行锁保留至事务结束；同日并发取号串行，无 MAX+1 竞争。
  const [[row]] = await connection.query<(RowDataPacket & { sequence: string })[]>(
    'SELECT CAST(last_sequence AS CHAR) sequence FROM work_order_daily_sequence WHERE number_date=? FOR UPDATE',
    [clock.number_date],
  );
  if (!row) throw new Error('工单编号计数未生成');
  return `${clock.number_date}-${row.sequence}`;
};
