import { Body, Controller, Get, Param, Patch, Post, Query, UseFilters } from '@nestjs/common';
import { PERMISSIONS } from '@company/constants';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import {
  AuditInApplication,
  CurrentCommandContext,
  RequirePermission,
} from '../../../../common/security/auth.decorators.js';
import { SupplierService } from '../../application/supplier.service.js';
import { ProcurementDomainExceptionFilter } from './procurement-domain-exception.filter.js';
import {
  CreateSupplierDto,
  SupplierIdParamDto,
  SupplierOptionQueryDto,
  SupplierQueryDto,
  UpdateSupplierDto,
} from './supplier.dto.js';

@Controller('procurement/suppliers')
@UseFilters(ProcurementDomainExceptionFilter)
export class SupplierController {
  constructor(private readonly service: SupplierService) {}

  @Get()
  @RequirePermission(PERMISSIONS.procurement.suppliers.view)
  list(@Query() query: SupplierQueryDto) {
    return this.service.list(query);
  }

  @Get('options')
  @RequirePermission([
    PERMISSIONS.procurement.suppliers.view,
    PERMISSIONS.procurement.orders.view,
    PERMISSIONS.procurement.receipts.view,
  ])
  options(@Query() query: SupplierOptionQueryDto) {
    return this.service.options(query);
  }

  @Post()
  @RequirePermission(PERMISSIONS.procurement.suppliers.create)
  @AuditInApplication()
  create(@Body() body: CreateSupplierDto, @CurrentCommandContext() context: CommandContext) {
    return this.service.create(body, context);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.procurement.suppliers.update)
  @AuditInApplication()
  update(
    @Param() { id }: SupplierIdParamDto,
    @Body() body: UpdateSupplierDto,
    @CurrentCommandContext() context: CommandContext,
  ) {
    return this.service.update(id, body, context);
  }
}
