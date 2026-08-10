import 'reflect-metadata';
import { BadRequestException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IDEMPOTENCY_NOT_SUPPORTED } from '@company/constants';
import { describe, expect, it } from 'vitest';
import {
  IDEMPOTENT_ENDPOINT,
  IdempotentEndpoint,
  IS_PUBLIC,
  VALIDATED_IDEMPOTENCY_KEY,
} from '../../../common/security/auth.decorators.js';
import { IdempotencyKeyGuard } from '../idempotency-key.guard.js';

const TEST_SCOPE = 'test.scope.v1';

class PlainController {
  create() {}
}
class EnabledController {
  create() {}
}
class PublicController {
  create() {}
}

IdempotentEndpoint({ scope: TEST_SCOPE })(EnabledController);
SetMetadata(IS_PUBLIC, true)(PublicController);

class HandlerEnabledController {
  create() {}
}
IdempotentEndpoint({ scope: TEST_SCOPE })(
  HandlerEnabledController.prototype,
  'create',
  Object.getOwnPropertyDescriptor(HandlerEnabledController.prototype, 'create')!,
);

const VALID_KEY = '018f14a8-8f10-7d3a-a825-3d7ce6c9bc41';
const TOO_LONG_KEY = 'k'.repeat(151);

const context = (
  handler: object,
  klass: object,
  headers?: Record<string, string | string[] | undefined>,
) =>
  ({
    getHandler: () => handler,
    getClass: () => klass,
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  }) as never;

const guard = new IdempotencyKeyGuard(new Reflector());

const expectBadRequest = (fn: () => boolean, code: string) => {
  let threw = false;
  try {
    fn();
  } catch (error) {
    threw = true;
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toEqual(expect.objectContaining({ code }));
  }
  expect(threw, `expected a BadRequestException with code ${code}`).toBe(true);
};

describe('IdempotencyKeyGuard matrix', () => {
  it('passes a not-enabled endpoint without an Idempotency-Key', () => {
    expect(guard.canActivate(context(PlainController.prototype.create, PlainController))).toBe(
      true,
    );
  });

  it('rejects a not-enabled endpoint carrying a valid Idempotency-Key', () => {
    expectBadRequest(
      () =>
        guard.canActivate(
          context(PlainController.prototype.create, PlainController, {
            'idempotency-key': VALID_KEY,
          }),
        ),
      IDEMPOTENCY_NOT_SUPPORTED,
    );
  });

  it('rejects a not-enabled endpoint carrying an invalid key with IDEMPOTENCY_NOT_SUPPORTED, not VALIDATION_ERROR', () => {
    for (const header of ['', '   ', TOO_LONG_KEY]) {
      expectBadRequest(
        () =>
          guard.canActivate(
            context(PlainController.prototype.create, PlainController, {
              'idempotency-key': header,
            }),
          ),
        IDEMPOTENCY_NOT_SUPPORTED,
      );
    }
  });

  it('rejects an enabled endpoint missing the required Idempotency-Key', () => {
    expectBadRequest(
      () => guard.canActivate(context(EnabledController.prototype.create, EnabledController)),
      'VALIDATION_ERROR',
    );
  });

  it('rejects an enabled endpoint with an empty or overlong Idempotency-Key', () => {
    for (const header of ['', '   ', TOO_LONG_KEY]) {
      expectBadRequest(
        () =>
          guard.canActivate(
            context(EnabledController.prototype.create, EnabledController, {
              'idempotency-key': header,
            }),
          ),
        'VALIDATION_ERROR',
      );
    }
  });

  it('passes an enabled endpoint with a valid Idempotency-Key', () => {
    const request = { headers: { 'idempotency-key': `  ${VALID_KEY}  ` } } as {
      headers: Record<string, string>;
      [VALIDATED_IDEMPOTENCY_KEY]?: string;
    };
    const executionContext = {
      getHandler: () => HandlerEnabledController.prototype.create,
      getClass: () => HandlerEnabledController,
      switchToHttp: () => ({ getRequest: () => request }),
    } as never;

    expect(guard.canActivate(executionContext)).toBe(true);
    expect(request[VALIDATED_IDEMPOTENCY_KEY]).toBe(VALID_KEY);
  });

  it('passes a public endpoint without an Idempotency-Key (public endpoints never require one)', () => {
    expect(guard.canActivate(context(PublicController.prototype.create, PublicController))).toBe(
      true,
    );
  });

  // 严格契约：公开端点不接入幂等闭环，但收到该头必须明确拒绝（400 IDEMPOTENCY_NOT_SUPPORTED），
  // 不得静默接受——客户端一旦发送，说明其误以为请求受幂等保护。
  it('rejects a public endpoint carrying an Idempotency-Key', () => {
    expectBadRequest(
      () =>
        guard.canActivate(
          context(PublicController.prototype.create, PublicController, {
            'idempotency-key': VALID_KEY,
          }),
        ),
      IDEMPOTENCY_NOT_SUPPORTED,
    );
  });
});

describe('IdempotentEndpoint decorator', () => {
  it('throws at decoration time when scope is empty or whitespace-only', () => {
    expect(() => IdempotentEndpoint({ scope: '' })).toThrow(/scope/);
    expect(() => IdempotentEndpoint({ scope: '   ' })).toThrow(/scope/);
  });

  it('stores the scope in metadata for the guard to read', () => {
    const meta = Reflect.getMetadata(IDEMPOTENT_ENDPOINT, EnabledController);
    expect(meta).toEqual({ scope: TEST_SCOPE });
  });
});
