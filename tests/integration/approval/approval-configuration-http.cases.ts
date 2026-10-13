import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { Test } from '../../../apps/api/node_modules/@nestjs/testing';
import type { INestApplication } from '../../../apps/api/node_modules/@nestjs/common';
// supertest has no usable declaration when imported through the API workspace path.
// @ts-expect-error supertest is runtime-only for this integration suite.
import request from '../../../apps/api/node_modules/supertest';
import { AppModule } from '../../../apps/api/src/app.module.js';
import { requestContextMiddleware } from '../../../apps/api/src/common/http/request-context.middleware.js';
import { createValidationPipe } from '../../../apps/api/src/presentation/http/validation.pipe.js';
import {
  flowsForContext,
  roleAssignee,
  context,
  signAccessToken,
  SCENE_CODE,
  type ApprovalMysqlContext,
} from './approval-fixture.js';

export let app: INestApplication | undefined;

export const registerApprovalConfigurationHttpCases = (
  getContext: () => ApprovalMysqlContext,
): void => {
  it('rejects stale draft identity/version writes and keeps the published flow unchanged', async () => {
    const { fixture } = getContext();

    const before = await flowsForContext().getFlow(SCENE_CODE);
    const draft = await flowsForContext().saveFlowDraft(
      SCENE_CODE,
      {
        name: 'stale draft check',
        draftId: null,
        version: null,
        steps: [roleAssignee('草稿节点', fixture.assignmentRoleId)],
      },
      context(fixture.actorId, 'stale-draft-create'),
    );
    await expect(
      flowsForContext().saveFlowDraft(
        SCENE_CODE,
        {
          name: 'wrong draft identity',
          draftId: draft.draft!.id,
          version: draft.draft!.version - 1,
          steps: [roleAssignee('wrong', fixture.assignmentRoleId)],
        },
        context(fixture.actorId, 'stale-draft-save'),
      ),
    ).rejects.toMatchObject({ code: 'CONCURRENT_MODIFICATION' });
    await expect(
      flowsForContext().publishFlow(
        SCENE_CODE,
        { draftId: draft.draft!.id, version: draft.draft!.version - 1 },
        context(fixture.actorId, 'stale-draft-publish'),
      ),
    ).rejects.toMatchObject({ code: 'CONCURRENT_MODIFICATION' });
    const published = await flowsForContext().publishFlow(
      SCENE_CODE,
      { draftId: draft.draft!.id, version: draft.draft!.version },
      context(fixture.actorId, 'stale-draft-publish-valid'),
    );
    expect(published.published?.versionNo).toBeGreaterThan(before.published?.versionNo ?? 0);
    expect(published.draft).toBeNull();
  });

  it('uses the real HTTP pipeline for global configuration/user options and rejects legacy inputs', async () => {
    const { pool, fixture } = getContext();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.use(requestContextMiddleware);
    app.useGlobalPipes(createValidationPipe());
    await app.init();

    const token = await signAccessToken(fixture.actorId, `${fixture.token}-actor`);
    const scenes = await request(app.getHttpServer())
      .get('/api/approval/scenes')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Request-Id', randomUUID());
    expect(scenes.status).toBe(200);
    const userOptions = await request(app.getHttpServer())
      .get('/api/approval/user-options')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Request-Id', randomUUID());
    expect(userOptions.status).toBe(200);
    expect(Array.isArray(userOptions.body)).toBe(true);
    expect(userOptions.body.map((user: { id: string }) => user.id)).toContain(
      String(fixture.designatedId),
    );
    await pool.execute('UPDATE users SET status=0 WHERE id=?', [fixture.designatedId]);
    const disabledUserOptions = await request(app.getHttpServer())
      .get('/api/approval/user-options')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Request-Id', randomUUID());
    expect(disabledUserOptions.status).toBe(200);
    expect(disabledUserOptions.body.map((user: { id: string }) => user.id)).not.toContain(
      String(fixture.designatedId),
    );
    await pool.execute('UPDATE users SET status=1 WHERE id=?', [fixture.designatedId]);
    const forbidden = await request(app.getHttpServer())
      .get('/api/approval/scenes')
      .set('Authorization', `Bearer ${await signAccessToken(fixture.outsiderId, fixture.token)}`)
      .set('X-Request-Id', randomUUID());
    expect(forbidden.status).toBe(403);
    const userOptionsForbidden = await request(app.getHttpServer())
      .get('/api/approval/user-options')
      .set('Authorization', `Bearer ${await signAccessToken(fixture.outsiderId, fixture.token)}`)
      .set('X-Request-Id', randomUUID());
    expect(userOptionsForbidden.status).toBe(403);
    const legacyDecision = await request(app.getHttpServer())
      .post('/api/approval/instances/999999/approve')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Request-Id', randomUUID())
      .send({ version: 0, taskId: '1' });
    expect(legacyDecision.status).toBe(400);
    expect(String(legacyDecision.body.message)).toContain('taskId');
    const clientQualification = await request(app.getHttpServer())
      .get('/api/approval/instances?page=1&pageSize=10&roleIds=1&userId=1&canApprove=true')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Request-Id', randomUUID());
    expect(clientQualification.status).toBe(400);
    const reassignment = await request(app.getHttpServer())
      .post('/api/approval/instances/999999/reassign')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Request-Id', randomUUID())
      .send({ version: 0 });
    expect(reassignment.status).toBe(404);
  });
};
