import { appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const API_PACKAGE = '@company/api';
const WEB_PACKAGE = '@company/admin-web';
const ZERO_SHA = /^0+$/;
export const RELEASED_TAG = 'released';

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

export const chooseReleaseBase = ({
  releasedBase,
  baseArg,
  head,
  allowFallback = false,
  isUsable = () => true,
}) => {
  if (releasedBase) {
    return isUsable(releasedBase, head)
      ? { base: releasedBase, forceAll: false, reason: 'released-tag' }
      : { base: null, forceAll: true, reason: 'released-tag-unusable' };
  }
  if (allowFallback && baseArg && !ZERO_SHA.test(baseArg) && isUsable(baseArg, head)) {
    return { base: baseArg, forceAll: false, reason: 'supplied-base-fallback' };
  }
  return { base: null, forceAll: true, reason: 'no-released-tag' };
};

const main = () => {
  const baseArg = process.argv[2]?.trim();
  const head = process.argv[3]?.trim();
  if (!baseArg || !head) {
    throw new Error('usage: node scripts/detect-release-changes.mjs <base-sha> <head-sha>');
  }

  const releasedBase = tryStdout('git', ['rev-parse', '--verify', `${RELEASED_TAG}^{commit}`]);
  const allowFallback = process.env.ALLOW_BASE_WITHOUT_RELEASED_TAG === '1';
  const choice = chooseReleaseBase({
    releasedBase,
    baseArg,
    head,
    allowFallback,
    isUsable: (base) => isUsableReleaseRange(base, head),
  });

  if (choice.forceAll) {
    process.stderr.write(
      choice.reason === 'no-released-tag'
        ? `::warning::No ${RELEASED_TAG} tag found; forcing a full release.\n`
        : `::warning::Release base is unavailable or unrelated to ${head}; forcing a full release.\n`,
    );
  } else if (choice.reason === 'supplied-base-fallback') {
    process.stderr.write(
      `::warning::No ${RELEASED_TAG} tag found; using supplied base ${baseArg} because ALLOW_BASE_WITHOUT_RELEASED_TAG=1.\n`,
    );
  }

  const base = choice.base;
  const forceAll = choice.forceAll;
  const changedFiles = forceAll || base === head ? [] : gitChangedFiles(base, head);
  const affectedPackages = forceAll || base === head ? [] : turboAffectedPackages(base, head);
  const result = classifyReleaseChanges({ affectedPackages, changedFiles, forceAll });
  const output = {
    base: base ?? null,
    requestedBase: baseArg,
    releasedBase,
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

export const isUsableReleaseRange = (base, head, git = tryRun) =>
  git('git', ['cat-file', '-e', `${base}^{commit}`]) &&
  git('git', ['cat-file', '-e', `${head}^{commit}`]) &&
  git('git', ['merge-base', base, head]);

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

const tryRun = (command, args) => {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: process.env,
    windowsHide: true,
  });
  return !result.error && result.status === 0;
};

const tryStdout = (command, args) => {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: process.env,
    windowsHide: true,
  });
  return !result.error && result.status === 0 ? result.stdout.trim() : null;
};

const normalizePath = (path) => path.replaceAll('\\', '/');

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
