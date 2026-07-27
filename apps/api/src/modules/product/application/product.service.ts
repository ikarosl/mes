import {
  BadGatewayException,
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
  TechnicalFileQuery,
} from '@company/contracts';
import type { AuditContext } from '../../../common/audit/audit.types.js';
import { IdentityDirectoryService } from '../../identity/public.js';
import { ProductDomainError } from '../domain/product.errors.js';
import { ProcessRouteRepository } from './ports/process-route.repository.js';
import { ProcessStepRepository } from './ports/process-step.repository.js';
import { ProductCatalogRepository } from './ports/product-catalog.repository.js';
import { TechnicalFileRepository } from './ports/technical-file.repository.js';
import { TechnicalFileStorage, type TechnicalFileUpload } from './ports/technical-file.storage.js';

@Injectable()
export class ProductService {
  constructor(
    private readonly technicalFiles: TechnicalFileRepository,
    private readonly catalog: ProductCatalogRepository,
    private readonly processSteps: ProcessStepRepository,
    private readonly routes: ProcessRouteRepository,
    private readonly storage: TechnicalFileStorage,
    private readonly identityDirectory: IdentityDirectoryService,
  ) {}

  listCategories() {
    return this.catalog.listCategories();
  }
  listTechnicalFiles(query: TechnicalFileQuery) {
    return this.technicalFiles.listTechnicalFiles(query);
  }
  async uploadTechnicalFile(file: TechnicalFileUpload, audit: AuditContext) {
    this.validateTechnicalFile(file);
    let stored;
    try {
      stored = await this.storage.storeSop(file);
    } catch {
      throw new BadGatewayException('技术文件存储失败');
    }
    try {
      return await this.run(() => this.technicalFiles.createTechnicalFile(stored, audit));
    } catch (error) {
      await this.storage.remove(stored).catch(() => undefined);
      throw error;
    }
  }
  async downloadTechnicalFile(id: string) {
    const file = await this.run(() => this.technicalFiles.getTechnicalFile(id));
    try {
      return { file, stream: await this.storage.read(file) };
    } catch {
      throw new BadGatewayException('技术文件读取失败');
    }
  }
  async deleteTechnicalFile(id: string, audit: AuditContext) {
    const locator = await this.run(() => this.technicalFiles.prepareTechnicalFileDelete(id, audit));
    try {
      await this.storage.remove(locator);
    } catch {
      throw new BadGatewayException('技术文件删除失败，可重试此操作');
    }
    return this.run(() => this.technicalFiles.finalizeTechnicalFileDelete(id, audit));
  }
  listProducts() {
    return this.catalog.listProducts();
  }
  listProductOptions() {
    return this.catalog.listProductOptions();
  }
  listProcessSteps() {
    return this.processSteps.listProcessSteps();
  }
  listRoutes() {
    return this.routes.listRoutes();
  }
  listUserOptions() {
    return this.identityDirectory.listActiveUserOptions();
  }
  listMaterials(productId: string) {
    return this.catalog.listMaterials(productId);
  }
  async listRouteSteps(routeId: string) {
    const items = await this.routes.listRouteSteps(routeId);
    const ownerIds = [...new Set(items.flatMap((item) => item.defaultOwnerId ?? []))];
    if (ownerIds.length === 0) return items;
    const owners = await this.identityDirectory.listActiveUserOptionsByIds(ownerIds);
    const names = new Map(owners.map((owner) => [owner.id, owner.displayName]));
    return items.map((item) => ({
      ...item,
      defaultOwnerName: item.defaultOwnerId ? (names.get(item.defaultOwnerId) ?? null) : null,
    }));
  }

