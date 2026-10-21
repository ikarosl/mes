import { it } from 'vitest';

// TODO(production-persistence): 高重要性：任务／需求持久化、版本冻结、不可变事实、并发及回滚。
// 用户明确启动正式测试后，按任务级锁版及现行查询／幂等契约重建；原题名仅作覆盖索引。
it.todo(
  'persists administrator-selected exact versions, supports a split and replays the same intent',
);
it.todo('serializes concurrent first version selection to one demand plan');
it.todo('reuses one independent route across products while isolating snapshots and demands');
it.todo('keeps manual additions attached to their batch, basis, and selected variant');
it.todo('allows research splits but keeps mass-production versions locked across batches');
it.todo('rolls back failed demand configuration and batch creation transactions');
it.todo(
  'serializes concurrent batch creation by locking the work order and duplicate batch number',
);
it.todo(
  'stores immutable report facts and derives the compatibility totals after reversal and correction',
);
it.todo('enforces abnormal disposition identity, review state and separated step status');
