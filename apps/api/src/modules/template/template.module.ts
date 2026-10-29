import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { BusinessTemplateRepository } from './application/ports/business-template.repository.js';
import { TemplateService } from './application/template.service.js';
import { MysqlBusinessTemplateRepository } from './infrastructure/mysql-business-template.repository.js';
import { TemplateController } from './presentation/http/template.controller.js';

@Module({
  imports: [DatabaseModule],
  controllers: [TemplateController],
  providers: [
    TemplateService,
    { provide: BusinessTemplateRepository, useClass: MysqlBusinessTemplateRepository },
  ],
})
export class TemplateModule {}
