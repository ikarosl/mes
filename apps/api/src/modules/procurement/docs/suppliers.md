# 供应商配置接口

所有路径以 `/api` 开头，依照[接口规范](../../../../../../docs/api-conventions.md)。一期仅保存供应商名称，无启停、删除、联系人、电话或附件 API。

| 方法与路径 | 权限 | 请求与响应 |
| --- | --- | --- |
| GET /procurement/suppliers | procurement:suppliers:view | page/pageSize/keyword → PageResult<SupplierItem> |
| GET /procurement/suppliers/options | suppliers:view、orders:view、receipts:view 任一采购权限 | keyword/includeIds → SupplierOption[] |
| POST /procurement/suppliers | procurement:suppliers:create | supplierName → SupplierItem |
| PATCH /procurement/suppliers/:id | procurement:suppliers:update | supplierName/version → SupplierItem |

`SupplierItem` 为 `id/supplierName/version/createdAt/updatedAt`，时间为 `+08:00` ISO 字符串。名称在应用边界 trim，1～100 字符，按数据库排序规则永久唯一。分页继承公共 DTO，按 `supplier_name,id` 稳定排序；keyword 对名称做包含查询，trim 后为空表示无筛选。

options 明确为远程窗口：按名称、ID 返回关键词匹配的前 50 项，并合并 `includeIds` 对应的当前有效供应商，去重后只返回 `id/supplierName`。includeIds 最多 100 个，支持逗号分隔或重复 query 参数；已删 ID 不返回。只有请求中显式 include 的 ID 在成功响应缺失时才能判不可选，不能因当前关键词窗口缺失而清除选择。供应商、采购订单、到货页均是合法消费者，any-of 分别为 `procurement:suppliers:view`、`procurement:orders:view`、`procurement:receipts:view`。

创建为普通 POST，无 Idempotency-Key。修改携原始版本，服务器不自动重试覆盖：`CONCURRENT_MODIFICATION` 为 409；名称重复为 `SUPPLIER_NAME_TAKEN`（409），不等同并发冲突；不存在或已删为 `SUPPLIER_NOT_FOUND`（404）。非法 HTTP 输入沿用 `VALIDATION_ERROR`（400），应用名称规则拒绝为 `INVALID_SUPPLIER_NAME`（400）。客户端保留编辑草稿，刷新重选后由用户重新确认，不能静默替换版本。

成功写入和操作日志同事务，失败保留平台通用失败日志；后端独立鉴权，前端页面按钮无需按细粒度权限隐藏。共享契约位于 `packages/contracts/src/procurement`，权限与稳定错误码在 `packages/constants`。

## 逐行选择供应商

简单名称配置及稳定 supplierId 继续复用。每条普通采购明细由用户手动输入检索，并明确选择 options 中的现有供应商，提交 `items[].supplierId`。同主单允许多供应商，不设主单默认值或自动批量复制。名称不存在时先在配置页创建再返回选用，不隐式创建，不把任意输入文本直接当作采购供应商。选择组件须保留每行原已选 ID，不能因其他行改变关键词或结果窗口而清除。

异常补单是明确例外：供应商继承并锁定原采购行，用户不能另选其他供应商冒充原供应商超量或质量补货。正式下单及后续办理按供应商 ID 核验资格，名称只用于展示和搜索。采购历史按稳定 ID 显示当前名称，Inventory 已确认 provider 和审计中的文本保持原值；不因改名改变采购行归属，也不新增供应商名称快照来代替 ID。相关契约与表结构见[采购订单](purchase-orders.md)和[数据库设计](database.md)。
