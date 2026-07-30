import { fileURLToPath } from 'node:url';

export const assertMysqlIntegrationEnabled = (environment = process.env) => {
  if (environment.RUN_MYSQL_INTEGRATION === '1') return;
  throw new Error(
    'Refusing to run MySQL integration setup. Set RUN_MYSQL_INTEGRATION=1 explicitly before applying migrations.',
  );
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    assertMysqlIntegrationEnabled();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
