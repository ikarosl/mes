import { BadRequestException, Body, Controller, Get, Param, Put } from '@nestjs/common';
import { PERMISSIONS } from '@company/constants';
import type { UserCandidateConfigItem } from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import {
  AuditInApplication,
  CurrentCommandContext,
  RequirePermission,
} from '../../../../common/security/auth.decorators.js';
import { UserCandidateConfigService } from '../../application/user-candidate-config.service.js';
import { UserCandidateConfigError } from '../../domain/user-candidate.errors.js';
import {
  UpdateUserCandidateConfigDto,
  UserCandidateSceneParamDto,
} from './dto/user-candidate-config.dto.js';

@Controller('system/user-candidate-configs')
export class UserCandidateConfigController {
  constructor(private readonly service: UserCandidateConfigService) {}

  @Get()
  @RequirePermission(PERMISSIONS.system.userCandidates.view)
  list(): Promise<UserCandidateConfigItem[]> {
    return this.service.list();
  }

  @Put(':sceneCode')
  @RequirePermission(PERMISSIONS.system.userCandidates.configure)
  @AuditInApplication()
  async save(
    @Param() { sceneCode }: UserCandidateSceneParamDto,
    @Body() body: UpdateUserCandidateConfigDto,
    @CurrentCommandContext() context: CommandContext,
  ): Promise<UserCandidateConfigItem> {
    try {
      return await this.service.save(sceneCode, body, context);
    } catch (error) {
      if (error instanceof UserCandidateConfigError) throw new BadRequestException(error.message);
      throw error;
    }
  }
}
