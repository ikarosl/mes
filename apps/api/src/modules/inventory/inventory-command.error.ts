/** Inventory 公开命令的稳定失败契约，不携带 SQL 或内部异常。 */
export class InventoryCommandError extends Error {
  constructor(
    readonly code:
      | 'NOT_FOUND'
      | 'CONFLICT'
      | 'INVALID_STATE'
      | 'INVALID_INPUT'
      | 'CONCURRENT_MODIFICATION'
      | 'INSUFFICIENT_AVAILABLE_STOCK'
      | 'INBOUND_CONFIRM_NOT_ALLOWED'
      | 'INBOUND_CANCEL_NOT_ALLOWED'
      | 'STOCK_CHECK_COUNT_NOT_ALLOWED'
      | 'STOCK_CHECK_INCOMPLETE'
      | 'STOCK_CHECK_SNAPSHOT_CHANGED'
      | 'STOCK_CHECK_CANCEL_NOT_ALLOWED',
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}
