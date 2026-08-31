import { createPool, type Pool, type PoolConnection } from 'mysql2/promise';
import { AsyncLocalStorage } from 'node:async_hooks';

export type DatabasePool = Pool;
export type DatabaseConnection = PoolConnection;
export const DATABASE_TIME_ZONE = '+08:00';

/**
 * 事务边界操作（取连接/开启事务/提交）失败，或事务内经 `withActiveConnection`/嵌套
 * `withTransaction` 拿到的 tagged 连接（见 `tagConnection`）查询失败时包装的基础设施错误。
 *
 * 只包装边界操作与 tagged 连接上的查询；work 回调内直接抛出的错误原样通过、绝不包装——回调内
 * 可能是业务异常或其他 SDK 错误（如 handler 内其他 SDK 的 ECONNRESET），应由调用方自行分类。
 * 原始错误保留在 `cause` 字段供调用方判定（如幂等 executor 对瞬态错误的分类）。
 *
 * `code`/`errno`/`sqlState`/`sqlMessage` getter 透传 `cause` 上的对应字段：查询被包装后，事务内
 * 现有 `error.code === 'ER_DUP_ENTRY'` 之类按码 catch 的代码无需改动即可继续命中。
 */
export class DatabaseError extends Error {
  constructor(
    readonly cause: unknown,
    message: string,
  ) {
    super(message);
    this.name = 'DatabaseError';
  }

  /** 透传 cause 上的驱动错误码（如 ER_DUP_ENTRY / ECONNRESET），无则 undefined。 */
  get code(): unknown {
    return causeField(this.cause, 'code');
  }

  /** 透传 cause 上的数字 errno（mysql2 服务器错误形态），无则 undefined。 */
  get errno(): unknown {
    return causeField(this.cause, 'errno');
  }

  /** 透传 cause 上的 sqlState（mysql2 服务器错误形态），无则 undefined。 */
  get sqlState(): unknown {
    return causeField(this.cause, 'sqlState');
  }

  /** 透传 cause 上的 sqlMessage（mysql2 服务器错误形态），无则 undefined。 */
  get sqlMessage(): unknown {
    return causeField(this.cause, 'sqlMessage');
  }
}

const causeField = (cause: unknown, field: string): unknown => {
  if (typeof cause !== 'object' || cause === null) return undefined;
  return (cause as Record<string, unknown>)[field];
};

/** `tagConnection` 绑定的连接方法：execute/query 额外包装为 DatabaseError，其余直接绑定透传。 */
const TAGGED_CONNECTION_METHODS = [
  'execute',
  'query',
  'beginTransaction',
  'commit',
  'rollback',
  'release',
  'ping',
  'format',
  'escape',
  'unprepare',
  'changeUser',
  'destroy',
] as const;

/** `tagConnection` 以 getter 透传的只读属性（防御性覆盖，当前业务代码未读取这些属性）。 */
const TAGGED_CONNECTION_PROPERTIES = ['threadId', 'config'] as const;

/**
 * 为事务连接生成显式方法绑定的门面对象，给查询错误打上「来源明确」的标记（评审 P2：handler 内
 * 业务 SQL 的网络中断错误需要与 handler 内其他 SDK 的同名网络错误区分，由数据库包包装后 executor
 * 才能按 `cause` 分类）。
 *
 * - `execute`/`query`：reject 时包装为 `DatabaseError`（`cause` 保留原错误），成功原样返回；
 * - 其余连接标准方法（beginTransaction/commit/rollback/release/ping/format/escape/unprepare/
 *   changeUser/destroy 等）直接 bind 到原连接透传，不做包装；
 * - 不使用 Proxy：mysql2 方法依赖 this（连接内部状态），Proxy 会破坏其行为；
 * - 只读属性（threadId/config）以 getter 透传，不拷贝可变内部状态；
 * - 只标记事务连接：调用方（withTransaction）在开启事务后把 tagged 门面存入 ALS，因此只有事务内
 *   经 `withActiveConnection` / 嵌套 `withTransaction` 取到的连接带标记；事务外 withActiveConnection
 *   返回的 pool 不标记；S3/HTTP 等其他 SDK 的错误不会被包装成 DatabaseError。
 */
export const tagConnection = (connection: PoolConnection): PoolConnection => {
  const facade: Record<string, unknown> = {};
  for (const key of TAGGED_CONNECTION_METHODS) {
    const fn = connection[key];
    if (typeof fn !== 'function') continue; // 兼容测试假连接等部分实现，只绑定实际存在的方法
    const bound = fn.bind(connection) as (...args: unknown[]) => unknown;
    facade[key] =
      key === 'execute' || key === 'query'
        ? async (...args: unknown[]): Promise<unknown> => {
            try {
              return await bound(...args);
            } catch (error) {
              throw new DatabaseError(error, '数据库查询失败');
            }
          }
        : bound;
  }
  for (const key of TAGGED_CONNECTION_PROPERTIES) {
    if (!(key in connection)) continue;
    Object.defineProperty(facade, key, {
      enumerable: true,
      get: () => connection[key],
    });
  }
  return facade as unknown as PoolConnection;
};

const transactionContext = new AsyncLocalStorage<{ pool: Pool; connection: PoolConnection }>();

export const initializeDatabaseConnection = (connection: Pick<PoolConnection, 'query'>) =>
  connection.query(`SET time_zone = '${DATABASE_TIME_ZONE}'`);

