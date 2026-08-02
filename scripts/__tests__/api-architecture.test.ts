import { describe, expect, it } from 'vitest';
import { checkApiArchitecture } from '../check-api-architecture.mjs';

const flagsPath = (violations, path) => violations.some((v) => v.includes(path));

describe('checkApiArchitecture', () => {
  it('finds no violations in the current source tree', async () => {
    expect(await checkApiArchitecture()).toEqual([]);
  });

  // 负向 fixture：验证检查器确实能拦截违规代码，而不只是断言当前仓库干净。

  it('flags any *Exception named import from @nestjs/common in an application layer', async () => {
    const violations = await checkApiArchitecture([
      {
        path: 'apps/api/src/modules/product/application/leak.ts',
        source: `import { Injectable, UnprocessableEntityException } from '@nestjs/common';\n`,
      },
    ]);

    expect(flagsPath(violations, 'product/application/leak.ts')).toBe(true);
  });

  it('flags an InternalServerErrorException import in a domain layer', async () => {
    const violations = await checkApiArchitecture([
      {
        path: 'apps/api/src/modules/identity/domain/leak.ts',
        source: `import { InternalServerErrorException } from '@nestjs/common';\n`,
      },
    ]);

    expect(flagsPath(violations, 'identity/domain/leak.ts')).toBe(true);
  });

  it('flags a database driver error code literal in an application layer', async () => {
    const violations = await checkApiArchitecture([
      {
        path: 'apps/api/src/modules/production/application/leak.ts',
        source: `if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {}\n`,
      },
    ]);

    expect(flagsPath(violations, 'production/application/leak.ts')).toBe(true);
  });

  it('flags an SDK package import in an application layer', async () => {
    const violations = await checkApiArchitecture([
      {
        path: 'apps/api/src/modules/identity/application/leak.ts',
        source: `import { S3Client } from '@aws-sdk/client-s3';\n`,
      },
    ]);

    expect(flagsPath(violations, 'identity/application/leak.ts')).toBe(true);
  });

  it('flags a mysql2 type leak in an application port', async () => {
    const violations = await checkApiArchitecture([
      {
        path: 'apps/api/src/modules/product/application/ports/leak.ts',
        source: `import type { PoolConnection } from 'mysql2/promise';\n`,
      },
    ]);

    expect(flagsPath(violations, 'product/application/ports/leak.ts')).toBe(true);
  });

  it('flags a public.ts that re-exports a domain error', async () => {
    const violations = await checkApiArchitecture([
      {
        path: 'apps/api/src/modules/product/public.ts',
        source: `export { ProductDomainError } from './domain/product.errors.js';\n`,
      },
    ]);

    expect(flagsPath(violations, 'product/public.ts')).toBe(true);
  });

  it('flags a direct write to operation_logs outside the audit writer', async () => {
    const violations = await checkApiArchitecture([
      {
        path: 'apps/api/src/modules/identity/infrastructure/leak.ts',
        source: `await connection.execute('INSERT INTO operation_logs (action) VALUES (?)', ['x']);\n`,
      },
    ]);

    expect(flagsPath(violations, 'identity/infrastructure/leak.ts')).toBe(true);
  });

  it('does not flag a *Exception import from a non-Nest package', async () => {
    const violations = await checkApiArchitecture([
      {
        path: 'apps/api/src/modules/product/application/leak.ts',
        source: `import { CustomException } from 'some-lib';\n`,
      },
    ]);

    expect(flagsPath(violations, 'product/application/leak.ts')).toBe(false);
  });
});
