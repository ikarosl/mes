import { describe, expect, it, vi } from 'vitest';
import { ProductDomainError } from '../../domain/product.errors.js';
import { ProductService } from '../product.service.js';

const audit = { userId: '1', ip: '127.0.0.1' };

describe('ProductService workflow safeguards', () => {
  it('rejects duplicate BOM inputs before opening a repository transaction', async () => {
    const repository = { replaceMaterials: vi.fn() };
    const service = new ProductService(
      {} as never,
      {} as never,
      repository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

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
    ).toThrow(ProductDomainError);
    expect(repository.replaceMaterials).not.toHaveBeenCalled();
  });

  it('rejects more than 200 BOM lines before opening a repository transaction', () => {
    const repository = { replaceMaterials: vi.fn() };
    const service = new ProductService(
      {} as never,
      {} as never,
      repository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    expect(() =>
      service.replaceMaterials(
        '10',
        Array.from({ length: 201 }, (_, index) => ({
          materialProductId: String(index + 1),
          quantityPerUnit: 1,
          unit: 'pcs',
          isKeyMaterial: false,
          needBatchRecord: false,
        })),
        audit,
      ),
    ).toThrow(ProductDomainError);
    expect(repository.replaceMaterials).not.toHaveBeenCalled();
  });

  it('requires route step orders to be continuous from one', async () => {
    const repository = { replaceRouteSteps: vi.fn() };
    const service = new ProductService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      repository as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.replaceRouteSteps(
        '30',
        [
          { processStepId: '1', stepOrder: 1, needInspection: false, needRecord: true },
          { processStepId: '2', stepOrder: 3, needInspection: true, needRecord: true },
        ],
        audit,
      ),
    ).rejects.toBeInstanceOf(ProductDomainError);
    expect(repository.replaceRouteSteps).not.toHaveBeenCalled();
  });

  it('rejects inactive route owners before opening the route transaction', async () => {
    const repository = { replaceRouteSteps: vi.fn() };
    const identityDirectory = { listActiveUserOptionsByIds: vi.fn().mockResolvedValue([]) };
    const service = new ProductService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      repository as never,
      {} as never,
      identityDirectory as never,
    );

    await expect(
      service.replaceRouteSteps(
        '30',
        [
          {
            processStepId: '1',
            stepOrder: 1,
            defaultOwnerId: '99',
            needInspection: false,
            needRecord: true,
          },
        ],
        audit,
      ),
    ).rejects.toBeInstanceOf(ProductDomainError);
    expect(repository.replaceRouteSteps).not.toHaveBeenCalled();
  });

  it('enriches route steps through the Identity public directory', async () => {
    const repository = {
      listRouteSteps: vi
        .fn()
        .mockResolvedValue([{ id: '1', defaultOwnerId: '7', defaultOwnerName: null }]),
    };
    const identityDirectory = {
      listActiveUserOptionsByIds: vi.fn().mockResolvedValue([{ id: '7', displayName: '张师傅' }]),
    };
    const service = new ProductService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      repository as never,
      {} as never,
      identityDirectory as never,
    );

    await expect(service.listRouteSteps('30')).resolves.toEqual([
      { id: '1', defaultOwnerId: '7', defaultOwnerName: '张师傅' },
    ]);
  });

  it('removes a stored SOP when database attachment fails', async () => {
    const repository = { attachProcessStepSop: vi.fn().mockRejectedValue(new Error('db failed')) };
    const stored = {
      storageProvider: 's3',
      bucket: 'technical-files',
      objectKey: 'sop/2026/file.pdf',
    };
    const storage = {
      storeSop: vi.fn().mockResolvedValue(stored),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ProductService(
      {} as never,
      {} as never,
      {} as never,
      repository as never,
      {} as never,
      {} as never,
      storage as never,
      {} as never,
    );

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
    expect(storage.remove).toHaveBeenCalledWith(stored);
  });

  it('soft-deletes a technical file without touching object storage', async () => {
    const repository = { deleteTechnicalFile: vi.fn().mockResolvedValue(undefined) };
    const storage = { remove: vi.fn() };
    const service = new ProductService(
      repository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      storage as never,
      {} as never,
    );

    await service.deleteTechnicalFile('2', audit);

    expect(repository.deleteTechnicalFile).toHaveBeenCalledWith('2', audit);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('associates an existing SOP without deleting the previous file', async () => {
    const repository = { setProcessStepDefaultSop: vi.fn().mockResolvedValue(undefined) };
    const storage = { remove: vi.fn() };
    const service = new ProductService(
      {} as never,
      {} as never,
      {} as never,
      repository as never,
      {} as never,
      {} as never,
      storage as never,
      {} as never,
    );

    await service.setProcessStepDefaultSop('2', '8', audit);

    expect(repository.setProcessStepDefaultSop).toHaveBeenCalledWith('2', '8', audit);
    expect(storage.remove).not.toHaveBeenCalled();
  });
});
