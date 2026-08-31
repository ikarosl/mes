# ADR-0002：Redis 是可选适配器

状态：Accepted

MySQL 是业务事实来源，并优先用数据库事务和行锁保证一致性。当前仓库没有 CachePort、LockPort、
RateLimitPort、Noop/Memory adapter 或 Redis adapter，也不存在共享 cache 包。

只有多实例限流、热点缓存、跨实例锁或异步任务形成已批准需求后，才在真实消费者一侧定义窄端口；出现第二个消费者并证明语义稳定后，再评审提取共享包。未来接入 Redis 时业务代码不得直接依赖 Redis client，Redis 不可用也不得改变业务事实。
