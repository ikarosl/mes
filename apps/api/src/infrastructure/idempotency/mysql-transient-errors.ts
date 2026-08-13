/**
 * mysql2 驱动瞬态错误分类器（基础设施层，唯一允许识别驱动错误码的位置）。
 *
 * 幂等 executor 的登记 INSERT 处于短小事务中，锁等待/死锁/连接中断属于可安全重试的瞬态失败，
 * 应映射为 `IdempotencyStorageError('retryable')`（HTTP 503），而不是让驱动错误原样冒泡成通用
 * 500（docs/http-idempotency-implementation-plan.md：锁等待/死锁/连接中断 → 503 语义）。
 *
 * 判定依据（mysql2 3.23.1）：
 *  - 服务器 SQL 错误：`{ code: 'ER_*', errno: <数字>, sqlState: <5 位串>, sqlMessage }`，
 *    code 由 lib/packets/packet.js `asError()` 的 `ErrorCodeToName[errorCode]` 填充，如
 *    `ER_LOCK_DEADLOCK`(1213)、`ER_LOCK_WAIT_TIMEOUT`(1205)；
 *  - `PROTOCOL_CONNECTION_LOST`：已核实 lib/base/connection.js（'close' 事件分支）——该错误是
 *    `new Error('Connection lost: The server closed the connection.')`，只设置 `fatal=true` 与
 *    `code='PROTOCOL_CONNECTION_LOST'`，**不带 errno/sqlState/sqlMessage**（旧注释声称 errno 2013
 *    不准确；2013 是 mysqljs 时代的客户端码 CR_SERVER_LOST，mysql2 常量表与构造路径均无此字段）；
 *  - 网络层错误：连接中断时 mysql2 把 socket 错误原样上抛（lib/base/connection.js
 *    `_handleNetworkError`），code 为 node 系统错误 `ECONNRESET`/`EPIPE`，连接建立超时为
 *    `ETIMEDOUT`（该路径仅设置 code 与 `errorno` 拼写错误的字段，无数字 errno/sqlState）；
 *  - 连接池已关闭：mysql2 3.23.1 的 pool 在 `getConnection`/`end` 抛 `new Error('Pool is closed.')`，
 *    多处固定字符串且**不设置 code**（lib/base/pool.js），因此除 `code === 'POOL_CLOSED'` 的
 *    前向兼容判断外，还需按该驱动内部常量消息兜底识别。
 *
 * `isMysqlServerErrorShape`：区分「mysql2 服务器 SQL 错误」与「其他 SDK 错误」的保守形态判定。
 * 服务器错误必带数字 errno + sqlState + sqlMessage（packet.asError 一次性设置三者）；
 * node 系统错误（ECONNRESET 等）与第三方 SDK 错误没有这些字段。`PROTOCOL_CONNECTION_LOST` 因
 * 构造路径特殊（只带 code）需要显式放行——该 code 名是 mysql2 专有名称，其他 SDK 不会使用，
 * 放行不会误判。
 *
 * 保守原则：只按上述确定性形态判定，不按 errno、消息前缀或其他启发式猜测；无法识别的一律返回
 * false，让错误原样冒泡保留堆栈与诊断信息——宁可保持通用 500，也不把非瞬态错误误判为可重试。
 */
const TRANSIENT_MYSQL_CODES = new Set<string>([
  'ER_LOCK_DEADLOCK', // 1213：死锁，InnoDB 已回滚一方事务，重试即可
  'ER_LOCK_WAIT_TIMEOUT', // 1205：锁等待超时（innodb_lock_wait_timeout 到期）
  'PROTOCOL_CONNECTION_LOST', // 2013：连接丢失（服务器关闭连接/网络中断）
  'ECONNRESET', // 网络连接被重置
  'EPIPE', // 向已关闭的 socket 写入
  'ETIMEDOUT', // 连接建立/读写超时
  'POOL_CLOSED', // 连接池已 end() 后取连接（前向兼容；3.23.1 实际不设置该 code，见下方消息兜底）
]);

/** mysql2 3.23.1 池关闭错误的唯一可识别信号：固定消息（lib/base/pool.js 多处同字符串）。 */
const POOL_CLOSED_MESSAGE = 'Pool is closed.';

/**
 * 判定错误是否带 mysql2 服务器 SQL 错误形态（数字 errno 或 sqlState/sqlMessage）。
 *
 * 用于区分「mysql2 服务器错误」与「其他 SDK 的网络错误（如 handler 内其他 SDK 的 ECONNRESET）」：
 * node 系统错误只有字符串 errno 与 code（'ECONNRESET' 等），没有数字 errno/sqlState/sqlMessage。
 * `PROTOCOL_CONNECTION_LOST` 特例放行，见文件头注释的核实结论。无法确定性识别的一律返回 false。
 */
export const isMysqlServerErrorShape = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as {
    errno?: unknown;
    sqlState?: unknown;
    sqlMessage?: unknown;
    code?: unknown;
  };
  if (typeof candidate.errno === 'number') return true;
  if (typeof candidate.sqlState === 'string') return true;
  if (typeof candidate.sqlMessage === 'string') return true;
  // PROTOCOL_CONNECTION_LOST 由 mysql2 构造为只带 code 的 Error；code 名是 mysql2 专有，直接放行。
  if (candidate.code === 'PROTOCOL_CONNECTION_LOST') return true;
  return false;
};

export const isTransientMysqlError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  if (typeof code === 'string' && TRANSIENT_MYSQL_CODES.has(code)) return true;
  // 当前驱动版本池关闭错误不带 code，仅有该固定消息；消息是驱动内部常量，不会与业务错误文本混淆。
  if (error instanceof Error && error.message === POOL_CLOSED_MESSAGE) return true;
  return false;
};
