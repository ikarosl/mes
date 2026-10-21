import { it } from 'vitest';

// TODO(inventory-ledger): 最高恢复优先级：库存账本不可变，拒绝直接 UPDATE／DELETE。
// 用户明确启动正式测试后，通过现行公共单据构造合法流水恢复。
// TODO(inventory-ledger): 同阶段补回余额投影、批次状态、负库存拒绝及盘点审计失败回滚。
it.todo(
  'rejects inventory transaction update and delete outside the dedicated fixture cleanup connection',
);
