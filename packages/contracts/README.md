# @company/contracts

前后端共享的 TypeScript 传输契约和 API 路径常量，当前覆盖通用分页/错误结构、认证、System、Product 和 Production。

本包当前只提供编译期 interface、type 与常量，不包含 Zod 等运行时 schema，也没有 OpenAPI 生成或兼容性检查能力。HTTP 入参的运行时校验由 API 的 class DTO 与 ValidationPipe 所有；如果未来引入生成式契约，必须先明确唯一事实来源并迁移现有 DTO，不能把计划描述成当前能力。

## 验证

```text
corepack pnpm --filter @company/contracts typecheck
corepack pnpm --filter @company/contracts test
```
