import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PERMISSIONS } from '@company/constants';
import type { PageResult, PersonnelItem, PersonnelOption } from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import {
  AuditInApplication,
  CurrentCommandContext,
  RequirePermission,
} from '../../../../common/security/auth.decorators.js';
import { PersonnelService } from '../../application/personnel.service.js';
import { PersonnelError } from '../../domain/personnel.errors.js';
import {
  PersonnelListQueryDto,
  PersonnelParamDto,
  SavePersonnelDto,
  UpdatePersonnelDto,
} from './dto/personnel.dto.js';

@Controller('identity/personnel')
export class PersonnelController {
  constructor(private readonly service: PersonnelService) {}

  @Get()
  @RequirePermission(PERMISSIONS.system.personnel.view)
  list(@Query() query: PersonnelListQueryDto): Promise<PageResult<PersonnelItem>> {
    return this.service.list(query);
  }

  @Get('options')
  @RequirePermission([
    PERMISSIONS.system.personnel.view,
    PERMISSIONS.production.workbench.view,
    PERMISSIONS.production.tracking.view,
    PERMISSIONS.production.tasks.view,
  ])
  options(): Promise<PersonnelOption[]> {
    return this.service.options();
  }

  @Post()
  @RequirePermission(PERMISSIONS.system.personnel.manage)
  @AuditInApplication()
  create(
    @Body() input: SavePersonnelDto,
    @CurrentCommandContext() context: CommandContext,
  ): Promise<PersonnelItem> {
    return this.mapErrors(() => this.service.create(input, context));
  }
  @Patch(':id')
  @RequirePermission(PERMISSIONS.system.personnel.manage)
  @AuditInApplication()
  update(
    @Param() params: PersonnelParamDto,
    @Body() input: UpdatePersonnelDto,
    @CurrentCommandContext() context: CommandContext,
  ): Promise<PersonnelItem> {
    return this.mapErrors(() => this.service.update(params.id, input, context));
  }
  private async mapErrors<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof PersonnelError) {
        if (error.code === 'NOT_FOUND') throw new NotFoundException(error.message);
        if (error.code === 'CONFLICT') throw new ConflictException(error.message);
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
