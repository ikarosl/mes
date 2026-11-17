import type { TechnicalFileListItem } from '@company/contracts';
import type { AttachmentService } from '../../attachment/public.js';
import { ProductDomainError } from '../domain/product.errors.js';

/** 调用方持有主数据根锁；附件资格锁由 Attachment 在同池事务中持有。 */
export async function requireSpecificationFile(
  files: AttachmentService,
  id: string,
): Promise<void> {
  if (!id || !/^\d+$/.test(id)) {
    throw new ProductDomainError('INVALID_INPUT', '请选择规格书文件');
  }
  await files.requireAvailable([id], 'specification');
}

/** 只为当前结果集批量补齐展示元数据，不改变业务分页或授予绑定资格。 */
export async function readSpecificationFiles(
  files: AttachmentService,
  fileIds: Array<number | string | null>,
): Promise<Map<string, TechnicalFileListItem>> {
  const ids = [...new Set(fileIds.filter((id): id is number | string => id !== null).map(String))];
  if (!ids.length) return new Map();
  const references = await files.getManyTechnicalFiles(ids);
  return new Map(
    references.filter((file) => file.fileType === 'specification').map((file) => [file.id, file]),
  );
}
