import { Controller, Get, UseFilters } from '@nestjs/common';
import { PERMISSIONS } from '@company/constants';
import type { BusinessTemplateDefaultItem } from '@company/contracts';
import { RequirePermission } from '../../../../common/security/auth.decorators.js';
import { IncomingInspectionTemplateService } from '../../application/incoming-inspection-template.service.js';
import { QualityCommandExceptionFilter } from './quality-command-exception.filter.js';

@Controller('quality/incoming-inspection-template')
@UseFilters(QualityCommandExceptionFilter)
export class IncomingInspectionTemplateController {
  constructor(private readonly service: IncomingInspectionTemplateService) {}

  @Get()
  @RequirePermission(PERMISSIONS.quality.inboundInspections.view)
  getDefault(): Promise<BusinessTemplateDefaultItem> {
    return this.service.getDefault();
  }
}
