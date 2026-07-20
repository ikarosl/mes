# packages/cache

定义 CachePort、LockPort 和 RateLimitPort，提供 Noop/Memory 与 Redis adapter。Redis 关闭时核心业务仍必须正确运行；缓存失效不能改变业务事实。
