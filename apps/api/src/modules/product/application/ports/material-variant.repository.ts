import type { MaterialVariantItem, MaterialVariantListQuery, PageResult } from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';

/**
 * Product owns variant master data. Production must consume this capability through
 * Product's public boundary and must not query `material_variants` directly.
 */
/** Shared public shape for paged Product lists and cross-module option reads. */
export type MaterialVariantRecord = MaterialVariantItem;

/** 仅供既有单据展示；包含停用、软删除版本，不得用于写操作校验。 */
export interface MaterialVariantDisplayReference {
  id: string;
  variantCode: string;
}

export interface CreateMaterialVariantCommand {
  materialId: string;
  majorVersion: string;
  minorVersion: string;
  remark: string | null;
}

export abstract class MaterialVariantQuery {
  abstract listDisplayReferencesByIds(
    variantIds: string[],
  ): Promise<MaterialVariantDisplayReference[]>;
  /**
   * `lock` is a domain-level concurrency hint. It is meaningful only when the
   * caller is already inside the shared application transaction; the adapter
   * reuses that transaction and locks the selected master rows before a write.
   */
  abstract listEnabledByMaterials(
    materialIds: string[],
    options?: { lock?: boolean },
  ): Promise<MaterialVariantRecord[]>;
}

export abstract class MaterialVariantRepository extends MaterialVariantQuery {
  abstract list(query: MaterialVariantListQuery): Promise<PageResult<MaterialVariantItem>>;
  abstract create(
    command: CreateMaterialVariantCommand,
    context: CommandContext,
  ): Promise<{ id: string; variantCode: string }>;
  abstract setStatus(id: string, status: number, context: CommandContext): Promise<void>;
}
