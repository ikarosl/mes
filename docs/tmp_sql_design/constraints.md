# 通用出入库约束、状态和事务

本文件与[字段字典](schema.md)共同定义完整目标，状态见 [README](README.md)。字段已具体确定；本稿不是已执行 migration 或测试通过证明。

## 1. 约束层次

- CHECK 处理同一行值域、成组非空和互斥。必须显式写 IS NULL / IS NOT NULL，不能以 nullable 列比较产生 UNKNOWN 绕过约束。
- FK/UNIQUE 处理真实引用、库存身份、父单场景及重复事实。所有外键统一 ON UPDATE RESTRICT / ON DELETE RESTRICT，不级联删历史。
- 数据库守卫处理跨表场景、数量／单位匹配、生命周期和事实不可变；既有来源授权守卫继续保留。
- 来源模块公开命令在同事务锁内判断当前轮、放行、额度、任务阶段及履约。FK不代替这些业务资格，Controller不提供任意source_type或流水写接口。

## 2. 场景矩阵

表中“有”指全部非空且引用一致，“无”指全部NULL，不仅是请求不传。

| 单据场景 | 主单任务+工单 | 主单product_id | 明细身份 | 采购四ID+供应商快照 | 产出授权ID | 明细任务+需求+原分配 | reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 入库 purchased | 无 | 无 | 物料 | 有 | 无 | 无 | 无 |
| 入库 finished_product | 有 | 有 | 与主单同成品 | 无 | 有 | 无 | 无 |
| 入库 return_inbound | 有 | 无 | 原分配物料版本 | 无 | 无 | 有，return_allocation_id | 无 |
| 入库 other | 无 | 无 | 物料或成品 | 无 | 无 | 无 | 非空非空白 |
| 出库 production_material | 有 | 不设该列 | 原分配物料版本 | 不设该组列 | 不设该列 | 有，allocation_id | 无 |
| 出库 other | 无 | 不设该列 | 物料或成品 | 不设该组列 | 不设该列 | 无 | 非空非空白 |

物料身份严格为 item_id、material_variant_id 非空且 product_id 为空；成品严格反之。采购四ID为 receipt_line、receipt_revision、inspection、allocation。场景列在父子表以组合外键绑定，客户端不能单独改变行场景。

生产退料只能 existing 原批次。采购、批准成品及其他入库可 new/existing；出库只选择已有批次。其他行可混合不同对象但不混业务场景，同批次的多行确认时合计核对余额；没有“一单一个批次”或“一批次只能一个来源”的约束。

## 3. 主单状态与字段一致性

| 状态 | 确认时间/人 | 取消原因/人/时间 | 出库cancel_source | 可写规则 |
| --- | --- | --- | --- | --- |
| pending / pending_picking | 全空 | 全空 | 空 | 仅其他草稿可编辑；来源业务单只确认或取消 |
| completed | 全非空 | 全空 | 空 | 整单及所有行不可变 |
| cancelled | 全空 | 全非空，原因非空白 | 非空合法代码 | 整单及所有行不可变 |

出库其他单取消来源只许manual；生产领料可manual、production_batch、production_termination。入库取消无额外cancel_source字段，沿用当前退料人工取消语义。

允许的状态边只有待确认→completed/cancelled，以及其他草稿状态内保存。无恢复终态、部分确认、直接修改状态接口。业务编号、来源场景、生产归属及创建事实创建后不变。改变整单来源必须取消并重新制单。

新建version=0；保存、确认、取消均比较请求中的父单版本，并恰好递增1，数据库主单UPDATE守卫同步检查NEW.version=OLD.version+1。终态幂等重放返回已有结果，不更新任何行或版本。同一业务确认中的多条明细修改只计一次父版本推进。

