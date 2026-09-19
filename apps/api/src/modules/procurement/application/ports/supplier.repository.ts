import type {
  CreateSupplierPayload,
  PageResult,
  SupplierItem,
  SupplierOption,
  SupplierOptionQuery,
  SupplierQuery,
  UpdateSupplierPayload,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';

export type SupplierListFilter = SupplierQuery & { page: number; pageSize: number };

export abstract class SupplierRepository {
  abstract list(query: SupplierListFilter): Promise<PageResult<SupplierItem>>;
  abstract options(query: SupplierOptionQuery): Promise<SupplierOption[]>;
  abstract create(payload: CreateSupplierPayload, context: CommandContext): Promise<SupplierItem>;
  abstract update(
    id: string,
    payload: UpdateSupplierPayload,
    context: CommandContext,
  ): Promise<SupplierItem>;
}
