# Product

负责成品与物料共用的分类、成品、基础物料、物料精确版本、BOM、标准工序、工艺路线和技术文件。分类树保存于 `item_categories`，由 `item_kind` 区分物料与成品；公开分类接口仍属于 Product 模块。

## 范围与边界

- 负责：产品主数据及其冻结快照；不负责生产执行、库存事实或质量判定。
- 数据所有权：产品、BOM、工序、路线和技术文件元数据。
- 公开入口：[`public.ts`](public.ts)；跨模块只使用稳定查询契约。

成品与基础物料分别存储，工艺路线独立维护。管理端通过“成品与物料”页维护两类主数据；Production 通过 Product 公开能力读取生产快照和物料版本；当前物料名称展示允许按已登记的专用查询规则读取。

## 当前能力与不变量

产品编码和基础单位表达不可复用的稳定身份；BOM 最后一级审批通过后永久锁定，审批中冻结编辑。创建任务时冻结路线、工序与 SOP 快照。公开契约不得暴露数据库行、连接、SDK 类型或内部 domain 错误。

`ProductBomApprovalHandler` 负责声明 BOM 受审快照的结构版本，并通过 `readSnapshotForDisplay()` 校验历史证据、按物料 ID 补充当前名称。Approval 通用提交调用其准备、绑定及终态方法；冻结版本取绑定返回值。BOM 资格和永久锁定规则仍由 Product 实现，不进入审批通用配置仓储。

BOM 审批证据仅接受当前结构版本 2；开发环境通过数据重置切换，不保留版本 1 兼容读取或补造缺失字段。

BOM 明细仅配置基础物料、单位用量、单位、状态和备注，不再配置关键物料或是否记录批次开关；生产侧仍按精确物料版本和库存批次追溯。

详细技术文件规则见 [technical-files.md](docs/technical-files.md)；业务表规则见[数据库设计](docs/database.md)。

`MaterialVariantQuery` 明确区分用途：`listEnabledByMaterials` 返回版本、基础物料及分类均启用且未删除的
完整候选，也是 `/material-variants/by-material/:materialId` 的查询入口；`listDisplayReferencesByIds` 只按
既有版本 ID 返回 `MaterialVariantDisplayReference`（ID 与编码），允许停用或软删除，仅供历史单据展示。
历史引用不能用于新版本选择或写操作校验，基础物料及分类停用、软删除不影响既有版本编码解析。

## 验证

`corepack pnpm --filter @company/api typecheck` 及 `src/modules/product/__tests__` 相邻测试。

## 1. 管理端与接口范围

管理端 `views/product` 提供分类配置、成品与物料、标准工序和工艺路线四个页面。Product 不实现入库、工单、生产批次、需求、分配、出库或质量能力。

## 2. 页面、路由与页面权限

| 页面       | 稳定路由名               | 路径                      | 页面权限                  |
| ---------- | ------------------------ | ------------------------- | ------------------------- |
| 成品与物料 | `product-products`       | `/product/products`       | `product:products:view`   |
| 分类配置   | `product-categories`     | `/product/categories`     | `product:categories:view` |
| 标准工序   | `product-processes`      | `/product/processes`      | `product:processes:view`  |
| 工艺路线   | `product-process-routes` | `/product/process-routes` | `product:routes:view`     |

历史路径 `/product/material-variants` 重定向到 `/product/products?tab=materials`，不再提供独立物料版本页面。

前端统一使用表中的页面权限控制菜单、路由和整页入口，不对页面内操作按钮做细粒度权限隐藏。写接口权限编码集中定义在 `@company/constants`，并由后端 `RequirePermission` 对每个接口独立校验。关键写权限包括 `product:products:manage-bom`、`product:products:set-default-route`、`product:processes:upload-sop` 和 `product:routes:manage-steps`。

## 3. HTTP 接口

接口统一位于 `/api/product`，除有效 Access Token 外还需要下表权限。

> `/options` 端点采用跨页面授权契约（any-of）：授权集是全部消费页面的视图权限并集。例如
> `/categories/options` 同时服务产品页（`product:products:view`）与分类页（`product:categories:view`），
> 任一权限即可读取，避免只拥有单个页面权限的角色被 403。生产工单页（`production:orders:view`）与
> 生产任务页（`production:tasks:view`）会消费 `products/options`、`process-routes/options` 和
> `users/options`，对应授权集须并入这两个视图权限。生产任务页任务表单弹窗额外消费的生产域工单候选
> 见下表后的「跨模块 /options 契约」。前端把选项请求视为 best-effort
> （`skipErrorHandling`），单个选项失败只影响该项下拉，不触发全局 403 跳转。

