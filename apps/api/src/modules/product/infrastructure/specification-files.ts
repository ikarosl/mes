import type { TechnicalFileListItem } from '@company/contracts';
import { SPECIFICATION_FILE_MAX_COUNT } from '@company/constants';
import type { AttachmentService } from '../../attachment/public.js';
import { ProductDomainError } from '../domain/product.errors.js';

function isSpecificationFileIds(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= SPECIFICATION_FILE_MAX_COUNT &&
    new Set(value).size === value.length &&
    value.every((id) => typeof id === 'string' && /^[1-9][0-9]{0,19}$/.test(id))
  );
}

export async function requireSpecificationFiles(
  files: AttachmentService,
  ids: string[],
): Promise<void> {
  if (!isSpecificationFileIds(ids) || ids.length < 1) {
    throw new ProductDomainError(
      'INVALID_INPUT',
      `请选择 1 至 ${SPECIFICATION_FILE_MAX_COUNT} 个不重复的规格文件`,
    );
  }
  await files.requireAvailable(ids, 'specification');
}

/** JSON 中保存十进制 ID 字符串，不能转成可能丢失 BIGINT 精度的 number。 */
export function readSpecificationIds(value: unknown): string[] {
  const ids: unknown = typeof value === 'string' ? JSON.parse(value) : value;
  if (!isSpecificationFileIds(ids)) throw new Error('规格文件存储数据不合法');
  return [...ids].sort((left, right) => left.length - right.length || left.localeCompare(right));
}

export interface SpecificationFiles {
  specificationFileIds: string[];
  specificationFiles: TechnicalFileListItem[];
}

/** 先读取本页根记录中的 JSON，再批量补充附件元数据。 */
export async function readSpecificationFiles(
  files: AttachmentService,
  rows: { id: string | number; specification_file_ids: unknown }[],
): Promise<Map<string, SpecificationFiles>> {
  const associations = new Map(
    rows.map((row) => [String(row.id), readSpecificationIds(row.specification_file_ids)]),
  );
  const ids = [...new Set([...associations.values()].flat())];
  const metadata = ids.length ? await files.getManyTechnicalFiles(ids) : [];
  const byId = new Map(
    metadata.filter((file) => file.fileType === 'specification').map((file) => [file.id, file]),
  );
  return new Map(
    [...associations].map(([id, specificationFileIds]) => {
      return [
        id,
        {
          specificationFileIds,
          specificationFiles: specificationFileIds.flatMap((fileId) => {
            const file = byId.get(fileId);
            return file ? [file] : [];
          }),
        },
      ];
    }),
  );
}
