# 编码规范

本规范补充架构、API 和设计文档，不重复 Prettier 能自动完成的排版细节。格式以根目录
`prettier.config.js` 为准，强制规则由 ESLint、TypeScript 和测试执行。

## 1. 文件与命名

- TypeScript、CSS 和 SQL 文件使用 kebab-case；Vue 组件文件使用 PascalCase。
- 类、DTO、组件和导出类型使用 PascalCase；函数、变量、参数和对象字段使用 camelCase。
- 常量使用 UPPER_SNAKE_CASE；数据库表、字段和业务稳定代码使用 snake_case。
- 布尔值优先使用 `is`、`has`、`can`、`should` 前缀；ID 使用 `xxxId`，集合使用复数名词。
- 框架对象使用明确后缀：Dto、Service、Controller、Repository、Guard、Interceptor。
- 单元和组件测试放在相邻 `__tests__/*.test.ts`；跨模块测试放在根 `tests` 对应目录。

## 2. TypeScript

- 保持 strict，禁止新增 `any`；未知外部输入使用 `unknown` 并收窄。
- 禁止 `@ts-ignore`；必要兼容使用带原因的 `@ts-expect-error`。
- 公共函数、Port 方法和导出 API 声明明确返回类型；局部简单函数允许推断。
- 类型导入使用 `import type`。
- 数据对象契约使用 interface；联合、映射和工具类型使用 type。
- NestJS 注入 Port 使用 abstract class 或明确 token，不能依赖运行时消失的 interface。
- 封闭业务值使用共享常量和字符串联合类型，不使用 TypeScript enum 和散落魔法字符串。
- 避免无依据的类型断言和非空断言；`undefined` 表示未提供，`null` 表示明确为空。
- 不修改输入参数和共享对象；需要变更时创建新对象。

## 3. 函数与异步

- 函数只承担一个可描述任务，优先提前返回降低嵌套；不设置机械函数行数上限。
- 仅在错误映射、资源清理、补偿或 best-effort 时 catch；未恢复的错误必须继续 throw/reject。
- 禁止无说明的空 catch。可忽略错误必须通过函数名或注释说明补偿/best-effort 语义。
- `Promise.all` 只用于相互独立的操作；同一事务内有顺序约束的 SQL 不并发执行。
- 异步事件必须处理 rejection；核心写入禁止 fire-and-forget。

## 4. NestJS 与模块代码

分层、public 入口、Port 类型边界、事务审计及 Adapter 拆分遵守[架构规范](architecture.md)。domain、application、infrastructure 和通用 persistence helper 不直接抛 Nest HTTP 异常，presentation 统一映射。

## 5. Vue

- 使用 Composition API 和 `<script setup lang="ts">`，Props、Emits、模板引用必须有类型。
- 状态归属、composable 复用、候选刷新及失败处理遵守[管理端架构](../apps/admin-web/docs/architecture.md)，不在本规范另存副本。

- Vue 单文件超过 1000 行时，优先把列表状态、服务端分页和可复用副作用提取到 `views/<模块>/composables/useXxx.ts`（视图与状态分离），再按需拆分弹窗组件；模板和样式不是拆分对象，禁止机械拆行数。
- HTTP 只通过 `src/api` 封装，不在组件创建 Axios 实例。
- `.vue` 不重复声明业务编码与中文映射；复用 shared constants 和格式化函数。
- `v-for` 使用稳定业务 ID；loading 在 `finally` 恢复；通用 HTTP 错误不重复提示。
- 全局样式仅存放设计 token 和通用布局，业务组件样式默认 scoped。

## 6. SQL 与 migration

- 使用参数化查询；动态排序只使用服务端白名单；显式列出查询字段，避免 `SELECT *`。
- 分页查询必须稳定排序；多表写入必须有明确事务边界。
- migration 只能追加，命名为时间戳加 kebab-case 目的，同时提供 up/down。
- 已执行 migration 不可修改；每个 migration 只承担一个明确目标。
- 新增封闭状态值时同步更新数据库 CHECK、constants、contracts 和测试。
- 时间遵守 [`database-conventions.md`](database-conventions.md) 的 `+08:00` 规则。

## 7. 注释、错误、日志与安全

- 注释解释原因、不变量和风险，不复述代码。
- TODO 使用 `TODO(scope): 原因；解除条件`。
- 用户错误信息使用中文，机器错误码使用稳定英文；不直接返回底层异常。
- 日志包含必要 requestId 和业务上下文，但不得记录密码、Token、Cookie、签名或凭证。
- 未预期 HTTP 异常仅在 `NODE_ENV=development` 的本地日志保留原始异常链；生产、测试及未声明环境保留错误
  类型、稳定驱动错误码和脱敏堆栈。任何环境都不得采集请求体、认证头、Cookie 或 URL 查询串作为诊断信息。
- API 正式日志使用框架 Logger，不使用 `console.log`。

## 8. 依赖、测试与提交

- 共享依赖版本放在 pnpm catalog，新依赖放入实际使用的 workspace。
- 测试按 Arrange–Act–Assert 组织，验证外部行为而非私有实现；时间和外部依赖必须可控制。
- 新业务规则、错误分支和 bug 修复的测试按[测试策略](testing-strategy.md)及已授权阶段执行；禁止 `--passWithNoTests`。
- 提交使用 `feat/fix/refactor/docs/test/chore(scope): description`，一个提交只包含一个逻辑变更。
