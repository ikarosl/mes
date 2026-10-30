# Product 技术文件与对象存储

技术文件由 Product 管理，通过独立存储端口使用 S3-compatible 服务。只有出现第二个独立业务消费者，且端口语义能够脱离 Product 技术文件生命周期时，才评审提取共享存储包。

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

- 对象键使用 `<fileType>/<Asia-Shanghai 年>/<月>/<UUID><扩展名>`，`fileType` 为 `sop` 或 `specification`，不包含用户输入路径。
- `technical_files` 只保存 provider、bucket、稳定对象键、MIME、大小、SHA-256、文件类型及 SOP 版本等元数据，不保存临时 URL 或凭证。
- 上传先写对象存储，再写数据库；数据库写入失败时通过 `remove` 补偿删除刚上传的孤立对象。
- 下载先完成权限和元数据校验，再从冻结 bucket/object key 流式读取。
- 工序和路线会冻结 SOP 文件名、对象键和版本，历史生产记录不得回读当前工序配置替代快照。

## 用途与上传契约

`POST /api/product/technical-files` 使用 multipart：`file` 是实际文件，`fileType` 省略时保持既有 `sop` 行为，可显式指定 `specification`。文件名直接使用上传原始文件名，不接受另填业务名称或版本号。SOP 继续由服务端生成时间版本并参与既有快照；规格书不管理文件版本，元数据 `versionNo` 固定返回 `null`。每次上传都创建新的对象与元数据，返回 `{ id }`，不通过名称或内容摘要覆盖旧对象。

`GET /api/product/technical-files` 按 `fileType` 精确筛选，省略时仍只读取 SOP，避免把规格书混入既有 SOP 选择器，目录列表独立校验 `product:files:view`。下载使用 `/:id/content`，独立校验 `product:files:download` 并从已登记 locator 读取；上传独立校验 `product:files:upload`。规格书元数据随成品或精确物料版本读取返回，主数据归属、绑定授权和并发条件由[规格书规则](product-rules.md#成品与精确物料版本规格书)维护。

规格书支持 PDF、Word（doc/docx）、Excel（xls/xlsx）、PowerPoint（ppt/pptx）和现有图片（png/jpg/jpeg/gif/webp/bmp）；扩展名和 MIME 必须共同命中共享白名单。全部技术文件共用 20 MiB 上限。

## 删除规则

当前不提供技术文件删除能力，权限目录不登记删除权限；目录来源与发布规则见 [Identity](../../identity/docs/database.md#14-permissions)。已登记的文件及对象持续保留，不随主数据软删除、草稿取消、绑定失败或规格书替换清理，历史 SOP 继续通过生产快照定位读取。

`TechnicalFileStorage.remove` 目前只用于“对象上传成功但数据库写入失败”的补偿清理，不表示允许删除已经登记并可能被历史记录引用的业务文件。

## 安全与运维

- 技术文件最大 20 MiB，恰好上限允许，超限返回 413；上传配置使用业务上限，不额外加减字节。
- 生产 Nginx 将 API 请求体上限设为 21 MiB，仅用于容纳 20 MiB 文件与 multipart 封装开销；精确的文件上限仍由 Product 的共享常量与 Multer 校验。
- 日志不得输出访问密钥、session token、签名 URL 或文件内容。
- Bucket 备份、版本控制、保留策略和凭证轮换由部署环境负责；恢复时必须保持数据库 locator 与对象键一致。
- 更换兼容服务只调整配置和凭证，不改变业务表或 Product application port。
