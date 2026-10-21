import { describe, it } from 'vitest';

describe('MysqlProductionMaterialLossRepository', () => {
  // TODO(test-migration): 高重要性：损耗额度及事务；正式测试获准后按公共领料和结案用途恢复。
  it.todo('reads candidates with the current material name and filters consumed quantities');

  // TODO(test-migration): 高重要性：损耗额度及事务；正式测试获准后按公共领料和结案用途恢复。
  it.todo(
    'creates a pending loss, writes transactional audit on the same connection, and reloads current names',
  );

  // TODO(test-migration): 高重要性：损耗额度及事务；正式测试获准后按公共领料和结案用途恢复。
  it.todo(
    'rolls back without writing a scrap or audit when the available loss quantity is exceeded',
  );

  // TODO(test-migration): 高重要性：损耗额度及事务；正式测试获准后按公共领料和结案用途恢复。
  it.todo('cancels a pending loss with an audit and optimistic version check');
});
