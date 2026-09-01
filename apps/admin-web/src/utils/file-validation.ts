import { TECHNICAL_FILE_EXTENSIONS, TECHNICAL_FILE_MAX_SIZE_BYTES } from '@company/constants';
import { getFileExtension } from './file-preview';

/** el-upload accept 提示值；仅优化文件选择器过滤，不作为校验依据。 */
export const UPLOAD_ACCEPT = TECHNICAL_FILE_EXTENSIONS.map((ext) => `.${ext}`).join(',');

const SUPPORTED_EXTENSIONS_LABEL = TECHNICAL_FILE_EXTENSIONS.join('、');
export const TECHNICAL_FILE_MAX_SIZE_MIB = TECHNICAL_FILE_MAX_SIZE_BYTES / 1024 / 1024;

/** 上传前校验，返回可理解的拒绝原因；合法文件返回 null。类型按扩展名判定，与后端兜底校验共用同一白名单。 */
export const validateTechnicalFileUpload = (file: {
  name: string;
  size: number;
}): string | null => {
  const extension = getFileExtension(file.name).slice(1);
  if (!(TECHNICAL_FILE_EXTENSIONS as readonly string[]).includes(extension)) {
    return `不支持的文件类型，仅支持：${SUPPORTED_EXTENSIONS_LABEL}`;
  }
  if (file.size > TECHNICAL_FILE_MAX_SIZE_BYTES) {
    return `文件大小不能超过 ${TECHNICAL_FILE_MAX_SIZE_MIB} MiB`;
  }
  return null;
};
