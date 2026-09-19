import { Body, Controller, Get, Param, Post, Res, UseFilters } from '@nestjs/common';
import { PERMISSIONS } from '@company/constants';
import type { BatchCloseoutDetail } from '@company/contracts';
import type { IdempotentCommandContext } from '../../../../common/audit/audit.types.js';
import {
  AuditInApplication,
  CurrentIdempotentCommandContext,
  IdempotentEndpoint,
  RequirePermission,
} from '../../../../common/security/auth.decorators.js';
import { ApprovalDomainExceptionFilter } from '../../../approval/public.js';
import { ProductionDomainExceptionFilter } from './production-domain-exception.filter.js';
import { ProductionCloseoutService } from '../../application/production-closeout.service.js';
import {
  BEGIN_BATCH_CLOSEOUT_SCOPE,
  HANDLE_BATCH_CLOSEOUT_SCOPE,
} from '../../application/idempotency/production-idempotency-scopes.contract.js';
import {
  BeginBatchCloseoutDto,
  HandleBatchCloseoutItemDto,
} from './dto/production-closeout.dto.js';
import { TerminationBatchParamDto } from './dto/production-termination.dto.js';
@Controller('production/batches/:batchId/closeout')
@UseFilters(ProductionDomainExceptionFilter, ApprovalDomainExceptionFilter)
export class ProductionCloseoutController {
  constructor(private readonly service: ProductionCloseoutService) {}
  @Get()
  @RequirePermission(PERMISSIONS.production.tasks.view)
  async detail(
    @Param() { batchId }: TerminationBatchParamDto,
    @Res() response: { json(body: BatchCloseoutDetail | null): void },
  ): Promise<void> {
    // Nest 默认将 null 发送为空响应体；这里的 null 是“没有逐项收尾记录”的有效 JSON 值。
    response.json(await this.service.detail(batchId));
  }
  @Post('begin')
  @RequirePermission(PERMISSIONS.production.tasks.terminate)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: BEGIN_BATCH_CLOSEOUT_SCOPE })
  begin(
    @Param() { batchId }: TerminationBatchParamDto,
    @Body() body: BeginBatchCloseoutDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.begin(batchId, body, context);
  }
  @Post('items')
  @RequirePermission(PERMISSIONS.production.tasks.terminate)
  @AuditInApplication()
  @IdempotentEndpoint({ scope: HANDLE_BATCH_CLOSEOUT_SCOPE })
  handle(
    @Param() { batchId }: TerminationBatchParamDto,
    @Body() body: HandleBatchCloseoutItemDto,
    @CurrentIdempotentCommandContext() context: IdempotentCommandContext,
  ) {
    return this.service.handle(batchId, body, context);
  }
}
