import { randomUUID } from 'node:crypto';
import {
  type ExecuteValues,
  type Pool,
  type ResultSetHeader,
  type RowDataPacket,
} from '../../../apps/api/node_modules/mysql2/promise.js';
import { SignJWT } from '../../../apps/api/node_modules/jose';
import { APPROVAL_SCENE_CODES, PERMISSIONS } from '../../../packages/constants/src/index.js';
import type {
  ApprovalFlowDetail,
  ApprovalAssignee,
} from '../../../packages/contracts/src/index.js';
import { type ApprovalService } from '../../../apps/api/src/modules/approval/application/approval.service.js';
import { type MysqlApprovalFlowRepository } from '../../../apps/api/src/modules/approval/infrastructure/mysql-approval-flow.repository.js';
import {
  type NotificationService,
  type CommittedNotification,
} from '../../../apps/api/src/modules/notification/public.js';
import { type IdentityDirectoryService } from '../../../apps/api/src/modules/identity/application/identity-directory.service.js';
import { type ProductBomApprovalHandler } from '../../../apps/api/src/modules/product/application/product-bom-approval.handler.js';
import { type MysqlProductCatalogRepository } from '../../../apps/api/src/modules/product/infrastructure/mysql-product-catalog.repository.js';
import type { CommandContext } from '../../../apps/api/src/common/audit/audit.types.js';

export const SCENE_CODE = APPROVAL_SCENE_CODES.bom;
let contextFixture: Fixture | undefined;
let flowRepositoryRef: MysqlApprovalFlowRepository | undefined;
export let notificationServiceRef: NotificationService | undefined;
export let notificationHookEvents: CommittedNotification[] = [];

export interface ApprovalMysqlContext {
  pool: Pool;
  fixture: Fixture;
  identity: IdentityDirectoryService;
  products: MysqlProductCatalogRepository;
  approvals: ApprovalService;
  bomHandler: ProductBomApprovalHandler;
}

export const setApprovalFixture = (fixture: Fixture): void => {
  contextFixture = fixture;
};

export const setApprovalFlowRepository = (flows: MysqlApprovalFlowRepository): void => {
  flowRepositoryRef = flows;
};

export const setApprovalNotificationService = (service: NotificationService): void => {
  notificationServiceRef = service;
};

export const resetApprovalNotificationHookEvents = (): void => {
  notificationHookEvents = [];
};

export interface Fixture {
  token: string;
  actorId: number;
  peerId: number;
  designatedId: number;
  outsiderId: number;
  assignmentRoleId: number;
  qualificationRoleId: number;
  categoryId: number;
  materialCategoryId: number;
  decidePermissionId: number;
  viewPermissionId: number;
  configurePermissionId: number;
  productManagePermissionId: number;
  productIds: number[];
  extraUserIds: number[];
  publishedFlow: ApprovalFlowDetail;
}

interface ProductFixture {
  productId: number;
  materialId: number;
  materialCode: string;
  itemCode: string;
  materialName: string;
}

interface NotificationFactRow extends RowDataPacket {
  id: string;
  event_key: string;
  event_type: string;
  source_type: string;
  source_id: string;
  target_type: string;
  target_id: string;
  action_id: string;
  action_instance_id: string;
  action_type: string;
  recipient_id: string | null;
}

interface NotificationFact {
  id: string;
  eventKey: string;
  eventType: string;
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  actionId: string;
  actionInstanceId: string;
  actionType: string;
  recipientIds: string[];
}

export const flushAfterCommit = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

