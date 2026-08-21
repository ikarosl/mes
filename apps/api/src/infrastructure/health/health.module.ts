import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { HealthController } from '../../presentation/http/health.controller.js';
import { HealthCheckService } from './health-check.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
  providers: [HealthCheckService],
})
export class HealthModule {}
