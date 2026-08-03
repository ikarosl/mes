import 'reflect-metadata';
import { BadRequestException, StreamableFile } from '@nestjs/common';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS, permissionMatches } from '@company/constants';
import { REQUIRED_PERMISSION } from '../../../../../common/security/auth.decorators.js';
import { ProductController } from '../product.controller.js';

describe('ProductController technical files', () => {
  it('streams a private download with safe response headers and RBAC metadata', async () => {
    const service = {
      downloadTechnicalFile: vi.fn().mockResolvedValue({
        file: {
          originalName: '工艺 SOP.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 12,
        },
        stream: Readable.from(Buffer.from('content')),
      }),
    };
    const controller = new ProductController(service as never);
    const setHeader = vi.fn();

    const result = await controller.downloadTechnicalFile({ id: '8' }, { setHeader });

    expect(result).toBeInstanceOf(StreamableFile);
    expect(setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(setHeader).toHaveBeenCalledWith('Content-Length', '12');
    expect(setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION, ProductController.prototype.downloadTechnicalFile),
    ).toBe(PERMISSIONS.product.files.download);
  });

  it('rejects an empty multipart upload before calling the service', () => {
    const service = { uploadTechnicalFile: vi.fn() };
    const controller = new ProductController(service as never);

    expect(() => controller.uploadTechnicalFile(undefined, { userId: '1', ip: null })).toThrow(
      BadRequestException,
    );
    expect(service.uploadTechnicalFile).not.toHaveBeenCalled();
  });

  it('repairs a UTF-8 multipart filename before calling the service', () => {
    const service = { uploadTechnicalFile: vi.fn().mockReturnValue({ id: '9' }) };
    const controller = new ProductController(service as never);
    const audit = { userId: '1', ip: null };

    controller.uploadTechnicalFile(
      {
        originalname: '12- æååè£æ£éªè§ç¨.docx',
        mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: Buffer.from('document'),
        size: 8,
      },
      audit,
    );

    expect(service.uploadTechnicalFile).toHaveBeenCalledWith(
      expect.objectContaining({ originalName: '12- 成品包装检验规程.docx' }),
      audit,
    );
  });
});

describe('ProductController paginated lists and options', () => {
  it('passes a normalized category pagination query to the service', () => {
    const service = { listCategories: vi.fn().mockReturnValue({ items: [], total: 0 }) };
    const controller = new ProductController(service as never);

    controller.categories({ page: 2, pageSize: 20, categoryCode: 'MAT ', status: 1 });

    expect(service.listCategories).toHaveBeenCalledWith({
      page: 2,
      pageSize: 20,
      categoryCode: 'MAT',
      categoryName: undefined,
      status: 1,
    });
  });

  it('serves enabled categories as independent options', () => {
    const service = { listCategoryOptions: vi.fn().mockReturnValue([{ id: '1' }]) };
    const controller = new ProductController(service as never);

    expect(controller.categoryOptions()).toEqual([{ id: '1' }]);
    expect(service.listCategoryOptions).toHaveBeenCalledOnce();
  });

  it('passes a normalized process step pagination query to the service', () => {
    const service = { listProcessSteps: vi.fn().mockReturnValue({ items: [], total: 0 }) };
    const controller = new ProductController(service as never);

    controller.processSteps({ page: 1, pageSize: 10, keyword: 'GX ', status: 0 });

    expect(service.listProcessSteps).toHaveBeenCalledWith({
      page: 1,
      pageSize: 10,
      keyword: 'GX',
      status: 0,
    });
  });

  it('serves enabled process steps as independent options', () => {
    const service = { listProcessStepOptions: vi.fn().mockReturnValue([{ id: '2' }]) };
    const controller = new ProductController(service as never);

    expect(controller.processStepOptions()).toEqual([{ id: '2' }]);
    expect(service.listProcessStepOptions).toHaveBeenCalledOnce();
  });

  it('serves enabled routes as independent options', () => {
    const service = { listRouteOptions: vi.fn().mockReturnValue([{ id: '15' }]) };
    const controller = new ProductController(service as never);

    expect(controller.routeOptions()).toEqual([{ id: '15' }]);
    expect(service.listRouteOptions).toHaveBeenCalledOnce();
  });
});

