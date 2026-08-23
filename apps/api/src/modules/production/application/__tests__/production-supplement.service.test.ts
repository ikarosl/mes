import { describe, expect, it, vi } from 'vitest';
import type { ProductionScrapSupplementPlanItem } from '@company/contracts';
import { ProductionDomainError } from '../../domain/production.errors.js';
import { ProductionSupplementService } from '../production-supplement.service.js';

const commandContext = { actorId: '9', requestId: 'req-save', ip: null, userAgent: null };

const makeIdempotency = () => ({
  execute: vi.fn(async (command: { handler: () => Promise<unknown> }) => ({
    result: await command.handler(),
    isReplay: false,
  })),
});

const makeCandidateContext = () => ({
  routeStepIds: ['3', '4'],
  candidates: [
    {
      originalDemandId: '5',
      productionBatchId: '1',
      productMaterialId: '6',
      itemId: '7',
      itemCode: '',
      itemName: '',
      unit: 'kg',
      normalDemandQuantity: '2.0000',
    },
  ],
});

const makePlan = (
  overrides: Partial<ProductionScrapSupplementPlanItem> = {},
): ProductionScrapSupplementPlanItem => ({
  planId: 'p1',
  planNo: 'SSP-1',
  dispositionId: '8',
  productionBatchId: '1',
  sourceStepRecordId: '2',
  sourceReportId: '3',
  materialEndStepRecordId: '4',
  status: 'draft',
  confirmedSupplementId: null,
  remark: '补料',
  version: 3,
  updatedAt: '2026-08-20T10:00:00.000+08:00',
  lines: [
    {
      originalDemandId: '5',
      productMaterialId: '6',
      itemId: '7',
      itemCode: '',
      itemName: '',
      plannedQuantity: '1.2500',
      unit: 'kg',
    },
  ],
  ...overrides,
});

const approveResult = {
  disposition: {
    dispositionId: '8',
    dispositionNo: 'D-1',
    productionBatchId: '1',
    stepRecordId: '2',
    sourceReportId: '3',
    abnormalOrigin: 'current_step',
    reviewStatus: 'approved',
    dispositionType: 'scrap',
    remark: '补料',
    version: 3,
    createdAt: '2026-08-20T10:00:00.000+08:00',
  },
  scrapRecord: { scrapRecordId: 's1', sourceReportId: '3', scrapQuantity: '1.0000', unit: 'kg' },
  reproductionAuthorization: {
    authorizationId: 'a1',
    scrapRecordId: 's1',
    supplementId: 'sup1',
    entryStepRecordId: '2',
    quotaEndStepRecordId: '2',
    materialEndStepRecordId: '4',
    authorizedQuantity: '1.0000',
    authorizedBy: '9',
    authorizedAt: '2026-08-20T10:00:00.000+08:00',
  },
  supplement: {
    supplementId: 'sup1',
    supplementNo: 'SUP-1',
    scrapRecordId: 's1',
    productionBatchId: '1',
    stepRecordId: '2',
    status: 'approved',
    remark: '补料',
    createdAt: '2026-08-20T10:00:00.000+08:00',
    demands: [
      {
        originalDemandId: '5',
        demandId: 'd1',
        productMaterialId: '6',
        itemId: '7',
        itemCode: '',
        itemName: '',
        supplementQuantity: '1.2500',
        unit: 'kg',
      },
    ],
  },
};

