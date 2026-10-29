import type {
  SystemRoleOption,
  UpdateUserCandidateConfigRequest,
  UserCandidateSceneCode,
  UserOption,
} from '@company/contracts';
import type { AuditLogEntry } from '../../../../common/audit/audit.types.js';

export interface UserCandidateConfiguration {
  id: string;
  sceneCode: UserCandidateSceneCode;
  version: number;
  roles: SystemRoleOption[];
  candidateCount: number;
}

export abstract class UserCandidateRepository {
  abstract listConfigurations(): Promise<UserCandidateConfiguration[]>;
  abstract saveConfiguration(
    sceneCode: UserCandidateSceneCode,
    payload: UpdateUserCandidateConfigRequest,
    audit: AuditLogEntry,
  ): Promise<UserCandidateConfiguration>;
  abstract listCandidates(sceneCode: UserCandidateSceneCode): Promise<UserOption[]>;
  /** 复用调用方事务的当前锁定读，写入资格不能用候选列表或历史姓名替代。 */
  abstract isEligible(sceneCode: UserCandidateSceneCode, userId: string): Promise<boolean>;
}
