import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  NotificationIdDto,
  NotificationQueryDto,
  ReadNotificationDto,
} from '../notification.dto.js';

describe('notification HTTP DTOs', () => {
  it('accepts paginated all/unread queries and applies shared pagination transforms', async () => {
    const all = plainToInstance(NotificationQueryDto, {});
    const unread = plainToInstance(NotificationQueryDto, {
      page: '2',
      pageSize: '100',
      read: 'unread',
    });

    await expect(validate(all)).resolves.toEqual([]);
    await expect(validate(unread)).resolves.toEqual([]);
    expect(all).toMatchObject({ page: 1, pageSize: 10 });
    expect(unread).toMatchObject({ page: 2, pageSize: 100, read: 'unread' });
  });

  it.each([
    ['read', 'READ'],
    ['read', 'pending'],
    ['page', '0'],
    ['pageSize', '101'],
  ])('rejects invalid notification query field %s=%s', async (field, value) => {
    const errors = await validate(plainToInstance(NotificationQueryDto, { [field]: value }));
    expect(errors.some((error) => error.property === field)).toBe(true);
  });

  it('keeps notification ids as strings and accepts the full unsigned BIGINT decimal width', async () => {
    const dto = plainToInstance(NotificationIdDto, { id: '18446744073709551615' });

    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto.id).toBe('18446744073709551615');
  });

  it.each(['0', '01', '-1', '184467440737095516160'])(
    'rejects malformed notification id %s',
    async (id) => {
      await expect(validate(plainToInstance(NotificationIdDto, { id }))).resolves.not.toEqual([]);
    },
  );

  it.each([0, 2_147_483_647])('accepts read version %s', async (version) => {
    await expect(validate(plainToInstance(ReadNotificationDto, { version }))).resolves.toEqual([]);
  });

  it.each([-1, 2_147_483_648, 0.5, '0'])('rejects invalid read version %s', async (version) => {
    await expect(validate(plainToInstance(ReadNotificationDto, { version }))).resolves.not.toEqual(
      [],
    );
  });
});
