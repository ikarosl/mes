import { Injectable } from '@nestjs/common';
import type {
  PageResult,
  PersonnelItem,
  PersonnelListQuery,
  PersonnelOption,
  SavePersonnelInput,
  UpdatePersonnelInput,
} from '@company/contracts';
import type { AuditLogEntry, CommandContext } from '../../../common/audit/audit.types.js';
import { PersonnelRepository } from './ports/personnel.repository.js';

@Injectable()
export class PersonnelService {
  constructor(private readonly repository: PersonnelRepository) {}

  list(
    query: PersonnelListQuery & { page: number; pageSize: number },
  ): Promise<PageResult<PersonnelItem>> {
    return this.repository.list({ ...query, keyword: query.keyword?.trim() || undefined });
  }
  options(): Promise<PersonnelOption[]> {
    return this.repository.options();
  }
  requireActive(id: string): Promise<PersonnelOption> {
    return this.repository.requireActive(id);
  }
  create(input: SavePersonnelInput, context: CommandContext): Promise<PersonnelItem> {
    return this.repository.create(
      { ...input, code: input.code.trim(), name: input.name.trim() },
      this.audit('personnel.create', context),
    );
  }
  update(id: string, input: UpdatePersonnelInput, context: CommandContext): Promise<PersonnelItem> {
    return this.repository.update(
      id,
      { ...input, code: input.code.trim(), name: input.name.trim() },
      this.audit('personnel.update', context),
    );
  }
  private audit(action: string, context: CommandContext): AuditLogEntry {
    return {
      logType: 'operation',
      module: 'identity',
      action,
      targetType: 'personnel',
      userId: context.actorId,
      result: 'success',
      requestId: context.requestId,
      ip: context.ip,
      userAgent: context.userAgent,
    };
  }
}
