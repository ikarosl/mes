import { appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const API_PACKAGE = '@company/api';
const WEB_PACKAGE = '@company/admin-web';
const ZERO_SHA = /^0+$/;

const BOTH_COMPONENT_INPUTS = new Set([
  '.dockerignore',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  'turbo.json',
]);

const SERVER_CONTROL_INPUTS = new Set([
  'infra/compose/compose.prod.yml',
  'ops/scripts/apply-control.sh',
  'ops/scripts/deploy-api.sh',
  'ops/scripts/deploy-web.sh',
]);

export const classifyReleaseChanges = ({ affectedPackages, changedFiles, forceAll = false }) => {
  const packages = new Set(affectedPackages);
  const files = changedFiles.map(normalizePath);
  const sharedImageInputChanged = files.some((file) => BOTH_COMPONENT_INPUTS.has(file));
  const apiImageInputChanged = files.includes('infra/docker/api.Dockerfile');
  const webImageInputChanged = files.some(
    (file) => file === 'infra/docker/web.Dockerfile' || file.startsWith('infra/nginx/'),
  );

  return {
    apiChanged:
      forceAll || sharedImageInputChanged || apiImageInputChanged || packages.has(API_PACKAGE),
    webChanged:
      forceAll || sharedImageInputChanged || webImageInputChanged || packages.has(WEB_PACKAGE),
    controlChanged: forceAll || files.some((file) => SERVER_CONTROL_INPUTS.has(file)),
  };
};

const main = () => {
  const base = process.argv[2]?.trim();
  const head = process.argv[3]?.trim();
  if (!base || !head) {
    throw new Error('usage: node scripts/detect-release-changes.mjs <base-sha> <head-sha>');
  }

  const forceAll = ZERO_SHA.test(base);
  const changedFiles = forceAll ? [] : gitChangedFiles(base, head);
  const affectedPackages = forceAll ? [] : turboAffectedPackages(base, head);
  const result = classifyReleaseChanges({ affectedPackages, changedFiles, forceAll });
  const output = {
    base,
    head,
    changedFiles,
    affectedPackages,
    ...result,
  };

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `api_changed=${String(result.apiChanged)}\nweb_changed=${String(result.webChanged)}\ncontrol_changed=${String(result.controlChanged)}\n`,
    );
  }

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
};

const gitChangedFiles = (base, head) =>
  run('git', ['diff', '--name-only', '--diff-filter=ACDMRTUXB', `${base}...${head}`])
    .split(/\r?\n/u)
    .map((file) => file.trim())
    .filter(Boolean)
    .map(normalizePath);

const turboAffectedPackages = (base, head) => {
  const corepack = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';
  const json = run(
    corepack,
    ['pnpm', 'exec', 'turbo', 'ls', '--affected', '--output=json'],
    {
      ...process.env,
      TURBO_SCM_BASE: base,
      TURBO_SCM_HEAD: head,
    },
    process.platform === 'win32',
  );
  const parsed = JSON.parse(json);
  const items = parsed?.packages?.items;
  if (!Array.isArray(items)) throw new Error('Unexpected output from turbo ls --affected');
  return items.map((item) => item?.name).filter((name) => typeof name === 'string');
};

const run = (command, args, env = process.env, shell = false) => {
  const result = spawnSync(command, args, { encoding: 'utf8', env, shell, windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed (${result.status})\n${result.stderr || result.stdout}`,
    );
  }
  return result.stdout;
};

const normalizePath = (path) => path.replaceAll('\\', '/');

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
