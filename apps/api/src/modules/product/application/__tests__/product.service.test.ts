import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ProductService } from '../product.service.js';

const audit = { userId: '1', ip: '127.0.0.1' };

describe('ProductService workflow safeguards', () => {
  it('rejects duplicate BOM inputs before opening a repository transaction', async () => {
    const repository = { replaceMaterials: vi.fn() };
    const service = new ProductService(repository as never, {} as never);

    expect(() =>
      service.replaceMaterials(
        '10',
        [
          {
            materialProductId: '20',
            quantityPerUnit: 1,
            unit: 'pcs',
            isKeyMaterial: true,
            needBatchRecord: true,
          },
          {
            materialProductId: '20',
            quantityPerUnit: 2,
            unit: 'pcs',
            isKeyMaterial: false,
            needBatchRecord: true,
          },
        ],
        audit,
      ),
    ).toThrow(BadRequestException);
    expect(repository.replaceMaterials).not.toHaveBeenCalled();
  });

  it('requires route step orders to be continuous from one', async () => {
    const repository = { replaceRouteSteps: vi.fn() };
    const service = new ProductService(repository as never, {} as never);

    expect(() =>
      service.replaceRouteSteps(
        '30',
        [
          { processStepId: '1', stepOrder: 1, needInspection: false, needRecord: true },
          { processStepId: '2', stepOrder: 3, needInspection: true, needRecord: true },
        ],
        audit,
      ),
    ).toThrow(BadRequestException);
    expect(repository.replaceRouteSteps).not.toHaveBeenCalled();
  });

  it('removes a stored SOP when database attachment fails', async () => {
    const repository = { attachProcessStepSop: vi.fn().mockRejectedValue(new Error('db failed')) };
    const storage = {
      storeSop: vi.fn().mockResolvedValue({ objectKey: 'sop/2026/file.pdf' }),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ProductService(repository as never, storage as never);

    await expect(
      service.uploadProcessStepSop(
        '2',
        {
          originalName: 'SOP.pdf',
          mimeType: 'application/pdf',
          buffer: Buffer.from('file'),
        },
        audit,
      ),
    ).rejects.toThrow('db failed');
    expect(storage.remove).toHaveBeenCalledWith('sop/2026/file.pdf');
  });
});
