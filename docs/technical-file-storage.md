# 技术文件对象存储

产品资料模块的 SOP 文件保持私有。后端只保留 `TechnicalFileStorage` 端口和 S3 协议适配器，不再提供本地文件适配器，也不按环境动态选择 npm SDK。MinIO、AIStor、AWS S3 及其他兼容服务统一使用 AWS SDK v3。

数据库 `technical_files` 统一写入 `storage_provider='s3'`，并保存 Bucket、稳定对象键和文件元数据，不保存文件内容、临时 URL、服务地址或凭证。本次整改前已确认当前数据库没有未删除的技术文件，因此没有需要搬迁的 local/minio 历史对象，也不需要追加数据迁移。

## 配置

本地开发只使用仓库根目录 `.env`。`pnpm infra:*` 会通过 `docker compose --env-file .env` 显式加载该文件，API、MySQL 初始化和对象存储不得再维护重复的账号配置。

```dotenv
# AIStor/MinIO 等自建服务需要；AWS S3 可留空
S3_ENDPOINT=http://127.0.0.1:9000
S3_REGION=us-east-1
S3_BUCKET=mes-technical-files
S3_ACCESS_KEY_ID=admin
S3_SECRET_ACCESS_KEY=12345678 （要求最少8位）
# S3_SESSION_TOKEN=
# 有自定义服务地址时默认 true；AWS S3 通常设为 false
S3_FORCE_PATH_STYLE=true
```

- `S3_BUCKET`、访问密钥和秘密密钥缺失时，API 启动失败。
- `S3_ENDPOINT` 是对象存储服务地址，不是 API 服务进程地址。仅仅重启或更换 API 进程不会改变文件位置。
- 配置中存在自定义地址时，path-style 默认开启；未配置地址时默认关闭，也可以显式覆盖。
- API 业务请求不会隐式创建 Bucket。部署初始化命令 `pnpm storage:ensure-bucket` 会检查并只在缺失时创建，不会清空或删除已有 Bucket。
- 运行时错误不输出凭证、签名或完整 SDK 异常文本。

## 本地开发

Compose 固定使用 `quay.io/minio/aistor/minio:RELEASE.2026-04-14T21-32-45Z`，避免未固定标签回退到已归档且带有已知安全问题的 MinIO OSS 镜像。AIStor 免费版需要许可：按 `infra/compose/secrets/README.md` 放置本机许可后执行：

```bash
pnpm infra:up
```

本地开发统一使用根目录 `pnpm infra:up`，不再区分 WSL 与 Desktop。该命令通过 `docker compose` 启动 MySQL（容器名 `dev_test_sql`，宿主 `3307` 映射容器 `3306`）和对象存储（容器名 `dev_test_minio`），随后自动保证 `S3_BUCKET` 存在。MySQL 数据库名与 `.env` 的 `DB_NAME` 一致。对象数据写入命名卷，容器重建不会删除数据；`pnpm infra:down` 也不会删除卷。不要使用 `docker compose down -v`，除非明确要销毁全部本地对象。

Console 地址为 `http://127.0.0.1:9001`。开发环境可以在 Console 中管理对象和 Bucket，不要求使用命令行删除。正在被应用使用的 Bucket 不应日常删除；如确需删除，应先确认没有业务引用并清空对象，再从 Console 删除。当前项目不自动开启 Bucket 版本控制，避免删除时还需额外清理历史版本和删除标记。

## 更换对象存储服务

这里的“更换地址”可以直接理解为“换了一套对象存储服务器”。API 的部署或进程变化并不需要迁移；只有文件实际存放的对象存储服务器发生变化时才需要迁移。

迁移顺序如下：

1. 保持旧服务可读，暂停新文件写入或安排增量同步。
2. 把旧 Bucket 的全部对象复制到新服务的目标 Bucket，保持 object key 不变。
3. 对比对象数量、大小，并抽样或全量校验 SHA-256。
4. 修改 `S3_ENDPOINT`、Bucket 或凭证，重启 API，完成上传、下载、删除烟雾测试。
5. 观察稳定后再下线旧服务；在此之前保留旧服务作为回滚路径。

数据库通常不用改，因为其中的 Bucket/object key 仍然有效。若目标 Bucket 名发生变化，必须通过追加迁移或受审计的迁移工具同步修改元数据，不能直接手工改生产库。

## 删除与备份

技术文件仍被 `process_steps` 或 `process_route_steps` 引用时拒绝删除。删除流程先停用元数据，再幂等删除物理对象，最后软删元数据；对象存储暂时故障时可以重复调用接口继续清理。上传成功但数据库写入失败时，应用会补偿删除刚上传的对象。

命名卷只解决容器重建后的持久化，不等同于备份。部署环境仍需对对象存储数据目录执行独立备份，并定期验证恢复；更换服务器前也必须先完成迁移与校验。
