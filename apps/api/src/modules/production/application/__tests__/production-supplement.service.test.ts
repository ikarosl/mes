import { describe, expect, it, vi } from 'vitest';
import type { ProductionScrapSupplementPlanItem } from '@company/contracts';
import { ProductionSupplementService } from '../production-supplement.service.js';

const commandContext = { actorId: '9', requestId: 'req-save', ip: null, userAgent: null };
const idempotentContext = {
  ...commandContext,
  idempotencyKey: '11111111-1111-4111-8111-111111111111',
};

const makeIdempotency = () => ({
  execute: vi.fn(async (command: { handler: () => Promise<unknown> }) => ({
    result: await command.handler(),
    isReplay: false,
  })),
});

const makeCandidate = (overrides: Record<string, unknown> = {}) => ({
  originalDemandId: 'd1',
  productionBatchId: 'b1',
  requirementBasisId: 'basis-1',
  productMaterialId: 'pm1',
  itemId: 'm1',
  materialVariantId: 'v1',
  materialVariantCode: 'M-1-v1-A',
  variants: [
    { id: 'v1', variantCode: 'M-1-v1-A', majorVersion: 'v1', minorVersion: 'A' },
    { id: 'v2', variantCode: 'M-1-v1-B', majorVersion: 'v1', minorVersion: 'B' },
  ],
  itemCode: 'm1.077.012',
  itemName: '微带',
  quantityPerUnit: '1.0000',
  unit: 'pcs',
  isKeyMaterial: true,
  needBatchRecord: true,
  plannedOutputQuantity: '1.0000',
  normalDemandQuantity: '1.0000',
  ...overrides,
});

const makeCandidateContext = () => ({ candidates: [makeCandidate()] });

const makePlan = (
  overrides: Partial<ProductionScrapSupplementPlanItem> = {},
): ProductionScrapSupplementPlanItem => ({
  planId: 'p1',
  planNo: 'SSP-1',
  dispositionId: 'disp1',
  productionBatchId: 'b1',
  sourceStepRecordId: 'step1',
  sourceReportId: 'report1',
  status: 'draft',
  confirmedSupplementId: null,
  remark: '补料',
  version: 3,
  updatedAt: '2026-08-20T10:00:00.000+08:00',
  lines: [
    {
      originalDemandId: 'd1',
      requirementBasisId: 'basis-1',
      productMaterialId: 'pm1',
      itemId: 'm1',
      materialVariantId: 'v2',
      materialVariantCode: 'M-1-v1-B',
      itemCode: 'm1.077.012',
      itemName: '微带',
      plannedQuantity: '1.0000',
      unit: 'pcs',
    },
  ],
  ...overrides,
});

const approveResult = {
  disposition: {
    dispositionId: 'disp1',
    dispositionNo: 'D-1',
    productionBatchId: 'b1',
    stepRecordId: 'step1',
    sourceReportId: 'report1',
    abnormalOrigin: 'current_step' as const,
    reviewStatus: 'approved' as const,
    dispositionType: 'scrap' as const,
    remark: '补料',
    version: 4,
    createdAt: '2026-08-20T10:00:00.000+08:00',
  },
  scrapRecord: {
    scrapRecordId: 'scrap1',
    sourceReportId: 'report1',
    scrapQuantity: '1.0000',
    unit: 'pcs',
  },
  reproductionAuthorization: {
    authorizationId: 'auth1',
    scrapRecordId: 'scrap1',
    supplementId: 'sup1',
    entryStepRecordId: 'step1',
    quotaEndStepRecordId: 'step1',
    authorizedQuantity: '1.0000',
    authorizedBy: '9',
    authorizedAt: '2026-08-20T10:00:00.000+08:00',
  },
  supplement: {
    supplementId: 'sup1',
    supplementNo: 'SUP-1',
    scrapRecordId: 'scrap1',
    productionBatchId: 'b1',
    stepRecordId: 'step1',
    status: 'approved' as const,
    remark: '补料',
    createdAt: '2026-08-20T10:00:00.000+08:00',
    demands: [
      {
        originalDemandId: 'd1',
        demandId: 'd2',
        requirementBasisId: 'basis-1',
        productMaterialId: 'pm1',
        itemId: 'm1',
        materialVariantId: 'v2',
        materialVariantCode: 'M-1-v1-B',
        itemCode: 'm1.077.012',
        itemName: '微带',
        supplementQuantity: '1.0000',
        unit: 'pcs',
      },
    ],
  },
};

