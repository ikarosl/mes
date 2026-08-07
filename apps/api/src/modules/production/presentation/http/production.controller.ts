import { Body, Controller, Get, Param, Patch, Post, Query, UseFilters } from '@nestjs/common';
import { PERMISSIONS } from '@company/constants';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import {
  AuditInApplication,
  CurrentCommandContext,
  IdempotentEndpoint,
  RequirePermission,
} from '../../../../common/security/auth.decorators.js';
import { CREATE_BATCH_IDEMPOTENCY_SCOPE } from '../../application/idempotency/create-batch-idempotency.contract.js';
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
  WorkOrderIdParamDto,
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
  // 任务表单工单候选：完整返回全部已下达且仍有可分配余量的工单。
  // 当前候选规模具有明确小上限，不分页、不截断，前端本地筛选。
  @Get('work-orders/options')
  @RequirePermission([PERMISSIONS.production.tasks.view])
  workOrderOptions() {
    return this.service.listWorkOrderOptions();
  }
  @Get('work-orders/:workOrderId')
  @RequirePermission(PERMISSIONS.production.orders.view)
  workOrder(@Param() { workOrderId }: WorkOrderIdParamDto) {
    return this.service.getWorkOrder(workOrderId);
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
  @Patch('work-orders/:workOrderId')
  @RequirePermission(PERMISSIONS.production.orders.update)
  @AuditInApplication()
  updateWorkOrder(
    @Param() { workOrderId }: WorkOrderIdParamDto,
    @Body() body: UpdateWorkOrderDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.updateWorkOrder(workOrderId, body, audit);
  }
  @Post('work-orders/:workOrderId/actions/release')
  @RequirePermission(PERMISSIONS.production.orders.transition)
  @AuditInApplication()
  releaseWorkOrder(
    @Param() { workOrderId }: WorkOrderIdParamDto,
    @Body() body: VersionedCommandDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.releaseWorkOrder(workOrderId, body.version, audit);
  }
  @Post('work-orders/:workOrderId/actions/cancel')
  @RequirePermission(PERMISSIONS.production.orders.transition)
  @AuditInApplication()
  cancelWorkOrder(
    @Param() { workOrderId }: WorkOrderIdParamDto,
    @Body() body: VersionedCommandDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.cancelWorkOrder(workOrderId, body.version, audit);
  }
  @Post('work-orders/:workOrderId/actions/close')
  @RequirePermission(PERMISSIONS.production.orders.transition)
  @AuditInApplication()
  closeWorkOrder(
    @Param() { workOrderId }: WorkOrderIdParamDto,
    @Body() body: VersionedCommandDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.closeWorkOrder(workOrderId, body.version, audit);
  }
  @Get('work-orders/:workOrderId/batches')
  @RequirePermission(PERMISSIONS.production.tasks.view)
  workOrderBatches(@Param() { workOrderId }: WorkOrderIdParamDto) {
    return this.service.listWorkOrderBatches(workOrderId);
  }
  @Post('work-orders/:workOrderId/batches')
  @RequirePermission(PERMISSIONS.production.batches.create)
  @AuditInApplication()
  // scope 引用 application 层幂等契约常量（唯一事实来源，见 create-batch-idempotency.contract.ts）。
  // 本控制器已 import application 层 ProductionService，presentation→application 是既有合规依赖方向，
  // 模块内直接 import 契约文件即可，不涉及跨模块 public.ts 约束。
  @IdempotentEndpoint({ scope: CREATE_BATCH_IDEMPOTENCY_SCOPE })
  createBatch(
    @Param() { workOrderId }: WorkOrderIdParamDto,
    @Body() body: CreateProductionBatchDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.createBatch(workOrderId, body, audit);
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
