import { Injectable } from '@nestjs/common';
import type {
  CreateSupplierPayload,
  SupplierOptionQuery,
  SupplierQuery,
  UpdateSupplierPayload,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { normalizeSupplierName } from '../domain/supplier-name.policy.js';
import { SupplierRepository } from './ports/supplier.repository.js';

@Injectable()
export class SupplierService {
  constructor(private readonly repository: SupplierRepository) {}

  list(query: SupplierQuery) {
    return this.repository.list({
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 10,
      keyword: query.keyword?.trim() || undefined,
    });
  }

  options(query: SupplierOptionQuery) {
    return this.repository.options({
      keyword: query.keyword?.trim() || undefined,
      includeIds: [...new Set(query.includeIds ?? [])],
    });
  }

  create(payload: CreateSupplierPayload, context: CommandContext) {
    return this.repository.create(
      { supplierName: normalizeSupplierName(payload.supplierName) },
      context,
    );
  }

  update(id: string, payload: UpdateSupplierPayload, context: CommandContext) {
    return this.repository.update(
      id,
      { supplierName: normalizeSupplierName(payload.supplierName), version: payload.version },
      context,
    );
  }
}