| 方法与路径                             | 用途                                                         | 权限                                                                                                |
| -------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `GET /categories`                      | 分页查询分类列表                                             | `product:categories:view`                                                                           |
| `GET /categories/options`              | 分类表单选项（最小字段，仅启用）                             | `product:products:view`、`product:materials:view` 或 `product:categories:view`                       |
| `POST /categories`                     | 新增分类                                                     | `product:categories:create`                                                                         |
| `PATCH /categories/:id`                | 编辑分类                                                     | `product:categories:update`                                                                         |
| `PATCH /categories/:id/status`         | 启停分类                                                     | `product:categories:change-status`                                                                  |
| `GET /product-groups`                  | 按名称和分类聚合成品，返回组内全部编码                       | `product:products:view`                                                                             |
| `GET /products`                        | 成品编码分页列表                                             | `product:products:view`                                                                             |
| `GET /products/options`                | 已启用成品编码选项                                           | `product:products:view`、`product:routes:view`、`production:orders:view` 或 `production:tasks:view` |
| `GET /materials`                       | 基础物料及其版本分页列表                                     | `product:products:view` 或 `product:materials:view`                                                  |
| `GET /materials/options`               | 已启用基础物料选项                                           | `product:products:view`、`product:materials:view`、`product:material-variants:view`、`production:materials:view`、`production:material-demands:view` 或 `production:inbounds:view` |
| `POST /materials`                      | 新增基础物料                                                 | `product:materials:create`                                                                          |
| `PATCH /materials/:id`                 | 编辑基础物料                                                 | `product:materials:update`                                                                          |
| `PATCH /materials/:id/status`          | 启停基础物料                                                 | `product:materials:change-status`                                                                   |
| `GET /material-variants`               | 物料精确版本分页列表                                         | `product:material-variants:view`                                                                    |
| `GET /material-variants/by-material/:materialId` | 指定基础物料的启用版本候选（历史事实不在此查询） | `product:material-variants:view`、`product:products:view`、`production:materials:view`、`production:material-demands:view` 或 `production:inbounds:view` |
| `POST /material-variants`              | 新增物料精确版本                                             | `product:material-variants:create`                                                                  |
| `PATCH /material-variants/:id/status`  | 启停物料精确版本                                             | `product:material-variants:change-status`                                                          |
| `POST /products`                       | 新增成品编码                                                 | `product:products:create`                                                                           |
| `PATCH /products/:id`                  | 编辑成品编码资料                                             | `product:products:update`                                                                           |
| `PATCH /products/:id/status`           | 启停成品编码                                                 | `product:products:change-status`                                                                    |
| `GET /products/:id/materials`          | 查询成品 BOM                                                 | `product:products:view`                                                                             |
| `PUT /products/:id/materials`          | 事务替换成品 BOM                                             | `product:products:manage-bom`                                                                       |
| `PATCH /products/:id/default-route`    | 设置任意已启用路线为默认路线                                 | `product:products:set-default-route`                                                                |
| `GET /process-steps`                   | 分页查询标准工序列表                                         | `product:processes:view`                                                                            |
| `GET /process-steps/options`           | 标准工序选项（最小字段，仅启用）                             | `product:processes:view` 或 `product:routes:view`                                                   |
| `POST /process-steps`                  | 新增标准工序                                                 | `product:processes:create`                                                                          |
| `PATCH /process-steps/:id`             | 编辑标准工序                                                 | `product:processes:update`                                                                          |
| `PATCH /process-steps/:id/status`      | 启停标准工序                                                 | `product:processes:change-status`                                                                   |
| `POST /process-steps/:id/sop`          | 上传并关联默认 SOP，最大 20 MiB                              | `product:processes:upload-sop`                                                                      |
| `GET /technical-files`                 | 分页查询 SOP 技术文件                                        | `product:files:view`                                                                                |
| `POST /technical-files`                | 独立上传 SOP，最大 20 MiB                                    | `product:files:upload`                                                                              |
| `GET /technical-files/:id/content`     | 鉴权后流式下载私有文件                                       | `product:files:download`                                                                            |

技术文件删除接口当前不开放。生产模块已经提供基于 `batch_step_records` 冻结对象定位快照的管理端与员工本人 SOP 下载；未来恢复删除能力时仍只能软删除元数据并保留对象存储内容，同时校验工序和有效工艺路线的当前引用。
| `PATCH /process-steps/:id/default-sop` | 关联、替换或解除默认 SOP                                     | `product:files:attach`                                                                              |
| `GET /process-routes`                  | 工艺路线版本列表                                             | `product:routes:view`                                                                               |
| `GET /process-routes/options`          | 已启用路线选项（最小字段）                                   | `product:products:view`、`product:routes:view`、`production:orders:view` 或 `production:tasks:view` |
| `GET /users/options`                   | 用户选项（最小字段，仅启用）                                 | `product:routes:view`、`production:orders:view` 或 `production:tasks:view`                          |
| `POST /process-routes`                 | 新建草稿路线版本                                             | `product:routes:create`                                                                             |
| `PATCH /process-routes/:id`            | 编辑草稿路线                                                 | `product:routes:update`                                                                             |
| `PATCH /process-routes/:id/status`     | 路线状态流转                                                 | `product:routes:change-status`                                                                      |
| `DELETE /process-routes/:id`           | 软删除从未启用的草稿路线                                     | `product:routes:delete`                                                                             |
| `GET /process-routes/:id/steps`        | 路线步骤、SOP 与规则快照                                     | `product:routes:view`                                                                               |
| `PUT /process-routes/:id/steps`        | 保存步骤顺序、SOP/规则快照                                   | `product:routes:manage-steps`                                                                       |

