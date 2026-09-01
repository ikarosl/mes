# Product 技术文件与对象存储

技术文件能力当前完整归属 Product：application 定义 `TechnicalFileStorage` 端口，infrastructure 的
`S3TechnicalFileStorage` 使用 AWS SDK v3 连接 S3-compatible 服务。只有出现第二个独立业务消费者，且端口语义能够脱离 Product 技术文件生命周期时，才评审提取共享存储包。

## 配置

```text
S3_ENDPOINT=                 # 自建 S3-compatible 服务填写；AWS S3 可留空
S3_REGION=us-east-1
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_SESSION_TOKEN=            # 可选
S3_FORCE_PATH_STYLE=true     # 有自定义 endpoint 时默认为 true
```

本地开发可使用 MinIO/AIStor，正式环境可连接 AWS S3 或兼容服务。`pnpm storage:ensure-bucket` 通过 API 包的脚本确保 Bucket 存在。

## 存储与数据库边界

- 对象键使用 `sop/<Asia-Shanghai 年>/<月>/<UUID><扩展名>`，不包含用户输入路径。
- `technical_files` 只保存 provider、bucket、稳定对象键、MIME、大小、SHA-256、文件类型和版本等元数据，不保存临时 URL 或凭证。
- 上传先写对象存储，再写数据库；数据库写入失败时通过 `remove` 补偿删除刚上传的孤立对象。
- 下载先完成权限和元数据校验，再从冻结 bucket/object key 流式读取。
- 工序和路线会冻结 SOP 文件名、对象键和版本，历史生产记录不得回读当前工序配置替代快照。

## 删除规则

当前没有技术文件 HTTP 删除入口。Repository 只保留未来恢复入口所需的元数据软删除实现，并在删除前检查当前引用；对象内容不会随业务软删除而物理删除，以保留历史追溯。

`TechnicalFileStorage.remove` 目前只用于“对象上传成功但数据库写入失败”的补偿清理，不表示允许删除已经登记并可能被历史记录引用的业务文件。

## 安全与运维

- 上传限制、允许 MIME 和最大文件大小由 Product DTO/application 校验；当前 SOP 最大 20 MiB。
- 生产 Nginx 将 API 请求体上限设为 21 MiB，仅用于容纳 20 MiB 文件与 multipart 封装开销；精确的文件上限仍由 Product 的共享常量与 Multer 校验。
- 日志不得输出访问密钥、session token、签名 URL 或文件内容。
- Bucket 备份、版本控制、保留策略和凭证轮换由部署环境负责；恢复时必须保持数据库 locator 与对象键一致。
- 更换兼容服务只调整配置和凭证，不改变业务表或 Product application port。
