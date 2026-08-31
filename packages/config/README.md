# @company/config

服务端 workspace 环境文件定位与加载工具。它从源码或构建产物位置解析仓库根目录，并统一加载根 `.env`；进程已注入的环境变量优先，不由本包覆盖。

当前导出：`resolveWorkspaceRoot`、`workspaceRoot`、`workspaceEnvPath`、`loadWorkspaceEnv`。业务配置校验仍由使用方负责，本包不保存环境密钥或业务默认值。

## 验证

```text
corepack pnpm --filter @company/config typecheck
corepack pnpm --filter @company/config test
```
