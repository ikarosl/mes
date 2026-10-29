# 表格模板与公开契约

Template 唯一拥有模板名称、表格内容、启停状态及编辑并发版本。模板在系统管理页统一维护，与业务模块独立；新增业务消费者仍须确认产品范围及业务资料所有权。模板不建立项目实体、项目数据隔离、动态脚本或通用表单引擎。

## 内容与复制边界

模板 `content` 使用共享 `JsonTableData`，内部只有 `columns` 和 `rows`；完整字段规则、上限及规范化行为由 [utils JSON 表格](../../../../../../packages/utils/README.md#json-表格)维护。模板至少需要一列，行数据允许为空。列只定义 key、展示名及顺序，单元格保存文本；Template 按同一通用格式校验全部模板。

应用模板将完整表格复制到业务表单草稿，后续保存由业务模块按原接口执行权限、状态和并发校验，并保存独立的 `JsonTableData`。模板与业务资料之间不保存引用；模板改名、修改或停用均不联动已经复制的草稿或已保存资料。Template 不访问消费者业务表，也不注册业务场景或业务权限。

## 名称、启停与并发

稳定身份是 `id`；名称是可编辑的展示名，trim 后非空，最多 100 个字符。当前名称在系统内唯一，包含软删除记录，采用数据库排序规则；改名不保留旧名称占用。状态只有 `enabled` 和 `disabled`。停用保留内容和历史，模板选择只请求启用项；管理读取可以包含停用项。当前不开放删除命令，软删除列按[数据库公共约定](../../../../../../docs/database-conventions.md)保留。

模板的 `version` 只用于自身并发更新，每次名称、内容或状态修改均递增；它不构成业务发布版本或历史业务快照。列表与编辑草稿分别持有状态，读取失败不能成为可保存的空模板；并发冲突保留草稿，重新加载须明确放弃当前输入。

## HTTP 资源

路径前缀 `/api/templates`；分页、ID、时间及错误结构沿用[公共 HTTP 规范](../../../../../../docs/api-conventions.md)。

| 接口 | 输入与结果 | 授权 |
| --- | --- | --- |
| `GET /templates` | `status` 精确筛选，`keyword` trim 后按模板名称做字面子串搜索；`page/pageSize`；返回 `PageResult<BusinessTemplateItem>`，按名称、ID 稳定排序 | `system:templates:view` |
| `GET /templates/:id` | 返回未软删除模板，含内容、状态及版本 | `system:templates:view` |
| `POST /templates` | `{ name,content,status }`；返回创建的完整模板，版本从 0 开始 | `system:templates:create` |
| `PATCH /templates/:id` | `{ version,name?,content?,status? }`，至少提供一个修改字段；返回修改后的完整模板 | `system:templates:update` |

列表不传 `status` 时包含启用和停用项，不全量下载后分页。非法内容返回 `400 VALIDATION_ERROR`；无权限返回 `403 FORBIDDEN`；无记录返回 `404 NOT_FOUND`；重名返回 `409 CONFLICT`。修改锁定当前模板，再以 `id + version + is_deleted=0` 原子更新并递增版本，旧版本返回 `409 CONCURRENT_MODIFICATION`。核心写入和包含前后值的成功审计同事务提交；本模块未接入 HTTP 幂等，沿用全局未启用端点的请求头规则。

每个后端接口独立声明权限；产品或其他业务页面的读写权限不授予模板操作。权限目录属于 [Identity](../../identity/docs/database.md#14-permissions)，通过版本化 migration 发布，不自动给已有业务角色补授。
