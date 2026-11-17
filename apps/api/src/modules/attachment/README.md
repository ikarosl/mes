# Attachment

Attachment 拥有附件元数据、保留引用、对象内容访问和清理生命周期。业务模块决定谁可以上传、选择和替换附件，以及快照何时冻结；附件模块不判断成品、路线或生产任务的业务资格。

表结构见[数据库设计](docs/database.md)，引用、清理恢复与存储配置见[生命周期](docs/lifecycle.md)。Product 的上传用途、版本和绑定权限由 [Product 技术文件](../product/docs/technical-files.md)维护。

## 公开边界

跨模块仅从 [public.ts](public.ts) 导入应用服务和装配对象。`AttachmentService` 提供上传、目录、元数据、内容读取与事务内可绑定资格校验；`AttachmentReferenceService` 提供业务事务内的引用登记和当前引用替换。展示元数据包含停用、软删除和已清理记录，不能替代 `requireAvailable` 的写入资格校验。历史内容还须核验业务保存的文件 ID 和对象键，不能改读当前配置。

业务调用方先完成权限、状态、版本和业务根锁校验，再使用同池事务调用附件公开能力；附件行共享锁与清理排他锁协调绑定和删除。引用不是业务状态或对象存在性的替代来源，支持范围及不可解除边界见[生命周期](docs/lifecycle.md#引用与业务协作)。

## 管理端接口与权限

管理资源为 `/api/attachments`，请求与响应结构以 [attachment 契约](../../../../../packages/contracts/src/attachment.ts)和 [DTO](presentation/http/dto/attachment.dto.ts)为准。

| 资源／动作 | 独立后端权限 |
| --- | --- |
| `GET /attachments`、`GET /attachments/:id/references` | `system:attachments:view` |
| `GET /attachments/:id/content` | `system:attachments:download` |
| `POST /attachments/:id/trash`、`POST /attachments/:id/purge` | `system:attachments:manage` |

目录按文件名、原始名称或用途版本搜索，按文件用途、引用状态和生命周期精确筛选；省略生命周期时包括全部记录。上传人及引用登记人的当前显示名通过 Identity 公开历史查询批量解析，不过滤已停用或软删除人员。

管理下载允许尚未进入清理流程的回收站文件；清理中、失败及完成状态均禁止内容读取。`canTrash/canPurge/canDownload` 是当前服务端展示判断，写请求仍须核验版本和实时引用。清理失败也返回已持久化的结果，调用方按 `cleanupStatus` 展示逐项成功或失败；批量界面逐项顺序调用，不承诺批量原子性。

附件清理包含外部对象操作，不接入 HTTP 幂等外层事务。文件上传仍由业务 HTTP 入口提供，管理页面不开放任意业务 owner／slot 的绑定接口。
