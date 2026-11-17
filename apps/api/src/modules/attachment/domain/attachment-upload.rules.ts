import {
  TECHNICAL_FILE_EXTENSIONS,
  TECHNICAL_FILE_MAX_SIZE_BYTES,
  TECHNICAL_FILE_MIME_TYPES_BY_EXTENSION,
  TECHNICAL_FILE_TYPES,
} from '@company/constants';
import type { TechnicalFileType } from '@company/contracts';
import { AttachmentError } from './attachment.errors.js';

interface UploadInput {
  originalName: string;
  mimeType: string;
  buffer: Buffer;
}

export const requireValidAttachmentUpload = (
  file: UploadInput,
  fileType: TechnicalFileType,
  versionNo: string | null,
): void => {
  if (!(TECHNICAL_FILE_TYPES as readonly string[]).includes(fileType))
    throw new AttachmentError('INVALID_ATTACHMENT_INPUT', '附件用途无效');
  if (!Buffer.isBuffer(file.buffer) || file.buffer.length === 0)
    throw new AttachmentError('INVALID_ATTACHMENT_INPUT', '上传文件不能为空');
  if (file.buffer.length > TECHNICAL_FILE_MAX_SIZE_BYTES)
    throw new AttachmentError('ATTACHMENT_TOO_LARGE', '附件不能超过 20 MiB');
  if (!file.originalName.trim() || file.originalName.length > 255)
    throw new AttachmentError('INVALID_ATTACHMENT_INPUT', '文件名不能为空，且不能超过 255 个字符');
  if (
    (fileType === 'sop' && (!versionNo?.trim() || versionNo.length > 64)) ||
    (fileType === 'specification' && versionNo !== null)
  )
    throw new AttachmentError('INVALID_ATTACHMENT_INPUT', '附件用途与版本不一致');
  const extension = file.originalName.split('.').at(-1)?.toLowerCase();
  const supported = TECHNICAL_FILE_EXTENSIONS.find((candidate) => candidate === extension);
  if (!supported) throw new AttachmentError('UNSUPPORTED_ATTACHMENT_TYPE', '不支持的附件类型');
  const allowed: readonly string[] = TECHNICAL_FILE_MIME_TYPES_BY_EXTENSION[supported];
  if (!allowed.includes(file.mimeType))
    throw new AttachmentError('UNSUPPORTED_ATTACHMENT_TYPE', '文件 MIME 类型与扩展名不匹配');
};
