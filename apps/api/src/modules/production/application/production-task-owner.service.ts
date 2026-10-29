import { Injectable } from '@nestjs/common';
import { USER_CANDIDATE_SCENES } from '@company/constants';
import type { UserOption } from '@company/contracts';
import { UserCandidateService } from '../../identity/public.js';
import { ProductionDomainError } from '../domain/production.errors.js';

@Injectable()
export class ProductionTaskOwnerService {
  constructor(private readonly candidates: UserCandidateService) {}

  listOptions(): Promise<UserOption[]> {
    return this.candidates.listCandidates(USER_CANDIDATE_SCENES.taskOwner);
  }

  /** 调用方须先锁定生产根，并在同一写入事务内核验最终负责人。 */
  async requireEligible(userId: string | null | undefined): Promise<void> {
    if (!userId?.trim()) throw new ProductionDomainError('INVALID_INPUT', '请选择任务负责人');
    const result = await this.candidates.checkEligibility(USER_CANDIDATE_SCENES.taskOwner, userId);
    if (!result.eligible)
      throw new ProductionDomainError(
        'INVALID_INPUT',
        result.message ?? '所选人员不符合任务负责人资格，请重新选择',
      );
  }
}
