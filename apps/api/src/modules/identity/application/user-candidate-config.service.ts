import { Injectable } from '@nestjs/common';
import { USER_CANDIDATE_SCENE_CATALOG } from '@company/constants';
import type {
  UpdateUserCandidateConfigRequest,
  UserCandidateConfigItem,
  UserCandidateSceneCode,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { UserCandidateConfigError } from '../domain/user-candidate.errors.js';
import {
  UserCandidateRepository,
  type UserCandidateConfiguration,
} from './ports/user-candidate.repository.js';

@Injectable()
export class UserCandidateConfigService {
  constructor(private readonly repository: UserCandidateRepository) {}

  async list(): Promise<UserCandidateConfigItem[]> {
    const configurations = new Map(
      (await this.repository.listConfigurations()).map((config) => [config.sceneCode, config]),
    );
    return USER_CANDIDATE_SCENE_CATALOG.map((scene) =>
      configItem(scene.code, scene.name, configurations.get(scene.code)),
    );
  }

  async save(
    sceneCode: UserCandidateSceneCode,
    payload: UpdateUserCandidateConfigRequest,
    context: CommandContext,
  ): Promise<UserCandidateConfigItem> {
    const scene = USER_CANDIDATE_SCENE_CATALOG.find((item) => item.code === sceneCode);
    if (!scene) throw new UserCandidateConfigError('业务人员场景不存在');
    const configuration = await this.repository.saveConfiguration(sceneCode, payload, {
      logType: 'operation',
      module: 'system',
      action: '配置业务候选角色',
      userId: context.actorId,
      result: 'success',
      requestId: context.requestId,
      ip: context.ip,
      userAgent: context.userAgent,
    });
    return configItem(scene.code, scene.name, configuration);
  }
}

const configItem = (
  sceneCode: UserCandidateSceneCode,
  sceneName: string,
  config?: UserCandidateConfiguration,
): UserCandidateConfigItem => ({
  sceneCode,
  sceneName,
  configId: config?.id ?? null,
  version: config?.version ?? null,
  roleIds: config?.roles.map((role) => role.id) ?? [],
  roles: config?.roles ?? [],
  candidateCount: config?.candidateCount ?? 0,
});
