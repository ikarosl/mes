# AIStor 开发许可

本目录只存放本机开发所需的 AIStor 许可，不得提交真实许可文件。

1. 按 [AIStor 许可文档](https://docs.min.io/aistor/operations/licenses/) 获取免费的单节点许可。
2. 将许可保存为 `infra/compose/secrets/minio.license`。
3. 从仓库根目录执行 `pnpm infra:up`；脚本会启动 MySQL 与对象存储，并创建缺失的私有 Bucket。

`*.license` 已被 `.gitignore` 排除。正式环境应通过部署平台的 Secret 管理能力挂载许可和 S3 凭证，不应复制这里的开发凭证。
