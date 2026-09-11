import { describe, expect, it, vi } from 'vitest';
import { withTransaction } from '@company/database';
import { ProductDomainError } from '../../domain/product.errors.js';
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

  it('returns the Product-owned identifiers required by production snapshots', async () => {
    const connection = transactionConnection();
    connection.query.mockResolvedValueOnce([[productRow], []]).mockResolvedValueOnce([
      [
        {
          product_material_id: 31,
          material_id: 21,
          item_code: 'MAT-1',
          product_name: 'Material',
          unit: 'kg',
          quantity_per_unit: '2.5000',
          material_status: 1,
          material_is_deleted: 0,
          category_status: 1,
          category_is_deleted: 0,
        },
      ],
      [],
    ]);
    const repository = repositoryWith(connection);

    await expect(repository.getBomSnapshot('9')).resolves.toMatchObject({
      lines: [{ productMaterialId: '31', materialId: '21' }],
    });
    expect(connection.commit).toHaveBeenCalledOnce();
  });

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

  it('rejects an enabled BOM line whose material was disabled later', async () => {
    const connection = transactionConnection();
    connection.query.mockResolvedValueOnce([[productRow], []]).mockResolvedValueOnce([
      [
        {
          product_material_id: 31,
          material_id: 21,
          material_status: 0,
          material_is_deleted: 0,
          category_status: 1,
          category_is_deleted: 0,
        },
      ],
      [],
    ]);
    const repository = repositoryWith(connection);

    await expect(repository.getBomSnapshot('9')).rejects.toBeInstanceOf(ProductDomainError);
    expect(connection.rollback).toHaveBeenCalledOnce();
  });

  it('returns route-step and SOP object-key snapshots in one transaction', async () => {
    const connection = transactionConnection();
    connection.query
      .mockResolvedValueOnce([
        [{ id: 15, route_code: 'R-1', route_name: 'Route', version_no: 'V1' }],
        [],
      ])
      .mockResolvedValueOnce([
        [
          {
            route_step_id: 41,
            step_order: 1,
            process_step_id: 7,
            step_code_snapshot: 'CUT',
            step_name_snapshot: 'Cut',
            description_snapshot: null,
            default_owner_id: 5,
            sop_file_id: 6,
            sop_file_name_snapshot: 'cut.pdf',
            sop_object_key_snapshot: 'sop/cut.pdf',
            sop_version_no_snapshot: 'V2',
            sop_status: 1,
            sop_is_deleted: 0,
            need_inspection: 0,
          },
        ],
        [],
      ]);
    const repository = repositoryWith(connection);

    await expect(repository.getRouteSnapshot('15')).resolves.toMatchObject({
      steps: [
        {
          routeStepId: '41',
          defaultOwnerId: '5',
          sop: { id: '6', objectKey: 'sop/cut.pdf', versionNo: 'V2' },
        },
      ],
    });
    expect(String(connection.query.mock.calls[1]?.[0])).toContain('rs.sop_version_no_snapshot');
    expect(String(connection.query.mock.calls[1]?.[0])).not.toContain('tf.version_no');
    expect(connection.commit).toHaveBeenCalledOnce();
  });

  it('joins the batch-creation transaction and locks the selected route configuration', async () => {
    const connection = transactionConnection();
    const pool = { getConnection: vi.fn().mockResolvedValue(connection) };
    connection.query
      .mockResolvedValueOnce([[productRow], []])
      .mockResolvedValueOnce([
        [{ id: 15, route_code: 'R-1', route_name: 'Route', version_no: 'V1' }],
        [],
      ])
      .mockResolvedValueOnce([
        [
          {
            route_step_id: 41,
            step_order: 1,
            process_step_id: 7,
            step_code_snapshot: 'CUT',
            step_name_snapshot: 'Cut',
            description_snapshot: null,
            default_owner_id: null,
            sop_file_id: null,
            sop_file_name_snapshot: null,
            sop_object_key_snapshot: null,
            sop_version_no_snapshot: null,
            sop_status: null,
            sop_is_deleted: null,
            need_inspection: 0,
          },
        ],
        [],
      ]);
    const repository = new MysqlProductSnapshotRepository(pool as never);

    await withTransaction(pool as never, async () =>
      repository.getProductionRouteSnapshot('9', '15'),
    );

    expect(pool.getConnection).toHaveBeenCalledOnce();
    expect(String(connection.query.mock.calls[0]?.[0])).toContain('FOR UPDATE');
    expect(String(connection.query.mock.calls[1]?.[0])).toContain('FOR UPDATE');
    expect(String(connection.query.mock.calls[2]?.[0])).toContain('FOR UPDATE');
    expect(connection.query.mock.calls[1]?.[1]).toEqual(['15']);
    expect(connection.commit).toHaveBeenCalledOnce();
  });

  it('allows a production task only when the BOM approval is final and locked', async () => {
    const connection = transactionConnection();
    connection.query
      .mockResolvedValueOnce([[{ ...productRow, default_route_id: null }], []])
      .mockResolvedValueOnce([
        [{ bom_status: 'approved', bom_locked_at: new Date(), bom_approval_instance_id: 12 }],
        [],
      ])
      .mockResolvedValueOnce([
        [
          {
            unit: 'kg',
            material_unit: 'kg',
            material_status: 1,
            material_is_deleted: 0,
            material_kind: 'material',
            category_status: 1,
            category_is_deleted: 0,
          },
        ],
        [],
      ]);
    const repository = repositoryWith(connection);
    const audit = { actorId: '7', requestId: 'req-1', ip: null, userAgent: null };

    await expect(
      repository.requireApprovedBomForProductionTask('9', null, audit),
    ).resolves.toBeNull();

    expect(String(connection.query.mock.calls[1]?.[0])).toContain('bom_status,bom_locked_at');
    expect(String(connection.query.mock.calls[2]?.[0])).toContain('FOR UPDATE');
    expect(connection.execute).not.toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalledOnce();
  });

  it('rejects a production task before reading BOM lines when approval is not final', async () => {
    const connection = transactionConnection();
    connection.query
      .mockResolvedValueOnce([[{ ...productRow, default_route_id: null }], []])
      .mockResolvedValueOnce([
        [{ bom_status: 'pending_approval', bom_locked_at: null, bom_approval_instance_id: 12 }],
        [],
      ]);
    const repository = repositoryWith(connection);

    await expect(
      repository.requireApprovedBomForProductionTask('9', null, {
        actorId: '7',
        requestId: 'req-1',
        ip: null,
        userAgent: null,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_MATERIAL' });
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
