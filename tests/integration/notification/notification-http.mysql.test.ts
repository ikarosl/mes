import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SignJWT } from '../../../apps/api/node_modules/jose';
import { Test } from '../../../apps/api/node_modules/@nestjs/testing';
import type { INestApplication } from '../../../apps/api/node_modules/@nestjs/common';
import type { Pool } from '../../../apps/api/node_modules/mysql2/promise.js';
// supertest has no usable declaration when imported through the API workspace path.
// @ts-expect-error supertest is runtime-only for this integration suite.
import request from '../../../apps/api/node_modules/supertest';
import { AppModule } from '../../../apps/api/src/app.module.js';
import { DATABASE_POOL } from '../../../apps/api/src/infrastructure/database/database.module.js';
import { createValidationPipe } from '../../../apps/api/src/presentation/http/validation.pipe.js';
import { requestContextMiddleware } from '../../../apps/api/src/common/http/request-context.middleware.js';
import { NotificationAfterCommitHook } from '../../../apps/api/src/modules/notification/public.js';
import { NotificationFixture, notificationPool, required } from './notification-fixture.js';

const describeMysql = process.env.RUN_MYSQL_INTEGRATION === '1' ? describe : describe.skip;

describeMysql('Notification authenticated HTTP pipeline (real MySQL)', () => {
  let pool: Pool;
  let app: INestApplication;
  let fixture: NotificationFixture;
  let owner: string;
  let other: string;
  let token: string;
  let receiptId: string;
  const handle = vi.fn();

  beforeAll(async () => {
    pool = notificationPool();
    fixture = new NotificationFixture(pool);
    owner = await fixture.createUser();
    other = await fixture.createUser();
    // No role or business permission is assigned to either recipient.
    token = await signToken(owner);
    const service = fixture.service();
    await service.publish(
      fixture.input([owner], { targetType: 'approval_instance', targetId: '18446744073709551615' }),
      fixture.context(),
    );
    receiptId = (await service.list({}, owner)).items[0]!.id;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NotificationAfterCommitHook)
      .useValue({ handle })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.use(requestContextMiddleware);
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    const appPool = app?.get<Pool>(DATABASE_POOL);
    try {
      await app?.close();
      await appPool?.end();
      await fixture?.cleanup();
    } finally {
      await pool?.end();
    }
  });

  it('requires authentication on all three endpoints', async () => {
    expect((await request(app.getHttpServer()).get('/api/notifications')).status).toBe(401);
    expect((await request(app.getHttpServer()).get('/api/notifications/unread-count')).status).toBe(
      401,
    );
    expect(
      (
        await request(app.getHttpServer())
          .post(`/api/notifications/${receiptId}/read`)
          .send({ version: 0 })
      ).status,
    ).toBe(401);
  });

  it('allows a roleless recipient to read historical text while the target API independently refuses access', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/notifications')
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({ total: 1, page: 1, pageSize: 10 });
    expect(list.body.items[0]).toMatchObject({
      id: receiptId,
      body: '纯文本通知内容',
      targetId: '18446744073709551615',
      readAt: null,
    });
    const count = await request(app.getHttpServer())
      .get('/api/notifications/unread-count')
      .set('Authorization', `Bearer ${token}`);
    expect(count.body).toEqual({ count: 1 });
    const target = await request(app.getHttpServer())
      .get('/api/approval/instances/18446744073709551615')
      .set('Authorization', `Bearer ${token}`);
    expect(target.status).toBe(403);
  });

  it('rejects client supplied recipient identity and invalid versions', async () => {
    const list = await request(app.getHttpServer())
      .get(`/api/notifications?userId=${other}`)
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(400);
    for (const body of [{ version: 0, userId: other }, { version: -1 }, { version: 0.5 }, {}]) {
      const result = await request(app.getHttpServer())
        .post(`/api/notifications/${receiptId}/read`)
        .set('Authorization', `Bearer ${token}`)
        .send(body);
      expect(result.status).toBe(400);
    }
  });

  it('returns identical not-found errors for missing and another user receipt', async () => {
    const otherToken = await signToken(other);
    const responses = [];
    for (const id of [receiptId, '18446744073709551615']) {
      const response = await request(app.getHttpServer())
        .post(`/api/notifications/${id}/read`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ version: 0 });
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('NOT_FOUND');
      responses.push(response.body.message);
    }
    expect(responses[0]).toBe(responses[1]);
    const list = await request(app.getHttpServer())
      .get('/api/notifications')
      .set('Authorization', `Bearer ${otherToken}`);
    expect(list.body.total).toBe(0);
  });

  it('rejects HTTP Idempotency-Key before writes and never schedules a publish hook for read replays', async () => {
    const forbiddenKey = await request(app.getHttpServer())
      .post(`/api/notifications/${receiptId}/read`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'notification-read-test')
      .send({ version: 0 });
    expect(forbiddenKey.status).toBe(400);
    expect((await fixture.service().list({}, owner)).items[0]!.readAt).toBeNull();
    const stale = await request(app.getHttpServer())
      .post(`/api/notifications/${receiptId}/read`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('CONCURRENT_MODIFICATION');
    const first = await request(app.getHttpServer())
      .post(`/api/notifications/${receiptId}/read`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 0 });
    const replay = await request(app.getHttpServer())
      .post(`/api/notifications/${receiptId}/read`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 0 });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ id: receiptId, version: 1, readAt: expect.any(String) });
    expect(replay.body).toEqual(first.body);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(handle).not.toHaveBeenCalled();
  });
});

const signToken = (userId: string): Promise<string> =>
  new SignJWT({ username: 'notification-test', kind: 'access' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuer(required('JWT_ISSUER'))
    .setAudience(required('JWT_AUDIENCE'))
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(new TextEncoder().encode(required('JWT_SECRET')));
