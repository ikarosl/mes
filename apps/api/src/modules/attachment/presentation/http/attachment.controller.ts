import { Body, Controller, Get, Param, Post, Query, Res, StreamableFile } from '@nestjs/common';
import { PERMISSIONS } from '@company/constants';
import type {
  AttachmentLifecycleResult,
  AttachmentListItem,
  AttachmentReferenceItem,
  PageResult,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import {
  AuditInApplication,
  CurrentCommandContext,
  RequirePermission,
} from '../../../../common/security/auth.decorators.js';
import { PageQueryDto } from '../../../../presentation/http/dto/page-query.dto.js';
import { AttachmentService } from '../../application/attachment.service.js';
import {
  AttachmentIdParamDto,
  AttachmentLifecycleDto,
  AttachmentQueryDto,
} from './dto/attachment.dto.js';

@Controller('attachments')
export class AttachmentController {
  constructor(private readonly service: AttachmentService) {}

  @Get()
  @RequirePermission(PERMISSIONS.system.attachments.view)
  list(@Query() query: AttachmentQueryDto): Promise<PageResult<AttachmentListItem>> {
    return this.service.list(query);
  }

  @Get(':id/references')
  @RequirePermission(PERMISSIONS.system.attachments.view)
  references(
    @Param() { id }: AttachmentIdParamDto,
    @Query() query: PageQueryDto,
  ): Promise<PageResult<AttachmentReferenceItem>> {
    return this.service.listReferences(id, query);
  }

  @Get(':id/content')
  @RequirePermission(PERMISSIONS.system.attachments.download)
  async content(
    @Param() { id }: AttachmentIdParamDto,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
  ): Promise<StreamableFile> {
    const file = await this.service.readForManagement(id);
    const fallback = file.originalName.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 150) || 'download';
    response.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    response.setHeader('Content-Length', String(file.sizeBytes));
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(file.stream);
  }

  @Post(':id/trash')
  @RequirePermission(PERMISSIONS.system.attachments.manage)
  @AuditInApplication()
  trash(
    @Param() { id }: AttachmentIdParamDto,
    @Body() body: AttachmentLifecycleDto,
    @CurrentCommandContext() audit: CommandContext,
  ): Promise<AttachmentLifecycleResult> {
    return this.service.trash(id, body.version, audit);
  }

  @Post(':id/purge')
  @RequirePermission(PERMISSIONS.system.attachments.manage)
  @AuditInApplication()
  purge(
    @Param() { id }: AttachmentIdParamDto,
    @Body() body: AttachmentLifecycleDto,
    @CurrentCommandContext() audit: CommandContext,
  ): Promise<AttachmentLifecycleResult> {
    return this.service.purge(id, body.version, audit);
  }
}
