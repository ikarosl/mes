import { ProductionDomainError } from '../../domain/production.errors.js';

export const requireVersion = (current: number, expected: number, target: string): void => {
  if (current !== expected)
    throw new ProductionDomainError('CONCURRENT_MODIFICATION', `${target}版本已变化，请刷新后重试`);
};