### 跨模块 /options 契约（不属于 `/api/product`）

上表接口统一位于 `/api/product`。任务表单弹窗除消费上表的产品类 options 外，还消费一个生产域工单候选，
该端点不在 `/api/product` 前缀下，完整路径与授权如下：

| 方法  | 完整路径                              | 用途                                                                                                   | 权限                    |
| ----- | ------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------- |
| `GET` | `/api/production/work-orders/options` | 任务表单已下达工单候选（完整返回全部 `released` 且仍有余量，前端本地过滤，最小字段 `WorkOrderOption`） | `production:tasks:view` |

该端点位于生产模块（`apps/api/src/modules/production`），唯一消费方是生产任务页的任务表单弹窗；因其同时
依赖上表的产品类 options，故在本文档汇总列出。实际前缀为 `/api/production/...`，与上表 `/api/product/...`
不冲突，前端以 `skipErrorHandling` best-effort 读取。

`GET /product-groups`、`GET /materials`、`GET /process-routes`、`GET /categories` 和 `GET /process-steps` 使用通用 `PageResult<T>` 响应。成品组、物料和路线列表支持关键字、状态及各自业务筛选；表单选择统一使用独立 `/options` 接口，默认排除停用和删除记录。

`PUT /products/:id/materials` 的请求体为 `{ version, items }`，不是裸数组。`version` 必填，使用成品列表返回的聚合版本；DTO 校验非负整数，Product 在同一事务锁成品根后核对版本，再替换明细、递增版本并写成功审计。旧版本返回 `409 CONFLICT`，缺失或非法版本返回 `400 VALIDATION_ERROR`。保存成功后重新读取成品版本，再用新版本提交 BOM 审批；未保存的本地修改不能直接送审。

## 4. 工作流不变量

1. 分类仅使用 `item_kind = material | finished_product`；分类说明“是什么”，`acquire_method` 说明“如何获得”。半成品不再是独立产品类型。
2. 成品写入 `products`（`item_code`），基础物料写入 `materials`（`material_code`），编码在各自表内永久唯一；编码和基础单位创建后不可修改，原则变化必须新建产品和编码。
3. 只有已启用的自制成品可以配置 `product_materials` 和默认路线；采购物料不能配置生产工艺。
4. BOM 投入对象只能是已启用的基础物料；BOM 是 Production 生成需求基础的唯一来源。本模块只维护 BOM，不生成需求，也不回写任何历史需求。
5. `material_variants` 是物料库存的精确身份。版本编码由服务端按基础物料编码和版本号生成，创建后不可改；启用版本由 Production 在写入需求、入库或补料时要求管理员明确选择。
6. 工艺路线只表达工序顺序、负责人、SOP 与规则快照，不绑定产品或 BOM 行；物料需求统一按批次冻结的完整 BOM 基础配置。
7. 路线创建时固定为 `draft`。只有草稿可以编辑路线内容与步骤；首次启用后，即使后来停用也不可原地修改，调整必须新建版本。
8. 启用路线前必须至少包含一个启用步骤。保存步骤时后端从 `process_steps` 和 `technical_files` 复制工序与 SOP 快照。
9. 默认路线必须为 `enabled` 且未删除；生产任务带出产品默认路线，并允许改选其他已启用路线。
10. 所有产品资料写操作和 `operation_logs` 在同一数据库事务中提交；审计信息不记录文件内容、Token、Cookie 或其他密钥。

## 5. 数据库与文件存储

Product 所有业务表、字段与约束由[数据库设计](docs/database.md)维护；migration 统一登记在 `packages/database/migrations`，不改变业务所有权。SOP 元数据写入 `technical_files`，对象内容通过 Product 的存储端口访问，完整配置和补偿边界见[技术文件专题](docs/technical-files.md)。

## 6. 管理端视觉符合性

“成品与物料”页在一个稳定路由内切换两类数据。成品按名称和分类形成父行，展开显示全部成品编码、BOM 和默认路线操作，“新增编码”位于父行；物料父行展开显示具体版本，“新增版本”位于父行。其余页面继续使用筛选、工具栏、表格和分页结构；写操作使用 Modal、二次确认、统一消息反馈和加载态。

所有路线的所有工序均须报工，不提供报工开关；路线步骤契约和表结构不保存是否报工字段。

分类 `itemKind` 创建后不可修改；修改请求必须与原类型一致，更新 SQL 不写该字段。成品分组和组内编码关联均以数据库名称比较规则为准。
