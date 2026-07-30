import { describe, expect, it } from 'vitest';
import { assertMysqlIntegrationEnabled } from '../assert-mysql-integration-enabled.mjs';

describe('assertMysqlIntegrationEnabled', () => {
  it('rejects MySQL setup unless the explicit integration switch is enabled', () => {
    expect(() => assertMysqlIntegrationEnabled({})).toThrow('RUN_MYSQL_INTEGRATION=1');
  });

  it('allows MySQL setup only when the explicit integration switch is enabled', () => {
    expect(() => assertMysqlIntegrationEnabled({ RUN_MYSQL_INTEGRATION: '1' })).not.toThrow();
  });
});
