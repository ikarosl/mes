import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { ProductSnapshotQuery } from '../application/product-snapshot.query.js';
import { TechnicalFileContentQuery } from '../application/technical-file-content.query.js';
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
});
