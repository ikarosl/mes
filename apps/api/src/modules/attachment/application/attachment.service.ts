import { Injectable } from '@nestjs/common';
import type { Readable } from 'node:stream';
import type {
  AttachmentCleanupErrorCode,
  AttachmentLifecycleResult,
  AttachmentListItem,
  AttachmentQuery,
  AttachmentReferenceItem,
  PageQuery,
  PageResult,
  TechnicalFileListItem,
  TechnicalFileQuery,
  TechnicalFileType,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { IdentityDirectoryService } from '../../identity/public.js';
import { AttachmentError } from '../domain/attachment.errors.js';
import { requireValidAttachmentUpload } from '../domain/attachment-upload.rules.js';
import {
  AttachmentLifecycleRepository,
  AttachmentRepository,
} from './ports/attachment.repository.js';
import { AttachmentStorage, type AttachmentUpload } from './ports/attachment.storage.js';

export interface AttachmentContent extends TechnicalFileListItem {
  stream: Readable;
}
export interface AttachmentSnapshotLocator {
  fileId: string;
  objectKey: string;
}

@Injectable()
export class AttachmentService {
  constructor(
    private readonly files: AttachmentRepository,
    private readonly lifecycle: AttachmentLifecycleRepository,
    private readonly storage: AttachmentStorage,
    private readonly identity: IdentityDirectoryService,
  ) {}

  listTechnicalFiles(query: TechnicalFileQuery): Promise<PageResult<TechnicalFileListItem>> {
    return this.files.listTechnicalFiles({ ...query, keyword: query.keyword?.trim() || undefined });
  }

  /** 历史显示包括停用、软删除或已清理记录；不能用来判断新写入资格。 */
  getManyTechnicalFiles(ids: string[]): Promise<TechnicalFileListItem[]> {
    return this.files.getManyForDisplay([...new Set(ids)]);
  }

  requireAvailable(ids: string[], fileType: TechnicalFileType): Promise<TechnicalFileListItem[]> {
    return this.files.requireAvailable([...new Set(ids)], fileType);
  }

  async upload(
    file: AttachmentUpload,
    fileType: TechnicalFileType,
    versionNo: string | null,
    audit: CommandContext,
  ): Promise<{ id: string }> {
    requireValidAttachmentUpload(file, fileType, versionNo);
    const stored = await this.storage.store(file, fileType, versionNo);
    try {
      return await this.files.create(stored, audit);
    } catch (error) {
      // 提交确认丢失不代表回滚；存在记录或数据库结果未知时，保留对象及原始异常。
      try {
        if (await this.files.canRemoveUnregisteredObject(stored)) {
          await this.storage.remove(stored);
        }
      } catch {
        /* 判定或补偿失败不覆盖原始错误，未登记孤立对象由运维对账。 */
      }
      throw error;
    }
  }

  async readCurrent(id: string): Promise<AttachmentContent> {
    const file = await this.files.getCurrent(id);
    return { ...file, stream: await this.storage.read(file) };
  }

  async readHistoricalSnapshot(snapshot: AttachmentSnapshotLocator): Promise<AttachmentContent> {
    const file = await this.files.getHistorical(snapshot.fileId);
    if (file.fileType !== 'sop' || file.objectKey !== snapshot.objectKey) {
      throw new AttachmentError('NOT_FOUND', '历史附件与生产快照不一致');
    }
    return { ...file, stream: await this.storage.read(file) };
  }

  async readForManagement(id: string): Promise<AttachmentContent> {
    const file = await this.files.getForManagementDownload(id);
    return { ...file, stream: await this.storage.read(file) };
  }

  async list(query: AttachmentQuery): Promise<PageResult<AttachmentListItem>> {
    const result = await this.files.list({ ...query, keyword: query.keyword?.trim() || undefined });
    const names = await this.userNames(result.items.map((item) => item.createdBy));
    return {
      ...result,
      items: result.items.map((item) => ({
        ...item,
        createdByName: item.createdBy ? (names.get(item.createdBy) ?? null) : null,
      })),
    };
  }

  async listReferences(id: string, query: PageQuery): Promise<PageResult<AttachmentReferenceItem>> {
    const result = await this.files.listReferences(id, query);
    const names = await this.userNames(result.items.map((item) => item.createdBy));
    return {
      ...result,
      items: result.items.map((item) => ({
        ...item,
        createdByName: item.createdBy ? (names.get(item.createdBy) ?? null) : null,
      })),
    };
  }

  trash(id: string, version: number, audit: CommandContext): Promise<AttachmentLifecycleResult> {
    return this.lifecycle.trash(id, version, audit);
  }

  async purge(
    id: string,
    version: number,
    audit: CommandContext,
  ): Promise<AttachmentLifecycleResult> {
    const attempt = await this.lifecycle.beginPurge(id, version, audit);
    let errorCode: AttachmentCleanupErrorCode | null = null;
    try {
      await this.storage.remove(attempt.locator);
    } catch (error) {
      errorCode =
        error instanceof AttachmentError && error.code === 'VERSIONED_BUCKET_UNSUPPORTED'
          ? 'VERSIONED_BUCKET_UNSUPPORTED'
          : 'STORAGE_UNAVAILABLE';
    }
    return this.lifecycle.finishPurge(attempt, errorCode, audit);
  }

  private async userNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const users = await this.identity.listUserReferencesByIds([
      ...new Set(ids.filter((id): id is string => id !== null)),
    ]);
    return new Map(users.map((user) => [user.id, user.displayName]));
  }
}
