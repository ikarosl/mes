/**
 * 技术文件（工序 SOP 与通用技术文件）扩展名白名单：常见图片、常见 Office 文档与 pdf。
 * 前端上传校验与后端兜底校验必须共用此清单，明确不含 ppt/pptx。
 */
export const TECHNICAL_FILE_EXTENSIONS = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
] as const;

/** 与扩展名一一对应的上传 MIME 白名单；服务端必须同时校验扩展名和 MIME。 */
export const TECHNICAL_FILE_MIME_TYPES_BY_EXTENSION = {
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  gif: ['image/gif'],
  webp: ['image/webp'],
  bmp: ['image/bmp', 'image/x-ms-bmp'],
  pdf: ['application/pdf'],
  doc: ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xls: ['application/vnd.ms-excel'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
} as const satisfies Record<(typeof TECHNICAL_FILE_EXTENSIONS)[number], readonly string[]>;

export const TECHNICAL_FILE_MAX_SIZE_BYTES = 20 * 1024 * 1024;
