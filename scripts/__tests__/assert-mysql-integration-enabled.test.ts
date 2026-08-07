import { describe, expect, it } from 'vitest';
import { assertMysqlIntegrationEnabled } from '../assert-mysql-integration-enabled.mjs';

const validEnvironment = {
  RUN_MYSQL_INTEGRATION: '1',
  TEST_DB_NAME: 'company_mes_next_test',
  DB_NAME: 'company_mes_next_test',
};

describe('assertMysqlIntegrationEnabled', () => {
  it('rejects MySQL setup unless the explicit integration switch is enabled', () => {
    expect(() => assertMysqlIntegrationEnabled({})).toThrow('RUN_MYSQL_INTEGRATION=1');
  });

  it('rejects MySQL setup when TEST_DB_NAME is missing or empty', () => {
    expect(() => assertMysqlIntegrationEnabled({ RUN_MYSQL_INTEGRATION: '1' })).toThrow(
      'TEST_DB_NAME',
    );
    expect(() =>
      assertMysqlIntegrationEnabled({ RUN_MYSQL_INTEGRATION: '1', TEST_DB_NAME: '' }),
    ).toThrow('TEST_DB_NAME');
  });

  it('rejects MySQL setup when TEST_DB_NAME differs from DB_NAME', () => {
    expect(() =>
      assertMysqlIntegrationEnabled({
        RUN_MYSQL_INTEGRATION: '1',
        TEST_DB_NAME: 'company_mes_next_test',
        DB_NAME: 'company_mes_next',
      }),
    ).toThrow('完全相等');
  });

  it('rejects MySQL setup when DB_NAME does not end with _test', () => {
    expect(() =>
      assertMysqlIntegrationEnabled({
        RUN_MYSQL_INTEGRATION: '1',
        TEST_DB_NAME: 'company_mes_next',
        DB_NAME: 'company_mes_next',
      }),
    ).toThrow('必须以 _test 结尾');
  });

  it('allows MySQL setup when the switch and all database guards pass', () => {
    expect(() => assertMysqlIntegrationEnabled(validEnvironment)).not.toThrow();
  });
});
