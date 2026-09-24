# Product 业务规则与公开资格

本文维护 Product 的命令边界、用途资格、BOM 审批和路线发布规则。表字段见[数据库设计](database.md)，文件生命周期见[技术文件](technical-files.md)。页面布局和接口逐项清单不在本章重复维护；HTTP 入口及权限以 `presentation/http`、共享契约和权限常量定位。

## 稳定身份与工作流

1. 分类仅使用 `item_kind = material | finished_product`；分类说明“是什么”，`acquire_method` 说明“如何获得”。半成品不再是独立产品类型。
2. 成品写入 `products`（`item_code`），基础物料写入 `materials`（`material_code`），编码在各自表内永久唯一；编码和基础单位创建后不可修改，原则变化必须新建产品和编码。
3. 只有已启用的自制成品可以配置 `product_materials` 和默认路线；采购物料不能配置生产工艺。
4. BOM 投入对象只能是已启用的基础物料；BOM 是 Production 批量任务生成需求基础的唯一来源；研发手工需求不依赖 BOM。本模块只维护 BOM，不生成需求，也不回写任何历史需求。
5. `material_variants` 是物料库存的精确身份。版本编码由服务端按基础物料编码和版本号生成，创建后不可改；Production 的新需求、补料和生产出库使用启用版本，采购及对应入库允许停用但未删除的版本，基础物料和分类仍须有效。
6. 工艺路线只表达工序顺序、负责人、SOP 与规则快照，不绑定产品或 BOM 行；批量物料需求按本任务完整 BOM 基础配置并锁版，研发直接手工提需。
7. 路线创建时固定为 `draft`。只有草稿可以编辑路线内容与步骤；首次启用后，即使后来停用也不可原地修改，调整必须新建版本。
8. 启用路线前必须至少包含一个启用步骤。保存步骤时后端从 `process_steps` 和 `technical_files` 复制工序与 SOP 快照。
9. 默认路线必须为 `enabled` 且未删除；生产任务带出产品默认路线，并允许改选其他已启用路线。
10. 所有产品资料写操作和 `operation_logs` 在同一数据库事务中提交；审计信息不记录文件内容、Token、Cookie 或其他密钥。


分类 `itemKind` 创建后不可修改；修改请求须与原类型一致，更新 SQL 不写该字段。成品分组和组成员关联使用数据库名称比较规则，不以 JavaScript 字符串相等重新分组。

所有路线的所有工序均须报工，不提供报工开关；路线步骤契约和表结构不保存是否报工字段。

## BOM 命令与审批

`ProductBomApprovalHandler` 负责声明 BOM 受审快照的结构版本，并通过 `readSnapshotForDisplay()` 校验历史证据、按物料 ID 补充当前名称。Approval 通用提交调用其准备、绑定及终态方法；冻结版本取绑定返回值。BOM 资格和永久锁定规则仍由 Product 实现，不进入审批通用配置仓储。

BOM 审批证据仅接受当前结构版本 2；开发环境通过数据重置切换，不保留版本 1 兼容读取或补造缺失字段。

`PUT /products/:id/materials` 的请求体为 `{ version, items }`，不是裸数组。`version` 必填，使用成品列表返回的聚合版本；DTO 校验非负整数，Product 在同一事务锁成品根后核对版本，再替换明细、递增版本并写成功审计。旧版本返回 `409 CONFLICT`，缺失或非法版本返回 `400 VALIDATION_ERROR`。保存成功后重新读取成品版本，再用新版本提交 BOM 审批；未保存的本地修改不能直接送审。


`ProductSnapshotQuery.getApprovedBomSnapshot` 在活动事务内锁定成品并复核批准依据，为 Production 批量任务初始需求提供不依赖路线的 BOM 快照；它不写审批或锁定事实，也不改变基础物料与精确版本身份。

## 候选、历史展示与写入资格

`MaterialVariantQuery` 明确区分用途：`listEnabledByMaterials` 返回版本、基础物料及分类均启用且未删除的
完整候选，也是 `/material-variants/by-material/:materialId` 的查询入口；`listDisplayReferencesByIds` 只按
既有版本 ID 返回 `MaterialVariantDisplayReference`（ID 与编码），允许停用或软删除，仅供历史单据展示。
历史引用不能用于新版本选择或写操作校验，基础物料及分类停用、软删除不影响既有版本编码解析。

`ProductInventoryEligibility` 为库存命令提供事务内用途校验：
`requirePurchasableReferences` 允许停用的精确版本，仍要求基础物料和分类启用且未删除、版本未删除；
`requireProductionIssuableReferences` 另外要求版本启用。`lockHistoricalReferences` 只锁定历史身份，
不因停用或软删除阻断退料、盘点和既有成品事实。所有方法返回稳定 `ProductQueryResult`，
须在同池事务中调用，并在库存批次锁之前按 ID 顺序取得 Product 父身份共享锁。


采购候选通过 `listPurchasableMaterials/listPurchasableByMaterials` 读取：基础物料、分类须启用且未删除，精确版本未删除，允许版本停用。物料关键词窗口为 50 项，最多 100 个 `includeIds` 用于已选回显；候选不持有业务资格锁，写命令须重新调用用途门禁。

生产用途 `listProductionMaterials` 使用相同的 50 项窗口和最多 100 个 `includeIds`，要求存在启用版本；研发手工提需由 Production 候选入口消费。窗口未包含某个 ID 不代表该 ID 已失效，不能以当前列表代替显式解析或命令校验。

## 候选接口授权

`/options` 采用所有合法消费页面视图权限的 any-of 并集，不能仅授予配置页面。例如分类候选服务产品与分类页；成品、路线和用户候选也服务生产工单与任务页。跨模块候选仍由其所有者维护，Product 不记录 Production 接口清单。

候选响应只包含选择所需最小字段；状态、关键词和业务筛选在服务端处理。生产新选版与采购用途候选不能混用，历史展示引用更不能作为写入资格。页面局部读取失败遵守[管理端错误处理](../../../../../admin-web/docs/http-error-handling.md)，不借候选 403 触发整页全局跳转。
