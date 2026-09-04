import { z } from 'zod';
import type {
  IdempotencyResultCodec,
  JsonValue,
} from '../../../../common/idempotency/idempotency-executor.js';
import {
  ADD_MANUAL_MATERIAL_DEMAND_IDEMPOTENCY_SCOPE,
  CONFIGURE_MATERIAL_DEMANDS_IDEMPOTENCY_SCOPE,
} from './production-idempotency-scopes.contract.js';

export interface ConfigureMaterialDemandsResult {
  configured: true;
}

export interface AddManualMaterialDemandResult {
  demandId: string;
}

const configureSchema: z.ZodType<ConfigureMaterialDemandsResult> = z
  .object({ configured: z.literal(true) })
  .strict();
const manualSchema: z.ZodType<AddManualMaterialDemandResult> = z
  .object({ demandId: z.string() })
  .strict();

const codec = <T>(schema: z.ZodType<T>): IdempotencyResultCodec<T> => ({
  encode: (result) => schema.parse(result) as unknown as JsonValue,
  decode: (stored) => schema.parse(stored),
});

export const configureMaterialDemandsResultCodec = {
  ...codec(configureSchema),
  scope: CONFIGURE_MATERIAL_DEMANDS_IDEMPOTENCY_SCOPE,
} as const;
export const addManualMaterialDemandResultCodec = {
  ...codec(manualSchema),
  scope: ADD_MANUAL_MATERIAL_DEMAND_IDEMPOTENCY_SCOPE,
} as const;
