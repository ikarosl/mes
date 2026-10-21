export const PROCUREMENT_ERROR_CODES = {
  supplierNameTaken: 'SUPPLIER_NAME_TAKEN',
  supplierNotFound: 'SUPPLIER_NOT_FOUND',
  invalidSupplierName: 'INVALID_SUPPLIER_NAME',
  purchaseOrderNotFound: 'PURCHASE_ORDER_NOT_FOUND',
  invalidPurchaseOrder: 'INVALID_PURCHASE_ORDER',
  purchaseOrderState: 'PURCHASE_ORDER_STATE',
  procurementSourceUnavailable: 'PROCUREMENT_SOURCE_UNAVAILABLE',
  receiptNotFound: 'RECEIPT_NOT_FOUND',
  invalidReceipt: 'INVALID_RECEIPT',
  receiptState: 'RECEIPT_STATE',
} as const;

export const SUPPLIER_NAME_MAX_LENGTH = 100;
export const SUPPLIER_OPTIONS_WINDOW_SIZE = 50;
export const SUPPLIER_OPTIONS_MAX_INCLUDE_IDS = 100;