采购／成品不增加跨请求草稿：保留来源确认命令，在同一事务创建单据、目标、明细和流水并完成。为统一完成守卫，目标写入顺序采用pending→明细→流水→completed，采购现有直接INSERT completed的内部实现改为该顺序；外部仍一次确认成单，没有新增用户步骤。对应父单pending的事务中间值不能当作已开放业务草稿。

## 4. 草稿、目标与不可变边界

其他单首次保存和每次修改必须保留1–50条有效行；父单version检查并递增，数量、原因、备注、对象与目标修改记操作日志的前后值。行号按父单锁分配为历史最大值+1，永不复用。不增加行版本或行修订表。

- 仅other+待确认且从未记账可修改／软删除有效行；删除时is_deleted=1、deleted_by/deleted_at齐全。未删行三者为0/NULL/NULL。
- 已删行不可恢复或改内容；需要时追加新行。父单完成或取消后，连已删行也冻结。禁止物理删除主单及明细。
- 采购、成品、领料、退料的is_deleted恒0，不因共享列开放编辑。创建后唯一允许的系统修改是入库确认时把new目标的batch_id从NULL落为真实批次，并维护修改审计；所有来源和数量保持不变。
- 其他草稿编辑不占用库存或新增生产预留；待确认生产领料保留原“占可制单额度”规则；待确认退料仍占可退额度。

| target_mode | new_batch_key | batch_id | 规则 |
| --- | --- | --- | --- |
| existing | NULL | 非空 | 核验精确身份与单位；退料必须是原分配批次 |
| new | 非空非空白，≤100字符 | 草稿NULL；确认事务回填 | 单内相同键的有效行共建一次批次，跨单不共享该键 |

new目标的有效行必须具有一致的对象／精确版本、单位及编码快照。确认按有效行分组，每组生成一个IB编号和真实批次，再统一回填；失败整体回滚，不留下批次或流水。确认落批期间父单仍pending，不能用“pending时batch_id必空”的CHECK阻断中间写入。

new_batch_key先由服务端trim，再校验非空和长度、分组及保存；禁止客户端自行用尾随空格区分批次组。other新行创建时new目标必须batch_id=NULL，真实批次只在确认事务中落定；采购／成品同事务直接确认可以先建批再插入带batch_id的new行。不提供单独的“草稿预建真实批次”命令。

已软删new行不建批，可以永远batch_id=NULL；completed只要求有效行全部有真实批次和匹配流水。new_batch_key及target_mode确认后保留，供解释当时选择；既有批次再入库不会更改其建批来源、日期或描述。

批次新增用途：其他物料新批source_type=other，其他成品新批source_type=finished_product；provider、来源工单／任务、production_date、remark均NULL。新建业务必须提供created_by/updated_by。其他既有批次可以余额为0，不要求正库存才可补入；出库仍须满足余额和预留约束。

## 5. 完整目标键和索引

六表均保留PRIMARY KEY(id)。以下列出公共单据及流水的业务唯一键和查询索引；外键所需支撑索引一并建立，不依赖非唯一父索引作为候选键。不为低选择性状态单建索引。

| 表 | UNIQUE | 查询INDEX |
| --- | --- | --- |
| inbound_order | (inbound_no)、(id,source_type)、(id,production_batch_id) | (source_type,status,created_at,id)、(production_batch_id,source_type,status,id)、(work_order_id,id) |
| inbound_detail | (inbound_id,line_no)、(inbound_id,return_allocation_id)、(id,item_id,material_variant_id,batch_id)、(id,product_id,batch_id) | (inbound_id,is_deleted,id)、(inbound_id,new_batch_key)、(batch_id,id)、(procurement_allocation_id,id)、(procurement_receipt_line_id,id)、(procurement_inspection_id,id)、(production_output_allocation_id,id)、(return_allocation_id,id) |
| outbound_order | (outbound_no)、(id,source_type)、(id,production_batch_id) | (source_type,status,created_at,id)、(production_batch_id,source_type,status,id)、(work_order_id,id) |
| outbound_detail | (outbound_id,line_no)、(outbound_id,allocation_id)、(id,item_id,material_variant_id,batch_id)、(id,product_id,batch_id) | (outbound_id,is_deleted,id)、(batch_id,id)、(allocation_id,id)、(demand_id,id) |
| inventory_transaction | (idempotency_key)、(reversal_of_transaction_id)、(original_posting_key) | (reference_type,reference_detail_id,id)、(item_id,batch_id,stock_status,created_at)、(product_id,batch_id,stock_status,created_at)、(transaction_group_key)、(batch_id,stock_status,id) |

