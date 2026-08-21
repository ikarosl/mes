const PREVIEW_MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.txt': 'text/plain',
  '.log': 'text/plain',
  '.csv': 'text/plain',
  '.json': 'text/plain',
  '.md': 'text/plain',
  '.xml': 'text/plain',
  '.yml': 'text/plain',
  '.yaml': 'text/plain',
};

export const getFileExtension = (fileName: string): string => {
  const dot = fileName.lastIndexOf('.');
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : '';
};

/** 仅允许浏览器可直接渲染、风险可控的格式走 Blob URL 预览。 */
export const canPreviewFile = (fileName: string): boolean =>
  getFileExtension(fileName) in PREVIEW_MIME_BY_EXTENSION;

export const previewMimeOf = (fileName: string, fallbackMime?: string): string =>
  PREVIEW_MIME_BY_EXTENSION[getFileExtension(fileName)] ??
  fallbackMime ??
  'application/octet-stream';
