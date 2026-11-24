/**
 * 技术文件（工序 SOP 与通用技术文件）扩展名白名单：图片、Office、PDF 与 CAD 图纸。
 * 前端上传校验与后端兜底校验必须共用此清单。
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
  'ppt',
  'pptx',
  'dwg',
  'dxf',
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
  ppt: ['application/vnd.ms-powerpoint'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  // CAD 文件在未注册对应应用的系统中通常以通用二进制类型上传；仅对这两种扩展名接受该类型。
  dwg: [
    'image/vnd.dwg',
    'image/x-dwg',
    'application/acad',
    'application/x-acad',
    'application/dwg',
    'application/x-dwg',
    'application/octet-stream',
  ],
  dxf: [
    'image/vnd.dxf',
    'image/x-dxf',
    'application/dxf',
    'application/x-dxf',
    'application/octet-stream',
  ],
} as const satisfies Record<(typeof TECHNICAL_FILE_EXTENSIONS)[number], readonly string[]>;

export const TECHNICAL_FILE_MAX_SIZE_BYTES = 20 * 1024 * 1024;

/** 每个成品或精确物料版本当前关联的规格文件上限。 */
export const SPECIFICATION_FILE_MAX_COUNT = 5;