export const notificationsFor = async (
  pool: Pool,
  instanceId: string,
): Promise<NotificationFact[]> => {
  const [rows] = await pool.query<NotificationFactRow[]>(
    `SELECT CAST(n.id AS CHAR) id,n.event_key,n.event_type,n.source_type,
       CAST(n.source_id AS CHAR) source_id,n.target_type,CAST(n.target_id AS CHAR) target_id,
       CAST(a.id AS CHAR) action_id,CAST(a.instance_id AS CHAR) action_instance_id,
       a.action_type,CAST(r.user_id AS CHAR) recipient_id
       FROM notifications n
       JOIN approval_actions a ON a.id=n.source_id AND a.instance_id=n.target_id
       LEFT JOIN notification_recipients r ON r.notification_id=n.id
       WHERE n.target_type='approval_instance' AND n.target_id=?
       ORDER BY n.id,r.user_id`,
    [instanceId],
  );
  const facts = new Map<string, NotificationFact>();
  for (const row of rows) {
    let fact = facts.get(row.id);
    if (!fact) {
      fact = {
        id: row.id,
        eventKey: row.event_key,
        eventType: row.event_type,
        sourceType: row.source_type,
        sourceId: row.source_id,
        targetType: row.target_type,
        targetId: row.target_id,
        actionId: row.action_id,
        actionInstanceId: row.action_instance_id,
        actionType: row.action_type,
        recipientIds: [],
      };
      facts.set(row.id, fact);
    }
    if (row.recipient_id !== null) fact.recipientIds.push(row.recipient_id);
  }
  return [...facts.values()].map((fact) => ({
    ...fact,
    recipientIds: [...new Set(fact.recipientIds)].sort(),
  }));
};

export const notificationCountForActor = async (pool: Pool, actorId: number): Promise<number> => {
  const [[row]] = await pool.query<(RowDataPacket & { total: number })[]>(
    'SELECT COUNT(*) total FROM notifications WHERE created_by=?',
    [actorId],
  );
  return Number(row!.total);
};

