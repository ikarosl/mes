import type {
  Connection,
  ExecuteValues,
  Pool,
  ResultSetHeader,
} from '../../../apps/api/node_modules/mysql2/promise.js';
import { SYSTEM_STATUS } from '../../../packages/constants/src/index.js';
import type {
  JsonTableData,
  ProductAcquireMethod,
  ProductItemKind,
} from '../../../packages/contracts/src/index.js';

// 仅用于当前完整 migration 链下的基础资料；历史阶段夹具仍在所属迁移测试中显式构造。
// 不创建审批、生产或库存事实，资料归属与清理由调用套件维护。
export type FixtureConnection = Pool | Connection;
type FixtureId = string | number;
type FixtureStatus = (typeof SYSTEM_STATUS)[keyof typeof SYSTEM_STATUS];
const emptySpecValues = (): JsonTableData => ({ columns: [], rows: [] });

export interface UserFixtureInput {
  username: string;
  displayName?: string;
  passwordHash?: string;
  departmentId?: FixtureId | null;
  status?: FixtureStatus;
}

export interface RoleFixtureInput {
  code: string;
  name?: string;
  description?: string | null;
  status?: FixtureStatus;
}

interface AuditedFixtureInput {
  actorId: FixtureId;
  status?: FixtureStatus;
  remark?: string | null;
}

export interface ItemCategoryFixtureInput extends AuditedFixtureInput {
  categoryCode: string;
  categoryName?: string;
  itemKind: ProductItemKind;
}

interface CatalogFixtureInput extends AuditedFixtureInput {
  categoryId: FixtureId;
  unit?: string;
  acquireMethod?: ProductAcquireMethod;
  specValues?: JsonTableData;
}

export interface ProductFixtureInput extends CatalogFixtureInput {
  itemCode: string;
  productName?: string;
  specificationFileId?: FixtureId | null;
}

export interface MaterialFixtureInput extends CatalogFixtureInput {
  materialCode: string;
  materialName?: string;
}

export interface MaterialVariantFixtureInput extends AuditedFixtureInput {
  materialId: FixtureId;
  variantCode: string;
  majorVersion?: string;
  minorVersion?: string;
  specificationFileId?: FixtureId | null;
}

export const insertUserFixture = (
  connection: FixtureConnection,
  input: UserFixtureInput,
): Promise<number> =>
  insert(
    connection,
    `INSERT INTO users (username,password_hash,display_name,department_id,status)
     VALUES (?,?,?,?,?)`,
    [
      input.username,
      input.passwordHash ?? 'integration-test-hash',
      input.displayName ?? input.username,
      input.departmentId ?? null,
      input.status ?? SYSTEM_STATUS.enabled,
    ],
  );

export const insertRoleFixture = (
  connection: FixtureConnection,
  input: RoleFixtureInput,
): Promise<number> =>
  insert(connection, 'INSERT INTO roles (code,name,description,status) VALUES (?,?,?,?)', [
    input.code,
    input.name ?? input.code,
    input.description ?? null,
    input.status ?? SYSTEM_STATUS.enabled,
  ]);

export const insertItemCategoryFixture = (
  connection: FixtureConnection,
  input: ItemCategoryFixtureInput,
): Promise<number> =>
  insert(
    connection,
    `INSERT INTO item_categories
       (category_code,category_name,item_kind,status,remark,created_by,updated_by)
     VALUES (?,?,?,?,?,?,?)`,
    [
      input.categoryCode,
      input.categoryName ?? input.categoryCode,
      input.itemKind,
      input.status ?? SYSTEM_STATUS.enabled,
      input.remark ?? null,
      input.actorId,
      input.actorId,
    ],
  );

export const insertProductFixture = (
  connection: FixtureConnection,
  input: ProductFixtureInput,
): Promise<number> =>
  insert(
    connection,
    `INSERT INTO products
       (item_code,product_name,category_id,unit,acquire_method,spec_values,
        specification_file_id,status,remark,created_by,updated_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [
      input.itemCode,
      input.productName ?? input.itemCode,
      input.categoryId,
      input.unit ?? 'pcs',
      input.acquireMethod ?? 'self_made',
      JSON.stringify(input.specValues ?? emptySpecValues()),
      input.specificationFileId ?? null,
      input.status ?? SYSTEM_STATUS.enabled,
      input.remark ?? null,
      input.actorId,
      input.actorId,
    ],
  );

export const insertMaterialFixture = (
  connection: FixtureConnection,
  input: MaterialFixtureInput,
): Promise<number> =>
  insert(
    connection,
    `INSERT INTO materials
       (material_code,material_name,category_id,unit,acquire_method,spec_values,
        status,remark,created_by,updated_by)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      input.materialCode,
      input.materialName ?? input.materialCode,
      input.categoryId,
      input.unit ?? 'kg',
      input.acquireMethod ?? 'purchased',
      JSON.stringify(input.specValues ?? emptySpecValues()),
      input.status ?? SYSTEM_STATUS.enabled,
      input.remark ?? null,
      input.actorId,
      input.actorId,
    ],
  );

export const insertMaterialVariantFixture = (
  connection: FixtureConnection,
  input: MaterialVariantFixtureInput,
): Promise<number> =>
  insert(
    connection,
    `INSERT INTO material_variants
       (material_id,major_version,minor_version,variant_code,specification_file_id,
        status,remark,created_by,updated_by)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      input.materialId,
      input.majorVersion ?? 'v1',
      input.minorVersion ?? 'A',
      input.variantCode,
      input.specificationFileId ?? null,
      input.status ?? SYSTEM_STATUS.enabled,
      input.remark ?? null,
      input.actorId,
      input.actorId,
    ],
  );

const insert = async (
  connection: FixtureConnection,
  sql: string,
  values: ExecuteValues[],
): Promise<number> => {
  const [result] = await connection.execute<ResultSetHeader>(sql, values);
  return Number(result.insertId);
};