  createCategory(payload: ProductCategoryPayload, audit: AuditContext) {
    return this.run(() => this.catalog.createCategory(this.cleanCategory(payload), audit));
  }
  updateCategory(id: string, payload: ProductCategoryPayload, audit: AuditContext) {
    return this.run(() => this.catalog.updateCategory(id, this.cleanCategory(payload), audit));
  }
  setCategoryStatus(id: string, status: number, audit: AuditContext) {
    return this.run(() => this.catalog.setCategoryStatus(id, status, audit));
  }
  createProduct(payload: ProductPayload, audit: AuditContext) {
    return this.run(() => this.catalog.createProduct(this.cleanProduct(payload), audit));
  }
  updateProduct(id: string, payload: ProductPayload, audit: AuditContext) {
    return this.run(() => this.catalog.updateProduct(id, this.cleanProduct(payload), audit));
  }
  setProductStatus(id: string, status: number, audit: AuditContext) {
    return this.run(() => this.catalog.setProductStatus(id, status, audit));
  }
  replaceMaterials(id: string, items: ProductMaterialPayload[], audit: AuditContext) {
    if (new Set(items.map((item) => item.materialProductId)).size !== items.length) {
      throw new BadRequestException('同一投入物料不能在一份 BOM 中重复');
    }
    if (items.some((item) => item.quantityPerUnit <= 0 || !item.unit.trim())) {
      throw new BadRequestException('BOM 单位用量必须大于 0，且用量单位不能为空');
    }
    return this.run(() => this.catalog.replaceMaterials(id, items, audit));
  }
  setDefaultRoute(id: string, routeId: string | null, audit: AuditContext) {
    return this.run(() => this.catalog.setDefaultRoute(id, routeId, audit));
  }
  createProcessStep(payload: ProcessStepPayload, audit: AuditContext) {
    return this.run(() =>
      this.processSteps.createProcessStep(this.cleanProcessStep(payload), audit),
    );
  }
  updateProcessStep(id: string, payload: ProcessStepPayload, audit: AuditContext) {
    return this.run(() =>
      this.processSteps.updateProcessStep(id, this.cleanProcessStep(payload), audit),
    );
  }
  setProcessStepStatus(id: string, status: number, audit: AuditContext) {
    return this.run(() => this.processSteps.setProcessStepStatus(id, status, audit));
  }
  async uploadProcessStepSop(id: string, file: TechnicalFileUpload, audit: AuditContext) {
    this.validateTechnicalFile(file);
    let stored;
    try {
      stored = await this.storage.storeSop(file);
    } catch {
      throw new BadGatewayException('技术文件存储失败');
    }
    try {
      await this.run(() => this.processSteps.attachProcessStepSop(id, stored, audit));
    } catch (error) {
      await this.storage.remove(stored).catch(() => undefined);
      throw error;
    }
  }
  setProcessStepDefaultSop(id: string, fileId: string | null, audit: AuditContext) {
    return this.run(() => this.processSteps.setProcessStepDefaultSop(id, fileId, audit));
  }
  createRoute(payload: ProcessRoutePayload, audit: AuditContext) {
    return this.run(() => this.routes.createRoute(this.cleanRoute(payload), audit));
  }
  updateRoute(id: string, payload: ProcessRoutePayload, audit: AuditContext) {
    return this.run(() => this.routes.updateRoute(id, this.cleanRoute(payload), audit));
  }
  setRouteStatus(id: string, status: ProcessRouteStatus, audit: AuditContext) {
    return this.run(() => this.routes.setRouteStatus(id, status, audit));
  }
  deleteRoute(id: string, audit: AuditContext) {
    return this.run(() => this.routes.deleteRoute(id, audit));
  }
  async replaceRouteSteps(id: string, items: ProcessRouteStepPayload[], audit: AuditContext) {
    const orders = items.map((item) => item.stepOrder);
    const normalizedOrders = [...orders].sort((left, right) => left - right);
    if (
      items.length === 0 ||
      new Set(orders).size !== orders.length ||
      normalizedOrders.some((order, index) => order !== index + 1)
    ) {
      throw new BadRequestException('路线至少包含一个工序，且工序顺序必须从 1 开始连续排列');
    }
    const ownerIds = [...new Set(items.flatMap((item) => item.defaultOwnerId ?? []))];
    if (ownerIds.length > 0) {
      const owners = await this.identityDirectory.listActiveUserOptionsByIds(ownerIds);
      if (owners.length !== ownerIds.length) {
        throw new BadRequestException('默认负责人不存在或已停用');
      }
    }
    return this.run(() => this.routes.replaceRouteSteps(id, items, audit));
  }

  private cleanCategory(payload: ProductCategoryPayload): ProductCategoryPayload {
    return {
      ...payload,
      categoryCode: payload.categoryCode.trim(),
      categoryName: payload.categoryName.trim(),
      remark: payload.remark?.trim() || null,
    };
  }
  private validateTechnicalFile(file: TechnicalFileUpload) {
    if (!file.buffer.length) throw new BadRequestException('上传文件不能为空');
    if (file.buffer.length > 20 * 1024 * 1024) {
      throw new BadRequestException('技术文件不能超过 20 MiB');
    }
    if (!file.originalName.trim()) throw new BadRequestException('文件名不能为空');
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