来源重复行规则：生产领料／退料一单同分配仅一行，因此allocation唯一键无软删除后复用问题。采购、成品允许同授权在同单分到不同批次，不建授权唯一键。同一单不同来源可以同批，不恢复旧的(inbound_id,batch_id,item_id)唯一槽位。其他场景allocation为空，按MySQL NULL语义不会错误限制多行。

item_batch保留既有唯一键(batch_code)、(material_variant_id,batch_code)、(product_id,batch_code)、(id,item_id)、(id,item_id,material_variant_id)、(id,product_id)；保留(item_id,batch_status)、(product_id,batch_status)、(source_production_batch_id,product_id)查询索引及FK支撑索引。stock_check_detail只新增上述物料身份候选键；其现有键不改。

## 6. 完整外键关系

以下是列组定义，不是任意source_id。表内全部created_by、updated_by、operator_id、cancelled_by、deleted_by均引用users(id)；可空用户列仅在相应动作尚未发生时为空。

| 子表／列 | 父表／候选键 |
| --- | --- |
| inbound_order(work_order_id) | work_orders(id) |
| inbound_order(production_batch_id,work_order_id) | production_batches(id,work_order_id) |
| inbound_order(product_id) | products(id) |
| inbound_order(production_batch_id,product_id) | production_batches(id,product_id) |
| outbound_order(work_order_id) | work_orders(id) |
| outbound_order(production_batch_id,work_order_id) | production_batches(id,work_order_id) |
| inbound_detail(inbound_id,source_type) | inbound_order(id,source_type) |
| inbound_detail(inbound_id,production_batch_id) | inbound_order(id,production_batch_id) |
| outbound_detail(outbound_id,source_type) | outbound_order(id,source_type) |
| outbound_detail(outbound_id,production_batch_id) | outbound_order(id,production_batch_id) |
| inbound_detail(demand_id,production_batch_id) | production_item_demand(id,production_batch_id) |
| inbound_detail(return_allocation_id,demand_id,production_batch_id,item_id,batch_id,material_variant_id) | production_item_allocation(id,demand_id,production_batch_id,item_id,batch_id,material_variant_id) |
| outbound_detail(demand_id,production_batch_id) | production_item_demand(id,production_batch_id) |
| outbound_detail(allocation_id,demand_id,production_batch_id,item_id,batch_id,material_variant_id) | production_item_allocation(id,demand_id,production_batch_id,item_id,batch_id,material_variant_id) |
| inbound_detail(procurement_receipt_line_id,item_id,material_variant_id) | procurement_receipt_line(id,item_id,material_variant_id) |
| inbound_detail(procurement_receipt_revision_id,procurement_receipt_line_id) | procurement_receipt_revision(id,receipt_line_id) |
| inbound_detail(procurement_inspection_id,procurement_receipt_line_id) | quality_inspection_record(id,receipt_line_id) |
| inbound_detail(procurement_allocation_id,procurement_receipt_line_id) | procurement_receipt_allocation(id,receipt_line_id) |
| inbound_detail(production_output_allocation_id) | production_output_allocation(id) |
| inventory_transaction(reversal_of_transaction_id) | inventory_transaction(id) |

