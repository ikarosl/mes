import { describe, it } from 'vitest';

describe('MysqlProductionAbnormalRepository rejection', () => {
  // TODO(test-migration): 高重要性：异常冲销；正式测试获准后补齐工单锁和专检来源。
  it.todo(
    'reverses a direct pure-abnormal report in the same transaction without creating scrap authorization',
  );

  // TODO(test-migration): 高重要性：异常冲销；正式测试获准后补齐工单锁和专检来源。
  it.todo('rejects a mixed or rework-completion source instead of silently reversing it');
});
