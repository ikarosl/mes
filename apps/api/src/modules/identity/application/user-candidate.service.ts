import { Injectable } from '@nestjs/common';
import { USER_CANDIDATE_SCENE_CATALOG } from '@company/constants';
import type { UserCandidateSceneCode, UserOption } from '@company/contracts';
import { UserCandidateRepository } from './ports/user-candidate.repository.js';

export interface UserCandidateEligibility {
  eligible: boolean;
  message: string | null;
}

@Injectable()
export class UserCandidateService {
  constructor(private readonly repository: UserCandidateRepository) {}

  listCandidates(sceneCode: UserCandidateSceneCode): Promise<UserOption[]> {
    if (!USER_CANDIDATE_SCENE_CATALOG.some((scene) => scene.code === sceneCode))
      return Promise.resolve([]);
    return this.repository.listCandidates(sceneCode);
  }

  async checkEligibility(
    sceneCode: UserCandidateSceneCode,
    userId: string,
  ): Promise<UserCandidateEligibility> {
    const eligible =
      USER_CANDIDATE_SCENE_CATALOG.some((scene) => scene.code === sceneCode) &&
      (await this.repository.isEligible(sceneCode, userId));
    return {
      eligible,
      message: eligible ? null : '所选人员不在当前场景的有效候选范围内，请刷新后重新选择',
    };
  }
}