inbound_detail、outbound_detail、inventory_transaction共同建立：item_id→materials(id)、(material_variant_id,item_id)→material_variants(id,material_id)、product_id→products(id)、(batch_id,item_id,material_variant_id)→item_batch(id,item_id,material_variant_id)、(batch_id,product_id)→item_batch(id,product_id)。入库新批草稿batch可空但物料／成品身份不得空。

item_batch保留item_id→materials、(material_variant_id,item_id)→material_variants、product_id→products、source_work_order_id→work_orders、(source_production_batch_id,source_work_order_id)→production_batches(id,work_order_id)、(source_production_batch_id,product_id)→production_batches(id,product_id)及操作者外键。

批准成品明细与主单的product_id一致，以及产出授权→修订→任务／产品完整关系，使用跨表守卫和来源公开命令校验。移除旧(inbound_id,product_id)→inbound_order(id,product_id)外键：other主单product_id为空而行可以是成品，旧FK不能套用；保留上述物料／成品批次外键，不为减一项守卫改造不可变产出授权列。

采购四ID的组合FK保证同到货行，当前轮／实收修订／检验依据／allocation实际一致及disposition=inbound还须沿原业务守卫检查，不能只凭“同到货行”放行。

### 6.1 流水有类型外键

替换旧(reference_detail_id,product_id,batch_id)固定引用inbound_detail的外键，建立下列分支：

| 流水列组 | 目标 |
| --- | --- |
| (inbound_detail_ref) | inbound_detail(id) |
| (inbound_detail_ref,item_id,material_variant_id,batch_id) | inbound_detail(id,item_id,material_variant_id,batch_id) |
| (inbound_detail_ref,product_id,batch_id) | inbound_detail(id,product_id,batch_id) |
| (outbound_detail_ref) | outbound_detail(id) |
| (outbound_detail_ref,item_id,material_variant_id,batch_id) | outbound_detail(id,item_id,material_variant_id,batch_id) |
| (outbound_detail_ref,product_id,batch_id) | outbound_detail(id,product_id,batch_id) |
| (stock_check_detail_ref) | stock_check_detail(id) |
| (stock_check_detail_ref,item_id,material_variant_id,batch_id) | stock_check_detail(id,item_id,material_variant_id,batch_id) |

