import { it } from 'vitest';

// TODO(production-supplement): 高重要性：报废补料确认、授权生效、事务回滚及状态互斥。
// 用户明确启动正式测试后，按现行生产执行与公共库存契约重建夹具恢复。
it.todo(
  'keeps a scrap supplement non-allocatable until confirmation and activates its quota after outbound',
);
it.todo('rolls back every scrap-supplement confirmation write when any in-transaction write fails');
it.todo('rejects staging and confirmation once the abnormal is approved for rework');
it.todo('rejects staging and confirmation once the abnormal is rejected');
it.todo('rejects staging and confirmation once the batch is no longer in production');