export const createFixture = async (pool: Pool): Promise<Fixture> => {
  const token = `appr-${process.pid}-${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const actorId = await createUser(pool, token, 'actor', '审批集成申请人');
  const peerId = await createUser(pool, token, 'peer', '审批集成同级人');
  const designatedId = await createUser(pool, token, 'designated', '审批集成指定人');
  const outsiderId = await createUser(pool, token, 'outsider', '审批集成无权限人');
  const assignmentRoleId = await insert(
    pool,
    'INSERT INTO roles (name,code,description,status) VALUES (?,?,?,1)',
    ['审批分配角色', `${token}-assignment-role`, '审批节点分配角色'],
  );
  const qualificationRoleId = await insert(
    pool,
    'INSERT INTO roles (name,code,description,status) VALUES (?,?,?,1)',
    ['审批资格角色', `${token}-qualification-role`, '仅提供审批资格'],
  );
  const permissionCodes = [
    PERMISSIONS.approval.configure,
    PERMISSIONS.approval.decide,
    PERMISSIONS.approval.view,
    PERMISSIONS.product.products.manageBom,
  ];
  const [permissionRows] = await pool.query<(RowDataPacket & { id: number; code: string })[]>(
    'SELECT id,code FROM permissions WHERE code IN (?) AND status=1 AND deleted_at IS NULL',
    [permissionCodes],
  );
  const permissionIds = new Map(permissionRows.map((row) => [row.code, Number(row.id)]));
  for (const code of permissionCodes) {
    if (!permissionIds.has(code))
      throw new Error(`Missing permission ${code}; run migrations first`);
  }
  const configurePermissionId = permissionIds.get(PERMISSIONS.approval.configure)!;
  const decidePermissionId = permissionIds.get(PERMISSIONS.approval.decide)!;
  const viewPermissionId = permissionIds.get(PERMISSIONS.approval.view)!;
  const productManagePermissionId = permissionIds.get(PERMISSIONS.product.products.manageBom)!;
  await pool.execute(
    'INSERT INTO role_permissions (role_id,permission_id) VALUES (?,?),(?,?),(?,?),(?,?)',
    [
      assignmentRoleId,
      configurePermissionId,
      assignmentRoleId,
      viewPermissionId,
      assignmentRoleId,
      productManagePermissionId,
      qualificationRoleId,
      decidePermissionId,
    ],
  );
  await pool.execute(
    'INSERT INTO user_roles (user_id,role_id) VALUES (?,?),(?,?),(?,?),(?,?),(?,?)',
    [
      actorId,
      assignmentRoleId,
      actorId,
      qualificationRoleId,
      peerId,
      assignmentRoleId,
      peerId,
      qualificationRoleId,
      designatedId,
      qualificationRoleId,
    ],
  );
  const categoryId = await insert(
    pool,
    'INSERT INTO item_categories (category_code,category_name,item_kind,created_by,updated_by) VALUES (?,?,?,?,?)',
    [`${token}-finished-category`, '审批集成成品分类', 'finished_product', actorId, actorId],
  );
  const materialCategoryId = await insert(
    pool,
    'INSERT INTO item_categories (category_code,category_name,item_kind,created_by,updated_by) VALUES (?,?,?,?,?)',
    [`${token}-material-category`, '审批集成物料分类', 'material', actorId, actorId],
  );
  return {
    token,
    actorId,
    peerId,
    designatedId,
    outsiderId,
    assignmentRoleId,
    qualificationRoleId,
    categoryId,
    materialCategoryId,
    decidePermissionId,
    viewPermissionId,
    configurePermissionId,
    productManagePermissionId,
    productIds: [],
    extraUserIds: [],
    publishedFlow: {
      sceneCode: SCENE_CODE,
      name: '',
      businessAssigneeSources: [],
      requiredFinalAssigneeSourceCode: null,
      published: null,
      draft: null,
    },
  };
};

export const publishFlow = async (
  steps: (ApprovalAssignee & { name: string })[],
): Promise<ApprovalFlowDetail> => {
  if (!contextFixture) throw new Error('approval fixture is not initialized');
  const current = await flowsForContext().getFlow(SCENE_CODE);
  const currentSteps = current.published?.steps ?? [];
  const payloadSteps = steps.map((step, index) => ({
    ...step,
    nodeCode: currentSteps[index]?.nodeCode ?? undefined,
  }));
  const flowRepository = flowsForContext();
  const draft = await flowRepository.saveFlowDraft(
    SCENE_CODE,
    {
      name: `BOM 审批版本 ${Date.now()}`,
      draftId: null,
      version: null,
      steps: payloadSteps,
    },
    context(contextFixture.actorId, `flow-draft-${randomUUID()}`),
  );
  const published = await flowRepository.publishFlow(
    SCENE_CODE,
    { draftId: draft.draft!.id, version: draft.draft!.version },
    context(contextFixture.actorId, `flow-publish-${randomUUID()}`),
  );
  contextFixture.publishedFlow = published;
  return published;
};

export const flowsForContext = (): MysqlApprovalFlowRepository => {
  if (!contextFixture || !flowRepositoryRef)
    throw new Error('approval flow repository is not initialized');
  return flowRepositoryRef;
};

export const roleAssignee = (
  name: string,
  roleId: number,
): ApprovalAssignee & { name: string } => ({
  name,
  assigneeType: 'role',
  assigneeSourceCode: null,
  roleId: String(roleId),
  assigneeUserId: null,
});

export const userAssignee = (
  name: string,
  userId: number,
): ApprovalAssignee & { name: string } => ({
  name,
  assigneeType: 'user',
  assigneeSourceCode: null,
  roleId: null,
  assigneeUserId: String(userId),
});

export const createUser = async (
  pool: Pool,
  token: string,
  suffix: string,
  name: string,
): Promise<number> =>
  insert(pool, 'INSERT INTO users (username,password_hash,display_name) VALUES (?,?,?)', [
    `${token}-${suffix}`,
    'integration-test-hash',
    name,
  ]);

export const createProduct = async (
  pool: Pool,
  current: Fixture,
  suffix: string,
): Promise<ProductFixture> => {
  const productCode = `${current.token}-${suffix}-product`;
  const itemCode = productCode.toUpperCase();
  const materialCode = `${current.token}-${suffix}-material`;
  const materialName = `审批集成物料-${suffix}`;
  const productId = await insert(
    pool,
    'INSERT INTO products (item_code,product_name,category_id,unit,acquire_method,spec_values,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?)',
    [
      itemCode,
      `审批集成产品-${suffix}`,
      current.categoryId,
      'pcs',
      'self_made',
      '[]',
      current.actorId,
      current.actorId,
    ],
  );
  const materialId = await insert(
    pool,
    'INSERT INTO materials (material_code,material_name,category_id,unit,acquire_method,created_by,updated_by) VALUES (?,?,?,?,?,?,?)',
    [
      materialCode,
      materialName,
      current.materialCategoryId,
      'kg',
      'purchased',
      current.actorId,
      current.actorId,
    ],
  );
  await pool.execute(
    'INSERT INTO product_materials (product_id,material_id,quantity_per_unit,unit,status,remark,created_by,updated_by) VALUES (?,?,?, ?,1,?,?,?)',
    [productId, materialId, '1.0000', 'kg', null, current.actorId, current.actorId],
  );
  current.productIds.push(productId);
  return { productId, materialId, materialCode, itemCode, materialName };
};

export const productState = async (pool: Pool, productId: number) => {
  const [[row]] = await pool.query<
    (RowDataPacket & {
      bom_status: string;
      bom_approval_instance_id: number | null;
      bom_locked_at: Date | null;
      bom_locked_by: number | null;
      version: number;
    })[]
  >(
    'SELECT bom_status,bom_approval_instance_id,bom_locked_at,bom_locked_by,version FROM products WHERE id=?',
    [productId],
  );
  return row;
};

export const context = (actorId: number, suffix: string): CommandContext => {
  if (!contextFixture) throw new Error('approval fixture is not initialized');
  return {
    actorId: String(actorId),
    requestId: `${contextFixture.token}-${suffix}`,
    ip: '127.0.0.1',
    userAgent: 'approval-integration-test',
  };
};

export const cleanupFixture = async (pool: Pool, current: Fixture): Promise<void> => {
  await pool.query(
    'DELETE r FROM notification_recipients r JOIN notifications n ON n.id=r.notification_id WHERE n.created_by IN (?)',
    [[current.actorId, current.peerId, current.designatedId, ...current.extraUserIds]],
  );
  await pool.query('DELETE FROM notifications WHERE created_by IN (?)', [
    [current.actorId, current.peerId, current.designatedId, ...current.extraUserIds],
  ]);
  const productMarks = placeholders(current.productIds);
  if (current.productIds.length) {
    await pool.execute(
      `UPDATE products SET bom_status='draft',bom_approval_instance_id=NULL,bom_locked_at=NULL,bom_locked_by=NULL WHERE id IN (${productMarks})`,
      current.productIds,
    );
    const [instances] = await pool.query<(RowDataPacket & { id: number })[]>(
      `SELECT id FROM approval_instances WHERE scene_code=? AND subject_type='product' AND subject_id IN (${productMarks})`,
      [SCENE_CODE, ...current.productIds],
    );
    const instanceIds = instances.map((row) => Number(row.id));
    if (instanceIds.length) {
      const marks = placeholders(instanceIds);
      await pool.execute(
        `DELETE FROM approval_actions WHERE instance_id IN (${marks})`,
        instanceIds,
      );
      await pool.execute(
        `DELETE FROM approval_instance_steps WHERE instance_id IN (${marks})`,
        instanceIds,
      );
      await pool.execute(`DELETE FROM approval_instances WHERE id IN (${marks})`, instanceIds);
    }
    const [materials] = await pool.query<(RowDataPacket & { id: number })[]>(
      `SELECT DISTINCT material_id id FROM product_materials WHERE product_id IN (${productMarks})`,
      current.productIds,
    );
    await pool.execute(
      `UPDATE products SET bom_status='draft',bom_approval_instance_id=NULL,bom_locked_at=NULL,bom_locked_by=NULL WHERE id IN (${productMarks})`,
      current.productIds,
    );
    await pool.execute(
      `DELETE FROM product_materials WHERE product_id IN (${productMarks})`,
      current.productIds,
    );
    const materialIds = materials.map((row) => Number(row.id));
    if (materialIds.length)
      await pool.execute(
        `DELETE FROM materials WHERE id IN (${placeholders(materialIds)})`,
        materialIds,
      );
    await pool.execute(`DELETE FROM products WHERE id IN (${productMarks})`, current.productIds);
  }
  const [definitions] = await pool.query<(RowDataPacket & { id: number })[]>(
    'SELECT id FROM approval_flow_definitions WHERE scene_code=?',
    [SCENE_CODE],
  );
  for (const definition of definitions) {
    const [versions] = await pool.query<(RowDataPacket & { id: number })[]>(
      'SELECT id FROM approval_flow_versions WHERE definition_id=?',
      [definition.id],
    );
    const versionIds = versions.map((row) => Number(row.id));
    if (versionIds.length) {
      const marks = placeholders(versionIds);
      const [leftoverInstances] = await pool.query<
        (RowDataPacket & { id: number; subject_id: number })[]
      >(
        `SELECT id,subject_id FROM approval_instances WHERE flow_version_id IN (${marks})`,
        versionIds,
      );
      if (leftoverInstances.length) {
        const leftoverIds = leftoverInstances.map((row) => Number(row.id));
        const leftoverMarks = placeholders(leftoverIds);
        const subjectIds = [...new Set(leftoverInstances.map((row) => Number(row.subject_id)))];
        if (subjectIds.length) {
          await pool.execute(
            `UPDATE products SET bom_status='draft',bom_approval_instance_id=NULL,bom_locked_at=NULL,bom_locked_by=NULL WHERE id IN (${placeholders(subjectIds)})`,
            subjectIds,
          );
        }
        await pool.execute(
          `DELETE FROM approval_actions WHERE instance_id IN (${leftoverMarks})`,
          leftoverIds,
        );
        await pool.execute(
          `DELETE FROM approval_instance_steps WHERE instance_id IN (${leftoverMarks})`,
          leftoverIds,
        );
        await pool.execute(
          `DELETE FROM approval_instances WHERE id IN (${leftoverMarks})`,
          leftoverIds,
        );
      }
      await pool.execute(
        `DELETE FROM approval_flow_steps WHERE flow_version_id IN (${marks})`,
        versionIds,
      );
      await pool.execute(
        'UPDATE approval_flow_definitions SET published_version_id=NULL WHERE id=?',
        [definition.id],
      );
      await pool.execute(`DELETE FROM approval_flow_versions WHERE id IN (${marks})`, versionIds);
    }
    await pool.execute('DELETE FROM approval_flow_definitions WHERE id=?', [definition.id]);
  }
  await pool.execute('DELETE FROM operation_logs WHERE request_id LIKE ?', [`${current.token}%`]);
  await pool.execute('DELETE FROM item_categories WHERE id IN (?,?)', [
    current.categoryId,
    current.materialCategoryId,
  ]);
  if (current.extraUserIds.length) {
    await pool.execute(
      `DELETE FROM user_roles WHERE user_id IN (${placeholders(current.extraUserIds)})`,
      current.extraUserIds,
    );
    await pool.execute(
      `DELETE FROM users WHERE id IN (${placeholders(current.extraUserIds)})`,
      current.extraUserIds,
    );
  }
  await pool.execute('DELETE FROM user_roles WHERE user_id IN (?,?,?,?)', [
    current.actorId,
    current.peerId,
    current.designatedId,
    current.outsiderId,
  ]);
  await pool.execute('DELETE FROM roles WHERE id IN (?,?)', [
    current.assignmentRoleId,
    current.qualificationRoleId,
  ]);
  await pool.execute('DELETE FROM users WHERE id IN (?,?,?,?)', [
    current.actorId,
    current.peerId,
    current.designatedId,
    current.outsiderId,
  ]);
};

export const signAccessToken = async (userId: number, username: string): Promise<string> => {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ username, kind: 'access' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(String(userId))
    .setIssuer(requiredEnv('JWT_ISSUER'))
    .setAudience(requiredEnv('JWT_AUDIENCE'))
    .setIssuedAt()
    .setExpirationTime(now + 15 * 60)
    .sign(new TextEncoder().encode(requiredEnv('JWT_SECRET')));
};

export const insert = async (pool: Pool, sql: string, values: ExecuteValues[]): Promise<number> => {
  const [result] = await pool.execute<ResultSetHeader>(sql, values);
  return Number(result.insertId);
};

const placeholders = (values: readonly unknown[]): string => values.map(() => '?').join(',');

export const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} for MySQL integration test`);
  return value;
};