身份XOR和交易类型范围确保实际分支的组合FK各列非空；不能把成品盘点漏进NULL跳过的分支。生成指针不引用id自增列，只依据普通reference字段。使用STORED而非VIRTUAL；所有FK使用RESTRICT，不级联。生成列不可由应用独立填写，数据库触发器读取NEW.reference_type/reference_detail_id判断，不能访问NEW生成列。这些限制依据 [MySQL生成列规则](https://dev.mysql.com/doc/refman/8.4/en/create-table-generated-columns.html)。正式迁移仍须在项目MySQL验证，本文不宣称已执行。

## 7. CHECK与数据库守卫清单

同一不变量由下表指定层落实，不能以“后端会判断”省略已确定的数据库保护。

| 位置 | 必须落实 |
| --- | --- |
| 两张主单CHECK | 精确场景／状态集合、version>=0、任务／工单成组、按矩阵产品与reason、确认／取消字段组、出库取消来源 |
| 两张明细CHECK | 物料／成品XOR、行号>0、数量范围、available、快照非空白、场景来源组、other之外不可软删、软删审计组 |
| 入库明细CHECK | target_mode合法；existing必有batch且无new_key；new必有非空key；退料existing、原分配来源组完整 |
| item_batch CHECK | 保留物料／成品XOR、版本编码组、batch_status、source_type、version及新成品来源字段为空规则 |
| 流水CHECK | 物料／成品XOR、数量范围、类型／方向／来源匹配；成品仅production_inbound/other_inbound/other_outbound且available，无冲销及状态转移；保留物料基础冲销与分组规则 |
| 主单INSERT守卫 | 四种入库、两种出库均从待确认建立；创建事实齐全；编号与场景由受权命令生成 |
| 明细INSERT/UPDATE守卫 | 锁父单；待确认且未记账，source_type匹配，来源／单位／目标一致；仅other草稿可改业务内容；生产来源事实不可改 |
| 入库落批UPDATE守卫 | 非编辑命令仅允许new目标batch_id NULL→同身份真实批次及修改审计；数量、来源、key、单位不变 |
| 行软删除守卫 | 仅other待确认且无流水的有效行可删除；已删行不可恢复／改写；来源行不可删 |
| 六场景原始流水INSERT守卫 | 按reference锁实际父单，读取有效明细；检查来源场景、精确身份、批次、单位、available、数量及方向；原始记账只能在待确认事务中发生 |
| 盘点／基础冲销INSERT守卫 | 使用各自独立分支；盘点保留四类库存状态、原盘点阶段及非零差额核验；基础冲销保留对原已完成事实的镜像检查，不要求原父单重新待确认 |
| 主单完成守卫 | 至少一条有效行；所有有效行有真实批次及唯一匹配原始流水；被删行无流水；确认人／时间齐全；已完成不允许追加或改行 |
| 主单取消守卫 | 所有明细无流水，取消字段齐全；保持所有历史行 |
| 主单终态与DELETE守卫 | 所有终态及其全部行冻结；全部主单、明细禁止物理删除；测试库清理只沿用受控专用豁免 |
| 主单版本UPDATE守卫 | 保存、确认、取消恰增1，终态重放不UPDATE；禁止只改行却不推进父单版本的应用命令 |
| 流水UPDATE/DELETE与冲销守卫 | 继续不可修改、删除；基础冲销同身份同来源反向全额且仅一次，不给六场景新增无条件撤销接口 |

原始类型映射固定为README六场景表，不能让客户端选择同一单的流水类型。其他正负补差都生成新单，不能填写reversal_of_transaction_id伪装为批准的业务冲销。物料既有基础冲销设施保留，既有具体入口仍受原来源规则约束。

original_posting_key对三种实际明细且reversal为空生成type:id；与idempotency_key双重唯一。transaction_group_key不能跳过此唯一性。六场景记账使用INBOUND:<detailId>或OUTBOUND:<detailId>稳定幂等键；盘点保留STOCKCHECK:<detailId>。单据重复确认先识别已完成并返回既有结果，不换新键补写。

## 8. 数量口径

生产领料可制单量=分配量−已完成生产领料−待确认生产领料；已取消不占用。确认后逐需求履约，补料授权激活仍按Production现有规则；其他出库不参与这些汇总。

退料可新增量=该原分配已完成生产领料−pending/completed退料−pending/confirmed生产领料损耗。确认时核对全部占用（包含本单，不重复减一次）。退料回仓不恢复原需求履约或生产预留；其他入库即使备注提到任务也不能算作退料履约。

授权消费只累计已完成、有效实际明细及匹配原始正流水，不用批次当前余额反推。采购／成品同授权多行必须先合计检查额度。其他单草稿不占来源授权或库存。

## 9. 所有权、预留与事务

Inventory唯一写公共四表、批次、流水；Production写需求／分配／履约，Procurement写采购来源，Quality写检验事实。任何业务模块不得直接UPDATE公共出入库，即使字段内嵌其业务ID。数据库FK和只读守卫可跨表，不授权跨模块应用写入。

来源命令继续由来源模块编排：先锁来源并校验，再调Inventory窄能力。Inventory读取实际领退料／入库事实的公开能力供来源模块计算额度；来源模块不能再直接锁公共表。登记展示目录仅用于展示，不承担资格校验。

### 9.1 不迁预留的具体协作

预留事实仍是Production的有效allocation；已确认领料事实已归Inventory公共出库。独立其他出库需要二者，不能使用展示查询或普通RR快照。

1. Inventory提供other确认用例并定义窄的InventoryReservationReadPort；API组合根adapter只导入Production public，读取目标批次当前有效分配(id、batchId、assignedNumber、allocationStatus)，不取得来源任务办理资格，不修改分配。
2. Inventory先锁本其他出库父单，统一取得Product历史身份及目标批次排他锁，再经端口当前读分配。所有分配新增／增量必须先持目标批次锁，禁止绕过；目标集合创建草稿后也要锁内重核。
3. Production只锁自有分配，使用FOR SHARE NOWAIT；Inventory对所需的已完成生产出库实际行也使用当前读及NOWAIT，不让Production跨所有权读锁outbound。有效预留逐分配计算max(assigned−confirmedIssued,0)，再按批次求和。
4. 锁冲突立即使整个其他出库事务回滚并有限重试，不能等待已持分配而在等待本批次的生产命令，也不能SKIP LOCKED漏算。只允许在stock.available−reserved足够时写other负流水；重试仍用原HTTP幂等键。
5. 释放分配、生产领料、更正等命令仍各自校验；其他出库不抢占或释放它们的预留。不存在预留的成品分支不伪造allocation。

这明确增加一条“只读预留事实”的运行时反向协作，取代现行协议在此窄范围的完全单向限制；不是靠接口注入掩盖依赖。其他业务来源资格依然不能由Inventory反调决定。未增加预留表、第二套缓存或新仓库模块。

NOWAIT只避免新增路径阻塞形成的环，不能宣称解决现有分配／生产确认的所有锁序问题。全量接入时同批次分配余额计算涉及他任务分配／公共出库的当前读，也统一NOWAIT并整体回滚重试，避免“持批次等分配”与“持分配等批次”无限互等。多个ID稳定排序，不在取得库存锁后追加新的Product父锁。[MySQL锁定读取](https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html)说明NOWAIT遇行锁立即失败，不能将其误作获得最新数据的普通快照。

### 9.2 确认事务

```text
验证RBAC和请求幂等；开启同池事务
来源业务：锁来源根及授权／分配，检查阶段、依据、累计额度
锁公共父单与有效明细，核对version、场景及目标集合
统一Product父身份锁 → 目标批次锁（稳定顺序）
其他出库：当前读有效预留和实际领料，冲突整事务回滚
入库new目标：按单内key创建真实批次并回填有效行
逐有效行追加匹配正／负流水，触发器更新可重建余额
主单完成、来源履约／补料生效、成功审计、已启用幂等响应同事务提交
```

来源资格要锁来源根在前，不能通用确认先锁公共单据再反锁生产任务。其他单没有任务锁；所有权端口只传业务值，不传数据库连接或SQL。事务失败包括批次、行、流水、履约与审计一起回滚。

## 10. 迁移与联动

本次完整上线六场景，不做退料先上线或同场景双写。开发库允许经统一初始化重建；新增成对migration，不修改已执行文件。迁移须重建受影响的旧守卫、FK与投影依赖，不能把列展示SQL当成完整迁移。

先检查所有受影响的出入库、旧退料、流水及审计／审批／幂等引用，不静默删除业务事实。完成目标结构后删除旧退料表；down亦先保护非空目标事实，再恢复迁移前完整约束，不能遗留悬空来源。共享状态字典、权限、编号、DTO、公开端口、模块所有权登记与版本化迁移一起发布。

联动必含：生产制单与履约、退料及损耗额度、需求更正历史、任务收尾取消出库／待退料阻断／物料实核、审批快照依据、采购更正／复检历史已入、产出授权消费／更正／复检、仓库列表／候选、生产追溯、库存批次与成品展示。核对旧return_detail、return_order、outbound直接写和旧returned状态引用，不把结构共用变成业务资格放松。

设计审阅通过后，更新Inventory数据库及公开契约、Production领退料／收尾文档、Procurement实际入库引用、根库存协作协议和scripts/api-data-ownership.mjs；实际登记仍与实施状态一致。类型／构建／启动、人工验收和正式测试遵循根交付顺序，当前没有数据库执行或正式测试通过结论。