describe('ProductionSupplementService', () => {
  it('returns null without trying to enrich a missing draft', async () => {
    const repository = { getPlan: vi.fn().mockResolvedValue(null) };
    const service = new ProductionSupplementService(
      repository as never,
      makeIdempotency() as never,
    );

    await expect(service.getPlan('disp1')).resolves.toBeNull();
  });

  it('enriches a saved plan while preserving the selected exact variant', async () => {
    const repository = { getPlan: vi.fn().mockResolvedValue(makePlan()) };
    const service = new ProductionSupplementService(
      repository as never,
      makeIdempotency() as never,
    );

    await expect(service.getPlan('disp1')).resolves.toMatchObject({
      lines: [
        {
          itemCode: 'm1.077.012',
          itemName: '微带',
          materialVariantId: 'v2',
          materialVariantCode: 'M-1-v1-B',
        },
      ],
    });
  });

  it('validates a scrap detail against the complete batch BOM and all enabled variants', async () => {
    const repository = {
      getCandidateContext: vi.fn().mockResolvedValue(makeCandidateContext()),
      savePlan: vi.fn().mockResolvedValue(makePlan()),
    };
    const service = new ProductionSupplementService(
      repository as never,
      makeIdempotency() as never,
    );

    await service.savePlan(
      'disp1',
      {
        planVersion: null,
        dispositionVersion: 2,
        details: [
          {
            originalDemandId: 'd1',
            requirementBasisId: 'basis-1',
            materialVariantId: 'v2',
            supplementQuantity: 1,
          },
        ],
        remark: '  补料  ',
      },
      commandContext,
    );

    expect(repository.savePlan).toHaveBeenCalledWith(
      'disp1',
      expect.objectContaining({
        dispositionVersion: 2,
        details: [
          {
            originalDemandId: 'd1',
            requirementBasisId: 'basis-1',
            materialVariantId: 'v2',
            supplementQuantity: 1,
          },
        ],
        remark: '补料',
      }),
      expect.objectContaining({ actorId: '9' }),
    );
  });

  it('rejects a detail outside the complete BOM candidate set', async () => {
    const repository = {
      getCandidateContext: vi.fn().mockResolvedValue(makeCandidateContext()),
      savePlan: vi.fn(),
    };
    const service = new ProductionSupplementService(
      repository as never,
      makeIdempotency() as never,
    );

    await expect(
      service.savePlan(
        'disp1',
        {
          planVersion: null,
          dispositionVersion: 2,
          details: [
            {
              originalDemandId: 'd1',
              requirementBasisId: 'basis-1',
              materialVariantId: 'disabled-v',
              supplementQuantity: 1,
            },
          ],
        },
        commandContext,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(repository.savePlan).not.toHaveBeenCalled();
  });

  it('confirms only the server-side draft and persists its selected variant', async () => {
    const repository = {
      getPlan: vi.fn().mockResolvedValue(makePlan()),
      getCandidateContext: vi.fn().mockResolvedValue(makeCandidateContext()),
      approve: vi.fn().mockResolvedValue(approveResult),
    };
    const idempotency = makeIdempotency();
    const service = new ProductionSupplementService(repository as never, idempotency as never);

    const result = await service.confirmPlan(
      'disp1',
      { version: 3, dispositionVersion: 2 },
      idempotentContext,
    );

    expect(repository.approve).toHaveBeenCalledWith(
      'disp1',
      {
        version: 2,
        details: [
          {
            originalDemandId: 'd1',
            requirementBasisId: 'basis-1',
            materialVariantId: 'v2',
            supplementQuantity: 1,
          },
        ],
        remark: '补料',
      },
      expect.objectContaining({ actorId: '9' }),
      { planId: 'p1', version: 3 },
    );
    expect(result.supplement.demands[0]).toMatchObject({
      materialVariantId: 'v2',
      materialVariantCode: 'M-1-v1-B',
      itemCode: 'm1.077.012',
      itemName: '微带',
    });
    expect(idempotency.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        request: {
          params: { dispositionId: 'disp1' },
          body: { version: 3, dispositionVersion: 2 },
        },
      }),
    );
  });

  it('does not confirm a plan whose saved exact variant is no longer enabled', async () => {
    const firstVariant = makeCandidate().variants[0];
    const repository = {
      getPlan: vi.fn().mockResolvedValue(makePlan()),
      getCandidateContext: vi.fn().mockResolvedValue({
        candidates: [makeCandidate({ variants: [firstVariant] })],
      }),
      approve: vi.fn(),
    };
    const service = new ProductionSupplementService(
      repository as never,
      makeIdempotency() as never,
    );

    await expect(
      service.confirmPlan('disp1', { version: 3, dispositionVersion: 2 }, idempotentContext),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(repository.approve).not.toHaveBeenCalled();
  });

  it('lists every frozen BOM candidate without route-step material filtering', async () => {
    const repository = {
      getCandidateContext: vi.fn().mockResolvedValue({
        candidates: [
          makeCandidate(),
          makeCandidate({
            originalDemandId: 'd2',
            requirementBasisId: 'basis-2',
            itemId: 'm2',
            materialVariantId: 'v3',
            itemCode: 'm1.077.013',
            itemName: '微带',
            variants: [
              { id: 'v3', variantCode: 'M-2-v1-A', majorVersion: 'v1', minorVersion: 'A' },
            ],
          }),
        ],
      }),
    };
    const service = new ProductionSupplementService(
      repository as never,
      makeIdempotency() as never,
    );

    const result = await service.listCandidates('disp1');

    expect(repository.getCandidateContext).toHaveBeenCalledWith('disp1');
    expect(result.map((row) => row.originalDemandId)).toEqual(['d1', 'd2']);
    expect(result[0]?.variants).toHaveLength(2);
    expect(result[1]).toMatchObject({ itemCode: 'm1.077.013', itemName: '微带' });
  });

  it('returns frozen base code and name snapshots without reading current Product master data', async () => {
    const repository = {
      getCandidateContext: vi.fn().mockResolvedValue(makeCandidateContext()),
    };
    const service = new ProductionSupplementService(
      repository as never,
      makeIdempotency() as never,
    );

    await expect(service.listCandidates('disp1')).resolves.toMatchObject([
      { itemCode: 'm1.077.012', itemName: '微带', materialVariantId: 'v1' },
    ]);
  });
});
