import { Injectable } from '@nestjs/common';
import type { ProductionTraceDetail, ProductionTraceQuery } from '@company/contracts';
import { ProductionMaterialService } from './production-material.service.js';
import { ProductionReportingRepository } from './ports/production-reporting.repository.js';
import { ProductionTraceRepository } from './ports/production-trace.repository.js';

@Injectable()
export class ProductionTraceService {
  constructor(
    private readonly trace: ProductionTraceRepository,
    private readonly materials: ProductionMaterialService,
    private readonly reporting: ProductionReportingRepository,
  ) {}

  search(query: ProductionTraceQuery) {
    return this.trace.search(query);
  }

  async getDetail(batchId: string): Promise<ProductionTraceDetail> {
    const [
      summary,
      materialDemands,
      materialOutbounds,
      inventoryTransactions,
      materialInboundSources,
      execution,
    ] = await Promise.all([
      this.trace.getSummary(batchId),
      this.materials.listDemands(batchId),
      this.materials.listOutbounds(batchId),
      this.trace.listInventoryTransactions(batchId),
      this.trace.listMaterialInboundSources(batchId),
      this.reporting.getBatchExecution(batchId),
    ]);
    return {
      summary,
      materialDemands,
      materialOutbounds,
      inventoryTransactions,
      materialInboundSources,
      steps: execution.steps,
    };
  }
}
