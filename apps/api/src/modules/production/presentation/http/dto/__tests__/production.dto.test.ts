import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  AssignProductionStepDto,
  ApproveBatchStepReworkDto,
  CompleteReworkDto,
  ApproveScrapSupplementDto,
  ConfirmProductionScrapSupplementPlanDto,
  CancelWorkOrderDto,
  CreateProductionBatchDto,
  CreateWorkOrderDto,
  SaveProductionScrapSupplementPlanDto,
  UpdateBatchStepExecutionDto,
  UpdateProductionBatchDto,
  UpdateWorkOrderDto,
} from '../production.dto.js';

describe('Work-order terminal command DTOs', () => {
  it('requires a version and cancellation reason', async () => {
    const valid = plainToInstance(CancelWorkOrderDto, { version: 2, reason: '计划取消' });
    expect(await validate(valid)).toEqual([]);

    const invalid = plainToInstance(CancelWorkOrderDto, { version: 2, reason: '' });
    expect((await validate(invalid)).some((error) => error.property === 'reason')).toBe(true);
  });
});

describe('Production batch execution DTOs', () => {
  it('transforms and validates route-generated step overrides on batch creation', async () => {
    const dto = plainToInstance(CreateProductionBatchDto, {
      plannedQuantity: '10',
      stepOverrides: [{ routeStepId: '41', actualSopFileId: '7', responsibleUserId: '3' }],
    });

    expect(await validate(dto, { whitelist: true })).toEqual([]);
    expect(dto.stepOverrides?.[0]).toMatchObject({
      routeStepId: '41',
      actualSopFileId: '7',
    });
    expect(dto.stepOverrides?.[0]).not.toHaveProperty('responsibleUserId');
  });

  it('requires the step-record version for an execution override', async () => {
    const dto = plainToInstance(UpdateBatchStepExecutionDto, { actualSopFileId: '7' });

    expect((await validate(dto)).some((error) => error.property === 'version')).toBe(true);
  });

  it('requires both a responsible employee and version for assignment', async () => {
    const invalid = plainToInstance(AssignProductionStepDto, { responsibleUserId: '' });
    expect((await validate(invalid)).map((error) => error.property)).toEqual(
      expect.arrayContaining(['responsibleUserId', 'version']),
    );
    const valid = plainToInstance(AssignProductionStepDto, {
      responsibleUserId: '7',
      version: 0,
    });
    expect(await validate(valid)).toEqual([]);
  });

  it('validates versioned rework approval and full-quantity completion inputs', async () => {
    expect(
      await validate(plainToInstance(ApproveBatchStepReworkDto, { version: 0, remark: '返工' })),
    ).toEqual([]);
    expect(
      await validate(
        plainToInstance(CompleteReworkDto, {
          version: 1,
          normalQuantity: 1,
          abnormalQuantity: 1,
        }),
      ),
    ).toEqual([]);
    const invalid = plainToInstance(CompleteReworkDto, {
      version: 1,
      normalQuantity: -1,
      abnormalQuantity: 0,
    });
    expect((await validate(invalid)).some((error) => error.property === 'normalQuantity')).toBe(
      true,
    );
    const fractional = plainToInstance(CompleteReworkDto, {
      version: 1,
      normalQuantity: 1.5,
      abnormalQuantity: 0,
    });
    expect((await validate(fractional)).some((error) => error.property === 'normalQuantity')).toBe(
      true,
    );
  });

  it('requires at least one positive manually-entered supplement line', async () => {
    const valid = plainToInstance(ApproveScrapSupplementDto, {
      version: 0,
      details: [
        {
          originalDemandId: '5',
          requirementBasisId: 'basis-1',
          materialVariantId: 'variant-1',
          supplementQuantity: 1,
        },
      ],
    });
    expect(await validate(valid)).toEqual([]);
    const empty = plainToInstance(ApproveScrapSupplementDto, {
      version: 0,
      details: [],
    });
    expect((await validate(empty)).some((error) => error.property === 'details')).toBe(true);
    const invalid = plainToInstance(ApproveScrapSupplementDto, {
      version: 0,
      details: [
        {
          originalDemandId: '5',
          requirementBasisId: 'basis-1',
          materialVariantId: 'variant-1',
          supplementQuantity: 0,
        },
      ],
    });
    expect((await validate(invalid))[0]?.children?.length).toBeGreaterThan(0);
  });
});

