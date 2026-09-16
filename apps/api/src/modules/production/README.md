# Production

负责生产工单、批次、工序执行、报工追溯、异常返工、报废补料，以及与生产直接相关的需求、分配、领料出库、窄入库、退料和现有库存盘点链路。

## 范围与边界

- 负责：上述已落地的生产闭环。
- 不负责：通用库存其他出入库/库存报废、Quality 和全链路 Traceability。
- 数据所有权：生产工单、批次、执行事实、生产需求和生产侧单据。
- 公开入口：[`public.ts`](public.ts)；Product 业务校验通过其 `public.ts`；当前物料名称展示允许按架构登记规则从专用查询目录只读获取。

工单类型与工单级物料版本锁的目标 schema 见[工单设计](docs/database/work-orders-and-batches.md)，应用入口适配见[roadmap](../../../../../docs/roadmap.md)。

成品入库前的代码组织见[内部职责与扩展边界](docs/module-boundaries.md)：先划清计划、执行、需求履约、结案产出、仓库操作及查询职责，保留单一 Production 所有权与原子事务；模块装配按职责分组，未拆出 Inventory／Quality。

## 关键不变量

损耗、退料和盘点分别由 `ProductionMaterialLossRepository`、`ProductionReturnRepository`、
`ProductionStockCheckRepository` 三个窄端口及对应 MySQL Adapter 所有，分别由同名
MaterialLoss、Return、StockCheck Service／Controller 提供独立用例入口；HTTP 路径不变。
每个命令在所属 Adapter 内保留完整事务。共享持久化辅助只处理锁定、编号、分页与
审计映射，不持有业务状态，不新增账本写入所有者；损耗补料继续通过统一需求计划 Writer，退料和盘点的
库存流水与单据、成功审计同事务提交。

物料分配由 `ProductionMaterialService`／`ProductionMaterialRepository` 所有；领料出库由
`ProductionMaterialOutboundService`／`ProductionMaterialOutboundRepository` 所有。确认出库的
需求扣减、库存记账、批次状态、短批授权、补料齐套与补产放行仍在出库 Adapter 的同一事务内完成。
共享物料持久化辅助仅承载锁定与齐套查询；收尾及产出后续通过独立用例扩展，不把它们加入仓库聚合服务。

生产任务创建在事务内通过 Product 校验 BOM 已批准并锁定；库存事实来自 `inventory_transaction`，需求事实来自
`production_item_demand`；可变单据使用 `version` 乐观锁，不可变执行事实不得更新。生产批次创建时
只冻结 Product BOM 快照，不自动生成可执行需求；管理员必须一次完整配置全部 BOM 行，明确选择启用的
精确 `material_variant_id` 和数量，整单确认后批次才进入 `material_pending`。人工追加以任务为单位，
一次可包含冻结 BOM 中的多种基础物料和多个版本，不依赖既有父需求；需求查询保留 normal、manual、
补料等全部已生成需求及取消、关闭与替代历史，停用版本仍从需求/物流快照展示。
人工追加、报废补料和损耗补料共用后续领料资格：已领料和执行中批次仍可分配、释放未出库分配、
制单及确认出库；人工追加仅保留追加记录和需求，不生成损耗单、补料单或产品补产授权。
未满足的活动追加需求继续阻断完工，执行中的物流履约不回退批次状态。

所有新增需求、补料、入库等命令均通过 `IdempotencyExecutor`；涉及新版本选择的写事务在事务内锁定
并重新校验 Product 公共 BOM/启用版本。路线只表达执行顺序，不再提供 route-step BOM 绑定或按工序
自动生成物料需求。

详细流程见 [business-workflow.md](docs/business-workflow.md)，数据库设计见[数据库索引](docs/database/README.md)，范围边界见[全局产品范围](../../../../../docs/product-scope.md)。

## 提前结束与结案核对

生产任务通过“开始收尾 → 逐项处理 → 保存实际产出 → 提交短产／提前结束审批 → 末级批准”结束批次。`closing` 停止生产执行，未完成工序显式进入 `terminated`，报工事实保留；审批不触发补料、补产或库存变化。所有批次终态后可关闭旧工单，工单聚合最终产出和未审定收尾量。状态、API、权限和物料处理规则见[批次结束设计](docs/database/production-termination.md)。实际成品入库仍待后续接入。

