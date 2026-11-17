import type {
  AttachmentOwnerType,
  AttachmentReferenceSlot,
  TechnicalFileType,
} from '@company/contracts';
import { AttachmentError } from './attachment.errors.js';

export const referenceFileType = (
  ownerType: AttachmentOwnerType,
  slot: AttachmentReferenceSlot,
): TechnicalFileType => {
  if (
    (ownerType === 'product_process_step' && slot === 'default_sop') ||
    (ownerType === 'product_route_step' && slot === 'sop') ||
    (ownerType === 'production_batch_step' && (slot === 'default_sop' || slot === 'actual_sop'))
  )
    return 'sop';
  if ((ownerType === 'product' || ownerType === 'material_variant') && slot === 'specification') {
    return 'specification';
  }
  throw new AttachmentError('INVALID_ATTACHMENT_REFERENCE', '此业务对象不支持该附件用途');
};
