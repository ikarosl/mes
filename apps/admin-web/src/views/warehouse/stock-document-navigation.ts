import type { RouteLocationRaw } from 'vue-router';
import type {
  StockDocumentDirection,
  StockDocumentItemKind,
  StockDocumentSourceType,
} from '@company/contracts';
import { STOCK_DOCUMENT_SCENARIOS } from '@company/constants';

export function stockDocumentTabName(itemKind: StockDocumentItemKind): string {
  return itemKind === 'material'
    ? 'warehouse-material-stock-documents'
    : 'warehouse-finished-stock-documents';
}

function scopePermissions(
  itemKind: StockDocumentItemKind,
  direction: StockDocumentDirection,
): string[] {
  return [
    ...new Set(
      STOCK_DOCUMENT_SCENARIOS.filter(
        (scene) => scene.itemKind === itemKind && scene.direction === direction,
      ).map((scene) => scene.viewPermission),
    ),
  ];
}

export const STOCK_DOCUMENT_ROUTES = [
  {
    name: 'warehouse-material-inbound',
    itemKind: 'material',
    direction: 'inbound',
    permission: scopePermissions('material', 'inbound'),
  },
  {
    name: 'warehouse-material-outbound',
    itemKind: 'material',
    direction: 'outbound',
    permission: scopePermissions('material', 'outbound'),
  },
  {
    name: 'warehouse-finished-inbound',
    itemKind: 'finished_product',
    direction: 'inbound',
    permission: scopePermissions('finished_product', 'inbound'),
  },
  {
    name: 'warehouse-finished-outbound',
    itemKind: 'finished_product',
    direction: 'outbound',
    permission: scopePermissions('finished_product', 'outbound'),
  },
] as const;

export function stockDocumentViewPermission(
  direction: StockDocumentDirection,
  sourceType: StockDocumentSourceType,
): string | readonly string[] {
  return (
    STOCK_DOCUMENT_SCENARIOS.find(
      (scene) => scene.direction === direction && scene.sourceType === sourceType,
    )?.viewPermission ?? []
  );
}

export function stockDocumentRoute(
  itemKind: StockDocumentItemKind,
  direction: StockDocumentDirection,
  id?: string,
  sourceType?: StockDocumentSourceType,
  detailId?: string,
): RouteLocationRaw {
  const scope = STOCK_DOCUMENT_ROUTES.find(
    (route) => route.itemKind === itemKind && route.direction === direction,
  );
  return { name: scope?.name, query: { documentId: id, sourceType, detailId } };
}