describe('ProductionSupplementService', () => {
  describe('getPlan', () => {
    it('returns null when no draft plan has been saved for the disposition', async () => {
      const repository = { getPlan: vi.fn().mockResolvedValue(null) };
      const products = { listInventoryItemReferencesByIds: vi.fn() };
      const service = new ProductionSupplementService(
        repository as never,
        products as never,
        makeIdempotency() as never,
      );

      await expect(service.getPlan('8')).resolves.toBeNull();
      expect(repository.getPlan).toHaveBeenCalledWith('8');
      expect(products.listInventoryItemReferencesByIds).not.toHaveBeenCalled();
    });

    it('returns the server-side draft with enriched material snapshots on its lines', async () => {
      const repository = { getPlan: vi.fn().mockResolvedValue(makePlan()) };
      const products = {
        listInventoryItemReferencesByIds: vi
          .fn()
          .mockResolvedValue([{ id: '7', itemCode: 'MAT-7', productName: '材料七' }]),
      };
      const service = new ProductionSupplementService(
        repository as never,
        products as never,
        makeIdempotency() as never,
      );

      const result = await service.getPlan('8');

      expect(result).toMatchObject({
        planId: 'p1',
        dispositionId: '8',
        status: 'draft',
        version: 3,
        materialEndStepRecordId: '4',
        remark: '补料',
      });
      expect(result?.lines[0]).toMatchObject({
        originalDemandId: '5',
        itemCode: 'MAT-7',
        itemName: '材料七',
        plannedQuantity: '1.2500',
      });
      expect(products.listInventoryItemReferencesByIds).toHaveBeenCalledWith(['7']);
    });
  });

  describe('savePlan', () => {
    it('re-validates the server-side candidate scope and saves a first-time draft with planVersion null', async () => {
      const repository = {
        getCandidateContext: vi.fn().mockResolvedValue(makeCandidateContext()),
        savePlan: vi.fn().mockResolvedValue(makePlan({ version: 1 })),
      };
      const products = {
        listRouteStepMaterialIds: vi.fn().mockResolvedValue(['6']),
        listInventoryItemReferencesByIds: vi
          .fn()
          .mockResolvedValue([{ id: '7', itemCode: 'MAT-7', productName: '材料七' }]),
      };
      const service = new ProductionSupplementService(
        repository as never,
        products as never,
        makeIdempotency() as never,
      );

      const result = await service.savePlan(
        '8',
        {
          planVersion: null,
          dispositionVersion: 2,
          materialEndStepRecordId: '4',
          details: [{ originalDemandId: '5', supplementQuantity: 1.25 }],
          remark: '  补料  ',
        },
        commandContext,
      );

      expect(repository.getCandidateContext).toHaveBeenCalledWith('8', '4');
      expect(repository.savePlan).toHaveBeenCalledWith(
        '8',
        {
          planVersion: null,
          dispositionVersion: 2,
          materialEndStepRecordId: '4',
          details: [{ originalDemandId: '5', supplementQuantity: 1.25 }],
          remark: '补料',
        },
        expect.not.objectContaining({ idempotencyKey: expect.anything() }),
      );
      expect(result.lines[0]).toMatchObject({ itemCode: 'MAT-7', itemName: '材料七' });
    });

    it('rejects a detail whose original demand is not a server-side candidate and never enters the repository', async () => {
      const repository = {
        getCandidateContext: vi.fn().mockResolvedValue(makeCandidateContext()),
        savePlan: vi.fn(),
      };
      const products = {
        listRouteStepMaterialIds: vi.fn().mockResolvedValue(['6']),
        listInventoryItemReferencesByIds: vi.fn(),
      };
      const service = new ProductionSupplementService(
        repository as never,
        products as never,
        makeIdempotency() as never,
      );

      await expect(
        service.savePlan(
          '8',
          {
            planVersion: null,
            dispositionVersion: 2,
            materialEndStepRecordId: '4',
            details: [
              { originalDemandId: '5', supplementQuantity: 1.25 },
              { originalDemandId: '99', supplementQuantity: 0.5 },
            ],
          },
          commandContext,
        ),
      ).rejects.toMatchObject({
        code: 'INVALID_INPUT',
        message: '补料物料不属于异常工序绑定物料或当前产品有效 BOM',
      });
      expect(repository.savePlan).not.toHaveBeenCalled();
    });

    it('treats the route-material-filtered candidates as the source of truth for the allowed scope', async () => {
      const repository = {
        getCandidateContext: vi.fn().mockResolvedValue({
          routeStepIds: ['3'],
          candidates: [
            {
              originalDemandId: '5',
              productionBatchId: '1',
              productMaterialId: '6',
              itemId: '7',
              itemCode: '',
              itemName: '',
              unit: 'kg',
              normalDemandQuantity: '2.0000',
            },
            {
              originalDemandId: '7',
              productionBatchId: '1',
              productMaterialId: '8',
              itemId: '9',
              itemCode: '',
              itemName: '',
              unit: 'kg',
              normalDemandQuantity: '1.0000',
            },
          ],
        }),
        savePlan: vi.fn(),
      };
      const products = {
        listRouteStepMaterialIds: vi.fn().mockResolvedValue(['6']),
        listInventoryItemReferencesByIds: vi.fn(),
      };
      const service = new ProductionSupplementService(
        repository as never,
        products as never,
        makeIdempotency() as never,
      );

      await expect(
        service.savePlan(
          '8',
          {
            planVersion: null,
            dispositionVersion: 2,
            materialEndStepRecordId: '4',
            details: [{ originalDemandId: '7', supplementQuantity: 1 }],
          },
          commandContext,
        ),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
      expect(repository.savePlan).not.toHaveBeenCalled();
    });

    it('forwards the server-returned planVersion when updating an existing draft', async () => {
      const repository = {
        getCandidateContext: vi.fn().mockResolvedValue(makeCandidateContext()),
        savePlan: vi.fn().mockResolvedValue(makePlan({ version: 4 })),
      };
      const products = {
        listRouteStepMaterialIds: vi.fn().mockResolvedValue(['6']),
        listInventoryItemReferencesByIds: vi.fn().mockResolvedValue([]),
      };
      const service = new ProductionSupplementService(
        repository as never,
        products as never,
        makeIdempotency() as never,
      );

      await service.savePlan(
        '8',
        {
          planVersion: 3,
          dispositionVersion: 2,
          materialEndStepRecordId: '4',
          details: [{ originalDemandId: '5', supplementQuantity: 1.5 }],
        },
        commandContext,
      );

      expect(repository.savePlan).toHaveBeenCalledWith(
        '8',
        expect.objectContaining({ planVersion: 3 }),
        expect.anything(),
      );
    });

    it('propagates the rejection of a stale planVersion so drafts cannot overwrite each other', async () => {
      const repository = {
        getCandidateContext: vi.fn().mockResolvedValue(makeCandidateContext()),
        savePlan: vi
          .fn()
          .mockRejectedValue(
            new ProductionDomainError(
              'CONCURRENT_MODIFICATION',
              '报废补料方案已被其他人修改，请重新打开后编辑',
            ),
          ),
      };
      const products = {
        listRouteStepMaterialIds: vi.fn().mockResolvedValue(['6']),
        listInventoryItemReferencesByIds: vi.fn(),
      };
      const service = new ProductionSupplementService(
        repository as never,
        products as never,
        makeIdempotency() as never,
      );

      await expect(
        service.savePlan(
          '8',
          {
            planVersion: 1,
            dispositionVersion: 2,
            materialEndStepRecordId: '4',
            details: [{ originalDemandId: '5', supplementQuantity: 1.25 }],
          },
          commandContext,
        ),
      ).rejects.toMatchObject({ code: 'CONCURRENT_MODIFICATION' });
      expect(repository.savePlan).toHaveBeenCalledWith(
        '8',
        expect.objectContaining({ planVersion: 1 }),
        expect.anything(),
      );
    });

    it('propagates a stale dispositionVersion, so a plan cannot be saved after the disposition was reworked, rejected, or scrapped', async () => {
      const repository = {
        getCandidateContext: vi.fn().mockResolvedValue(makeCandidateContext()),
        savePlan: vi
          .fn()
          .mockRejectedValue(
            new ProductionDomainError('CONCURRENT_MODIFICATION', '异常处置单已变化，请刷新后重试'),
          ),
      };
      const products = {
        listRouteStepMaterialIds: vi.fn().mockResolvedValue(['6']),
        listInventoryItemReferencesByIds: vi.fn(),
      };
      const service = new ProductionSupplementService(
        repository as never,
        products as never,
        makeIdempotency() as never,
      );

      await expect(
        service.savePlan(
          '8',
          {
            planVersion: null,
            dispositionVersion: 1,
            materialEndStepRecordId: '4',
            details: [{ originalDemandId: '5', supplementQuantity: 1.25 }],
          },
          commandContext,
        ),
      ).rejects.toMatchObject({ code: 'CONCURRENT_MODIFICATION' });
      expect(repository.savePlan).toHaveBeenCalledWith(
        '8',
        expect.objectContaining({ dispositionVersion: 1 }),
        expect.anything(),
      );
    });

    it('forwards duplicate originalDemandId details as-is because the uniqueness check belongs to the repository', async () => {
      const repository = {
        getCandidateContext: vi.fn().mockResolvedValue(makeCandidateContext()),
        savePlan: vi.fn().mockResolvedValue(makePlan({ version: 1 })),
      };
      const products = {
        listRouteStepMaterialIds: vi.fn().mockResolvedValue(['6']),
        listInventoryItemReferencesByIds: vi.fn().mockResolvedValue([]),
      };
      const service = new ProductionSupplementService(
        repository as never,
        products as never,
        makeIdempotency() as never,
      );

      await service.savePlan(
        '8',
        {
          planVersion: null,
          dispositionVersion: 2,
          materialEndStepRecordId: '4',
          details: [
            { originalDemandId: '5', supplementQuantity: 1.25 },
            { originalDemandId: '5', supplementQuantity: 0.5 },
          ],
        },
        commandContext,
      );

      // 同一原需求出现两次在此层不报错：候选范围校验只检查 originalDemandId 是否在允许集合内。
      // 查重责任在 repository（mysql-production-supplement.repository.ts 的 savePlan/approve 以
      // '同一原始需求只能暂存一条补料明细' 拒绝），service 原样转发两条明细。
      expect(repository.savePlan).toHaveBeenCalledWith(
        '8',
        expect.objectContaining({
          details: [
            { originalDemandId: '5', supplementQuantity: 1.25 },
            { originalDemandId: '5', supplementQuantity: 0.5 },
          ],
        }),
        expect.anything(),
      );
    });

    it('passes invalid supplement quantities through untouched because the DTO layer owns quantity rules', async () => {
      const repository = {
        getCandidateContext: vi.fn().mockResolvedValue(makeCandidateContext()),
        savePlan: vi.fn().mockResolvedValue(makePlan({ version: 1 })),
      };
      const products = {
        listRouteStepMaterialIds: vi.fn().mockResolvedValue(['6']),
        listInventoryItemReferencesByIds: vi.fn().mockResolvedValue([]),
      };
      const service = new ProductionSupplementService(
        repository as never,
        products as never,
        makeIdempotency() as never,
      );

      // presentation DTO 强制 1..99999999 整数，数据库再以 CHECK 兜底；application
      // service 只做候选范围校验，不重复 DTO 的形状和值域校验。
      for (const supplementQuantity of [0, -1, 1.23456]) {
        await service.savePlan(
          '8',
          {
            planVersion: null,
            dispositionVersion: 2,
            materialEndStepRecordId: '4',
            details: [{ originalDemandId: '5', supplementQuantity }],
          },
          commandContext,
        );
      }

      expect(repository.savePlan).toHaveBeenNthCalledWith(
        1,
        '8',
        expect.objectContaining({ details: [{ originalDemandId: '5', supplementQuantity: 0 }] }),
        expect.anything(),
      );
      expect(repository.savePlan).toHaveBeenNthCalledWith(
        2,
        '8',
        expect.objectContaining({ details: [{ originalDemandId: '5', supplementQuantity: -1 }] }),
        expect.anything(),
      );
      expect(repository.savePlan).toHaveBeenNthCalledWith(
        3,
        '8',
        expect.objectContaining({
          details: [{ originalDemandId: '5', supplementQuantity: 1.23456 }],
        }),
        expect.anything(),
      );
    });
  });

  describe('confirmPlan', () => {
    const idempotentContext = {
      actorId: '9',
      requestId: 'req-confirm',
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      ip: null,
      userAgent: null,
    };

    it('rejects with NOT_FOUND when no draft plan exists to confirm', async () => {
      const repository = {
        getPlan: vi.fn().mockResolvedValue(null),
        getCandidateContext: vi.fn(),
        approve: vi.fn(),
      };
      const products = { listRouteStepMaterialIds: vi.fn() };
      const idempotency = makeIdempotency();
      const service = new ProductionSupplementService(
        repository as never,
        products as never,
        idempotency as never,
      );

      await expect(
        service.confirmPlan('8', { version: 3, dispositionVersion: 2 }, idempotentContext),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', message: '报废补料暂存方案不存在' });

      expect(idempotency.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: 'production.abnormal.scrap-supplement-plan.confirm.v1',
          key: idempotentContext.idempotencyKey,
        }),
      );
      expect(repository.getCandidateContext).not.toHaveBeenCalled();
      expect(repository.approve).not.toHaveBeenCalled();
    });

    it('rejects a confirmed plan as neither editable nor re-confirmable', async () => {
      const repository = {
        getPlan: vi
          .fn()
          .mockResolvedValue(makePlan({ status: 'confirmed', confirmedSupplementId: 'sup1' })),
        getCandidateContext: vi.fn(),
        approve: vi.fn(),
      };
      const products = { listRouteStepMaterialIds: vi.fn() };
      const service = new ProductionSupplementService(
        repository as never,
        products as never,
        makeIdempotency() as never,
      );

      await expect(
        service.confirmPlan('8', { version: 3, dispositionVersion: 2 }, idempotentContext),
      ).rejects.toMatchObject({ code: 'INVALID_STATE', message: '报废补料方案已经确认' });
      expect(repository.getCandidateContext).not.toHaveBeenCalled();
      expect(repository.approve).not.toHaveBeenCalled();
    });

    it('re-checks the candidate scope at confirm time and rejects a draft whose material is no longer valid', async () => {
      const repository = {
        getPlan: vi.fn().mockResolvedValue(makePlan()),
        getCandidateContext: vi.fn().mockResolvedValue({
          routeStepIds: ['3'],
          candidates: [
            {
              originalDemandId: '50',
              productionBatchId: '1',
              productMaterialId: '60',
              itemId: '70',
              itemCode: '',
              itemName: '',
              unit: 'kg',
              normalDemandQuantity: '1.0000',
            },
          ],
        }),
        approve: vi.fn(),
      };
      const products = {
        listRouteStepMaterialIds: vi.fn().mockResolvedValue(['60']),
      };
      const service = new ProductionSupplementService(
        repository as never,
        products as never,
        makeIdempotency() as never,
      );

      await expect(
        service.confirmPlan('8', { version: 3, dispositionVersion: 2 }, idempotentContext),
      ).rejects.toMatchObject({
        code: 'INVALID_INPUT',
        message: '暂存方案中的物料已不属于当前有效候选，请重新编辑后确认',
      });
      expect(repository.approve).not.toHaveBeenCalled();
    });

    it('confirms from the server-side draft only and forwards both version references for concurrency control', async () => {
      const repository = {
        getPlan: vi.fn().mockResolvedValue(makePlan()),
        getCandidateContext: vi.fn().mockResolvedValue(makeCandidateContext()),
        approve: vi.fn().mockResolvedValue(approveResult),
      };
      const products = {
        listRouteStepMaterialIds: vi.fn().mockResolvedValue(['6']),
        listInventoryItemReferencesByIds: vi
          .fn()
          .mockResolvedValue([{ id: '7', itemCode: 'MAT-7', productName: '材料七' }]),
      };
      const idempotency = makeIdempotency();
      const service = new ProductionSupplementService(
        repository as never,
        products as never,
        idempotency as never,
      );

      const result = await service.confirmPlan(
        '8',
        { version: 3, dispositionVersion: 2 },
        idempotentContext,
      );

      // 确认请求体只携带版本号，不接受客户端重新提交物料明细
      expect(idempotency.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: 'production.abnormal.scrap-supplement-plan.confirm.v1',
          key: idempotentContext.idempotencyKey,
          request: {
            params: { dispositionId: '8' },
            body: { version: 3, dispositionVersion: 2 },
          },
        }),
      );
      // 明细、备注、截止工序全部来自服务端方案；
      // payload.version（planVersion）作为方案引用、dispositionVersion 作为异常处置版本
      expect(repository.approve).toHaveBeenCalledWith(
        '8',
        {
          version: 2,
          materialEndStepRecordId: '4',
          details: [{ originalDemandId: '5', supplementQuantity: 1.25 }],
          remark: '补料',
        },
        { actorId: '9', requestId: 'req-confirm', ip: null, userAgent: null },
        { planId: 'p1', version: 3 },
      );
      expect(result.supplement.demands[0]).toMatchObject({
        originalDemandId: '5',
        itemCode: 'MAT-7',
        itemName: '材料七',
        supplementQuantity: '1.2500',
      });
    });

    it('propagates a stale planVersion so a draft can never be confirmed twice or overwritten between save and confirm', async () => {
      const repository = {
        getPlan: vi.fn().mockResolvedValue(makePlan()),
        getCandidateContext: vi.fn().mockResolvedValue(makeCandidateContext()),
        approve: vi
          .fn()
          .mockRejectedValue(
            new ProductionDomainError(
              'CONCURRENT_MODIFICATION',
              '报废补料方案已被其他人修改，请重新复核',
            ),
          ),
      };
      const products = { listRouteStepMaterialIds: vi.fn().mockResolvedValue(['6']) };
      const service = new ProductionSupplementService(
        repository as never,
        products as never,
        makeIdempotency() as never,
      );

      await expect(
        service.confirmPlan('8', { version: 3, dispositionVersion: 2 }, idempotentContext),
      ).rejects.toMatchObject({
        code: 'CONCURRENT_MODIFICATION',
        message: '报废补料方案已被其他人修改，请重新复核',
      });

      // payload.version 作为 planVersion 进入 planReference，由 repository 与方案当前 version 比对，
      // 防止草稿被他人再次编辑后仍被旧引用确认
      expect(repository.approve).toHaveBeenCalledWith('8', expect.anything(), expect.anything(), {
        planId: 'p1',
        version: 3,
      });
    });

    it('propagates a stale dispositionVersion so confirmation cannot continue after the abnormal disposition was reworked, rejected, or scrapped', async () => {
      const repository = {
        getPlan: vi.fn().mockResolvedValue(makePlan()),
        getCandidateContext: vi.fn().mockResolvedValue(makeCandidateContext()),
        approve: vi
          .fn()
          .mockRejectedValue(
            new ProductionDomainError('CONCURRENT_MODIFICATION', '异常处置单已变化，请刷新后重试'),
          ),
      };
      const products = { listRouteStepMaterialIds: vi.fn().mockResolvedValue(['6']) };
      const service = new ProductionSupplementService(
        repository as never,
        products as never,
        makeIdempotency() as never,
      );

      await expect(
        service.confirmPlan('8', { version: 3, dispositionVersion: 2 }, idempotentContext),
      ).rejects.toMatchObject({
        code: 'CONCURRENT_MODIFICATION',
        message: '异常处置单已变化，请刷新后重试',
      });

      // dispositionVersion 作为正式补料批准请求的 version 字段；repository 要求异常处置单
      // review_status 仍为 pending_review 且 version 匹配，返工/驳回/报废都会使其失配
      expect(repository.approve).toHaveBeenCalledWith(
        '8',
        expect.objectContaining({ version: 2 }),
        expect.anything(),
        { planId: 'p1', version: 3 },
      );
    });
  });

  describe('listCandidates', () => {
    it('restricts candidates to the current route material scope and enriches the material snapshots', async () => {
      const repository = {
        getCandidateContext: vi.fn().mockResolvedValue({
          routeStepIds: ['3', '4'],
          candidates: [
            {
              originalDemandId: '5',
              productionBatchId: '1',
              productMaterialId: '6',
              itemId: '7',
              itemCode: '',
              itemName: '',
              unit: 'kg',
              normalDemandQuantity: '2.0000',
            },
            {
              originalDemandId: '7',
              productionBatchId: '1',
              productMaterialId: '8',
              itemId: '9',
              itemCode: '',
              itemName: '',
              unit: 'kg',
              normalDemandQuantity: '1.0000',
            },
          ],
        }),
      };
      const products = {
        listRouteStepMaterialIds: vi.fn().mockResolvedValue(['6']),
        listInventoryItemReferencesByIds: vi
          .fn()
          .mockResolvedValue([{ id: '7', itemCode: 'MAT-7', productName: '材料七' }]),
      };
      const service = new ProductionSupplementService(
        repository as never,
        products as never,
        makeIdempotency() as never,
      );

      const result = await service.listCandidates('8', '4');

      expect(repository.getCandidateContext).toHaveBeenCalledWith('8', '4');
      expect(result.map((row) => row.originalDemandId)).toEqual(['5']);
      expect(result[0]).toMatchObject({ itemCode: 'MAT-7', itemName: '材料七' });
    });

    it('keeps all batch candidates when the route steps bind no materials', async () => {
      const repository = {
        getCandidateContext: vi.fn().mockResolvedValue({
          routeStepIds: ['3'],
          candidates: [
            {
              originalDemandId: '5',
              productionBatchId: '1',
              productMaterialId: '6',
              itemId: '7',
              itemCode: '',
              itemName: '',
              unit: 'kg',
              normalDemandQuantity: '2.0000',
            },
            {
              originalDemandId: '7',
              productionBatchId: '1',
              productMaterialId: '8',
              itemId: '9',
              itemCode: '',
              itemName: '',
              unit: 'kg',
              normalDemandQuantity: '1.0000',
            },
          ],
        }),
      };
      const products = {
        listRouteStepMaterialIds: vi.fn().mockResolvedValue([]),
        listInventoryItemReferencesByIds: vi.fn().mockResolvedValue([
          { id: '7', itemCode: 'MAT-7', productName: '材料七' },
          { id: '9', itemCode: 'MAT-9', productName: '材料九' },
        ]),
      };
      const service = new ProductionSupplementService(
        repository as never,
        products as never,
        makeIdempotency() as never,
      );

      const result = await service.listCandidates('8', '4');

      expect(result.map((row) => row.originalDemandId)).toEqual(['5', '7']);
      expect(products.listRouteStepMaterialIds).toHaveBeenCalledTimes(1);
    });
  });
});
