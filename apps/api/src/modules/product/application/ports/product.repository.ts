import type {
  ProcessRouteListItem,
  ProcessRoutePayload,
  ProcessRouteStatus,
  ProcessRouteStepItem,
  ProcessRouteStepPayload,
  ProcessStepListItem,
  ProcessStepPayload,
  ProductCategoryListItem,
  ProductCategoryPayload,
  ProductListItem,
  ProductMaterialItem,
  ProductMaterialPayload,
  ProductOption,
  ProductPayload,
  UserOption,
} from '@company/contracts';
import type { AuditContext } from '../../../identity/application/audit.types.js';

export interface StoredTechnicalFile {
  fileName: string;
  originalName: string;
  storageProvider: 'local';
  bucket: null;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  fileType: 'sop';
  versionNo: string;
}

export abstract class ProductRepository {
  abstract listCategories(): Promise<ProductCategoryListItem[]>;
  abstract createCategory(
    payload: ProductCategoryPayload,
    audit: AuditContext,
  ): Promise<{ id: string }>;
  abstract updateCategory(
    id: string,
    payload: ProductCategoryPayload,
    audit: AuditContext,
  ): Promise<void>;
  abstract setCategoryStatus(id: string, status: number, audit: AuditContext): Promise<void>;

  abstract listProducts(): Promise<ProductListItem[]>;
  abstract listProductOptions(): Promise<ProductOption[]>;
  abstract createProduct(payload: ProductPayload, audit: AuditContext): Promise<{ id: string }>;
  abstract updateProduct(id: string, payload: ProductPayload, audit: AuditContext): Promise<void>;
  abstract setProductStatus(id: string, status: number, audit: AuditContext): Promise<void>;
  abstract listMaterials(productId: string): Promise<ProductMaterialItem[]>;
  abstract replaceMaterials(
    productId: string,
    items: ProductMaterialPayload[],
    audit: AuditContext,
  ): Promise<void>;
  abstract setDefaultRoute(
    productId: string,
    routeId: string | null,
    audit: AuditContext,
  ): Promise<void>;

  abstract listProcessSteps(): Promise<ProcessStepListItem[]>;
  abstract createProcessStep(
    payload: ProcessStepPayload,
    audit: AuditContext,
  ): Promise<{ id: string }>;
  abstract updateProcessStep(
    id: string,
    payload: ProcessStepPayload,
    audit: AuditContext,
  ): Promise<void>;
  abstract setProcessStepStatus(id: string, status: number, audit: AuditContext): Promise<void>;
  abstract attachProcessStepSop(
    id: string,
    file: StoredTechnicalFile,
    audit: AuditContext,
  ): Promise<void>;

  abstract listRoutes(): Promise<ProcessRouteListItem[]>;
  abstract createRoute(payload: ProcessRoutePayload, audit: AuditContext): Promise<{ id: string }>;
  abstract updateRoute(
    id: string,
    payload: ProcessRoutePayload,
    audit: AuditContext,
  ): Promise<void>;
  abstract setRouteStatus(
    id: string,
    status: ProcessRouteStatus,
    audit: AuditContext,
  ): Promise<void>;
  abstract deleteRoute(id: string, audit: AuditContext): Promise<void>;
  abstract listRouteSteps(routeId: string): Promise<ProcessRouteStepItem[]>;
  abstract replaceRouteSteps(
    routeId: string,
    items: ProcessRouteStepPayload[],
    audit: AuditContext,
  ): Promise<void>;
  abstract listUserOptions(): Promise<UserOption[]>;
}
