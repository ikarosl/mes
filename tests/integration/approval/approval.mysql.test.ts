import '../../../apps/api/node_modules/reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe } from 'vitest';
import { createPool, type Pool } from '../../../apps/api/node_modules/mysql2/promise.js';
import { loadWorkspaceEnv } from '../../../packages/config/src/index.js';
import { DATABASE_POOL } from '../../../apps/api/src/infrastructure/database/database.module.js';
import { ApprovalService } from '../../../apps/api/src/modules/approval/application/approval.service.js';
import { ApprovalSubjectHandlerRegistry } from '../../../apps/api/src/modules/approval/application/approval-subject-handler.registry.js';
import { MysqlApprovalFlowRepository } from '../../../apps/api/src/modules/approval/infrastructure/mysql-approval-flow.repository.js';
import { MysqlApprovalRepository } from '../../../apps/api/src/modules/approval/infrastructure/mysql-approval.repository.js';
import { ApprovalNotifications } from '../../../apps/api/src/modules/approval/infrastructure/approval-notifications.js';
import {
  NotificationService,
  type CommittedNotification,
} from '../../../apps/api/src/modules/notification/public.js';
import { MysqlNotificationRepository } from '../../../apps/api/src/modules/notification/infrastructure/mysql-notification.repository.js';
import { IdentityDirectoryService } from '../../../apps/api/src/modules/identity/application/identity-directory.service.js';
import { MysqlRbacRepository } from '../../../apps/api/src/modules/identity/infrastructure/mysql-rbac.repository.js';
import { ProductBomApprovalHandler } from '../../../apps/api/src/modules/product/application/product-bom-approval.handler.js';
import { MysqlProductCatalogRepository } from '../../../apps/api/src/modules/product/infrastructure/mysql-product-catalog.repository.js';
import {
  flushAfterCommit,
  createFixture,
  publishFlow,
  roleAssignee,
  cleanupFixture,
  requiredEnv,
  notificationHookEvents,
  setApprovalFixture,
  setApprovalFlowRepository,
  setApprovalNotificationService,
  resetApprovalNotificationHookEvents,
  type Fixture,
  type ApprovalMysqlContext,
} from './approval-fixture.js';
import {
  registerApprovalFlowVersionCases,
  registerApprovalAssigneeCases,
} from './approval-assignees.cases.js';
import { registerApprovalNotificationCases } from './approval-notifications.cases.js';
import {
  registerApprovalNotificationRollbackCases,
  registerApprovalDecisionTransactionCases,
} from './approval-transactions.cases.js';
import {
  app,
  registerApprovalConfigurationHttpCases,
} from './approval-configuration-http.cases.js';

loadWorkspaceEnv();

const describeMysql = process.env.RUN_MYSQL_INTEGRATION === '1' ? describe : describe.skip;

/**
 * Approval 的真实 MySQL 回归覆盖：节点单执行记录、实时资格、用户节点、固定选版、
 * 分页前过滤、并发决定、业务事务回滚和真实 HTTP 管线。所有候选人都由 Identity
 * 实时计算，测试不会读取或写入已经删除的 approval_tasks。
 */
describeMysql('Approval BOM workflow (real MySQL)', () => {
  let pool: Pool;
  let fixture: Fixture;
  let identity: IdentityDirectoryService;
  let handlers: ApprovalSubjectHandlerRegistry;
  let products: MysqlProductCatalogRepository;
  let flows: MysqlApprovalFlowRepository;
  let approvals: ApprovalService;
  let bomHandler: ProductBomApprovalHandler;

  beforeAll(async () => {
    const database = requiredEnv('DB_NAME');
    if (!/(?:_test|_ci)$/.test(database))
      throw new Error('approval integration tests require a dedicated *_test or *_ci database');
    pool = createPool({
      host: requiredEnv('DB_HOST'),
      port: Number(requiredEnv('DB_PORT')),
      user: requiredEnv('DB_USER'),
      password: requiredEnv('DB_PASSWORD'),
      database,
      charset: 'utf8mb4',
      timezone: '+08:00',
      connectionLimit: 12,
    });
    fixture = await createFixture(pool);
    setApprovalFixture(fixture);
    identity = new IdentityDirectoryService(new MysqlRbacRepository(pool));
    handlers = new ApprovalSubjectHandlerRegistry();
    products = new MysqlProductCatalogRepository(pool);
    bomHandler = new ProductBomApprovalHandler(products, handlers);
    bomHandler.onModuleInit();
    flows = new MysqlApprovalFlowRepository(pool, identity, handlers);
    setApprovalFlowRepository(flows);
    const notificationService = new NotificationService(
      new MysqlNotificationRepository(pool, {
        handle: (event: CommittedNotification) => {
          notificationHookEvents.push(event);
        },
      }),
    );
    setApprovalNotificationService(notificationService);
    approvals = new ApprovalService(
      new MysqlApprovalRepository(
        pool,
        identity,
        handlers,
        flows,
        new ApprovalNotifications(notificationService),
      ),
      flows,
    );
    fixture.publishedFlow = await publishFlow([
      roleAssignee('业务确认', fixture.assignmentRoleId),
      roleAssignee('技术确认', fixture.assignmentRoleId),
    ]);
  });

  afterAll(async () => {
    const appPool = app?.get(DATABASE_POOL) as Pool | undefined;
    await app?.close();
    await appPool?.end();
    if (pool && fixture) await cleanupFixture(pool, fixture);
    await pool?.end();
  });

  beforeEach(async () => {
    await flushAfterCommit();
    resetApprovalNotificationHookEvents();
    // Tests deliberately revoke membership/permissions; restore only the fixture baseline.
    await pool.execute(
      'INSERT IGNORE INTO user_roles (user_id,role_id) VALUES (?,?),(?,?),(?,?),(?,?),(?,?)',
      [
        fixture.actorId,
        fixture.assignmentRoleId,
        fixture.actorId,
        fixture.qualificationRoleId,
        fixture.peerId,
        fixture.assignmentRoleId,
        fixture.peerId,
        fixture.qualificationRoleId,
        fixture.designatedId,
        fixture.qualificationRoleId,
      ],
    );
    await pool.execute(
      'INSERT IGNORE INTO role_permissions (role_id,permission_id) VALUES (?,?),(?,?)',
      [
        fixture.qualificationRoleId,
        fixture.decidePermissionId,
        fixture.qualificationRoleId,
        fixture.viewPermissionId,
      ],
    );
  });

  const getContext = (): ApprovalMysqlContext => ({
    pool,
    fixture,
    identity,
    products,
    approvals,
    bomHandler,
  });

  // Keep registration order: these cases share the same beforeAll fixture.
  registerApprovalFlowVersionCases(getContext);
  registerApprovalNotificationCases(getContext);
  registerApprovalNotificationRollbackCases(getContext);
  registerApprovalAssigneeCases(getContext);
  registerApprovalDecisionTransactionCases(getContext);
  registerApprovalConfigurationHttpCases(getContext);
});