describe('Product options cross-page authorization contract', () => {
  type OptionsMethod =
    'categoryOptions' | 'productOptions' | 'processStepOptions' | 'routeOptions' | 'userOptions';

  const readOptionsPermissions = (method: OptionsMethod): string | readonly string[] =>
    Reflect.getMetadata(REQUIRED_PERMISSION, ProductController.prototype[method]) as
      string | readonly string[];

  const optionsPermissions: Record<OptionsMethod, string[]> = {
    categoryOptions: [PERMISSIONS.product.products.view, PERMISSIONS.product.categories.view],
    productOptions: [
      PERMISSIONS.product.products.view,
      PERMISSIONS.product.routes.view,
      PERMISSIONS.production.orders.view,
      PERMISSIONS.production.tasks.view,
    ],
    processStepOptions: [PERMISSIONS.product.processes.view, PERMISSIONS.product.routes.view],
    routeOptions: [
      PERMISSIONS.product.products.view,
      PERMISSIONS.product.routes.view,
      PERMISSIONS.production.orders.view,
      PERMISSIONS.production.tasks.view,
    ],
    userOptions: [
      PERMISSIONS.product.routes.view,
      PERMISSIONS.production.orders.view,
      PERMISSIONS.production.tasks.view,
    ],
  };

  it('declares an any-of permission set on every options endpoint', () => {
    for (const [method, permissions] of Object.entries(optionsPermissions) as Array<
      [OptionsMethod, string[]]
    >) {
      expect(readOptionsPermissions(method)).toEqual(permissions);
    }
  });

  it('keeps each consuming page minimum role readable on its form options', () => {
    const pageOptions: Array<{ page: string; permission: string; endpoints: OptionsMethod[] }> = [
      {
        page: '产品管理',
        permission: PERMISSIONS.product.products.view,
        endpoints: ['categoryOptions', 'productOptions', 'routeOptions'],
      },
      {
        page: '产品分类',
        permission: PERMISSIONS.product.categories.view,
        endpoints: ['categoryOptions'],
      },
      {
        page: '工艺路线',
        permission: PERMISSIONS.product.routes.view,
        endpoints: ['productOptions', 'processStepOptions', 'userOptions'],
      },
      {
        page: '生产工单',
        permission: PERMISSIONS.production.orders.view,
        endpoints: ['productOptions', 'routeOptions', 'userOptions'],
      },
      {
        page: '生产任务',
        permission: PERMISSIONS.production.tasks.view,
        endpoints: ['productOptions', 'routeOptions', 'userOptions'],
      },
    ];
    for (const { page, permission, endpoints } of pageOptions) {
      for (const method of endpoints) {
        expect(
          permissionMatches([permission], readOptionsPermissions(method)),
          `${page} 最小权限 ${permission} 应可读取 ${method}`,
        ).toBe(true);
      }
    }
  });

  it('rejects an options endpoint when the role holds no consuming page permission', () => {
    expect(
      permissionMatches(
        [PERMISSIONS.product.products.view],
        readOptionsPermissions('processStepOptions'),
      ),
    ).toBe(false);
  });

  it('does not open options beyond the consuming pages to a production-only role', () => {
    for (const permission of [
      PERMISSIONS.production.orders.view,
      PERMISSIONS.production.tasks.view,
    ]) {
      expect(permissionMatches([permission], readOptionsPermissions('categoryOptions'))).toBe(
        false,
      );
      expect(permissionMatches([permission], readOptionsPermissions('processStepOptions'))).toBe(
        false,
      );
    }
  });
});
