# 测试体系

## 分层

- Unit：领域规则、状态机、数量计算、权限判断；不连接数据库。
- Integration：Repository、事务、迁移、MySQL 约束、Redis/Storage adapter；使用真实容器依赖。
- API：NestJS HTTP、DTO 校验、错误码、鉴权、幂等和 OpenAPI 契约。
- Component：Vue 页面组件、Modal 表单、权限按钮、状态标签和 composable。
- E2E：少量核心旅程，例如登录、建档、工单到批次、物料分配、报工、检验返工。
- Performance：查询和关键写路径容量基线；按发布或定时任务执行。

## PR 门禁

1. format check
2. lint（零 error）
3. typecheck
4. unit + component tests，禁止无测试静默通过
5. build
6. MySQL migration fresh test
7. integration/API tests
8. 依赖与秘密扫描

主干或发布候选额外运行 E2E、镜像构建、镜像扫描和升级迁移测试。

## 最低策略

不先追求虚高覆盖率。新增或修复业务规则必须有测试；核心领域先设分支覆盖率门槛，UI 关注关键交互。历史代码迁移前先补 characterization tests，锁定已有行为后再重构。
