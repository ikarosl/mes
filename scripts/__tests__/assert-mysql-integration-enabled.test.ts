import { describe, expect, it } from 'vitest';
import { assertMysqlIntegrationEnabled } from '../assert-mysql-integration-enabled.mjs';

const validEnvironment = {
  RUN_MYSQL_INTEGRATION: '1',
  TEST_DB_HOST: '127.0.0.1',
  TEST_DB_PORT: '3307',
  TEST_DB_NAME: 'company_mes_next_test',
  DB_HOST: '127.0.0.1',
  DB_PORT: '3307',
  DB_NAME: 'company_mes_next_test',
};
const environmentWithoutTestDbName: Record<string, string> = { ...validEnvironment };
delete environmentWithoutTestDbName.TEST_DB_NAME;

describe('assertMysqlIntegrationEnabled', () => {
  it('rejects MySQL setup unless the explicit integration switch is enabled', () => {
    expect(() => assertMysqlIntegrationEnabled({})).toThrow('RUN_MYSQL_INTEGRATION=1');
  });

  it('rejects MySQL setup when the test host is missing or differs from DB_HOST', () => {
    expect(() =>
      assertMysqlIntegrationEnabled({
        ...validEnvironment,
        TEST_DB_HOST: '',
      }),
    ).toThrow('TEST_DB_HOST');
    expect(() =>
      assertMysqlIntegrationEnabled({
        ...validEnvironment,
        DB_HOST: 'localhost',
      }),
    ).toThrow('DB_HOST 必须与 TEST_DB_HOST 完全相等');
  });

  it('rejects MySQL setup when the test port is invalid or differs from DB_PORT', () => {
    expect(() =>
      assertMysqlIntegrationEnabled({
        ...validEnvironment,
        TEST_DB_PORT: '0',
      }),
    ).toThrow('TEST_DB_PORT 必须是 1-65535');
    expect(() =>
      assertMysqlIntegrationEnabled({
        ...validEnvironment,
        DB_PORT: '3306',
      }),
    ).toThrow('DB_PORT 必须与 TEST_DB_PORT 完全相等');
  });

  it('rejects MySQL setup when TEST_DB_NAME is missing or empty', () => {
    expect(() => assertMysqlIntegrationEnabled(environmentWithoutTestDbName)).toThrow(
      'TEST_DB_NAME',
    );
    expect(() => assertMysqlIntegrationEnabled({ ...validEnvironment, TEST_DB_NAME: '' })).toThrow(
      'TEST_DB_NAME',
    );
  });

  it('rejects MySQL setup when TEST_DB_NAME differs from DB_NAME', () => {
    expect(() =>
      assertMysqlIntegrationEnabled({
        ...validEnvironment,
        DB_NAME: 'company_mes_next',
      }),
    ).toThrow('完全相等');
  });

  it('rejects MySQL setup when DB_NAME does not end with _test', () => {
    expect(() =>
      assertMysqlIntegrationEnabled({
        ...validEnvironment,
        TEST_DB_NAME: 'company_mes_next',
        DB_NAME: 'company_mes_next',
      }),
    ).toThrow('必须以 _test 结尾');
  });

  it('allows MySQL setup when the switch and all database guards pass', () => {
    expect(() => assertMysqlIntegrationEnabled(validEnvironment)).not.toThrow();
    expect(() =>
      assertMysqlIntegrationEnabled({
        ...validEnvironment,
        TEST_DB_PORT: '3306',
        DB_PORT: '3306',
      }),
    ).not.toThrow();
  });
});
