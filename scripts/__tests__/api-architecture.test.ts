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

  it('flags legacy AuditContext symbols in production code', async () => {
    const violations = await checkApiArchitecture([
      {
        path: 'apps/api/src/modules/product/application/legacy.ts',
        source: `import type { AuditContext } from '../../../../common/audit/audit.types.js';\n`,
      },
    ]);

    expect(flagsPath(violations, 'product/application/legacy.ts')).toBe(true);
  });

  it('flags idempotencyKey added back to the base CommandContext', async () => {
    const violations = await checkApiArchitecture([
      {
        path: 'apps/api/src/common/audit/audit.types.ts',
        source: `interface CommandContext { actorId: string | null; idempotencyKey?: string }\n`,
      },
    ]);

    expect(flagsPath(violations, 'common/audit/audit.types.ts')).toBe(true);
  });

  it('flags IdempotentCommandContext leaking into a repository port', async () => {
    const violations = await checkApiArchitecture([
      {
        path: 'apps/api/src/modules/product/application/ports/leak.repository.ts',
        source: `import type { IdempotentCommandContext } from '../../../../../common/audit/audit.types.js';\n`,
      },
    ]);

    expect(flagsPath(violations, 'product/application/ports/leak.repository.ts')).toBe(true);
  });

  it('flags an unregistered application use of IdempotencyExecutor', async () => {
    const violations = await checkApiArchitecture([
      {
        path: 'apps/api/src/modules/product/application/product.service.ts',
        source: `import { IdempotencyExecutor } from '../../../common/idempotency/idempotency-executor.js';\n`,
      },
    ]);

    expect(flagsPath(violations, 'product/application/product.service.ts')).toBe(true);
  });

  it('flags a duplicate IdempotencyKeyGuard inside a business module', async () => {
    const violations = await checkApiArchitecture([
      {
        path: 'apps/api/src/modules/identity/presentation/http/idempotency-key.guard.ts',
        source: `class IdempotencyKeyGuard {}\n`,
      },
    ]);

    expect(flagsPath(violations, 'identity/presentation/http/idempotency-key.guard.ts')).toBe(true);
  });

  it('flags an unregistered frontend wrapper setting idempotency headers or idempotent-write retry', async () => {
    const violations = await checkApiArchitecture([
      {
        path: 'apps/admin-web/src/api/product.ts',
        source: `client.post('/products', body, { headers: { 'Idempotency-Key': key }, retryIdempotentWrite: true });\n`,
      },
    ]);

    expect(flagsPath(violations, 'apps/admin-web/src/api/product.ts')).toBe(true);
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

  it('flags Production infrastructure from directly querying Product material variants', async () => {
    const violations = await checkApiArchitecture([
      {
        path: 'apps/api/src/modules/production/infrastructure/leak.ts',
        source: `await connection.execute('SELECT id FROM material_variants WHERE material_product_id=?', [id]);\n`,
      },
    ]);

    expect(flagsPath(violations, 'production/infrastructure/leak.ts')).toBe(true);
  });

  it('flags a write to http_idempotency_records outside the idempotency platform', async () => {
    const violations = await checkApiArchitecture([
      {
        path: 'apps/api/src/modules/production/infrastructure/leak.ts',
        source: `await connection.execute('DELETE FROM http_idempotency_records WHERE expires_at < NOW()');\n`,
      },
    ]);

    expect(flagsPath(violations, 'production/infrastructure/leak.ts')).toBe(true);
  });

  it('does not flag the housekeeping service writing http_idempotency_records', async () => {
    const violations = await checkApiArchitecture([
      {
        path: 'apps/api/src/infrastructure/idempotency/idempotency-housekeeping.service.ts',
        source: `await this.pool.execute('DELETE FROM http_idempotency_records WHERE expires_at < NOW()');\n`,
      },
    ]);

    expect(flagsPath(violations, 'idempotency-housekeeping.service.ts')).toBe(false);
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

  it('flags a composition root importing a module internal layer', async () => {
    const violations = await checkApiArchitecture([
      {
        path: 'apps/api/src/app.module.ts',
        source: `import { IdempotencyKeyGuard } from './modules/identity/presentation/http/idempotency-key.guard.js';\n`,
      },
    ]);

    expect(flagsPath(violations, 'app.module.ts')).toBe(true);
  });

  it('does not flag a composition root importing only module public.ts or project infrastructure', async () => {
    const violations = await checkApiArchitecture([
      {
        path: 'apps/api/src/app.module.ts',
        source: [
          `import { IdentityModule } from './modules/identity/public.js';`,
          `import { IdempotencyKeyGuard } from './infrastructure/idempotency/idempotency.module.js';`,
        ].join('\n'),
      },
    ]);

    expect(flagsPath(violations, 'app.module.ts')).toBe(false);
  });

  it('flags a hardcoded idempotency scope literal outside the contract constant file', async () => {
    const violations = await checkApiArchitecture([
      {
        path: 'apps/api/src/modules/production/application/leak.ts',
        source: `const legacy = 'production.batch.create.v4';\n`,
      },
    ]);

    expect(flagsPath(violations, 'production/application/leak.ts')).toBe(true);
  });

  it('does not flag the contract constant file that defines the scope literal', async () => {
    const violations = await checkApiArchitecture([
      {
        path: 'apps/api/src/modules/production/application/idempotency/fixture-idempotency-scopes.contract.ts',
        source: `export const CREATE_BATCH_IDEMPOTENCY_SCOPE = 'production.batch.create.v4' as const;\n`,
      },
    ]);

    expect(flagsPath(violations, 'fixture-idempotency-scopes.contract.ts')).toBe(false);
  });

  it('flags an @IdempotentEndpoint whose scope argument is a string literal', async () => {
    const violations = await checkApiArchitecture([
      {
        path: 'apps/api/src/modules/production/presentation/http/leak.controller.ts',
        source: `@IdempotentEndpoint({ scope: 'production.batch.create.v9' })\n`,
      },
    ]);

    expect(flagsPath(violations, 'production/presentation/http/leak.controller.ts')).toBe(true);
  });

  it('flags an @IdempotentEndpoint without a scope argument', async () => {
    const violations = await checkApiArchitecture([
      {
        path: 'apps/api/src/modules/production/presentation/http/leak.controller.ts',
        source: `@IdempotentEndpoint()\n`,
      },
    ]);

    expect(flagsPath(violations, 'production/presentation/http/leak.controller.ts')).toBe(true);
  });

  it('flags an @IdempotentEndpoint controller that does not import the contract scope constant', async () => {
    const violations = await checkApiArchitecture([
      {
        path: 'apps/api/src/modules/production/presentation/http/leak.controller.ts',
        source: `@IdempotentEndpoint({ scope: SOME_LOCAL_IDENTIFIER })\n`,
      },
    ]);

    expect(flagsPath(violations, 'production/presentation/http/leak.controller.ts')).toBe(true);
  });

  it('flags an idempotent endpoint that does not use the idempotent command context decorator', async () => {
    const violations = await checkApiArchitecture([
      {
        path: 'apps/api/src/modules/production/presentation/http/leak.controller.ts',
        source: [
          `import { CREATE_BATCH_IDEMPOTENCY_SCOPE } from '../../application/idempotency/production-idempotency-scopes.contract.js';`,
          `@IdempotentEndpoint({ scope: CREATE_BATCH_IDEMPOTENCY_SCOPE })`,
          `create(@CurrentCommandContext() context: CommandContext) {}`,
        ].join('\n'),
      },
    ]);

    expect(flagsPath(violations, 'production/presentation/http/leak.controller.ts')).toBe(true);
  });

  it('flags a literal scope in an application-layer idempotency executor call', async () => {
    const violations = await checkApiArchitecture([
      {
        path: 'apps/api/src/modules/production/application/leak.ts',
        source: `await this.idempotency.execute({ scope: 'production.batch.create.v9', key });\n`,
      },
    ]);

    expect(flagsPath(violations, 'production/application/leak.ts')).toBe(true);
  });

  it('does not flag a compliant @IdempotentEndpoint referencing the contract scope constant', async () => {
    const violations = await checkApiArchitecture([
      {
        path: 'apps/api/src/modules/production/presentation/http/compliant.controller.ts',
        source: [
          `import { CREATE_BATCH_IDEMPOTENCY_SCOPE } from '../../application/idempotency/production-idempotency-scopes.contract.js';`,
          `import { CurrentIdempotentCommandContext } from '../../../../../common/security/auth.decorators.js';`,
          `@IdempotentEndpoint({ scope: CREATE_BATCH_IDEMPOTENCY_SCOPE })`,
          `create(@CurrentIdempotentCommandContext() context: unknown) {}`,
        ].join('\n'),
      },
    ]);

    expect(flagsPath(violations, 'compliant.controller.ts')).toBe(false);
  });

  // 幂等「声明↔scope↔executor」显式绑定（applyIdempotencyBindingChecks）的负向 fixture

  it('flags a contract file exporting a scope value not registered in knownIdempotencyScopes', async () => {
    const violations = await checkApiArchitecture([
      {
        path: 'apps/api/src/modules/production/application/idempotency/new-thing-idempotency.contract.ts',
        source: `export const NEW_THING_IDEMPOTENCY_SCOPE = 'production.thing.create.v1' as const;\n`,
      },
    ]);

    expect(flagsPath(violations, 'new-thing-idempotency.contract.ts')).toBe(true);
  });

  it('flags an @IdempotentEndpoint whose scope identifier is not an export of the imported contract', async () => {
    const violations = await checkApiArchitecture([
      {
        path: 'apps/api/src/modules/production/presentation/http/leak.controller.ts',
        source: [
          `import { NOT_THE_SCOPE } from '../../application/idempotency/production-idempotency-scopes.contract.js';`,
          `@IdempotentEndpoint({ scope: NOT_THE_SCOPE })`,
        ].join('\n'),
      },
    ]);

    expect(flagsPath(violations, 'leak.controller.ts')).toBe(true);
  });

  it('flags an endpoint whose scope is not wired through the executor in the owning application layer', async () => {
    const violations = await checkApiArchitecture([
      {
        path: 'apps/api/src/modules/identity/application/idempotency/identity-login-idempotency.contract.ts',
        source: `export const IDENTITY_LOGIN_IDEMPOTENCY_SCOPE = 'production.batch.create.v1' as const;\n`,
      },
      {
        path: 'apps/api/src/modules/identity/presentation/http/login.controller.ts',
        source: [
          `import { IDENTITY_LOGIN_IDEMPOTENCY_SCOPE } from '../../application/idempotency/identity-login-idempotency.contract.js';`,
          `@IdempotentEndpoint({ scope: IDENTITY_LOGIN_IDEMPOTENCY_SCOPE })`,
        ].join('\n'),
      },
    ]);

    expect(flagsPath(violations, 'login.controller.ts')).toBe(true);
  });

  it('does not flag an endpoint fully wired: decorator scope == executor scope == contract export', async () => {
    const violations = await checkApiArchitecture([
      {
        path: 'apps/api/src/modules/product/application/idempotency/product-create-idempotency.contract.ts',
        source: `export const PRODUCT_CREATE_IDEMPOTENCY_SCOPE = 'production.batch.create.v1' as const;\n`,
      },
      {
        path: 'apps/api/src/modules/product/presentation/http/create.controller.ts',
        source: [
          `import { PRODUCT_CREATE_IDEMPOTENCY_SCOPE } from '../../application/idempotency/product-create-idempotency.contract.js';`,
          `import { CurrentIdempotentCommandContext } from '../../../../../common/security/auth.decorators.js';`,
          `@IdempotentEndpoint({ scope: PRODUCT_CREATE_IDEMPOTENCY_SCOPE })`,
          `create(@CurrentIdempotentCommandContext() context: unknown) {}`,
        ].join('\n'),
      },
      {
        path: 'apps/api/src/modules/product/application/create.service.ts',
        source: [
          `import { PRODUCT_CREATE_IDEMPOTENCY_SCOPE } from './idempotency/product-create-idempotency.contract.js';`,
          `await this.executor.execute({ scope: PRODUCT_CREATE_IDEMPOTENCY_SCOPE, key });`,
        ].join('\n'),
      },
    ]);

    expect(flagsPath(violations, 'create.controller.ts')).toBe(false);
  });
});
