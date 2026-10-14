// TODO(production-return): 旧退料 Repository 的 SQL 队列 mock 随旧主从实现移除；
// 用户明确进入正式测试阶段后，以 Inventory 公共端口补回可退额度、超额拒绝、
// 创建／确认／取消审计原子性和失败回滚覆盖，不恢复旧表或旧 SQL 断言。