任务页入口分别为“提前结束”“继续收尾”“查看结案信息”：首次进入需填写原因并确认开始收尾，最后一项只读核对结果。它们是阶段操作名称，不新增或修改数据库状态。

## 需求纠错与审批

人工追加及未齐套工序报废补料可提交数量更正，采用“关闭旧剩余、创建替代需求”。`pending_correction_id` 仅冻结旧需求操作，保留活动履约与缺口；`replaces_demand_id` 保存永久替代链，原来源和数量不回改。更正审批与出库确认共用有效需求齐套判断，原补料单和补产授权继续沿用。Production 注册 `production.demand.correct`、`production.batch.closeout` 两个场景，复用 Approval 公开 handler 与通用引擎，未配置已发布流程时拒绝提交。数据与接口见[需求设计](docs/database/demand-allocation-and-outbound.md#正式需求更正与替代)。

## 验证

`corepack pnpm --filter @company/api typecheck` 及 `apps/api` 相邻单元/契约测试。

### 当前物料名称

库存、入出库、需求、补料、退料、损耗、盘点及追溯返回的物料 `itemName` / `materialName` 使用当前 `materials.material_name`；名称搜索和排序遵循相同口径。历史记录保留稳定 ID，停用或软删除不隐藏历史引用。专用 SQL 片段位于 `infrastructure/queries/material-name.sql.ts`，由各 Repository 在数据库查询内组合，避免应用层逐行请求；库存余额与缺口继续按精确版本计算。

需求基础、需求、库存批次和入库明细不保存物料名称快照。编码、单位及精确版本快照保留。工单成品名称与工序/SOP 快照不适用此规则。审计前后值、HTTP 幂等响应重放仍保留原结果，不作为列表名称数据源；重新 GET 获取当前名称。

### 退料、损耗与需求的职责边界

- 退料 Adapter 只校验已确认领料的可退额度，维护退料单、公共库存正流水和审计。无论是否开工，都不创建或恢复需求，不撤销原分配/出库履约，不改变需求计划版本、短批授权或生产状态。
- 损耗 Adapter 处理现场损坏、丢失等物料损失，确认后通过需求计划 Writer 创建等量损耗补料需求；人工追加由需求配置入口按管理员填写的物料和数量创建。退料不得调用需求计划 Writer。
- 需求与分配 Adapter 按原分配、已确认出库和需求剩余量计算待办，不从中扣除余料退回量。库存及追溯查询可展示净领用，但不得将净领用量反算为新需求。
- 执行模块独立校验开工和完工。短批要求已发生确认领料、当前有效授权和允许缺口覆盖；退料不参与授权或开工判定，即使全部退回也不因此阻止开工。已有剩余需求只能通过独立管理命令关闭，退料不代办订单关闭。

### 退料去向与追溯来源

退料仅用于现场多余物料或订单中途关闭后的余料回仓，固定回到原库存批次并释放为公共可用库存，不保留给原生产任务；原任务、需求、分配和版本 ID 用于追溯。`GET /production/trace/batches/:id` 的物料入库来源按关联库存批次的正数、available 库存流水展示，每条 `sourceLabel` 使用真实 `transaction_type`，例如 `material_return_inbound`，不再把无外购入库单的流水标为 `initial_stock`。此列表展示所用库存批次的入库历史，不表示某次入库数量全部被本任务消费。

来源单号字段使用 `sourceDocumentNo`（替代 `inboundNo`），当前解析外购入库单与已确认退料单；其他来源未解析单号时为 null，但类型仍来自流水。`confirmedAt` 优先采用对应单据确认时间，无关联单据时使用流水创建时间；供应方仅取外购入库单，不为退料推断供应商。前端按共享流水类型字典显示名称。

所有批次工序均须报工，前道有效正常产出是后道投入放行量的唯一来源；正常数量达到当前要求时自动完成。批次完工校验全部工序，不提供免报工快照或员工单独完成工序命令。

BOM 需求基础、需求及补料契约不再复制关键物料和记录批次标志；精确物料版本选择、库存批次分配和追溯规则继续统一执行。
