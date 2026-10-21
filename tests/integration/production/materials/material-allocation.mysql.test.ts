import { it } from 'vitest';

// TODO(material-allocation): 高重要性：分配／释放、库存预留、防超配、并发及幂等。
// 用户明确启动正式测试后，以现行公共单据准备库存事实并恢复夹具。
it.todo('allocates, releases without deleting facts, and recomputes the batch material state');
it.todo('serializes competing allocations on one inventory batch and prevents over-allocation');
it.todo(
  'replays allocation after a lost response, rejects key reuse with a different payload, and rolls back failed business writes',
);
