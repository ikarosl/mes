import { it } from 'vitest';

// TODO(production-reporting): 高重要性：不可变报工、冲销／更正、返工结果、额度、并发及幂等。
// 用户明确启动正式测试后，按现行数量与报工契约重建夹具恢复。
it.todo(
  'records split reports, creates pending abnormal disposition and consumes the unified report limit',
);
it.todo('closes a source-bound rework as separate immutable result reports in one transaction');
it.todo('corrects a normal report without changing an explicitly completed step');
it.todo('serializes concurrent reports with the same step version');
it.todo('replays report creation and correction without duplicating immutable facts');
