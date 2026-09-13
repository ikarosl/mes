import { type Pool, type RowDataPacket } from '../../../apps/api/node_modules/mysql2/promise.js';
import { APPROVAL_SCENE_CODES, PERMISSIONS } from '../../../packages/constants/src/index.js';
import type { ApprovalInstanceDetail } from '../../../packages/contracts/src/index.js';
import type { CommandContext } from '../../../apps/api/src/common/audit/audit.types.js';
import {
  ApprovalService,
  ApprovalSubjectHandlerRegistry,
} from '../../../apps/api/src/modules/approval/public.js';
import { MysqlApprovalFlowRepository } from '../../../apps/api/src/modules/approval/infrastructure/mysql-approval-flow.repository.js';
import { MysqlApprovalRepository } from '../../../apps/api/src/modules/approval/infrastructure/mysql-approval.repository.js';
import { IdentityDirectoryService } from '../../../apps/api/src/modules/identity/application/identity-directory.service.js';
import { MysqlRbacRepository } from '../../../apps/api/src/modules/identity/infrastructure/mysql-rbac.repository.js';
import { ProductBomApprovalHandler } from '../../../apps/api/src/modules/product/public.js';
import { MysqlProductCatalogRepository } from '../../../apps/api/src/modules/product/infrastructure/mysql-product-catalog.repository.js';

/** Creates an approved BOM through the public approval service for production fixtures. */
export interface ApprovedBomFixtureInput {
  pool: Pool;
  token: string;
  actorId: number;
  roleId: number;
  productId: number;
  expectedProductVersion: number;
}

export interface ApprovedBomFixture extends ApprovedBomFixtureInput {
  flowDefinitionId: number;
  flowVersionId: number;
  approvalInstanceId: number;
  approvalInstance: ApprovalInstanceDetail;
}

const SCENE_CODE = APPROVAL_SCENE_CODES.bom;

export const approveBomForProduction = async (
  input: ApprovedBomFixtureInput,
): Promise<ApprovedBomFixture> => {
  const { pool, token, actorId, roleId, productId, expectedProductVersion } = input;
  const approvalPermissionId = await permissionId(pool, PERMISSIONS.approval.decide);
  await pool.execute('INSERT IGNORE INTO role_permissions (role_id,permission_id) VALUES (?,?)', [
    roleId,
    approvalPermissionId,
  ]);
  await pool.execute('INSERT IGNORE INTO user_roles (user_id,role_id) VALUES (?,?)', [
    actorId,
    roleId,
  ]);

  const handlers = new ApprovalSubjectHandlerRegistry();
  const products = new MysqlProductCatalogRepository(pool);
  const bomHandler = new ProductBomApprovalHandler(products, handlers);
  bomHandler.onModuleInit();
  const identity = new IdentityDirectoryService(new MysqlRbacRepository(pool));
  const flows = new MysqlApprovalFlowRepository(pool, identity, handlers);
  const repository = new MysqlApprovalRepository(pool, identity, handlers, flows);
  const approvals = new ApprovalService(repository, flows);

  const draft = await flows.saveFlowDraft(
    SCENE_CODE,
    {
      name: `${token} production approval`,
      draftId: null,
      version: null,
      steps: [
        {
          name: 'production approval',
          assigneeType: 'role',
          roleId: String(roleId),
          assigneeUserId: null,
        },
      ],
    },
    commandContext(actorId, `${token}-flow-draft`),
  );
  const published = await flows.publishFlow(
    SCENE_CODE,
    { draftId: draft.draft!.id, version: draft.draft!.version },
    commandContext(actorId, `${token}-flow-publish`),
  );
  const flowDefinitionId = await currentFlowDefinitionId(pool);
  const flowVersionId = Number(published.published!.id);

  const submitted = await approvals.submit(
    {
      sceneCode: SCENE_CODE,
      subjectId: String(productId),
      expectedVersion: expectedProductVersion,
    },
    commandContext(actorId, `${token}-approval-submit`),
  );
  const step = submitted.steps[0];
  if (!step || !step.eligibleUsers.some((candidate) => candidate.id === String(actorId)))
    throw new Error('approved BOM fixture did not receive actor eligibility');
  const approved = await approvals.approve(
    submitted.id,
    { version: submitted.version, stepId: step.id },
    commandContext(actorId, `${token}-approval-final`),
  );
  if (approved.status !== 'approved')
    throw new Error(`approved BOM fixture ended in ${approved.status}`);

  return {
    ...input,
    flowDefinitionId,
    flowVersionId,
    approvalInstanceId: Number(approved.id),
    approvalInstance: approved,
  };
};

/** Restores the product draft and removes only rows created by this fixture. */
export const cleanupApprovedBom = async (
  pool: Pool,
  fixture: Partial<ApprovedBomFixture> & Pick<ApprovedBomFixtureInput, 'token' | 'productId'>,
): Promise<void> => {
  await pool.execute(
    "UPDATE products SET bom_status='draft',bom_approval_instance_id=NULL,bom_locked_at=NULL,bom_locked_by=NULL WHERE id=?",
    [fixture.productId],
  );
  if (fixture.approvalInstanceId) {
    await pool.execute('DELETE FROM approval_actions WHERE instance_id=?', [
      fixture.approvalInstanceId,
    ]);
    await pool.execute('DELETE FROM approval_instance_steps WHERE instance_id=?', [
      fixture.approvalInstanceId,
    ]);
    await pool.execute('DELETE FROM approval_instances WHERE id=?', [fixture.approvalInstanceId]);
  }
  if (fixture.flowDefinitionId) {
    const [versions] = await pool.query<(RowDataPacket & { id: number })[]>(
      'SELECT id FROM approval_flow_versions WHERE definition_id=?',
      [fixture.flowDefinitionId],
    );
    const versionIds = versions.map((row) => Number(row.id));
    if (versionIds.length) {
      const marks = versionIds.map(() => '?').join(',');
      await pool.execute(
        `DELETE FROM approval_flow_steps WHERE flow_version_id IN (${marks})`,
        versionIds,
      );
      await pool.execute(
        'UPDATE approval_flow_definitions SET published_version_id=NULL WHERE id=?',
        [fixture.flowDefinitionId],
      );
      await pool.execute(`DELETE FROM approval_flow_versions WHERE id IN (${marks})`, versionIds);
    }
    await pool.execute('DELETE FROM approval_flow_definitions WHERE id=?', [
      fixture.flowDefinitionId,
    ]);
  }
  await pool.execute('DELETE FROM operation_logs WHERE request_id LIKE ?', [`${fixture.token}%`]);
};

const commandContext = (actorId: number, requestId: string): CommandContext => ({
  actorId: String(actorId),
  requestId,
  ip: '127.0.0.1',
  userAgent: 'idempotency-approval-fixture',
});

const permissionId = async (pool: Pool, code: string): Promise<number> => {
  const [[row]] = await pool.query<(RowDataPacket & { id: number })[]>(
    'SELECT id FROM permissions WHERE code=? AND status=1 AND deleted_at IS NULL',
    [code],
  );
  if (!row) throw new Error(`Missing permission ${code}; run migrations first`);
  return Number(row.id);
};

const currentFlowDefinitionId = async (pool: Pool): Promise<number> => {
  const [[row]] = await pool.query<(RowDataPacket & { id: number })[]>(
    'SELECT id FROM approval_flow_definitions WHERE scene_code=? AND is_deleted=0',
    [SCENE_CODE],
  );
  if (!row) throw new Error('Approval flow definition was not created');
  return Number(row.id);
};
