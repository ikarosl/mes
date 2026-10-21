import { BUSINESS_NUMBER_PREFIX, type BusinessNumberKind } from '@company/constants';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';

type NumberingConnection = Pick<PoolConnection, 'query' | 'execute'>;

/** 调用方必须处于业务事务；日计数、业务事实、审计和幂等结果一起提交。 */
export const allocateBusinessNumber = async (
  connection: NumberingConnection,
  kind: BusinessNumberKind,
): Promise<string> => {
  // 连接由 database 统一设置 +08:00；整次分配只读取一次数据库日期。
  const [[clock]] = await connection.query<(RowDataPacket & { number_date: string })[]>(
    "SELECT DATE_FORMAT(CURRENT_DATE(), '%Y-%m-%d') number_date",
  );
  if (!clock) throw new Error('无法读取业务编号日期');
  await connection.execute(
    `INSERT INTO business_number_daily_sequence (number_kind,number_date,last_sequence)
     VALUES (?,?,1) ON DUPLICATE KEY UPDATE last_sequence=last_sequence+1`,
    [kind, clock.number_date],
  );
  // upsert 的排他锁持续到事务结束，读取字符串避免 BIGINT 转为 JS number 丢精度。
  const [[row]] = await connection.query<(RowDataPacket & { sequence: string })[]>(
    `SELECT CAST(last_sequence AS CHAR) sequence FROM business_number_daily_sequence
     WHERE number_kind=? AND number_date=? FOR UPDATE`,
    [kind, clock.number_date],
  );
  if (!row) throw new Error('业务编号计数未生成');
  return `${BUSINESS_NUMBER_PREFIX[kind]}${clock.number_date.replaceAll('-', '')}-${row.sequence}`;
};
