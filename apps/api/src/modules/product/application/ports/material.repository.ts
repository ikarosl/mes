import type {
  MaterialListItem,
  MaterialListQuery,
  MaterialOption,
  MaterialPayload,
  PageResult,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';

export abstract class MaterialRepository {
  abstract list(query: MaterialListQuery): Promise<PageResult<MaterialListItem>>;
  abstract listOptions(): Promise<MaterialOption[]>;
  abstract create(payload: MaterialPayload, audit: CommandContext): Promise<{ id: string }>;
  abstract update(id: string, payload: MaterialPayload, audit: CommandContext): Promise<void>;
  abstract setStatus(id: string, status: number, audit: CommandContext): Promise<void>;
}
