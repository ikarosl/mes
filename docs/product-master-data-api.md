# 产品资料模块接口与流程对接说明

## 1. 范围

本次仅对接管理端 `views/product` 下的产品分类、产品/BOM、标准工序和工艺路线四个页面。数据库设计以 `docs/database/README.md` 及其领域章节为唯一基准，业务约束对应 `docs/业务完整工作流.md` 的“基础资料准备”流程，不实现入库、工单、生产批次、需求、分配、出库或质量模块。

## 2. 页面、路由与页面权限

| 页面     | 稳定路由名               | 路径                      | 页面权限                  |
| -------- | ------------------------ | ------------------------- | ------------------------- |
| 产品管理 | `product-products`       | `/product/products`       | `product:products:view`   |
| 产品分类 | `product-categories`     | `/product/categories`     | `product:categories:view` |
| 标准工序 | `product-processes`      | `/product/processes`      | `product:processes:view`  |
| 工艺路线 | `product-process-routes` | `/product/process-routes` | `product:routes:view`     |

前端统一使用表中的页面权限控制菜单、路由和整页入口，不对页面内操作按钮做细粒度权限隐藏。写接口权限编码集中定义在 `@company/constants`，并由后端 `RequirePermission` 对每个接口独立校验。关键写权限包括 `product:bom-versions:edit-draft`、`product:bom-versions:publish`、`product:products:set-default-route`、`product:processes:upload-sop` 和 `product:routes:manage-steps`。

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
| `GET /categories/options`              | 分类表单选项（最小字段，仅启用）                             | `product:products:view` 或 `product:categories:view`                                                |
| `POST /categories`                     | 新增分类                                                     | `product:categories:create`                                                                         |
| `PATCH /categories/:id`                | 编辑分类                                                     | `product:categories:update`                                                                         |
| `PATCH /categories/:id/status`         | 启停分类                                                     | `product:categories:change-status`                                                                  |
| `GET /products`                        | 产品、物料和半成品统一列表                                   | `product:products:view`                                                                             |
| `GET /products/options`                | 产品、物料和半成品选项（最小字段，仅启用）                   | `product:products:view`、`product:routes:view`、`production:orders:view` 或 `production:tasks:view` |
| `POST /products`                       | 新增统一库存对象                                             | `product:products:create`                                                                           |
| `PATCH /products/:id`                  | 编辑基础资料                                                 | `product:products:update`                                                                           |
| `PATCH /products/:id/status`           | 启停基础资料                                                 | `product:products:change-status`                                                                    |
| `GET /products/:id/materials`          | 查询统一 BOM                                                 | `product:products:view`                                                                             |
| `GET /products/:id/bom-versions`       | 查询产品全部 BOM 版本                                        | `product:bom-versions:view`                                                                         |
| `POST /products/:id/bom-version-drafts` | 为产品创建唯一草稿 BOM                                      | `product:bom-versions:edit-draft`                                                                   |
| `GET /bom-versions/:id`                | 查询 BOM 版本头及不可变行明细                                | `product:bom-versions:view`                                                                         |
| `POST /bom-versions/:id/draft`         | 从已发布或历史版本复制为唯一草稿                             | `product:bom-versions:edit-draft`                                                                   |
| `PUT /bom-versions/:id/lines`          | 原子替换草稿 BOM 行                                          | `product:bom-versions:edit-draft`                                                                   |
| `POST /bom-versions/:id/publish`       | 发布草稿并原子切换产品当前 BOM                               | `product:bom-versions:publish`                                                                      |
| `DELETE /bom-versions/:id`             | 删除未发布草稿                                               | `product:bom-versions:edit-draft`                                                                   |
| `PATCH /products/:id/default-route`    | 设置同产品已启用的默认路线                                   | `product:products:set-default-route`                                                                |
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
| `GET /process-routes/:id/steps`        | 路线步骤与 BOM 关联                                          | `product:routes:view`                                                                               |
| `PUT /process-routes/:id/steps`        | 保存步骤顺序、SOP/规则快照及 BOM 关联                        | `product:routes:manage-steps`                                                                       |

### 跨模块 /options 契约（不属于 `/api/product`）

