# Product 技术文件用途与关联

Product 拥有 SOP 与规格书的业务含义、授权、绑定规则和 SOP 版本；[Attachment](../../attachment/README.md) 统一拥有附件元数据、对象内容、回收与物理清理。对象存储配置、上传补偿、清理状态及并发边界由 [Attachment 生命周期](../../attachment/docs/lifecycle.md) 维护，Product 不另建元数据或存储实现。

## 用途与上传契约

`POST /api/product/technical-files` 保留为有业务权限的上传入口，委托 Attachment 创建对象。multipart 的 `file` 为实际文件，`fileType` 省略时为 `sop`，可显式指定 `specification`。文件名使用原始文件名，不另填业务名称或版本号；Product 为 SOP 生成北京时间版本，规格书的 `versionNo` 固定为空。每次上传创建独立附件，不按文件名或摘要覆盖旧内容。

`GET /api/product/technical-files` 省略用途时只读 SOP，按 `fileType` 精确筛选；下载使用 `/:id/content`。上传、目录与下载仍分别独立校验 `product:files:upload/view/download`，委托统一附件能力不授予主数据写入权限。业务入口的上传类型和容量由共享技术文件常量与 HTTP 校验维护，支持图片、Office、PDF、DWG 和 DXF。每个 multipart 请求仍只上传一个文件，多文件资料通过多次上传后提交完整关联集合，数量与并发规则见[规格书规则](product-rules.md#成品与精确物料版本规格书)。

工序直接上传先登记附件，再在工序保存事务内绑定；业务保存失败时不伪造绑定，也不删除已登记附件。未关联上传后续按 Attachment 的无引用附件规则处理。

## 当前引用与历史保留

所有业务绑定、解绑与主数据修改及成功审计共享同池事务；业务先锁自身根，再经 Attachment 公开能力持有附件资格锁并维护统一引用。当前展示可读取已关联附件元数据，但新增绑定必须重新核验用途、启用状态和清理生命周期。

| 业务所有者 | 统一引用 owner/slot | 保存与移除边界 |
| --- | --- | --- |
| 标准工序 | `product_process_step/default_sop` | 上传、改绑或取消默认 SOP 时同步替换当前引用 |
| 路线步骤 | `product_route_step/sop` | 草稿保存时按真实步骤 ID 更新引用；完全移除的当前草稿步骤及删除从未启用的整条草稿时解除引用；路线停用、归档保留引用 |
| 成品 | `product/specification` | 资料保存时按当前规格文件集合增减引用 |
| 精确物料版本 | `material_variant/specification` | 版本创建或保存规格文件时按集合增减引用 |

路线保存从工序及 Attachment 公开能力复制 SOP 文件名、对象键和版本；路线启用后不能原地改写。生产下达另存自己的默认／覆盖 SOP 保留引用，规则由 [Production](../../production/docs/database/execution-traceability-quality.md#batch_step_records) 维护，不依赖当前工序或路线引用持续存在。

## 删除规则

Product 不执行对象清理。规格书替换、工序解绑或草稿步骤移除只解除对应当前引用；旧附件是否可回收由 Attachment 根据统一引用判定。从未启用的草稿路线只能在未发布阶段删除，整条删除同事务解除其当前步骤引用，避免已明确丢弃的草稿永久保留对象；已发布路线只能停用或归档，仍保留冻结引用。主数据软删除和生产结束不解除需保留的历史引用。仍有当前或历史引用的附件不能进入物理清理。

历史 SOP 下载由 Production 在完成业务授权后，将冻结的文件 ID 和对象键交给 Attachment 核验并读取；不能用当前工序配置替代快照，也不能仅凭对象键读取未登记内容。数据库中的业务外键及 SOP 内容快照继续表达领域身份和冻结内容，对象保留资格以统一引用为准。