export const createDatabasePool = (options: { multipleStatements?: boolean } = {}) => {
  const pool = createPool({
    host: requiredEnv('DB_HOST'),
    port: positiveIntegerEnv('DB_PORT'),
    user: requiredEnv('DB_USER'),
    password: requiredEnv('DB_PASSWORD', true),
    database: requiredEnv('DB_NAME'),
    charset: 'utf8mb4',
    timezone: DATABASE_TIME_ZONE,
    connectionLimit: positiveIntegerEnv('DB_CONNECTION_LIMIT'),
    namedPlaceholders: false,
    multipleStatements: options.multipleStatements ?? false,
  });
  pool.on('connection', (connection) => {
    void initializeDatabaseConnection(connection);
  });
  return pool;
};

export const withTransaction = async <T>(
  pool: Pool,
  work: (connection: PoolConnection) => Promise<T>,
) => {
  const active = transactionContext.getStore();
  if (active?.pool === pool) return work(active.connection);

  // 取连接失败发生在事务开启之前，不需要也绝不能回滚；包装后抛给调用方分类。
  let connection: PoolConnection;
  try {
    connection = await pool.getConnection();
  } catch (error) {
    throw new DatabaseError(error, '获取数据库连接失败');
  }
  try {
    try {
      await connection.beginTransaction();
    } catch (error) {
      throw new DatabaseError(error, '开启数据库事务失败');
    }
    // ALS 存储 tagged 门面：work 回调仍收到原始 connection（事务内直接 execute/query 的调用方
    // 行为完全不变），只有经 withActiveConnection / 嵌套 withTransaction 取到的连接才带
    // DatabaseError 来源标记（见 tagConnection）。
    const result = await transactionContext.run(
      { pool, connection: tagConnection(connection) },
      () => work(connection),
    );
    try {
      await connection.commit();
    } catch (error) {
      throw new DatabaseError(error, '提交数据库事务失败');
    }
    return result;
  } catch (error) {
    // rollback 是 best-effort 补偿：失败只记录日志，绝不让 rollback 错误覆盖原始异常
    // （原始异常可能是业务错误，覆盖会丢失调用方依赖的错误类型与诊断）。
    try {
      await connection.rollback();
    } catch (rollbackError) {
      // 日志安全规则：work 回调抛出的可能是业务/SDK 异常，message 可能含请求内容、SQL 参数或
      // 凭证，绝不打印原始 message。只记录异常类型（constructor.name）与经过白名单筛选的
      // mysql2 数据库错误码（服务器错误码形态 /^ER_[A-Z0-9_]+$/ 或连接/池网络错误码）。
      console.error(
        `[数据库] withTransaction 回滚失败；原始异常类型：${errorTypeLabel(error)}` +
          mysqlCodeLabel('原始错误码', error) +
          `；回滚异常类型：${errorTypeLabel(rollbackError)}` +
          mysqlCodeLabel('回滚错误码', rollbackError),
      );
    }
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * 调用栈已由 `withTransaction` 在同一个 pool 上开启事务时，复用该事务连接执行查询；
 * 否则退回 pool 自身。用于只读校验在既有事务上下文中执行（如幂等 executor 外层事务内的业务状态
 * 校验），既不向 application 暴露连接类型，也不为只读查询额外开启事务。
 *
 * 事务内取到的是 tagged 连接（见 `tagConnection`）：查询失败会被包装为 `DatabaseError` 来源标记，
 * 供上层（如幂等 executor）按 `cause` 做瞬态分类；事务外退回的 pool 本身不做任何包装。
 */
export const withActiveConnection = <T>(
  pool: Pool,
  work: (queryable: Pool | PoolConnection) => Promise<T>,
): Promise<T> => {
  const active = transactionContext.getStore();
  return work(active?.pool === pool ? active.connection : pool);
};

const requiredEnv = (name: string, allowEmpty = false) => {
  const value = process.env[name];
  if (value === undefined || (!allowEmpty && value.trim() === '')) {
    throw new Error(`缺少必填环境变量：${name}`);
  }
  return value;
};

const positiveIntegerEnv = (name: string) => {
  const value = Number(requiredEnv(name));
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} 必须是正整数`);
  }
  return value;
};

/** 日志安全标签：只取异常类型名（constructor.name），绝不打印 message/堆栈等可能泄露凭据的内容。 */
const errorTypeLabel = (error: unknown): string => {
  if (typeof error === 'object' && error !== null) {
    const ctor = (error as { constructor?: { name?: string } }).constructor;
    if (typeof ctor?.name === 'string' && ctor.name.length > 0) return ctor.name;
    return 'unknown-object';
  }
  return typeof error; // string / number / undefined 等原始值只记录类型，不打印内容
};

/**
 * mysql2 数据库错误码白名单：只有确定性可识别为驱动/系统网络错误码的 code 才允许进日志
 * （服务器错误码形态 `/^ER_[A-Z0-9_]+$/`，或连接/池网络错误码之一），其余 code 一律不打印。
 */
const MYSQL_CODE_WHITELIST = new Set([
  'PROTOCOL_CONNECTION_LOST',
  'ECONNRESET',
  'EPIPE',
  'ETIMEDOUT',
  'POOL_CLOSED',
]);

/** 白名单内的错误码输出为 `; label: code`，其余返回空串（不打印）。 */
const mysqlCodeLabel = (label: string, error: unknown): string => {
  if (typeof error !== 'object' || error === null) return '';
  const code = (error as { code?: unknown }).code;
  if (typeof code !== 'string' || code.length === 0) return '';
  if (!MYSQL_CODE_WHITELIST.has(code) && !/^ER_[A-Z0-9_]+$/.test(code)) return '';
  return `；${label}：${code}`;
};
