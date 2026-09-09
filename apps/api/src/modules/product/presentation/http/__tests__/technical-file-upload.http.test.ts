import 'reflect-metadata';
import { Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TECHNICAL_FILE_MAX_SIZE_BYTES } from '@company/constants';
import { technicalFileUploadOptions } from '../technical-file-upload.validation.js';

@Controller('upload')
class UploadProbeController {
  @Post()
  @UseInterceptors(FileInterceptor('file', technicalFileUploadOptions))
  upload(@UploadedFile() file: { size: number }) {
    return { size: file.size };
  }
}

describe('technical file multipart HTTP compatibility', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [UploadProbeController],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('accepts a PDF at the configured size limit', async () => {
    const response = await request(app.getHttpServer())
      .post('/upload')
      .attach('file', Buffer.alloc(TECHNICAL_FILE_MAX_SIZE_BYTES), 'sop.pdf');
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ size: TECHNICAL_FILE_MAX_SIZE_BYTES });
  });

  it('rejects a file above the configured size limit', async () => {
    const response = await request(app.getHttpServer())
      .post('/upload')
      .attach('file', Buffer.alloc(TECHNICAL_FILE_MAX_SIZE_BYTES + 1), 'sop.pdf');
    expect(response.status).toBe(413);
  });

  it('rejects unsupported files and multiple files', async () => {
    const unsupported = await request(app.getHttpServer())
      .post('/upload')
      .attach('file', Buffer.from('unsupported'), 'sop.exe');
    expect(unsupported.status).toBe(415);
    const multiple = await request(app.getHttpServer())
      .post('/upload')
      .attach('file', Buffer.from('first'), 'first.pdf')
      .attach('file', Buffer.from('second'), 'second.pdf');
    expect(multiple.status).toBe(400);
  });
});
