import { Injectable } from '@nestjs/common';
import { permissionMatches, STOCK_DOCUMENT_SCENARIOS } from '@company/constants';
import type {
  PageResult,
  StockDocumentDirection,
  StockDocumentOrder,
  StockDocumentQuery,
  StockDocumentSourceType,
} from '@company/contracts';
import { IdentityDirectoryService } from '../../identity/public.js';
import { StockDocumentQueryPort } from './ports/stock-document-query.port.js';

@Injectable()
export class StockDocumentQueryService {
  constructor(
    private readonly query: StockDocumentQueryPort,
    private readonly identity: IdentityDirectoryService,
  ) {}

  async list(
    query: StockDocumentQuery,
    permissions: readonly string[],
  ): Promise<PageResult<StockDocumentOrder>> {
    const normalized = { ...query, keyword: query.keyword?.trim() || undefined };
    const sources = this.allowedSources(query.direction, permissions, query.itemKind);
    const page = await this.query.list(normalized, sources);
    return { ...page, items: await this.enrich(page.items) };
  }

  async get(
    direction: StockDocumentDirection,
    id: string,
    permissions: readonly string[],
  ): Promise<StockDocumentOrder> {
    const order = await this.query.get(direction, id, this.allowedSources(direction, permissions));
    return (await this.enrich([order]))[0]!;
  }

  private allowedSources(
    direction: StockDocumentDirection,
    permissions: readonly string[],
    itemKind?: StockDocumentQuery['itemKind'],
  ): StockDocumentSourceType[] {
    return [
      ...new Set(
        STOCK_DOCUMENT_SCENARIOS.filter(
          (scenario) =>
            scenario.direction === direction &&
            (!itemKind || scenario.itemKind === itemKind) &&
            permissionMatches(permissions, scenario.viewPermission),
        ).map((scenario) => scenario.sourceType),
      ),
    ];
  }

  private async enrich(items: StockDocumentOrder[]): Promise<StockDocumentOrder[]> {
    const ids = [
      ...new Set(
        items
          .flatMap((row) => [row.createdById, row.operatorId, row.cancelledById])
          .filter((value): value is string => value !== null),
      ),
    ];
    const names = new Map(
      (await this.identity.listUserReferencesByIds(ids)).map((user) => [user.id, user.displayName]),
    );
    return items.map((row) => ({
      ...row,
      createdByName: names.get(row.createdById) ?? null,
      operatorName: row.operatorId ? (names.get(row.operatorId) ?? null) : null,
      cancelledByName: row.cancelledById ? (names.get(row.cancelledById) ?? null) : null,
    }));
  }
}
