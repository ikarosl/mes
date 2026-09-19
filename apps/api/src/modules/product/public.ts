export { ProductModule } from './product.module.js';
export {
  ProductInventoryEligibility,
  type MaterialIdentityReference,
  type InventoryMaterialEligibility,
} from './application/product-inventory-eligibility.query.js';
export { ProductBomApprovalHandler } from './application/product-bom-approval.handler.js';
export { ProductProductionDefinitionCommand } from './application/product-production-definition.command.js';
export {
  TechnicalFileContentQuery,
  type HistoricalTechnicalFileContent,
  type HistoricalTechnicalFileSnapshotLocator,
} from './application/technical-file-content.query.js';
export {
  ProductSnapshotQuery,
  type ProductQueryFailure,
  type ProductQueryResult,
  type ProcessRouteSnapshot,
  type ProcessRouteStepSnapshot,
  type ProductBomLineSnapshot,
  type ProductBomSnapshot,
  type ProductionProductSnapshot,
  type InventoryItemDisplayReference,
  type InventoryItemReference,
  type EnabledSopFileSnapshot,
} from './application/product-snapshot.query.js';
export {
  MaterialVariantQuery,
  type MaterialVariantRecord,
  type MaterialVariantDisplayReference,
} from './application/ports/material-variant.repository.js';

export { PRODUCT_BOM_APPROVAL_SCENE } from './approval-scenes.js';
