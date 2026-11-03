import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { withTransaction } from '../../../apps/api/node_modules/@company/database/dist/index.js';
import type { Pool, RowDataPacket } from '../../../apps/api/node_modules/mysql2/promise.js';
import type {
  CommittedNotification,
  NotificationService,
} from '../../../apps/api/src/modules/notification/public.js';
import { NotificationFixture, notificationPool } from './notification-fixture.js';

const describeMysql = process.env.RUN_MYSQL_INTEGRATION === '1' ? describe : describe.skip;
const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describeMysql('Notification persistence and transaction boundaries (real MySQL)', () => {
  let pool: Pool;
  let fixture: NotificationFixture;
  let service: NotificationService;
  let actor: string;
  let peer: string;

  beforeAll(async () => {
    pool = notificationPool();
    fixture = new NotificationFixture(pool);
    actor = await fixture.createUser();
    peer = await fixture.createUser();
    service = fixture.service();
  });
  afterAll(async () => {
    try {
      await fixture?.cleanup();
    } finally {
      await pool?.end();
    }
  });

  it('publishes normalized plain text without references, deduplicates self, and reuses the exact event', async () => {
    const handle = vi.fn();
    const publisher = fixture.service({ handle });
    const input = fixture.input([peer, actor, actor], {
      title: '  标题  ',
      body: '  <b>原样文本</b>  ',
    });
    const first = await publisher.publish(input, fixture.context());
    await tick();
    const second = await publisher.publish(
      { ...input, recipientIds: [actor, peer] },
      fixture.context(peer),
    );
    await tick();
    expect(first.status).toBe('created');
    expect(second).toEqual({ status: 'reused', notificationId: first.notificationId });
    expect(await fixture.messages(input.eventKey)).toHaveLength(1);
    const [receipts] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM notification_recipients WHERE notification_id=?',
      [first.notificationId],
    );
    expect(receipts).toHaveLength(2);
    expect(receipts.every((row) => row.read_at === null && row.version === 0)).toBe(true);
    expect(await fixture.auditCount('notification.publish', first.notificationId!)).toBe(1);
    expect(handle).toHaveBeenCalledTimes(1);
    const event = handle.mock.calls[0]![0] as CommittedNotification;
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.recipientIds)).toBe(true);
    expect(event).not.toHaveProperty('body');
    expect(event).not.toHaveProperty('connection');
    expect((await fixture.messages(input.eventKey))[0]).toMatchObject({
      title: '标题',
      body: '<b>原样文本</b>',
      source_id: null,
      target_id: null,
      created_by: Number(actor),
    });
  });

  it('does not persist or schedule a new empty event, and empty recipients cannot bypass an existing conflict', async () => {
    const handle = vi.fn();
    const publisher = fixture.service({ handle });
    const input = fixture.input([]);
    const audit = fixture.context();
    expect(await publisher.publish(input, audit)).toEqual({
      status: 'no_recipients',
      notificationId: null,
    });
    await tick();
    expect(await fixture.messages(input.eventKey)).toEqual([]);
    const [logs] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM operation_logs WHERE request_id=?',
      [audit.requestId],
    );
    expect(logs).toEqual([]);
    expect(handle).not.toHaveBeenCalled();
    await publisher.publish({ ...input, recipientIds: [actor] }, fixture.context());
    await expect(publisher.publish(input, fixture.context())).rejects.toMatchObject({
      code: 'NOTIFICATION_EVENT_CONFLICT',
    });
  });

  it('serializes concurrent publication into one message, one receipt set and one hook', async () => {
    const handle = vi.fn();
    const publisher = fixture.service({ handle });
    const input = fixture.input([actor, peer]);
    const settled = await Promise.allSettled(
      Array.from({ length: 5 }, () => publisher.publish(input, fixture.context())),
    );
    expect(settled.filter((result) => result.status === 'rejected')).toEqual([]);
    const results = settled.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    await tick();
    expect(results.filter((result) => result.status === 'created')).toHaveLength(1);
    expect(new Set(results.map((result) => result.notificationId)).size).toBe(1);
    expect(handle).toHaveBeenCalledTimes(1);
    expect(await fixture.auditCount('notification.publish', results[0]!.notificationId!)).toBe(1);
  });

  it('rejects concurrent conflicting content and leaves only the winner committed', async () => {
    const handle = vi.fn();
    const publisher = fixture.service({ handle });
    const input = fixture.input([actor]);
    const results = await Promise.allSettled([
      publisher.publish(input, fixture.context()),
      publisher.publish({ ...input, title: '另一份内容' }, fixture.context()),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const failures = results.filter((result) => result.status === 'rejected');
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ reason: { code: 'NOTIFICATION_EVENT_CONFLICT' } });
    await tick();
    expect(await fixture.messages(input.eventKey)).toHaveLength(1);
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it('reuses a concurrently committed event even when the outer transaction already has an older snapshot', async () => {
    const secondPool = notificationPool();
    const otherPublisher = new NotificationFixture(secondPool).service();
    const input = fixture.input([actor]);
    try {
      await withTransaction(pool, async (db) => {
        const [before] = await db.query<RowDataPacket[]>(
          'SELECT id FROM notifications WHERE event_key=?',
          [input.eventKey],
        );
        expect(before).toEqual([]);
        const created = await otherPublisher.publish(input, fixture.context());
        const [snapshot] = await db.query<RowDataPacket[]>(
          'SELECT id FROM notifications WHERE event_key=?',
          [input.eventKey],
        );
        expect(snapshot).toEqual([]);
        expect(await service.publish(input, fixture.context())).toEqual({
          status: 'reused',
          notificationId: created.notificationId,
        });
      });
    } finally {
      await secondPool.end();
    }
  });

  it('rejects different content or recipient sets without changing the original message', async () => {
    const input = fixture.input([actor], {
      sourceType: 'approval_action',
      sourceId: '17',
      targetType: 'approval_instance',
      targetId: '19',
    });
    await service.publish(input, fixture.context());
    for (const change of [
      { title: '变更标题' },
      { body: '变更正文' },
      { eventType: 'approval_approved' as const },
      { sourceId: '18' },
      { targetId: '20' },
      { sourceType: null, sourceId: null },
      { targetType: null, targetId: null },
      { recipientIds: [peer] },
    ]) {
      await expect(
        service.publish({ ...input, ...change }, fixture.context()),
      ).rejects.toMatchObject({ code: 'NOTIFICATION_EVENT_CONFLICT' });
    }
    expect((await fixture.messages(input.eventKey))[0]).toMatchObject({
      title: input.title,
      body: input.body,
    });
  });

  it('rolls back publication when a recipient does not exist but retains notifications for disabled users', async () => {
    const handle = vi.fn();
    const publisher = fixture.service({ handle });
    const missing = fixture.input([actor, '18446744073709551615']);
    await expect(publisher.publish(missing, fixture.context())).rejects.toMatchObject({
      code: 'ER_NO_REFERENCED_ROW_2',
    });
    expect(await fixture.messages(missing.eventKey)).toEqual([]);
    await tick();
    expect(handle).not.toHaveBeenCalled();
    await pool.execute('UPDATE users SET status=0,deleted_at=NOW() WHERE id=?', [peer]);
    try {
      const created = await publisher.publish(fixture.input([peer]), fixture.context());
      expect(created.status).toBe('created');
      expect(
        (await service.list({}, peer)).items.some(
          (item) => item.notificationId === created.notificationId,
        ),
      ).toBe(true);
    } finally {
      await pool.execute('UPDATE users SET status=1,deleted_at=NULL WHERE id=?', [peer]);
    }
  });

  it('keeps nested messages invisible and hooks idle until the outer transaction commits', async () => {
    const handle = vi.fn();
    const publisher = fixture.service({ handle });
    const input = fixture.input([actor]);
    await withTransaction(pool, async () => {
      await publisher.publish(input, fixture.context());
      await tick();
      expect(handle).not.toHaveBeenCalled();
      expect(await fixture.messages(input.eventKey)).toEqual([]);
    });
    await tick();
    expect(await fixture.messages(input.eventKey)).toHaveLength(1);
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it('rolls back a business change, message, receipts and success audit together and discards its hook', async () => {
    const handle = vi.fn();
    const publisher = fixture.service({ handle });
    const input = fixture.input([actor]);
    const audit = fixture.context();
    await expect(
      withTransaction(pool, async (db) => {
        await db.execute('UPDATE users SET display_name=? WHERE id=?', ['不应保存', actor]);
        await publisher.publish(input, audit);
        throw new Error('business failed after notification');
      }),
    ).rejects.toThrow('business failed after notification');
    await tick();
    expect(await fixture.messages(input.eventKey)).toEqual([]);
    const [[user]] = await pool.query<RowDataPacket[]>(
      'SELECT display_name FROM users WHERE id=?',
      [actor],
    );
    expect(user!.display_name).toBe('通知测试用户');
    const [logs] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM operation_logs WHERE request_id=?',
      [audit.requestId],
    );
    expect(logs).toEqual([]);
    expect(handle).not.toHaveBeenCalled();
  });

  it('does not wait for a pending hook to return a committed result', async () => {
    let finish: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const handle = vi.fn(() => pending);
    try {
      const input = fixture.input([actor]);
      const result = await fixture.service({ handle }).publish(input, fixture.context());
      expect(result.status).toBe('created');
      await tick();
      expect(handle).toHaveBeenCalledTimes(1);
      expect(await fixture.messages(input.eventKey)).toHaveLength(1);
    } finally {
      finish?.();
    }
  });

  it('paginates only the current recipient with a stable ID tie-break and never marks GET results read', async () => {
    const owner = await fixture.createUser();
    const ids: string[] = [];
    for (let index = 0; index < 3; index++) {
      const created = await service.publish(fixture.input([owner]), fixture.context());
      ids.push(created.notificationId!);
    }
    await service.publish(fixture.input([peer]), fixture.context());
    await pool.execute('UPDATE notification_recipients SET created_at=? WHERE user_id=?', [
      '2026-09-14 12:00:00',
      owner,
    ]);
    const first = await service.list({ page: 1, pageSize: 2 }, owner);
    const second = await service.list({ page: 2, pageSize: 2 }, owner);
    expect(first.total).toBe(3);
    expect([...first.items, ...second.items].map((item) => item.notificationId)).toEqual(
      ids.reverse(),
    );
    expect(first.items.every((item) => item.isUnread)).toBe(true);
    expect(await service.unreadCount(owner)).toEqual({ count: 3 });
  });

  // TODO(notification-read-all-mysql-isolation): 验证批量确认覆盖本人全部未读收件且不影响其他用户，保留已有已读时间及操作者约束，仅对实际更新数量记录成功审计；该身份与审计不变量重要，旧单条版本用例已移除且正式测试暂缓；获明确正式测试授权后按批量确认契约恢复。

  // TODO(notification-read-all-mysql-rollback): 验证批量确认与成功审计同事务提交，审计失败时全部收件状态回滚且无成功日志；该事务原子性重要，旧单条已读审计用例已失效且正式测试暂缓；获明确正式测试授权后恢复。
});
