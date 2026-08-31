# Runbooks

服务器端 Compose、固定持久化目录与发布入口见 [Docker Compose 测试服务器部署](compose-server-deployment.md)。

当前已提供 [API 镜像交付说明](api-image-release.md)，覆盖 CI 成功后的 Docker Hub 镜像构建、不可变 digest 交付和后续部署顺序边界。

数据库 migration 后的首次 system seed、管理员初始化和可选演示数据见[数据库首次初始化](database-initialization.md)。

正式上线前仍须补齐：目标环境发布与回滚、数据库备份恢复、迁移失败、MySQL 连接耗尽、对象存储不可用、Redis 不可用、磁盘空间、JWT 密钥轮换和安全事件处理。
