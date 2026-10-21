import { it } from 'vitest';

// TODO(production-execution): 高重要性：任务开工、当前派工资格、明确完工及状态／审计原子性。
// 用户明确启动正式测试后，按现行状态模型重建夹具；原题名仅作覆盖索引。
it.todo('requires administrator batch start before a worker starts the first step');
it.todo('rejects a non-assignee without changing state or writing success audit');
it.todo('serializes competing assignments and preserves one responsible employee');
it.todo('rolls back assignment when transactional success audit fails');
it.todo(
  'completes execution after every required step is explicitly completed and naturally replays',
);
it.todo('rejects incomplete execution and rolls back completion if success audit fails');
