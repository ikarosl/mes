import type {
  PageResult,
  PersonnelItem,
  PersonnelListQuery,
  PersonnelOption,
  SavePersonnelInput,
  UpdatePersonnelInput,
} from '@company/contracts';
import type { AuditLogEntry } from '../../../../common/audit/audit.types.js';

export abstract class PersonnelRepository {
  abstract list(
    query: PersonnelListQuery & { page: number; pageSize: number },
  ): Promise<PageResult<PersonnelItem>>;
  abstract options(): Promise<PersonnelOption[]>;
  abstract requireActive(id: string): Promise<PersonnelOption>;
  abstract create(input: SavePersonnelInput, audit: AuditLogEntry): Promise<PersonnelItem>;
  abstract update(
    id: string,
    input: UpdatePersonnelInput,
    audit: AuditLogEntry,
  ): Promise<PersonnelItem>;
}
