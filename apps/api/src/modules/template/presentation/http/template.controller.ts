import { Body, Controller, Get, HttpException, Param, Patch, Post, Query } from '@nestjs/common';
import { PERMISSIONS } from '@company/constants';
import type { BusinessTemplateItem, PageResult } from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import {
  AuditInApplication,
  CurrentCommandContext,
  RequirePermission,
} from '../../../../common/security/auth.decorators.js';
import { TemplateService } from '../../application/template.service.js';
import { TemplateDomainError, type TemplateErrorCode } from '../../domain/template.errors.js';
import {
  CreateTemplateDto,
  TemplateIdParamDto,
  TemplateListQueryDto,
  UpdateTemplateDto,
} from './dto/template.dto.js';

@Controller('templates')
export class TemplateController {
  constructor(private readonly service: TemplateService) {}

  @Get()
  @RequirePermission(PERMISSIONS.system.templates.view)
  list(@Query() query: TemplateListQueryDto): Promise<PageResult<BusinessTemplateItem>> {
    return this.execute(() => this.service.list(query));
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.system.templates.view)
  get(@Param() { id }: TemplateIdParamDto): Promise<BusinessTemplateItem> {
    return this.execute(() => this.service.getById(id));
  }

  @Post()
  @RequirePermission(PERMISSIONS.system.templates.create)
  @AuditInApplication()
  create(
    @Body() body: CreateTemplateDto,
    @CurrentCommandContext() context: CommandContext,
  ): Promise<BusinessTemplateItem> {
    return this.execute(() => this.service.create(body, context));
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.system.templates.update)
  @AuditInApplication()
  update(
    @Param() { id }: TemplateIdParamDto,
    @Body() body: UpdateTemplateDto,
    @CurrentCommandContext() context: CommandContext,
  ): Promise<BusinessTemplateItem> {
    return this.execute(() => this.service.update(id, body, context));
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof TemplateDomainError)
        throw new HttpException(
          { code: error.code, message: error.message },
          statusFor(error.code),
        );
      throw error;
    }
  }
}

const statusFor = (code: TemplateErrorCode): number => {
  if (code === 'FORBIDDEN') return 403;
  if (code === 'NOT_FOUND') return 404;
  if (code === 'CONFLICT') return 409;
  return 400;
};
