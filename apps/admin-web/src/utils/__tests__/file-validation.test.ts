import { describe, expect, it } from 'vitest';
import { TECHNICAL_FILE_EXTENSIONS } from '@company/constants';
import {
  TECHNICAL_FILE_MAX_SIZE_MIB,
  UPLOAD_ACCEPT,
  validateTechnicalFileUpload,
} from '../file-validation';

const fileOf = (name: string, size = 1024) => ({ name, size });

describe('validateTechnicalFileUpload', () => {
  it('accepts whitelisted image, office and pdf extensions case-insensitively', () => {
    expect(validateTechnicalFileUpload(fileOf('焊接SOP.PDF'))).toBeNull();
    expect(validateTechnicalFileUpload(fileOf('photo.PNG'))).toBeNull();
    expect(validateTechnicalFileUpload(fileOf('物料清单.xlsx'))).toBeNull();
    expect(validateTechnicalFileUpload(fileOf('说明文档.docx'))).toBeNull();
  });

  it('accepts a file exactly at the 20 MiB cap', () => {
    expect(validateTechnicalFileUpload(fileOf('a.pdf', 20 * 1024 * 1024))).toBeNull();
  });

  it('rejects file types outside the whitelist with the supported list', () => {
    const message = validateTechnicalFileUpload(fileOf('脚本.exe'));
    expect(message).toBe(`不支持的文件类型，仅支持：${TECHNICAL_FILE_EXTENSIONS.join('、')}`);
    expect(validateTechnicalFileUpload(fileOf('演示.ppt'))).toContain('不支持的文件类型');
    expect(validateTechnicalFileUpload(fileOf('无扩展名'))).toContain('不支持的文件类型');
  });

  it('rejects files beyond the 20 MiB cap', () => {
    expect(validateTechnicalFileUpload(fileOf('a.pdf', 20 * 1024 * 1024 + 1))).toBe(
      `文件大小不能超过 ${TECHNICAL_FILE_MAX_SIZE_MIB} MiB`,
    );
  });
});

describe('UPLOAD_ACCEPT', () => {
  it('mirrors the shared extension whitelist as dotted accept values', () => {
    expect(UPLOAD_ACCEPT).toBe(
      TECHNICAL_FILE_EXTENSIONS.map((extension) => `.${extension}`).join(','),
    );
  });
});
