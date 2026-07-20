# ADR-0002：Redis 是可选适配器

状态：Proposed

MySQL 是业务事实来源。默认使用 Noop/Memory cache，并优先用数据库事务和行锁保证一致性。多实例限流、热点缓存、跨实例锁或异步任务出现后，通过统一端口启用 Redis；业务代码不得直接依赖 Redis client。
