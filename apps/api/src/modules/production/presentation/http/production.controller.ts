import { Body, Controller, Get, Param, Patch, Post, Query, UseFilters } from '@nestjs/common';
import { PERMISSIONS } from '@company/constants';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import {
  AuditInApplication,
  CurrentCommandContext,
  RequirePermission,
} from '../../../../common/security/auth.decorators.js';
import { ProductionService } from '../../application/production.service.js';
import {
  BatchStepRecordParamDto,
  CreateProductionBatchDto,
  CreateWorkOrderDto,
  IdParamDto,
  ProductionBatchQueryDto,
  UpdateBatchStepExecutionDto,
  UpdateProductionBatchDto,
  UpdateWorkOrderDto,
  WorkOrderQueryDto,
} from './dto/production.dto.js';
import { VersionedCommandDto } from '../../../../presentation/http/dto/versioned-command.dto.js';
import { ProductionDomainExceptionFilter } from './production-domain-exception.filter.js';

@Controller('production')
@UseFilters(ProductionDomainExceptionFilter)
export class ProductionController {
  constructor(private readonly service: ProductionService) {}
  @Get('work-orders')
  @RequirePermission(PERMISSIONS.production.orders.view)
  workOrders(@Query() query: WorkOrderQueryDto) {
    return this.service.listWorkOrders({ ...query, keyword: query.keyword?.trim() || undefined });
  }
  @Get('work-orders/:id')
  @RequirePermission(PERMISSIONS.production.orders.view)
  workOrder(@Param() { id }: IdParamDto) {
    return this.service.getWorkOrder(id);
  }
  @Post('work-orders')
  @RequirePermission(PERMISSIONS.production.orders.create)
  @AuditInApplication()
  createWorkOrder(
    @Body() body: CreateWorkOrderDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.createWorkOrder(body, audit);
  }
  @Patch('work-orders/:id')
  @RequirePermission(PERMISSIONS.production.orders.update)
  @AuditInApplication()
  updateWorkOrder(
    @Param() { id }: IdParamDto,
    @Body() body: UpdateWorkOrderDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.updateWorkOrder(id, body, audit);
  }
  @Post('work-orders/:id/actions/release')
  @RequirePermission(PERMISSIONS.production.orders.transition)
  @AuditInApplication()
  releaseWorkOrder(
    @Param() { id }: IdParamDto,
    @Body() body: VersionedCommandDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.releaseWorkOrder(id, body.version, audit);
  }
  @Post('work-orders/:id/actions/cancel')
  @RequirePermission(PERMISSIONS.production.orders.transition)
  @AuditInApplication()
  cancelWorkOrder(
    @Param() { id }: IdParamDto,
    @Body() body: VersionedCommandDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.cancelWorkOrder(id, body.version, audit);
  }
  @Post('work-orders/:id/actions/close')
  @RequirePermission(PERMISSIONS.production.orders.transition)
  @AuditInApplication()
  closeWorkOrder(
    @Param() { id }: IdParamDto,
    @Body() body: VersionedCommandDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.closeWorkOrder(id, body.version, audit);
  }
  @Get('work-orders/:id/batches')
  @RequirePermission(PERMISSIONS.production.tasks.view)
  workOrderBatches(@Param() { id }: IdParamDto) {
    return this.service.listWorkOrderBatches(id);
  }
  @Post('work-orders/:id/batches')
  @RequirePermission(PERMISSIONS.production.batches.create)
  @AuditInApplication()
  createBatch(
    @Param() { id }: IdParamDto,
    @Body() body: CreateProductionBatchDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.createBatch(id, body, audit);
  }
  @Get('batches')
  @RequirePermission(PERMISSIONS.production.tasks.view)
  batches(@Query() query: ProductionBatchQueryDto) {
    return this.service.listBatches({ ...query, keyword: query.keyword?.trim() || undefined });
  }
  @Get('batches/:id')
  @RequirePermission(PERMISSIONS.production.tasks.view)
  batch(@Param() { id }: IdParamDto) {
    return this.service.getBatch(id);
  }
  @Patch('batches/:id')
  @RequirePermission(PERMISSIONS.production.batches.update)
  @AuditInApplication()
  updateBatch(
    @Param() { id }: IdParamDto,
    @Body() body: UpdateProductionBatchDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.updateBatch(id, body, audit);
  }
  @Patch('batches/:batchId/step-records/:recordId/execution')
  @RequirePermission(PERMISSIONS.production.steps.manageExecution)
  @AuditInApplication()
  updateBatchStepExecution(
    @Param() { batchId, recordId }: BatchStepRecordParamDto,
    @Body() body: UpdateBatchStepExecutionDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.updateBatchStepExecution(batchId, recordId, body, audit);
  }
  @Post('batches/:id/actions/generate-material-demands')
  @RequirePermission(PERMISSIONS.production.batches.transition)
  @AuditInApplication()
  generateMaterialDemands(
    @Param() { id }: IdParamDto,
    @Body() body: VersionedCommandDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.generateMaterialDemands(id, body.version, audit);
  }
}
