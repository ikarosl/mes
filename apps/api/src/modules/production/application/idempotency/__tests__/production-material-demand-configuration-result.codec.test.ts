import { describe, expect, it } from 'vitest';
import {
  addManualMaterialDemandResultCodec,
  configureMaterialDemandsResultCodec,
} from '../production-material-demand-configuration-result.codec.js';

describe('production material-demand configuration result codecs', () => {
  it('round-trips the canonical normal configuration and manual addition results', () => {
    const configured = { configured: true as const };
    const addition = { additionId: '31', additionNo: 'MD-1', demandIds: ['41', '42'] };

    expect(
      configureMaterialDemandsResultCodec.decode(
        JSON.parse(JSON.stringify(configureMaterialDemandsResultCodec.encode(configured))),
      ),
    ).toEqual(configured);
    expect(
      addManualMaterialDemandResultCodec.decode(
        JSON.parse(JSON.stringify(addManualMaterialDemandResultCodec.encode(addition))),
      ),
    ).toEqual(addition);
  });

  it('rejects damaged or extra-field persisted snapshots', () => {
    expect(() => configureMaterialDemandsResultCodec.decode({ configured: false })).toThrow();
    expect(() => addManualMaterialDemandResultCodec.decode({ additionId: '31' })).toThrow();
    expect(() =>
      addManualMaterialDemandResultCodec.decode({
        additionId: '31',
        additionNo: 'MD-1',
        demandIds: [],
        extra: true,
      }),
    ).toThrow();
  });
});
