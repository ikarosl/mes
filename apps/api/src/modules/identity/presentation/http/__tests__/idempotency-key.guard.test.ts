import 'reflect-metadata';
import { BadRequestException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IDEMPOTENCY_NOT_SUPPORTED } from '@company/constants';
import { describe, expect, it } from 'vitest';
import { IDEMPOTENT_ENDPOINT, IS_PUBLIC } from '../../../../../common/security/auth.decorators.js';
import { IdempotencyKeyGuard } from '../idempotency-key.guard.js';

class PlainController {
  create() {}
}
class EnabledController {
  create() {}
}
class PublicController {
  create() {}
}

SetMetadata(IDEMPOTENT_ENDPOINT, true)(EnabledController);
SetMetadata(IS_PUBLIC, true)(PublicController);

class HandlerEnabledController {
  create() {}
}
SetMetadata(IDEMPOTENT_ENDPOINT, true)(
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
    expect(
      guard.canActivate(
        context(HandlerEnabledController.prototype.create, HandlerEnabledController, {
          'idempotency-key': VALID_KEY,
        }),
      ),
    ).toBe(true);
  });

  it('passes a public endpoint even when it carries an Idempotency-Key', () => {
    expect(
      guard.canActivate(
        context(PublicController.prototype.create, PublicController, {
          'idempotency-key': VALID_KEY,
        }),
      ),
    ).toBe(true);
  });
});
