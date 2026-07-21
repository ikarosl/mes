import { config, type DotenvConfigOptions } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 根据当前模块位置定位 monorepo 根目录。
 * 源码位于 `packages/config/src`、构建产物位于 `packages/config/dist`，两种情况下均向上三级。
 */
export const resolveWorkspaceRoot = (moduleUrl: string) =>
  resolve(dirname(fileURLToPath(moduleUrl)), '../../..');

/** 工作区根目录：所有服务端运行时配置都从这里读取 `.env`。 */
export const workspaceRoot = resolveWorkspaceRoot(import.meta.url);

/** 工作区唯一环境文件路径，避免 Turbo 改变包级工作目录后读取失败。 */
export const workspaceEnvPath = resolve(workspaceRoot, '.env');

/**
 * 加载工作区环境变量。
 * 默认不覆盖进程已注入的变量，使 CI、Docker 与部署平台能够通过系统环境覆盖本地 `.env`。
 */
export const loadWorkspaceEnv = (options: Omit<DotenvConfigOptions, 'path'> = {}) =>
  config({ path: workspaceEnvPath, ...options });
