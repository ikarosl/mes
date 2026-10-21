import { it } from 'vitest';

// TODO(material-outbound): 高重要性：分次领料、损耗不提需、整单确认、库存保护、并发及幂等。
// 用户明确启动正式测试后，按现行公共出库及生产履约契约重建夹具恢复。
it.todo('confirms partial outbound and handles the remaining demand after administrator start');
it.todo('records material loss without generating demand and continues the remaining outbound');
it.todo(
  'creates one pending multi-line order without stock deduction, then confirms it atomically',
);
it.todo('serializes competing pending orders and restores orderable quantity after cancellation');
it.todo('keeps a pending order intact when aggregate stock validation fails during confirmation');
it.todo(
  'replays create and confirm without duplicate order or stock deduction and rejects damaged results',
);
