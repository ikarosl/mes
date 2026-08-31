import { describe, expect, it, vi } from 'vitest';
import { UnsupportedMediaTypeException } from '@nestjs/common';
import {
  assertTechnicalFileExtension,
  assertTechnicalFileType,
  technicalFileUploadOptions,
} from '../technical-file-upload.validation.js';

describe('technical file upload validation', () => {
  it.each(['工艺SOP.PDF', 'photo.jpeg', '物料清单.xlsx', '说明.doc'])(
    'accepts a supported extension: %s',
    (fileName) => {
      expect(() => assertTechnicalFileExtension(fileName)).not.toThrow();
    },
  );

  it('rejects powerpoint and unsupported extensions before Multer buffers the file', () => {
    const callback = vi.fn();
    technicalFileUploadOptions.fileFilter(
      {},
      { originalname: '培训.ppt', mimetype: 'application/vnd.ms-powerpoint' },
      callback,
    );

    expect(callback).toHaveBeenCalledWith(expect.any(UnsupportedMediaTypeException), false);
    expect(() => assertTechnicalFileExtension('script.exe')).toThrow(UnsupportedMediaTypeException);
  });

  it('rejects a spoofed MIME type even when the filename extension is allowed', () => {
    expect(() => assertTechnicalFileType('工艺SOP.pdf', 'application/x-msdownload')).toThrow(
      UnsupportedMediaTypeException,
    );
  });
});
