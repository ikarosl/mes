import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { IDEMPOTENCY_NOT_SUPPORTED } from '@company/constants';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProductService } from '../../../modules/product/application/product.service.js';
import { ProductController } from '../../../modules/product/presentation/http/product.controller.js';
import { IdempotencyKeyGuard } from '../idempotency-key.guard.js';

describe('Product upload idempotency header contract', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('rejects an accidental Idempotency-Key before object storage or database writes', async () => {
    const storage = {
      storeSop: vi.fn(),
      remove: vi.fn(),
    };
    const technicalFiles = {
      createTechnicalFile: vi.fn(),
    };
    const service = new ProductService(
      technicalFiles as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      storage as never,
      {} as never,
    );
    const moduleRef = await Test.createTestingModule({
      controllers: [ProductController],
      providers: [
        { provide: ProductService, useValue: service },
        {
          provide: APP_GUARD,
          useFactory: (reflector: Reflector) => new IdempotencyKeyGuard(reflector),
          inject: [Reflector],
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();

    const response = await request(app.getHttpServer())
      .post('/product/technical-files')
      .set('Idempotency-Key', 'accidental-upload-key')
      .attach('file', Buffer.from('document'), 'sop.pdf');

    expect(response.status).toBe(400);
    expect(response.body).toEqual(expect.objectContaining({ code: IDEMPOTENCY_NOT_SUPPORTED }));
    expect(storage.storeSop).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
    expect(technicalFiles.createTechnicalFile).not.toHaveBeenCalled();
  });
});
