# ADR-0003：文件存储使用端口适配器

状态：Proposed

业务层只识别 objectKey、文件元数据、校验和和版本，不直接拼接本地 URL。开发可使用 LocalStorageAdapter，联调可使用 MinIO，生产使用 S3 compatible adapter。下载优先使用短期签名 URL，并保留权限校验、大小/MIME 限制和病毒扫描钩子。
