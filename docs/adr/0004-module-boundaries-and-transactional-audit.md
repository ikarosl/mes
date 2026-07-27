# ADR-0004：模块公开入口与事务审计边界

状态：Accepted

## 决策

- 业务模块只通过根级 `public.ts` 向其他模块公开 Facade 或注入 token。
- 禁止跨模块深层 import、直接使用其他模块 Repository 或访问其他模块拥有的业务表。
- 跨模块所需的审计上下文和 HTTP 安全装饰器放入不含业务知识的 common。
- 核心业务成功审计接收当前事务 executor，与业务写入原子提交；审计失败整体回滚。
- 通用请求、认证拒绝和失败日志使用独立 AuditRepository，并按 best-effort 处理。
- 一个基础设施 Adapter 可以实现多个紧密相关的窄 Port；是否拆分类取决于变化原因和事务边界，而不是接口数量。

## 结果

ESLint 在 CI 阻止跨模块内部引用；Repository 测试验证事务审计原子性。application port 不得泄漏 PoolConnection 等基础设施类型。
