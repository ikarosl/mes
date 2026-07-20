# apps/api

NestJS 组合根。这里只负责启动、全局管道/过滤器/拦截器、模块装配和健康检查，不放业务 SQL。

```text
src/
  bootstrap/
  common/
  health/
  modules/
    identity/
    product/
    process/
    production/
    inventory/
    quality/
    traceability/
```

每个领域模块采用 `domain / application / infrastructure / presentation` 四层模板。Controller 只做协议转换，Command/Query handler 负责用例，Repository adapter 负责持久化。
