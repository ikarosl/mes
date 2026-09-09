import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { ProductSnapshotQuery } from '../application/product-snapshot.query.js';
import { MaterialRepository } from '../application/ports/material.repository.js';
import { TechnicalFileContentQuery } from '../application/technical-file-content.query.js';
import { MysqlMaterialRepository } from '../infrastructure/mysql-material.repository.js';
import { ProductModule } from '../product.module.js';

describe('ProductModule public providers', () => {
  it('exports the snapshot query token for future modules', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, ProductModule)).toContain(
      ProductSnapshotQuery,
    );
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, ProductModule)).toContain(
      TechnicalFileContentQuery,
    );
  });

  it('registers the material repository adapter and binds its application port', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ProductModule) as unknown[];

    expect(providers).toContain(MysqlMaterialRepository);
    expect(providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provide: MaterialRepository,
          useExisting: MysqlMaterialRepository,
        }),
      ]),
    );
  });
});
