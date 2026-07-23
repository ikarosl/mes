export type ProductErrorCode =
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVALID_CATEGORY'
  | 'INVALID_PRODUCT_KIND'
  | 'INVALID_MATERIAL'
  | 'INVALID_ROUTE'
  | 'IMMUTABLE_ROUTE'
  | 'ROUTE_STEPS_REQUIRED'
  | 'ROUTE_IN_USE';

export class ProductDomainError extends Error {
  constructor(
    readonly code: ProductErrorCode,
    message: string,
  ) {
    super(message);
  }
}
