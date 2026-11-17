import type {
  AttachmentCleanupErrorCode,
  AttachmentLifecycleResult,
  AttachmentListItem,
  AttachmentOwnerType,
  AttachmentQuery,
  AttachmentReferenceItem,
  AttachmentReferenceSlot,
  PageQuery,
  PageResult,
  TechnicalFileListItem,
  TechnicalFileQuery,
  TechnicalFileType,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import type { AttachmentLocator, StoredAttachment } from './attachment.storage.js';

export abstract class AttachmentRepository {
  abstract listTechnicalFiles(
    query: TechnicalFileQuery,
  ): Promise<PageResult<TechnicalFileListItem>>;
  abstract getCurrent(id: string): Promise<TechnicalFileListItem>;
  abstract getManyForDisplay(ids: string[]): Promise<TechnicalFileListItem[]>;
  abstract getHistorical(id: string): Promise<TechnicalFileListItem>;
  abstract getForManagementDownload(id: string): Promise<TechnicalFileListItem>;
  abstract create(file: StoredAttachment, audit: CommandContext): Promise<{ id: string }>;
  /** 独立当前锁定读确认未登记后才允许补偿；外围事务未结束或无法确认时返回 false。 */
  abstract canRemoveUnregisteredObject(locator: AttachmentLocator): Promise<boolean>;
  /** 调用方必须先开启同池业务事务；按 ID 排序锁附件，直至最外层事务结束。 */
  abstract requireAvailable(
    ids: string[],
    fileType: TechnicalFileType,
  ): Promise<TechnicalFileListItem[]>;
  abstract list(query: AttachmentQuery): Promise<PageResult<AttachmentListItem>>;
  abstract listReferences(
    id: string,
    query: PageQuery,
  ): Promise<PageResult<AttachmentReferenceItem>>;
}

export interface AttachmentPurgeAttempt {
  id: string;
  version: number;
  locator: AttachmentLocator;
}

export abstract class AttachmentLifecycleRepository {
  abstract trash(
    id: string,
    version: number,
    audit: CommandContext,
  ): Promise<AttachmentLifecycleResult>;
  /** 不接受外围事务，processing 必须在对象存储请求前独立提交。 */
  abstract beginPurge(
    id: string,
    version: number,
    audit: CommandContext,
  ): Promise<AttachmentPurgeAttempt>;
  abstract finishPurge(
    attempt: AttachmentPurgeAttempt,
    errorCode: AttachmentCleanupErrorCode | null,
    audit: CommandContext,
  ): Promise<AttachmentLifecycleResult>;
}

export abstract class AttachmentReferenceRepository {
  abstract setReference(
    ownerType: AttachmentOwnerType,
    ownerId: string,
    slot: AttachmentReferenceSlot,
    attachmentId: string | null,
    audit: CommandContext,
  ): Promise<void>;
  abstract bindReference(
    ownerType: AttachmentOwnerType,
    ownerId: string,
    slot: AttachmentReferenceSlot,
    attachmentId: string,
    audit: CommandContext,
  ): Promise<void>;
}
