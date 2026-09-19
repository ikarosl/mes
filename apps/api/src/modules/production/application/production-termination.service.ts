import { Injectable } from '@nestjs/common';
import { ProductionTerminationRepository } from './ports/production-termination.repository.js';
@Injectable()
export class ProductionTerminationService {
  constructor(private readonly repository: ProductionTerminationRepository) {}
  getCheck(batchId: string) {
    return this.repository.getCheck(batchId);
  }
}
