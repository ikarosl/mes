import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import {
  DevelopmentDatabaseError,
  copyDevelopmentDatabase,
  readDevelopmentDatabaseConfig,
} from './development-mysql-client.js';

/** Called under the migration lock, before any source schema or history write. */
export async function createDevelopmentBackup(
  connection: Pick<PoolConnection, 'query'>,
): Promise<string> {
  let candidate: string | undefined;
  let created: string | undefined;
  try {
    const { database } = readDevelopmentDatabaseConfig();
    const [[schema]] = await connection.query<
      (RowDataPacket & {
        characterSet: string;
        collation: string;
        eventCount: number;
        scheduler: string;
        serverUuid: string;
      })[]
    >(
      `SELECT DEFAULT_CHARACTER_SET_NAME characterSet,DEFAULT_COLLATION_NAME collation,
        (SELECT COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA=?) eventCount,
        @@event_scheduler scheduler,@@server_uuid serverUuid
       FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?`,
      [database, database],
    );
    if (!schema) throw new DevelopmentDatabaseError('无法读取开发备份的源数据库');
    if (Number(schema.eventCount) > 0 && schema.scheduler === 'ON') {
      throw new DevelopmentDatabaseError(
        '源库包含事件且事件调度器正在运行，不能创建可能自动执行事件的备份库',
      );
    }
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const day = ['year', 'month', 'day']
      .map((type) => parts.find((part) => part.type === type)!.value)
      .join('');
    const backupName = (sequence: number): string => {
      const suffix = `_${day}_${sequence}`;
      return database.slice(0, 64 - suffix.length) + suffix;
    };
    const [schemas] = await connection.query<(RowDataPacket & { name: string })[]>(
      'SELECT SCHEMA_NAME name FROM information_schema.SCHEMATA',
    );
    let sequence = 1;
    for (const existing of schemas) {
      const match = new RegExp(`_${day}_([1-9]\\d*)$`).exec(existing.name);
      if (!match) continue;
      const number = Number(match[1]);
      if (Number.isSafeInteger(number) && existing.name === backupName(number)) {
        sequence = Math.max(sequence, number + 1);
      }
    }
    for (; Number.isSafeInteger(sequence); sequence++) {
      candidate = backupName(sequence);
      try {
        // No IF NOT EXISTS: only a confirmed, exclusively created schema can be cleaned up below.
        await connection.query('CREATE DATABASE ?? CHARACTER SET ?? COLLATE ??', [
          candidate,
          schema.characterSet,
          schema.collation,
        ]);
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'ER_DB_CREATE_EXISTS'
        )
          continue;
        throw error;
      }
      created = candidate;
      await copyDevelopmentDatabase(database, created, schema.serverUuid);
      return created;
    }
    throw new DevelopmentDatabaseError('开发备份的当日版本号超出范围');
  } catch (error) {
    let cleanup = candidate ? `候选库 ${candidate} 的创建结果未确认，未自动删除，请核对。` : '';
    if (created) {
      try {
        await connection.query('DROP DATABASE ??', [created]);
        cleanup = `本次未完成备份库 ${created} 已清理。`;
      } catch {
        cleanup = `本次未完成备份库 ${created} 清理失败，请核对；不得将其当作可用备份。`;
      }
    }
    const message =
      error instanceof DevelopmentDatabaseError ? error.message : '客户端或数据库操作失败';
    throw new DevelopmentDatabaseError(
      `开发数据库备份失败：${message}。${cleanup}源库尚未执行迁移。`,
    );
  }
}
