import { UnsupportedMediaTypeException } from '@nestjs/common';
import {
  TECHNICAL_FILE_EXTENSIONS,
  TECHNICAL_FILE_MAX_SIZE_BYTES,
  TECHNICAL_FILE_MIME_TYPES_BY_EXTENSION,
} from '@company/constants';

type MulterFileFilterCallback = (error: Error | null, acceptFile: boolean) => void;
type TechnicalFileExtension = (typeof TECHNICAL_FILE_EXTENSIONS)[number];

const supportedExtensionsLabel = TECHNICAL_FILE_EXTENSIONS.join('、');

const extensionOf = (fileName: string) => fileName.split('.').at(-1)?.toLowerCase();

export const assertTechnicalFileExtension = (fileName: string): TechnicalFileExtension => {
  const extension = extensionOf(fileName);
  if (!(TECHNICAL_FILE_EXTENSIONS as readonly string[]).includes(extension ?? '')) {
    throw new UnsupportedMediaTypeException(
      `不支持的文件类型，仅支持：${supportedExtensionsLabel}`,
    );
  }
  return extension as TechnicalFileExtension;
};

export const assertTechnicalFileType = (fileName: string, mimeType: string) => {
  const extension = assertTechnicalFileExtension(fileName);
  const allowedMimeTypes = TECHNICAL_FILE_MIME_TYPES_BY_EXTENSION[extension];
  if (!(allowedMimeTypes as readonly string[]).includes(mimeType)) {
    throw new UnsupportedMediaTypeException(
      `文件 MIME 类型与扩展名不匹配，仅支持：${supportedExtensionsLabel}`,
    );
  }
};

/**
 * Multer 在读取完整文件前按扩展名拒绝不支持的上传；控制器仍会再次校验，
 * 以保证直接调用与未来改动不会绕过服务端安全边界。
 */
export const technicalFileUploadOptions = {
  limits: { fileSize: TECHNICAL_FILE_MAX_SIZE_BYTES, files: 1 },
  fileFilter: (
    _request: unknown,
    file: { originalname: string; mimetype: string },
    callback: MulterFileFilterCallback,
  ) => {
    try {
      assertTechnicalFileType(file.originalname, file.mimetype);
      callback(null, true);
    } catch (error) {
      callback(error instanceof Error ? error : new Error('技术文件校验失败'), false);
    }
  },
};
