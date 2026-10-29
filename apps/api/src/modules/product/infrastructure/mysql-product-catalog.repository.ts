import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'mysql2/promise';
import type {
  BomApprovalSnapshot,
  PageResult,
  ProductListItem,
  ProductListQuery,
  ProductMaterialItem,
  ProductOption,
  ProductPayload,
  ProductUpdatePayload,
  ReplaceProductMaterialsCommand,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import type { ProductCatalogRepository } from '../application/ports/product-catalog.repository.js';
import { MysqlProductCatalogQuery } from './mysql-product-catalog.query.js';
import { MysqlProductCommands } from './mysql-product.commands.js';
import { MysqlProductBomEditor } from './mysql-product-bom.editor.js';
import { MysqlProductBomApproval } from './mysql-product-bom.approval.js';

/** 应用端口装配：事务与业务 SQL 由对应职责的内部适配器执行。 */
@Injectable()
export class MysqlProductCatalogRepository implements ProductCatalogRepository {
  private readonly queries: MysqlProductCatalogQuery;
  private readonly products: MysqlProductCommands;
  private readonly bom: MysqlProductBomEditor;
  private readonly approvals: MysqlProductBomApproval;

  constructor(@Inject(DATABASE_POOL) pool: Pool) {
    this.queries = new MysqlProductCatalogQuery(pool);
    this.products = new MysqlProductCommands(pool);
    this.bom = new MysqlProductBomEditor(pool);
    this.approvals = new MysqlProductBomApproval(pool);
  }

  listProducts(query: ProductListQuery): Promise<PageResult<ProductListItem>> {
    return this.queries.listProducts(query);
  }

  listProductOptions(): Promise<ProductOption[]> {
    return this.queries.listProductOptions();
  }

  createProduct(payload: ProductPayload, audit: CommandContext): Promise<{ id: string }> {
    return this.products.createProduct(payload, audit);
  }

  updateProduct(id: string, payload: ProductUpdatePayload, audit: CommandContext): Promise<void> {
    return this.products.updateProduct(id, payload, audit);
  }

  setProductStatus(id: string, status: number, audit: CommandContext): Promise<void> {
    return this.products.setProductStatus(id, status, audit);
  }

  listMaterials(productId: string): Promise<ProductMaterialItem[]> {
    return this.queries.listMaterials(productId);
  }

  replaceMaterials(
    productId: string,
    command: ReplaceProductMaterialsCommand,
    audit: CommandContext,
  ): Promise<void> {
    return this.bom.replaceMaterials(productId, command, audit);
  }

  lockCurrentBomApproval(
    productId: string,
    instanceId: string,
    expectedVersion: number,
  ): Promise<void> {
    return this.approvals.lockCurrentBomApproval(productId, instanceId, expectedVersion);
  }

  prepareBomApproval(
    productId: string,
    expectedVersion: number,
    audit: CommandContext,
  ): Promise<{ title: string; subjectVersion: number; snapshot: BomApprovalSnapshot }> {
    return this.approvals.prepareBomApproval(productId, expectedVersion, audit);
  }

  bindBomApproval(
    productId: string,
    instanceId: string,
    expectedVersion: number,
    audit: CommandContext,
  ): Promise<number> {
    return this.approvals.bindBomApproval(productId, instanceId, expectedVersion, audit);
  }

  finalizeBomApproval(
    productId: string,
    instanceId: string,
    expectedVersion: number,
    audit: CommandContext,
  ): Promise<void> {
    return this.approvals.finalizeBomApproval(productId, instanceId, expectedVersion, audit);
  }

  restoreBomAfterApprovalEnd(
    productId: string,
    instanceId: string,
    expectedVersion: number,
    audit: CommandContext,
  ): Promise<void> {
    return this.approvals.restoreBomAfterApprovalEnd(productId, instanceId, expectedVersion, audit);
  }

  listMaterialNames(materialIds: string[]): Promise<Record<string, string>> {
    return this.queries.listMaterialNames(materialIds);
  }
}