describe('SaveProductionScrapSupplementPlanDto', () => {
  const basePlan = {
    planVersion: null,
    dispositionVersion: 0,
    details: [
      {
        originalDemandId: '5',
        requirementBasisId: 'basis-1',
        materialVariantId: 'variant-1',
        supplementQuantity: 1,
      },
    ],
  };

  it('accepts a first-created draft with null planVersion and an optional remark', async () => {
    expect(await validate(plainToInstance(SaveProductionScrapSupplementPlanDto, basePlan))).toEqual(
      [],
    );
    expect(
      await validate(
        plainToInstance(SaveProductionScrapSupplementPlanDto, {
          ...basePlan,
          remark: '待复核补料',
        }),
      ),
    ).toEqual([]);
  });

  it('accepts a subsequent draft with a non-negative integer planVersion', async () => {
    const dto = plainToInstance(SaveProductionScrapSupplementPlanDto, {
      ...basePlan,
      planVersion: 3,
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto.planVersion).toBe(3);
  });

  it('coerces a numeric-string planVersion to a number', async () => {
    const dto = plainToInstance(SaveProductionScrapSupplementPlanDto, {
      ...basePlan,
      planVersion: '2',
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto.planVersion).toBe(2);
  });

  it('rejects a missing, negative or fractional planVersion', async () => {
    for (const planVersion of [undefined, -1, 1.5]) {
      const dto = plainToInstance(SaveProductionScrapSupplementPlanDto, {
        ...basePlan,
        planVersion,
      });
      expect((await validate(dto)).some((error) => error.property === 'planVersion')).toBe(true);
    }
  });

  it('requires dispositionVersion and complete exact-version detail fields', async () => {
    const dto = plainToInstance(SaveProductionScrapSupplementPlanDto, {
      planVersion: null,
      dispositionVersion: undefined,
      details: [
        {
          originalDemandId: '5',
          requirementBasisId: '',
          materialVariantId: '',
          supplementQuantity: 1,
        },
      ],
    });
    expect((await validate(dto)).map((error) => error.property)).toEqual(
      expect.arrayContaining(['dispositionVersion', 'details']),
    );
  });

  it('rejects a negative dispositionVersion', async () => {
    const dto = plainToInstance(SaveProductionScrapSupplementPlanDto, {
      ...basePlan,
      dispositionVersion: -1,
    });
    expect((await validate(dto)).some((error) => error.property === 'dispositionVersion')).toBe(
      true,
    );
  });

  it('requires between one and two hundred detail lines', async () => {
    const empty = plainToInstance(SaveProductionScrapSupplementPlanDto, {
      ...basePlan,
      details: [],
    });
    expect((await validate(empty)).some((error) => error.property === 'details')).toBe(true);
    const tooMany = plainToInstance(SaveProductionScrapSupplementPlanDto, {
      ...basePlan,
      details: Array.from({ length: 201 }, (_, i) => ({
        originalDemandId: `demand-${i}`,
        supplementQuantity: 1,
      })),
    });
    expect((await validate(tooMany)).some((error) => error.property === 'details')).toBe(true);
  });

  it('rejects lines with a missing originalDemandId or non-integer quantity', async () => {
    const invalidLines: Array<Record<string, unknown>> = [
      { requirementBasisId: 'basis-1', materialVariantId: 'variant-1', supplementQuantity: 1 },
      {
        originalDemandId: '',
        requirementBasisId: 'basis-1',
        materialVariantId: 'variant-1',
        supplementQuantity: 1,
      },
      {
        originalDemandId: '5',
        requirementBasisId: 'basis-1',
        materialVariantId: 'variant-1',
        supplementQuantity: 0,
      },
      {
        originalDemandId: '5',
        requirementBasisId: 'basis-1',
        materialVariantId: 'variant-1',
        supplementQuantity: -0.5,
      },
      {
        originalDemandId: '5',
        requirementBasisId: 'basis-1',
        materialVariantId: 'variant-1',
        supplementQuantity: 1.12345,
      },
    ];
    for (const line of invalidLines) {
      const dto = plainToInstance(SaveProductionScrapSupplementPlanDto, {
        ...basePlan,
        details: [line],
      });
      expect((await validate(dto)).length).toBeGreaterThan(0);
    }
    const valid = plainToInstance(SaveProductionScrapSupplementPlanDto, basePlan);
    expect(await validate(valid)).toEqual([]);
  });
});

describe('ConfirmProductionScrapSupplementPlanDto', () => {
  it('accepts a versioned confirmation', async () => {
    expect(
      await validate(
        plainToInstance(ConfirmProductionScrapSupplementPlanDto, {
          version: 2,
          dispositionVersion: 1,
        }),
      ),
    ).toEqual([]);
  });

  it('requires both the plan version and the disposition version', async () => {
    const missingDisposition = await validate(
      plainToInstance(ConfirmProductionScrapSupplementPlanDto, { version: 2 }),
    );
    expect(missingDisposition.map((error) => error.property)).toEqual(
      expect.arrayContaining(['dispositionVersion']),
    );
    const missingVersion = await validate(
      plainToInstance(ConfirmProductionScrapSupplementPlanDto, { dispositionVersion: 0 }),
    );
    expect(missingVersion.map((error) => error.property)).toEqual(
      expect.arrayContaining(['version']),
    );
  });

  it('rejects negative versions', async () => {
    for (const [property, value] of [
      ['version', -1],
      ['dispositionVersion', -1],
    ] as const) {
      const dto = plainToInstance(ConfirmProductionScrapSupplementPlanDto, {
        version: 0,
        dispositionVersion: 0,
        [property]: value,
      });
      expect((await validate(dto)).some((error) => error.property === property)).toBe(true);
    }
  });

  it('coerces a numeric-string dispositionVersion', async () => {
    const dto = plainToInstance(ConfirmProductionScrapSupplementPlanDto, {
      version: 2,
      dispositionVersion: '1',
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto.dispositionVersion).toBe(1);
  });
});

describe('Production date-only DTO fields', () => {
  const cases: Array<[string, new () => object, Record<string, unknown>]> = [
    [
      'create work order',
      CreateWorkOrderDto,
      {
        workOrderNo: 'WO-001',
        productId: '8',
        plannedQuantity: 1,
        planEndDate: '2024-03-01',
      },
    ],
    ['update work order', UpdateWorkOrderDto, { version: 1 }],
    ['create batch', CreateProductionBatchDto, { plannedQuantity: 1 }],
    ['update batch', UpdateProductionBatchDto, { version: 1 }],
  ];

  it.each(cases)('rejects malformed and impossible dates for %s', async (_name, Dto, base) => {
    for (const planStartDate of ['abcdefghij', '2026-02-30', '2026-08-01T12:00:00Z']) {
      const errors = await validate(plainToInstance(Dto, { ...base, planStartDate }));
      expect(errors.some((error) => error.property === 'planStartDate')).toBe(true);
    }
  });

  it.each(cases)('accepts a valid leap-day date for %s', async (_name, Dto, base) => {
    const dto = plainToInstance(Dto, { ...base, planStartDate: '2024-02-29' });

    expect(await validate(dto)).toEqual([]);
  });

  it('requires both work-order plan dates on creation', async () => {
    const dto = plainToInstance(CreateWorkOrderDto, {
      workOrderNo: 'WO-001',
      productId: '8',
      plannedQuantity: 1,
    });

    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['planStartDate', 'planEndDate']),
    );
  });
});
