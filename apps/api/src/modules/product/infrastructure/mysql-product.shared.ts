import { ProductDomainError } from '../domain/product.errors.js';

/**
 * 把数据库驱动错误映射为稳定的模块错误。application 层不得识别 `ER_DUP_ENTRY` 等驱动错误码，
 * 唯一的兜底位置在 infrastructure 仓库：并发竞态下自然键撞唯一约束时，映射为 409 语义的 CONFLICT。
 */
export const mapProductWriteError = (error: unknown, message: string): never => {
  if ((error as { code?: string })?.code === 'ER_DUP_ENTRY')
    throw new ProductDomainError('CONFLICT', message);
  throw error;
};
