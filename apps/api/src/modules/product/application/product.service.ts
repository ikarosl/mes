import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ProcessRoutePayload,
  ProcessRouteStatus,
  ProcessRouteStepPayload,
  ProcessStepPayload,
  ProductCategoryPayload,
  ProductMaterialPayload,
  ProductPayload,
} from '@company/contracts';
import type { AuditContext } from '../../identity/application/audit.types.js';
import { ProductDomainError } from '../domain/product.errors.js';
import { ProductRepository } from './ports/product.repository.js';
import { TechnicalFileStorage, type TechnicalFileUpload } from './ports/technical-file.storage.js';

@Injectable()
export class ProductService {
  constructor(
    private readonly repository: ProductRepository,
    private readonly storage: TechnicalFileStorage,
  ) {}

  listCategories() {
    return this.repository.listCategories();
  }
  listProducts() {
    return this.repository.listProducts();
  }
  listProductOptions() {
    return this.repository.listProductOptions();
  }
  listProcessSteps() {
    return this.repository.listProcessSteps();
  }
  listRoutes() {
    return this.repository.listRoutes();
  }
  listUserOptions() {
    return this.repository.listUserOptions();
  }
  listMaterials(productId: string) {
    return this.repository.listMaterials(productId);
  }
  listRouteSteps(routeId: string) {
    return this.repository.listRouteSteps(routeId);
  }

  createCategory(payload: ProductCategoryPayload, audit: AuditContext) {
    return this.run(() => this.repository.createCategory(this.cleanCategory(payload), audit));
  }
  updateCategory(id: string, payload: ProductCategoryPayload, audit: AuditContext) {
    return this.run(() => this.repository.updateCategory(id, this.cleanCategory(payload), audit));
  }
  setCategoryStatus(id: string, status: number, audit: AuditContext) {
    return this.run(() => this.repository.setCategoryStatus(id, status, audit));
  }
  createProduct(payload: ProductPayload, audit: AuditContext) {
    return this.run(() => this.repository.createProduct(this.cleanProduct(payload), audit));
  }
  updateProduct(id: string, payload: ProductPayload, audit: AuditContext) {
    return this.run(() => this.repository.updateProduct(id, this.cleanProduct(payload), audit));
  }
  setProductStatus(id: string, status: number, audit: AuditContext) {
    return this.run(() => this.repository.setProductStatus(id, status, audit));
  }
  replaceMaterials(id: string, items: ProductMaterialPayload[], audit: AuditContext) {
    if (new Set(items.map((item) => item.materialProductId)).size !== items.length) {
      throw new BadRequestException('同一投入物料不能在一份 BOM 中重复');
    }
    if (items.some((item) => item.quantityPerUnit <= 0 || !item.unit.trim())) {
      throw new BadRequestException('BOM 单位用量必须大于 0，且用量单位不能为空');
    }
    return this.run(() => this.repository.replaceMaterials(id, items, audit));
  }
  setDefaultRoute(id: string, routeId: string | null, audit: AuditContext) {
    return this.run(() => this.repository.setDefaultRoute(id, routeId, audit));
  }
  createProcessStep(payload: ProcessStepPayload, audit: AuditContext) {
    return this.run(() => this.repository.createProcessStep(this.cleanProcessStep(payload), audit));
  }
  updateProcessStep(id: string, payload: ProcessStepPayload, audit: AuditContext) {
    return this.run(() =>
      this.repository.updateProcessStep(id, this.cleanProcessStep(payload), audit),
    );
  }
  setProcessStepStatus(id: string, status: number, audit: AuditContext) {
    return this.run(() => this.repository.setProcessStepStatus(id, status, audit));
  }
  async uploadProcessStepSop(id: string, file: TechnicalFileUpload, audit: AuditContext) {
    if (!file.buffer.length) throw new BadRequestException('上传文件不能为空');
    const stored = await this.storage.storeSop(file);
    try {
      await this.run(() => this.repository.attachProcessStepSop(id, stored, audit));
    } catch (error) {
      await this.storage.remove(stored.objectKey).catch(() => undefined);
      throw error;
    }
  }
  createRoute(payload: ProcessRoutePayload, audit: AuditContext) {
    return this.run(() => this.repository.createRoute(this.cleanRoute(payload), audit));
  }
  updateRoute(id: string, payload: ProcessRoutePayload, audit: AuditContext) {
    return this.run(() => this.repository.updateRoute(id, this.cleanRoute(payload), audit));
  }
  setRouteStatus(id: string, status: ProcessRouteStatus, audit: AuditContext) {
    return this.run(() => this.repository.setRouteStatus(id, status, audit));
  }
  deleteRoute(id: string, audit: AuditContext) {
    return this.run(() => this.repository.deleteRoute(id, audit));
  }
  replaceRouteSteps(id: string, items: ProcessRouteStepPayload[], audit: AuditContext) {
    const orders = items.map((item) => item.stepOrder);
    const normalizedOrders = [...orders].sort((left, right) => left - right);
    if (
      items.length === 0 ||
      new Set(orders).size !== orders.length ||
      normalizedOrders.some((order, index) => order !== index + 1)
    ) {
      throw new BadRequestException('路线至少包含一个工序，且工序顺序必须从 1 开始连续排列');
    }
    return this.run(() => this.repository.replaceRouteSteps(id, items, audit));
  }

  private cleanCategory(payload: ProductCategoryPayload): ProductCategoryPayload {
    return {
      ...payload,
      categoryCode: payload.categoryCode.trim(),
      categoryName: payload.categoryName.trim(),
      remark: payload.remark?.trim() || null,
    };
  }
  private cleanProduct(payload: ProductPayload): ProductPayload {
    return {
      ...payload,
      itemCode: payload.itemCode.trim(),
      productName: payload.productName.trim(),
      unit: payload.unit.trim(),
      remark: payload.remark?.trim() || null,
      specValues: (payload.specValues ?? [])
        .filter((item) => item.key.trim())
        .map((item) => ({
          key: item.key.trim(),
          value: item.value.trim(),
          unit: item.unit?.trim() || undefined,
        })),
    };
  }
  private cleanProcessStep(payload: ProcessStepPayload): ProcessStepPayload {
    return {
      ...payload,
      stepCode: payload.stepCode.trim(),
      stepName: payload.stepName.trim(),
      description: payload.description?.trim() || null,
      remark: payload.remark?.trim() || null,
    };
  }
  private cleanRoute(payload: ProcessRoutePayload): ProcessRoutePayload {
    return {
      ...payload,
      routeCode: payload.routeCode.trim(),
      routeName: payload.routeName.trim(),
      versionNo: payload.versionNo.trim(),
      remark: payload.remark?.trim() || null,
    };
  }
  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ProductDomainError) {
        if (error.code === 'NOT_FOUND') throw new NotFoundException(error.message);
        if (error.code === 'CONFLICT' || error.code === 'ROUTE_IN_USE')
          throw new ConflictException(error.message);
        throw new BadRequestException(error.message);
      }
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
        throw new ConflictException('编码或版本已存在，软删除记录的自然键也不能复用');
      }
      throw error;
    }
  }
}
