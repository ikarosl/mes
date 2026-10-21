// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createConnection: vi.fn(),
  query: vi.fn(),
  end: vi.fn(),
}));
vi.mock('mysql2/promise', () => ({ createConnection: mocks.createConnection }));
vi.mock('@company/config', () => ({ loadWorkspaceEnv: vi.fn() }));

describe('ensure-database command entry', () => {
  const originalArgv = process.argv;
  const originalExitCode = process.exitCode;

  beforeEach(() => {
    vi.resetModules();
    mocks.createConnection.mockReset().mockResolvedValue({ query: mocks.query, end: mocks.end });
    mocks.query.mockReset().mockResolvedValue(undefined);
    mocks.end.mockReset().mockResolvedValue(undefined);
    vi.stubEnv('DB_HOST', 'database.invalid');
    vi.stubEnv('DB_PORT', '3306');
    vi.stubEnv('DB_USER', 'test-runner');
    vi.stubEnv('DB_PASSWORD', 'test-only');
    vi.stubEnv('DB_NAME', 'entrypoint_test');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('executes the direct file entry with the native Windows or POSIX path', async () => {
    process.argv = [
      process.execPath,
      fileURLToPath(new URL('../ensure-database.ts', import.meta.url)),
    ];
    await import('../ensure-database.js');
    await vi.waitFor(() => expect(mocks.end).toHaveBeenCalledOnce());
    expect(mocks.createConnection).toHaveBeenCalledOnce();
    expect(mocks.query).toHaveBeenCalledWith(
      'CREATE DATABASE IF NOT EXISTS ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci',
      ['entrypoint_test'],
    );
  });

  it('does not initialize a database when imported by another entry point', async () => {
    process.argv = [process.execPath, fileURLToPath(import.meta.url)];
    const imported = await import('../ensure-database.js');
    expect(imported.ensureDatabaseExists).toBeTypeOf('function');
    expect(mocks.createConnection).not.toHaveBeenCalled();
  });

  it('closes the connection and sets a failure exit code when initialization fails', async () => {
    process.argv = [
      process.execPath,
      fileURLToPath(new URL('../ensure-database.ts', import.meta.url)),
    ];
    const error = new Error('initialization rejected');
    mocks.query.mockRejectedValue(error);
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await import('../ensure-database.js');
    await vi.waitFor(() => expect(errorLog).toHaveBeenCalledWith(error));
    expect(mocks.end).toHaveBeenCalledOnce();
    expect(process.exitCode).toBe(1);
  });
});
