import 'reflect-metadata';
import { BadRequestException, StreamableFile } from '@nestjs/common';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS } from '@company/constants';
import { REQUIRED_PERMISSION } from '../../../../identity/presentation/http/auth.decorators.js';
import { ProductController } from '../product.controller.js';

describe('ProductController technical files', () => {
  it('streams a private download with safe response headers and RBAC metadata', async () => {
    const service = {
      downloadTechnicalFile: vi.fn().mockResolvedValue({
        file: {
          originalName: '工艺 SOP.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 12,
        },
        stream: Readable.from(Buffer.from('content')),
      }),
    };
    const controller = new ProductController(service as never);
    const setHeader = vi.fn();

    const result = await controller.downloadTechnicalFile({ id: '8' }, { setHeader });

    expect(result).toBeInstanceOf(StreamableFile);
    expect(setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(setHeader).toHaveBeenCalledWith('Content-Length', '12');
    expect(setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION, ProductController.prototype.downloadTechnicalFile),
    ).toBe(PERMISSIONS.product.files.download);
  });

  it('rejects an empty multipart upload before calling the service', () => {
    const service = { uploadTechnicalFile: vi.fn() };
    const controller = new ProductController(service as never);

    expect(() => controller.uploadTechnicalFile(undefined, { userId: '1', ip: null })).toThrow(
      BadRequestException,
    );
    expect(service.uploadTechnicalFile).not.toHaveBeenCalled();
  });

  it('repairs a UTF-8 multipart filename before calling the service', () => {
    const service = { uploadTechnicalFile: vi.fn().mockReturnValue({ id: '9' }) };
    const controller = new ProductController(service as never);
    const audit = { userId: '1', ip: null };

    controller.uploadTechnicalFile(
      {
        originalname: '12- æååè£æ£éªè§ç¨.docx',
        mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: Buffer.from('document'),
        size: 8,
      },
      audit,
    );

    expect(service.uploadTechnicalFile).toHaveBeenCalledWith(
      expect.objectContaining({ originalName: '12- 成品包装检验规程.docx' }),
      audit,
    );
  });
});
