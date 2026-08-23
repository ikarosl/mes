import { Injectable } from '@nestjs/common';
import type {
  ProcessRoutePayload,
  ProcessRouteQuery,
  ProcessRouteStatus,
  ProcessRouteStepPayload,
  ProcessStepPayload,
  ProcessStepQuery,
  ProductCategoryPayload,
  ProductCategoryQuery,
  ProductMaterialPayload,
  ProductListQuery,
  ProductPayload,
  TechnicalFileQuery,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { IdentityDirectoryService } from '../../identity/public.js';
import { ProductDomainError } from '../domain/product.errors.js';
import { ProcessRouteRepository } from './ports/process-route.repository.js';
import { ProcessRouteStepRepository } from './ports/process-route-step.repository.js';
import { ProcessStepRepository } from './ports/process-step.repository.js';
import { ProductCatalogRepository } from './ports/product-catalog.repository.js';
import { ProductCategoryRepository } from './ports/product-category.repository.js';
import { TechnicalFileRepository } from './ports/technical-file.repository.js';
import { TechnicalFileStorage, type TechnicalFileUpload } from './ports/technical-file.storage.js';

@Injectable()
export class ProductService {
  constructor(
    private readonly technicalFiles: TechnicalFileRepository,
    private readonly categories: ProductCategoryRepository,
    private readonly catalog: ProductCatalogRepository,
    private readonly processSteps: ProcessStepRepository,
    private readonly routes: ProcessRouteRepository,
    private readonly routeSteps: ProcessRouteStepRepository,
    private readonly storage: TechnicalFileStorage,
    private readonly identityDirectory: IdentityDirectoryService,
  ) {}

  listCategories(query: ProductCategoryQuery) {
    return this.categories.listCategories(query);
  }
  listCategoryOptions() {
    return this.categories.listCategoryOptions();
  }
  listTechnicalFiles(query: TechnicalFileQuery) {
    return this.technicalFiles.listTechnicalFiles(query);
  }
  async uploadTechnicalFile(file: TechnicalFileUpload, audit: CommandContext) {
    this.validateTechnicalFile(file);
    const stored = await this.storage.storeSop(file);
    try {
      return await this.technicalFiles.createTechnicalFile(stored, audit);
    } catch (error) {
      await this.storage.remove(stored).catch(() => undefined);
      throw error;
    }
  }
  async downloadTechnicalFile(id: string) {
    const file = await this.technicalFiles.getTechnicalFile(id);
    return { file, stream: await this.storage.read(file) };
  }
  deleteTechnicalFile(id: string, audit: CommandContext) {
    // 软删除：停用并标记删除，对象存储内容保留，供历史路线和生产记录追溯。
    return this.technicalFiles.deleteTechnicalFile(id, audit);
  }
  listProducts(query: ProductListQuery) {
    return this.catalog.listProducts(query);
  }
  listProductOptions() {
    return this.catalog.listProductOptions();
  }
  listProcessSteps(query: ProcessStepQuery) {
    return this.processSteps.listProcessSteps(query);
  }
  listProcessStepOptions() {
    return this.processSteps.listProcessStepOptions();
  }
  listRoutes(query: ProcessRouteQuery) {
    return this.routes.listRoutes(query);
  }
  listRouteOptions() {
    return this.routes.listRouteOptions();
  }
  listUserOptions() {
    return this.identityDirectory.listActiveUserOptions();
  }
  listMaterials(productId: string) {
    return this.catalog.listMaterials(productId);
  }
  async listRouteSteps(routeId: string) {
    const items = await this.routeSteps.listRouteSteps(routeId);
    const ownerIds = [...new Set(items.flatMap((item) => item.defaultOwnerId ?? []))];
    if (ownerIds.length === 0) return items;
    const owners = await this.identityDirectory.listActiveUserOptionsByIds(ownerIds);
    const names = new Map(owners.map((owner) => [owner.id, owner.displayName]));
    return items.map((item) => ({
      ...item,
      defaultOwnerName: item.defaultOwnerId ? (names.get(item.defaultOwnerId) ?? null) : null,
    }));
  }

  createCategory(payload: ProductCategoryPayload, audit: CommandContext) {
    return this.categories.createCategory(this.cleanCategory(payload), audit);
  }
  updateCategory(id: string, payload: ProductCategoryPayload, audit: CommandContext) {
    return this.categories.updateCategory(id, this.cleanCategory(payload), audit);
  }
  setCategoryStatus(id: string, status: number, audit: CommandContext) {
    return this.categories.setCategoryStatus(id, status, audit);
  }
  createProduct(payload: ProductPayload, audit: CommandContext) {
    return this.catalog.createProduct(this.cleanProduct(payload), audit);
  }
  updateProduct(id: string, payload: ProductPayload, audit: CommandContext) {
    return this.catalog.updateProduct(id, this.cleanProduct(payload), audit);
  }
  setProductStatus(id: string, status: number, audit: CommandContext) {
    return this.catalog.setProductStatus(id, status, audit);
  }
  replaceMaterials(id: string, items: ProductMaterialPayload[], audit: CommandContext) {
    if (items.length > 200) {
      throw new ProductDomainError('INVALID_INPUT', '一份 BOM 最多包含 200 行明细');
    }
    if (new Set(items.map((item) => item.materialProductId)).size !== items.length) {
      throw new ProductDomainError('INVALID_INPUT', '同一投入物料不能在一份 BOM 中重复');
    }
    if (
      items.some(
        (item) =>
          !Number.isInteger(item.quantityPerUnit) ||
          item.quantityPerUnit <= 0 ||
          item.quantityPerUnit > 99_999_999 ||
          !item.unit.trim(),
      )
    ) {
      throw new ProductDomainError(
        'INVALID_INPUT',
        'BOM 单位用量必须是 1 到 99999999 的整数，且用量单位不能为空',
      );
    }
    return this.catalog.replaceMaterials(id, items, audit);
  }
  setDefaultRoute(id: string, routeId: string | null, audit: CommandContext) {
    return this.catalog.setDefaultRoute(id, routeId, audit);
  }
  createProcessStep(payload: ProcessStepPayload, audit: CommandContext) {
    return this.processSteps.createProcessStep(this.cleanProcessStep(payload), audit);
  }
  updateProcessStep(id: string, payload: ProcessStepPayload, audit: CommandContext) {
    return this.processSteps.updateProcessStep(id, this.cleanProcessStep(payload), audit);
  }
  setProcessStepStatus(id: string, status: number, audit: CommandContext) {
    return this.processSteps.setProcessStepStatus(id, status, audit);
  }
  async uploadProcessStepSop(id: string, file: TechnicalFileUpload, audit: CommandContext) {
    this.validateTechnicalFile(file);
    const stored = await this.storage.storeSop(file);
    try {
      await this.processSteps.attachProcessStepSop(id, stored, audit);
    } catch (error) {
      await this.storage.remove(stored).catch(() => undefined);
      throw error;
    }
  }
  setProcessStepDefaultSop(id: string, fileId: string | null, audit: CommandContext) {
    return this.processSteps.setProcessStepDefaultSop(id, fileId, audit);
  }
  createRoute(payload: ProcessRoutePayload, audit: CommandContext) {
    return this.routes.createRoute(this.cleanRoute(payload), audit);
  }
  updateRoute(id: string, payload: ProcessRoutePayload, audit: CommandContext) {
    return this.routes.updateRoute(id, this.cleanRoute(payload), audit);
  }
  setRouteStatus(id: string, status: ProcessRouteStatus, audit: CommandContext) {
    return this.routes.setRouteStatus(id, status, audit);
  }
  deleteRoute(id: string, audit: CommandContext) {
    return this.routes.deleteRoute(id, audit);
  }
  async replaceRouteSteps(id: string, items: ProcessRouteStepPayload[], audit: CommandContext) {
    if (items.length > 200) {
      throw new ProductDomainError('INVALID_INPUT', '一条工艺路线最多包含 200 个工序');
    }
    const orders = items.map((item) => item.stepOrder);
    const normalizedOrders = [...orders].sort((left, right) => left - right);
    if (
      items.length === 0 ||
      new Set(orders).size !== orders.length ||
      normalizedOrders.some((order, index) => order !== index + 1)
    ) {
      throw new ProductDomainError(
        'INVALID_INPUT',
        '路线至少包含一个工序，且工序顺序必须从 1 开始连续排列',
      );
    }
    const ownerIds = [...new Set(items.flatMap((item) => item.defaultOwnerId ?? []))];
    if (ownerIds.length > 0) {
      const owners = await this.identityDirectory.listActiveUserOptionsByIds(ownerIds);
      if (owners.length !== ownerIds.length) {
        throw new ProductDomainError('INVALID_INPUT', '默认负责人不存在或已停用');
      }
    }
    return this.routeSteps.replaceRouteSteps(id, items, audit);
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
    if (!file.buffer.length) throw new ProductDomainError('INVALID_INPUT', '上传文件不能为空');
    if (file.buffer.length > 20 * 1024 * 1024) {
      throw new ProductDomainError('INVALID_INPUT', '技术文件不能超过 20 MiB');
    }
    if (!file.originalName.trim()) throw new ProductDomainError('INVALID_INPUT', '文件名不能为空');
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
}
