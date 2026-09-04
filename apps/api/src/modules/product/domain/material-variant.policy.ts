import { ProductDomainError } from './product.errors.js';

/**
 * Material-version architecture contract.
 *
 * `materialProductId` is the stable base-material/BOM identity; `variantId` is the
 * exact demand and stock identity. Every enabled variant under the same base
 * material is interchangeable in every BOM reference. Do not introduce route-step
 * bindings, per-BOM allowlists, compatibility matrices, or code-prefix matching.
 *
 * Variant codes are assembled and validated server-side from the immutable base
 * code plus major/minor versions. Product's enabled-variant query invokes this
 * guard while mapping rows, so corrupted or cross-material rows cannot escape
 * through the public capability.
 */
export interface MaterialVariantCandidate {
  id: string;
  materialProductId: string;
  status: number;
  isDeleted: number;
}

export const requireEnabledCompatibleMaterialVariant = (
  materialProductId: string,
  variant: MaterialVariantCandidate,
): void => {
  if (
    variant.materialProductId !== materialProductId ||
    variant.status !== 1 ||
    variant.isDeleted !== 0
  ) {
    throw new ProductDomainError(
      'INVALID_PRODUCT_KIND',
      '所选版本必须是该基础物料下已启用且未删除的版本',
    );
  }
};
