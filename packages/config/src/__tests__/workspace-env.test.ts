import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveWorkspaceRoot, workspaceEnvPath, workspaceRoot } from '../index.js';

describe('workspace environment path', () => {
  it('resolves the root .env from a package module URL', () => {
    // 模拟配置包源码运行位置，验证 Turbo 在包目录运行时仍能定位到工作区根目录。
    const moduleUrl = pathToFileURL(resolve(workspaceRoot, 'packages/config/src/index.ts')).href;

    expect(resolveWorkspaceRoot(moduleUrl)).toBe(workspaceRoot);
    expect(workspaceEnvPath).toBe(resolve(workspaceRoot, '.env'));
  });
});
