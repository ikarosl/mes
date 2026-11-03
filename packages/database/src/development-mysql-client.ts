import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Transform, type TransformCallback } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { StringDecoder } from 'node:string_decoder';
import { promisify } from 'node:util';

export class DevelopmentDatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DevelopmentDatabaseError';
  }
}

interface DevelopmentDatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

function assertDevelopmentDatabaseName(database: string): void {
  if (
    !/^[A-Za-z0-9_]{1,64}$/.test(database) ||
    ['mysql', 'sys', 'information_schema', 'performance_schema'].includes(database.toLowerCase())
  ) {
    throw new DevelopmentDatabaseError(
      '开发数据库名称须为 1–64 位字母、数字或下划线，且不能是系统库',
    );
  }
}

export function readDevelopmentDatabaseConfig(): DevelopmentDatabaseConfig {
  if (process.env.NODE_ENV !== 'development') {
    throw new DevelopmentDatabaseError('开发数据库备份仅允许 NODE_ENV=development');
  }
  const required = (name: string, allowEmpty = false): string => {
    const value = process.env[name];
    if (value === undefined || (!allowEmpty && !value.trim())) {
      throw new DevelopmentDatabaseError(`缺少开发数据库配置：${name}`);
    }
    return value;
  };
  const port = Number(required('DB_PORT'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new DevelopmentDatabaseError('DB_PORT 必须为 1–65535 的整数');
  }
  const database = required('DB_NAME');
  assertDevelopmentDatabaseName(database);
  return {
    host: required('DB_HOST'),
    port,
    user: required('DB_USER'),
    password: required('DB_PASSWORD', true),
    database,
  };
}

const execute = promisify(execFile);
const container = 'dev_test_sql';
const childEnvironment = (): NodeJS.ProcessEnv => {
  const environment = { ...process.env };
  delete environment.DB_PASSWORD;
  delete environment.MYSQL_PWD;
  return environment;
};

const command = async (program: string, args: string[]): Promise<string> => {
  try {
    const result = await execute(program, args, {
      encoding: 'utf8',
      env: childEnvironment(),
      timeout: 15000,
      maxBuffer: 1024 * 1024,
    });
    return result.stdout;
  } catch {
    throw new DevelopmentDatabaseError(`开发数据库客户端命令执行失败：${program}`);
  }
};

const nativeClientsAvailable = async (): Promise<boolean> => {
  const results = await Promise.allSettled(
    ['mysqldump', 'mysql'].map((program) =>
      execute(program, ['--version'], {
        encoding: 'utf8',
        env: childEnvironment(),
        timeout: 15000,
        maxBuffer: 65536,
      }),
    ),
  );
  for (const result of results) {
    if (
      result.status === 'rejected' &&
      !(
        typeof result.reason === 'object' &&
        result.reason !== null &&
        'code' in result.reason &&
        result.reason.code === 'ENOENT'
      )
    ) {
      throw new DevelopmentDatabaseError('本机 MySQL 客户端预检失败，未改用其他连接目标');
    }
  }
  return results.every((result) => result.status === 'fulfilled');
};

const verifyContainerTarget = async (config: DevelopmentDatabaseConfig): Promise<void> => {
  if (!['127.0.0.1', 'localhost', '::1'].includes(config.host.toLowerCase())) {
    throw new DevelopmentDatabaseError('本机缺少 MySQL 客户端，远程数据库不能使用开发容器替代');
  }
  const output = await command('docker', [
    'inspect',
    '--format',
    '{{json .NetworkSettings.Ports}}',
    container,
  ]);
  let ports: unknown;
  try {
    ports = JSON.parse(output);
  } catch {
    throw new DevelopmentDatabaseError('无法核对开发 MySQL 容器的端口映射');
  }
  const bindings =
    typeof ports === 'object' && ports !== null && '3306/tcp' in ports ? ports['3306/tcp'] : null;
  if (
    !Array.isArray(bindings) ||
    !bindings.some(
      (binding: unknown) =>
        typeof binding === 'object' &&
        binding !== null &&
        'HostPort' in binding &&
        binding.HostPort === String(config.port),
    )
  ) {
    throw new DevelopmentDatabaseError('开发 MySQL 容器的宿主端口与 DB_PORT 不匹配，拒绝替换目标');
  }
};

const optionValue = (value: string): string =>
  `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')}"`;

export async function copyDevelopmentDatabase(
  sourceDatabase: string,
  targetDatabase: string,
  expectedServerUuid: string,
): Promise<void> {
  const config = readDevelopmentDatabaseConfig();
  assertDevelopmentDatabaseName(targetDatabase);
  if (sourceDatabase !== config.database || sourceDatabase === targetDatabase) {
    throw new DevelopmentDatabaseError('复制源库必须是当前 DB_NAME，目标须为新建的不同数据库');
  }
  const native = await nativeClientsAvailable();
  if (!native) {
    await verifyContainerTarget(config);
    await Promise.all([
      command('docker', ['exec', container, 'mysqldump', '--version']),
      command('docker', ['exec', container, 'mysql', '--version']),
    ]);
  }
  const directory = await mkdtemp(join(tmpdir(), 'easy-mes-mysql-'));
  const localOptionFile = join(directory, 'client.cnf');
  const dumpFile = join(directory, 'dump.sql');
  const remoteOptionFile = `/tmp/easy-mes-mysql-${randomUUID()}.cnf`;
  let cleanupFailed: boolean;
  let outcome: { ok: true } | { ok: false; error: unknown };
  try {
    await chmod(directory, 0o700);
    await writeFile(
      localOptionFile,
      `[client]\nprotocol=TCP\nhost=${optionValue(native ? config.host : '127.0.0.1')}\nport=${native ? config.port : 3306}\nuser=${optionValue(config.user)}\npassword=${optionValue(config.password)}\n`,
      { mode: 0o600, flag: 'wx' },
    );
    if (!native) {
      await command('docker', ['cp', localOptionFile, `${container}:${remoteOptionFile}`]);
      await command('docker', ['exec', container, 'chmod', '600', remoteOptionFile]);
    }
    const optionFile = native ? localOptionFile : remoteOptionFile;
    const preflightArgs = [
      `--defaults-file=${optionFile}`,
      '--no-login-paths',
      '--default-character-set=utf8mb4',
      '--binary-mode',
      '--batch',
      '--skip-column-names',
      '--execute=SELECT @@server_uuid',
    ];
    const serverUuid = await command(
      native ? 'mysql' : 'docker',
      native ? preflightArgs : ['exec', container, 'mysql', ...preflightArgs],
    );
    if (!expectedServerUuid || serverUuid.trim() !== expectedServerUuid) {
      throw new DevelopmentDatabaseError('开发 MySQL 客户端与源连接不属于同一实例，拒绝复制');
    }
    const run = async (
      program: 'mysqldump' | 'mysql',
      args: string[],
      file: string,
    ): Promise<void> => {
      const clientArgs = [`--defaults-file=${optionFile}`, '--no-login-paths', ...args];
      const dockerArgs = ['exec'];
      if (program === 'mysql') dockerArgs.push('-i');
      dockerArgs.push(container, program, ...clientArgs);
      const child = spawn(native ? program : 'docker', native ? clientArgs : dockerArgs, {
        env: childEnvironment(),
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      child.stderr.resume();
      const completion = new Promise<void>((resolve, reject) => {
        child.once('error', () =>
          reject(new DevelopmentDatabaseError('无法启动开发 MySQL 客户端')),
        );
        child.once('close', (code) => {
          if (code === 0) resolve();
          else reject(new DevelopmentDatabaseError(`开发 MySQL ${program} 失败，未输出底层诊断`));
        });
      });
      const abort = new AbortController();
      const transfer =
        program === 'mysqldump'
          ? pipeline(
              child.stdout,
              new DevelopmentDumpNormalizer(),
              createWriteStream(file, { flags: 'wx', mode: 0o600 }),
              { signal: abort.signal },
            )
          : pipeline(createReadStream(file), child.stdin, { signal: abort.signal });
      if (program === 'mysqldump') child.stdin.end();
      else child.stdout.resume();
      try {
        await Promise.all([completion, transfer]);
      } catch {
        child.kill('SIGTERM');
        abort.abort();
        await Promise.allSettled([completion, transfer]);
        throw new DevelopmentDatabaseError(
          `开发数据库${program === 'mysqldump' ? '导出' : '导入'}失败，已中止操作`,
        );
      }
    };
    await run(
      'mysqldump',
      [
        '--default-character-set=utf8mb4',
        '--single-transaction',
        '--quick',
        '--routines',
        '--events',
        '--triggers',
        '--hex-blob',
        '--set-gtid-purged=OFF',
        '--no-tablespaces',
        '--column-statistics=0',
        sourceDatabase,
      ],
      dumpFile,
    );
    await run(
      'mysql',
      ['--default-character-set=utf8mb4', '--binary-mode', `--database=${targetDatabase}`],
      dumpFile,
    );
    outcome = { ok: true };
  } catch (error) {
    outcome = {
      ok: false,
      error:
        error instanceof DevelopmentDatabaseError
          ? error
          : new DevelopmentDatabaseError('开发数据库客户端准备或复制失败'),
    };
  } finally {
    const cleanups = [rm(directory, { recursive: true, force: true })];
    if (!native) {
      cleanups.push(
        command('docker', ['exec', container, 'rm', '-f', '--', remoteOptionFile]).then(
          () => undefined,
        ),
      );
    }
    const results = await Promise.allSettled(cleanups);
    cleanupFailed = results.some((result) => result.status === 'rejected');
  }
  if (cleanupFailed)
    throw new DevelopmentDatabaseError(
      '开发数据库复制未确认完成：临时文件或凭证清理失败，请核对本机和容器临时目录',
    );
  if (!outcome.ok) throw outcome.error;
}
/** Keep mysqldump SQL intact while removing the version-comment wrapper around CREATE TRIGGER. */
class DevelopmentDumpNormalizer extends Transform {
  private readonly decoder = new StringDecoder('utf8');
  private header: string | null = '';
  private triggerTail = '';
  private insideTrigger = false;

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    try {
      this.consume(this.decoder.write(chunk));
      callback();
    } catch {
      callback(new Error('开发备份的触发器导出格式无法规范化'));
    }
  }

  override _flush(callback: TransformCallback): void {
    try {
      this.consume(this.decoder.end());
      if (this.header || this.triggerTail) this.endLine(false);
      if (this.insideTrigger) throw new Error('Unterminated trigger');
      callback();
    } catch {
      callback(new Error('开发备份包含未结束的触发器导出包装'));
    }
  }

  private consume(text: string): void {
    let start = 0;
    let newline: number;
    while ((newline = text.indexOf('\n', start)) !== -1) {
      this.fragment(text.slice(start, newline));
      this.endLine(true);
      start = newline + 1;
    }
    this.fragment(text.slice(start));
  }

  private fragment(text: string): void {
    if (this.insideTrigger) {
      this.writeTrigger(text);
      return;
    }
    if (this.header === null) {
      this.push(text);
      return;
    }
    this.header += text;
    const prefix = '/*!50003 CREATE*/';
    if (!prefix.startsWith(this.header) && !this.header.startsWith(prefix)) {
      this.push(this.header);
      this.header = null;
    } else if (
      /^\/\*!50003 CREATE\*\/\s+(?:\/\*!50017 DEFINER=.*?\*\/\s+)?\/\*!50003 TRIGGER /.test(
        this.header,
      )
    ) {
      const header = this.header
        .replace(prefix, 'CREATE')
        .replace(/\/\*!50017 (DEFINER=.*?)\*\//, '$1')
        .replace('/*!50003 TRIGGER ', 'TRIGGER ');
      this.header = null;
      this.insideTrigger = true;
      this.writeTrigger(header);
    } else if (this.header.length > 4096) {
      this.push(this.header);
      this.header = null;
    }
  }

  private writeTrigger(text: string): void {
    const content = this.triggerTail + text;
    // A long INSERT or trigger body never needs to be buffered as a complete line.
    this.push(content.slice(0, Math.max(0, content.length - 64)));
    this.triggerTail = content.slice(-64);
  }

  private endLine(newline: boolean): void {
    if (this.insideTrigger) {
      if (/ \*\/;;[ \t\r]*$/.test(this.triggerTail)) {
        this.triggerTail = this.triggerTail.replace(/ \*\/;;[ \t\r]*$/, ' ;;');
        this.insideTrigger = false;
      }
      this.push(this.triggerTail);
      this.triggerTail = '';
    } else if (this.header !== null) {
      this.push(this.header);
    }
    if (newline) this.push('\n');
    this.header = '';
  }
}
