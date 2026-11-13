import { describe, expect, it, vi } from 'vitest';
import { withTransaction } from '@company/database';
import { MysqlProductSnapshotRepository } from '../mysql-product-snapshot.repository.js';

describe('MysqlProductSnapshotRepository', () => {
  it('returns disabled inventory items for historical display without enabling write validation', async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValue([
          [{ id: 2, item_code: 'MAT-2', product_name: '停用物料', unit: 'pcs' }],
          [],
        ]),
    };
    const repository = new MysqlProductSnapshotRepository(pool as never);

    await expect(repository.listInventoryItemDisplayReferencesByIds(['2'])).resolves.toEqual([
      { id: '2', itemCode: 'MAT-2', productName: '停用物料', unit: 'pcs' },
    ]);
    const sql = String(pool.query.mock.calls[0]?.[0]);
    expect(sql).not.toContain('status=1');
    expect(sql).not.toContain('deleted_at IS NULL');
    expect(pool.query.mock.calls[0]?.[1]).toEqual(['2']);
  });

  // TODO(product-approved-bom-identities): 验证批准 BOM 快照保留基础物料与 BOM 行身份且同事务读取；高重要性：生产需求来源一致性，未审批 BOM 的公开读取链已退役且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，通过 getApprovedBomSnapshot 按当前批准依据恢复。

  it('joins an outer transaction and locks the current product used for a release snapshot', async () => {
    const connection = transactionConnection();
    const pool = { getConnection: vi.fn().mockResolvedValue(connection) };
    connection.query.mockResolvedValueOnce([[productRow], []]);
    const repository = new MysqlProductSnapshotRepository(pool as never);

    await withTransaction(pool as never, async () => repository.getProductionProduct('9'));

    expect(pool.getConnection).toHaveBeenCalledOnce();
    expect(String(connection.query.mock.calls[0]?.[0])).toContain('FOR UPDATE');
    expect(connection.commit).toHaveBeenCalledOnce();
  });

  // TODO(product-approved-bom-eligibility): 验证 BOM 投入物料后来停用时拒绝形成生产快照并回滚；高重要性：生产写入资格，未审批 BOM 的公开读取链已退役且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，通过批准 BOM 公开能力恢复资格与回滚断言。

  // TODO(product-task-release-snapshots): 验证下达时路线、工序及 SOP 对象键和版本快照同事务冻结；高重要性：历史执行依据与事务原子性，独立路线快照公开读取链已退役且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，通过正式下达生产定义公开能力恢复。

  // TODO(test-migration): 高重要性：路线快照事务；正式测试获准后按当前公开命令恢复。
  // TODO(product-route-snapshot): 验证正式下达复用任务事务并锁定选定路线配置；高重要性：跨模块事务与快照依据，旧创建快照夹具已失效且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，按当前下达路线与 BOM 资格恢复。

  // TODO(test-migration): 高重要性：BOM 批准资格；正式测试获准后补齐显式路线快照夹具。
  // TODO(product-route-snapshot): allows a production task only when the BOM approval is final and locked；高重要性，旧路线快照夹具已失效且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，按当前公开路线与BOM资格恢复。

  it('rejects a production task before reading BOM lines when approval is not final', async () => {
    const connection = transactionConnection();
    connection.query
      .mockResolvedValueOnce([[{ ...productRow, default_route_id: null }], []])
      .mockResolvedValueOnce([
        [{ bom_status: 'pending_approval', bom_locked_at: null, bom_approval_instance_id: 12 }],
        [],
      ]);
    const repository = repositoryWith(connection);

    await expect(repository.requireApprovedBomForProductionTask('9', '15')).rejects.toMatchObject({
      code: 'INVALID_MATERIAL',
    });
    expect(connection.execute).not.toHaveBeenCalled();
    expect(connection.query).toHaveBeenCalledTimes(2);
    expect(connection.rollback).toHaveBeenCalledOnce();
  });
});

const productRow = {
  id: 9,
  item_code: 'FG-1',
  product_name: 'Finished good',
  unit: 'pcs',
  default_route_id: 15,
};

const transactionConnection = () => ({
  beginTransaction: vi.fn(),
  query: vi.fn(),
  execute: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
});

const repositoryWith = (connection: ReturnType<typeof transactionConnection>) =>
  new MysqlProductSnapshotRepository({
    getConnection: vi.fn().mockResolvedValue(connection),
  } as never);
