import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IDEMPOTENCY_NOT_SUPPORTED } from '@company/constants';
import { describe, expect, it, vi } from 'vitest';
import { ProductController } from '../../../modules/product/presentation/http/product.controller.js';
import { IdempotencyKeyGuard } from '../idempotency-key.guard.js';

describe('Product upload idempotency header contract', () => {
  it('rejects an accidental Idempotency-Key before object storage or database writes', async () => {
    const storage = {
      storeSop: vi.fn(),
      remove: vi.fn(),
    };
    const technicalFiles = {
      createTechnicalFile: vi.fn(),
    };
    const context = {
      getHandler: () => ProductController.prototype.uploadTechnicalFile,
      getClass: () => ProductController,
      switchToHttp: () => ({
        getRequest: () => ({ headers: { 'idempotency-key': 'accidental-upload-key' } }),
      }),
    } as never;
    const guard = new IdempotencyKeyGuard(new Reflector());

    expect(() => guard.canActivate(context)).toThrow(BadRequestException);
    try {
      guard.canActivate(context);
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: IDEMPOTENCY_NOT_SUPPORTED }),
      );
    }
    expect(storage.storeSop).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
    expect(technicalFiles.createTechnicalFile).not.toHaveBeenCalled();
  });
});
