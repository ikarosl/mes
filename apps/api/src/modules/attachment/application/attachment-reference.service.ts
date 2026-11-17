import { Injectable } from '@nestjs/common';
import type { AttachmentOwnerType, AttachmentReferenceSlot } from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { referenceFileType } from '../domain/attachment-reference.rules.js';
import { AttachmentError } from '../domain/attachment.errors.js';
import { AttachmentReferenceRepository } from './ports/attachment.repository.js';

@Injectable()
export class AttachmentReferenceService {
  constructor(private readonly references: AttachmentReferenceRepository) {}

  /** 调用方先锁业务根并验证权限、状态与版本，再在同事务内替换当前引用。 */
  setReference(
    ownerType: AttachmentOwnerType,
    ownerId: string,
    slot: AttachmentReferenceSlot,
    attachmentId: string | null,
    audit: CommandContext,
  ): Promise<void> {
    referenceFileType(ownerType, slot);
    if (ownerType === 'production_batch_step')
      throw new AttachmentError('IMMUTABLE_ATTACHMENT_REFERENCE', '生产历史附件引用不能替换或解除');
    return this.references.setReference(ownerType, ownerId, slot, attachmentId, audit);
  }

  /** 生产快照引用只追加；同一对象、用途与附件重复登记不产生第二条引用。 */
  bindReference(
    ownerType: AttachmentOwnerType,
    ownerId: string,
    slot: AttachmentReferenceSlot,
    attachmentId: string,
    audit: CommandContext,
  ): Promise<void> {
    referenceFileType(ownerType, slot);
    if (ownerType !== 'production_batch_step')
      throw new AttachmentError(
        'INVALID_ATTACHMENT_REFERENCE',
        '当前业务附件须替换当前引用，只有生产历史支持追加保留',
      );
    return this.references.bindReference(ownerType, ownerId, slot, attachmentId, audit);
  }
}
