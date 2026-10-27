import { Injectable } from '@nestjs/common';
import { USER_CANDIDATE_SCENES } from '@company/constants';
import type { UserOption } from '@company/contracts';
import { UserCandidateService } from '../../identity/public.js';
import { ProductionDomainError } from '../domain/production.errors.js';

@Injectable()
export class ProductionWorkOrderOwnerService {
  constructor(private readonly candidates: UserCandidateService) {}

  listOptions(): Promise<UserOption[]> {
    return this.candidates.listCandidates(USER_CANDIDATE_SCENES.workOrderOwner);
  }

  /** 调用方须在工单写入事务中复核，Identity 的资格锁随业务提交一起释放。 */
  async requireEligible(userId: string | null | undefined): Promise<void> {
    if (userId === null || userId === undefined) return;
    const result = await this.candidates.checkEligibility(
      USER_CANDIDATE_SCENES.workOrderOwner,
      userId,
    );
    if (!result.eligible)
      throw new ProductionDomainError(
        'INVALID_INPUT',
        result.message ?? '所选人员不符合工单负责人资格，请重新选择',
      );
  }
}