上表接口统一位于 `/api/product`。任务表单弹窗除消费上表的产品类 options 外，还消费一个生产域工单候选，
该端点不在 `/api/product` 前缀下，完整路径与授权如下：

| 方法  | 完整路径                              | 用途                                                                                                   | 权限                    |
| ----- | ------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------- |
| `GET` | `/api/production/work-orders/options` | 任务表单已下达工单候选（完整返回全部 `released` 且仍有余量，前端本地过滤，最小字段 `WorkOrderOption`） | `production:tasks:view` |

该端点位于生产模块（`apps/api/src/modules/production`），唯一消费方是生产任务页的任务表单弹窗；因其同时
依赖上表的产品类 options，故在本文档汇总列出。实际前缀为 `/api/production/...`，与上表 `/api/product/...`
不冲突，前端以 `skipErrorHandling` best-effort 读取。

`GET /products`、`GET /process-routes`、`GET /categories` 和 `GET /process-steps` 使用通用 `PageResult<T>` 响应。产品列表支持 `page`、`pageSize`、`keyword`、`categoryId`、`acquireMethod` 和 `status`；路线列表支持 `page`、`pageSize`、`keyword` 和 `status`；分类列表支持 `page`、`pageSize`、`categoryCode`、`categoryName` 和 `status`；工序列表支持 `page`、`pageSize`、`keyword` 和 `status`。表单选择统一使用独立 `/options` 接口（最小字段、默认排除停用和删除记录），不承担正式列表分页。

## 4. 工作流不变量

1. 分类仅使用 `item_kind = material | semi_finished | finished_product`；分类说明“是什么”，`acquire_method` 说明“如何获得”。
2. 物料、半成品和成品统一写入 `products`，业务编码只使用永久唯一的 `item_code`。
3. 只有已启用的自制半成品或成品可以配置 `product_materials`、工艺路线和默认路线；采购物料不能配置生产工艺。
4. 新 BOM 只允许自制成品配置，投入对象只能是已启用的 `material`，不能引用产品自身；同一产品最多一个草稿。发布后版本头与行永久只读，后续修订必须复制为新草稿。
5. 发布必须填写变更原因并显式确认新版成品与旧版成品在规格、质量标准、用途和库存混用上兼容；不能确认时必须创建新的迭代产品。发布、旧版本替代、`products.current_bom_version_id` 切换和成功审计同事务完成。
6. 路线创建时固定为 `draft`。只有草稿可以编辑路线内容与步骤；首次启用后，即使后来停用也不可原地修改，调整必须新建版本。
7. 启用路线前必须至少包含一个启用步骤。保存步骤时后端从 `process_steps` 和 `technical_files` 复制工序与 SOP 快照；路线对 BOM 版本的设计依据与兼容性将在独立阶段接入。
8. 默认路线必须属于同一产品且状态为 `enabled`。将来生产批次仍可选择同产品的其他已启用路线。
9. 所有产品资料写操作和 `operation_logs` 在同一数据库事务中提交；审计信息不记录文件内容、Token、Cookie 或其他密钥。

## 5. 数据库与文件存储

追加迁移 `202607230001-product-master-data` 创建数据库领域章节已定义的以下表：

- `technical_files`
- `product_categories`
- `products`
- `product_materials`
- `process_steps`
- `process_routes`
- `process_route_steps`
- `route_step_materials`

迁移未创建 `item_type`、`item_info`、`product_bom`、`processes` 或其他重复模型。所有主数据使用统一审计字段和永久自然键，删除仅为软删除；纯路线步骤/BOM 关联按规范使用物理替换。

SOP 文件元数据写入 `technical_files`，内容统一通过 S3 协议存储端口访问；本地开发连接 AIStor/MinIO，正式环境可以连接兼容 S3 的对象存储。数据库统一写入 `storage_provider='s3'`，只保存 Bucket、稳定对象键和元数据，不保存临时 URL。完整配置及迁移约束见 `docs/technical-file-storage.md`。

## 6. design.md 符合性

四个页面保留稳定组件名和路由名，继续使用“标题 + 筛选 + 工具栏 + 表格 + 分页”结构；新增/编辑、BOM、步骤和默认路线均使用 Modal；启停、删除与路线启用冻结使用二次确认；写操作使用统一 `EMessage` 反馈；表格加载和提交按钮都有加载态。
