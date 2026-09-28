# 成品分次入库：结构对照与数据示例

本文用简化字段和几条数据解释已确认的分次授权与自主归批方案，不作为完整表定义。方案依据见 [ADR-0016](adr/0016-inbound-authorizations-and-stock-batches.md)，本次实施、用户验收和正式测试状态见[路线图](roadmap.md#成品物料入库统一整改代码核对清单)。

完整字段、约束和接口分别由 [Production 结案与批准版](../apps/api/src/modules/production/docs/database/production-termination.md)、[Procurement 正式分配](../apps/api/src/modules/procurement/docs/receipt-acceptance.md)、[Quality 检验表](../apps/api/src/modules/quality/docs/database.md)及 [Inventory 入库与库存](../apps/api/src/modules/inventory/docs/database/inventory-ledger-and-inbound.md)维护。本文省略通用审计、外键类型和索引细节；以下符号 ID 仅用于说明关系。

## 1. 参照物料的职责分层，不逐字段复制

| 职责 | 当前物料模型 | 成品模型 |
| --- | --- | --- |
| 来源身份与当前指针 | receipt / receipt_line | 已有 production_batches / production_batch_closeout |
| 到货核实数量修订 | receipt_revision | 不照搬；成品已有产出草稿、Quality 实测及批准产出，不虚构一次到货 |
| 剩余实物办理轮次 | receipt_round | 新增 production_output_round |
| 检验办理与不可变结果 | quality_inspection_case / record | 复用同一套 Quality 表，补成品轮次引用 |
| 正式确认依据 | receipt_acceptance | 复用 production_output_revision，保留负责人审批 |
| 本轮执行授权 | receipt_allocation | 新增 production_output_allocation |
| 实际入库及库存 | inbound_order/detail、item_batch、inventory_transaction | 复用 Inventory 表，按明细关联授权及目标批次 |

不复制物料的供应商、采购行、补单归属、实收修订、人工拒收和退供应商字段。成品保留生产任务、计划内外、负责人审批、产品报废及零产出核实。Quality 的 C 输入职责也维持来源差异，不能因为表相似强行统一。

## 2. 业务字段关系

### 2.1 来源与草稿：复用 production_batch_closeout

```text
id / production_batch_id             结案根及任务
current_round_id                    新增：当前办理轮次
current_revision_id                 最近批准版本；单独有它不代表还能入库
available_quantity / extra_quantity 当前可编辑草稿的累计计划内／外目标
inspection_record_id                当前草稿选用的检验依据
pending_approval_id / version        审批与乐观锁；原说明、报废等字段继续保留
```

取消的是仓库入库单的持久化草稿，不是这份产出草稿。任务中间过程、收尾事项与已批准产出仍各按原所有者管理。

### 2.2 办理轮次：新增 production_output_round（Production）

```text
id / closeout_id / round_no
previous_round_id                   前一轮，必须同一来源
trigger_type                        initial / reinspection / finalization_correction
base_revision_id                    开始本轮前的批准版，首轮为空
source_version                      发起时的来源版本
baseline_planned_received           发起时计划内历史已入快照
baseline_extra_received             发起时计划外历史已入快照
starting_declared_remaining         发起时申报的剩余送检量；参考值，不是实测 C
status                              办理状态：待检、检查中、待定稿、审批中、已定稿、已替代等
reason / created_by / created_at / updated_by / updated_at / version
```

基准与起始身份不可改写，status/version 按所有者定义的业务动作推进。初始基准为零，后续从 Inventory 的真实入库事实按任务／类别累计。它不是某库存批次余额，也不是只统计最近批准版。

开始更正即新建轮次、固定基准并暂停原剩余授权，使同轮核对及审批期间基准稳定。旧轮标为已替代，但旧批准、授权和入库事实不动。新一轮范围是同任务全部剩余送检实物，排除已入及已独立处置报废，不按库批拆质检，也不建立范围树。starting_declared_remaining 允许与实际 C 不同。

### 2.3 检验：复用 Quality 两表

```text
quality_inspection_case：新增 finished_round_id，绑定实际发起检查的轮次
quality_inspection_record：继续保存 case_id、C/G/F、方式、明确结论、前驱及凭据
```

一次新检查对应一个成品来源轮次；同来源的纯定稿分配更正可引用仍适用的既有检验记录，不新造检验。来源轮次和成品身份须同源组合校验，不能把另一任务的结果拿来定稿。Quality 仅写自己的办理／记录，Production 通过 public 能力掌握来源资格及冻结。

### 2.4 正式批准：复用 production_output_revision（Production）

```text
id / closeout_id / round_id          round_id 新增；每轮至多一个批准版
revision_no / previous_revision_id
approval_instance_id                原负责人审批，不能省略
inspection_record_id                本版实际采用的检验，可来自此前仍适用的检查轮
planned_quantity                    任务计划快照
additional_scrap_quantity / existing_scrap_quantity
correction_reason / review_snapshot / created_by / created_at
```

### 2.5 授权明细：新增 production_output_allocation（Production）

```text
id / revision_id / round_id / closeout_id
category                            self_made（计划内）/ production_extra（计划外）
quantity                            本轮新授权可入数，正整数；为零不建明细
remark / created_by / created_at
UNIQUE(revision_id, category)        本版每类别一条授权即可；入库可以拆很多次
```

本稿选择以“本轮剩余授权”作为唯一结构化明细量。批准版的累计计划内／外量分别由本轮对应已入基准加授权量得到；现有 revision.available_quantity/extra_quantity 在结构切换时改为查询派生，不同时维护另一套可编辑总量。API、打印及审批仍显示累计值，审批快照是不可变当时证据；同事务核对它与基准＋授权一致。草稿填写累计量，批准时转换成授权明细。

例如累计目标计划内80、计划外20，基准计划内0、计划外20，则只创建计划内授权80，不再创建计划外授权20。基准是固定历史快照，不随执行增加；累计展示也不能再加本轮后来入库量。

授权不存 target_batch_id、received_quantity、remaining_quantity 或重复的 mutable status。目标属于实际入库，已入由真实明细与流水汇总，办理资格来自当前轮和批准依据。批准版及其授权同事务追加且不可更新／删除。零剩余可有批准版而没有授权行。

### 2.6 实际入库与批次：复用 Inventory

以下仅列关键关系，完整表定义由 Inventory 维护：

```text
inbound_order                       一次实际确认的主单及操作者、时间、备注
inbound_detail.production_output_allocation_id  成品执行授权引用
inbound_detail.batch_id              本次实际选择／创建的库存批次
inbound_detail.inbound_number        本条实际入库量
inventory_transaction              每条实际入库明细对应正流水，库存唯一事实
item_batch                          库存身份和批号，不持有唯一的计划内外归属
```

每条明细只能消费一条授权、进入一个批次；一份授权可被多条明细消费，多份授权可进入同一批次。允许同次确认多授权／多目标时逐明细表达，主单不再保存唯一 output_revision_id，成品 source_type 为 finished_product；批准版由明细的授权引用追溯。物料／成品引用字段组保持明确、互斥和同源约束。批次不能用第一次或最后一次来源代表全部；来源按明细查询。

主单、明细、批次创建、流水和审计原子提交；页面没有服务端可继续办理的入库草稿。选择已有批次须为同成品或同物料精确版本、同单位且状态允许入库。跨任务／到货可共用合资格批次，但同一物料入库单仍维持同供应商限制。本例使用同任务、同产品的归批。

### 2.7 查询与实际批号

一个库存批次接收多次入库，不增加追溯歧义。查询批次001时，先按产品／物料身份定位 item_batch.id，再按 inbound_detail.batch_id 查询全部入库明细；每条明细分别关联入库单、执行授权、批准版和检验依据。反向从任一入库单也能通过明细定位真实批次，不要求入库单与批次一一对应。

| 入库明细 | 入库单 | 授权 | batch_id | 实际数量 |
| --- | --- | --- | --- | ---: |
| D1 | IN001 | A2 | B1（批号001） | 20 |
| D2 | IN002 | A3 | B1（批号001） | 30 |
| D3 | IN003 | A3 | B1（批号001） | 50 |

批次页显示三次历史，单据页分别显示各次交接；库存余额仍来自流水。授权来源移到明细后，不能继续假设主单或批次只有一个类别／批准版。保留或补齐支持按 batch_id、inbound_id、授权ID定位及稳定分页的索引，先复用已有前缀索引，避免重复建立。多来源混在同一库批后的领用只能追到库批及其来源集合，不能凭这些入库记录推断精确消耗了哪次来源。

原 requested_batch_code 是成品待确认草稿的拟用批号。取消持久化入库草稿后删除该列，实际批号经 inbound_detail.batch_id 关联 item_batch.batch_code 查询，不另存一份重复字符串。

```text
新批次：target = { mode: new, clientKey: local-1, batchCode: 001 }
已有批次：target = { mode: existing, batchId: B1 }
```

新建分支在确认事务内创建批次，再写入带实际 batch_id 的明细；已有分支核验后直接引用其 ID。同一次请求中多条明细共用一个新批次时使用相同 clientKey，不能仅凭相同批号猜测复用意图。批号保持稳定；未来若需要更名与打印快照，应另行定义，不能将原草稿字段改名充当历史事实。

## 3. 三个不同的数量，避免重复授权

```text
本轮授权[类别] = 本次累计批准目标[类别] − 本轮固定历史已入基准[类别]
本授权历史已执行 = 匹配该 allocation_id 的实际入库事实合计
当前可执行余额 = 本轮授权 − 本授权历史已执行（仅当前轮已定稿时可执行）
```

每类累计目标不得低于该类已入事实；质检建议仍不是上限。历史轮可能还有数值上的未执行余量，但其当前可执行余额为零，不累加它来授权。当前授权耗尽只表示已执行完，不删除正式依据；耗尽进度按事实派生，不额外维护一列容易失真的状态。

还有一个容易混淆的基准：**建议量必须用所引用检验实际发起时的基准。** 若纯分配更正沿用旧检验，新定稿轮已入基准可能增加，但不能把新增已入又加到旧的剩余建议上。

```text
累计质检建议 = 所引用 Quality case 对应检查轮的固定已入基准 + 该检验的建议 R
```

例如 Q2 发起时已入20、R=80，累计建议一直是100。后来又入30并仅更正定稿，新授权基准是50；仍沿用 Q2 时建议仍为100，不能变成50＋80＝130。若累计目标仍100，新授权应为50。实际剩余送检身份／范围改变时不能只沿用旧结果，必须新检验；不叠加多次检查建议。

## 4. 简单数据模拟

以下符号 ID 便于阅读，真实 ID 使用项目统一类型。任务 T1，成品 P1，计划100。初次核对计划内100、计划外20，实物共120。表中“已入／余额／累计批准”均标明派生含义，不表示新增存储列。

### 第一次：定稿120，先入计划外20

| 检验 | 检查轮 | C | G | F | 结论 |
| --- | --- | ---: | ---: | ---: | --- |
| Q1 | R1 | 120 | 120 | 0 | released |

| 轮次 | 计划内已入基准 | 计划外已入基准 | 起始申报剩余 |
| --- | ---: | ---: | ---: |
| R1 | 0 | 0 | 120 |

| 批准版 | 轮次 | 检验引用 | 累计计划内（派生） | 累计计划外（派生） |
| --- | --- | --- | ---: | ---: |
| V1 | R1 | Q1 | 100 | 20 |

| 授权 | 批准版 | 类别 | 本轮授权 quantity |
| --- | --- | --- | ---: |
| A1 | V1 | 计划内 | 100 |
| A2 | V1 | 计划外 | 20 |

| 入库明细 | 消费授权 | 目标批次 | 数量 | 库存流水 |
| --- | --- | --- | ---: | --- |
| D1 | A2 | 新建 B1 | 20 | L1：B1 +20 |

此时历史已入20，A1还未执行。B1是库存批次，不叫“计划外批次”；D1保留计划外来源。

### 第二次：复检剩余，累计改为100

开始新轮 R2：R1 已替代，A1剩余100立即退出执行资格，D1/L1保持不变。新检查覆盖尚未入库的100件。

| 轮次 | 前轮 | 计划内已入基准 | 计划外已入基准 | 起始申报剩余 |
| --- | --- | ---: | ---: | ---: |
| R2 | R1 | 0 | 20 | 100 |

| 检验 | 检查轮 | C | G | F | 结论 |
| --- | --- | ---: | ---: | ---: | --- |
| Q2 | R2 | 100 | 80 | 20 | released |

管理员核对后决定累计计划内80、计划外20，并独立确认剩余20件实际报废，走原负责人审批；质检 F=20 本身不自动写报废或库存。批准数据如下：

| 批准版 | 前版 | 轮次 | 检验引用 | 累计计划内（派生） | 累计计划外（派生） |
| --- | --- | --- | --- | ---: | ---: |
| V2 | V1 | R2 | Q2 | 80 | 20 |

| 新授权 | 批准版 | 类别 | 本轮授权 quantity |
| --- | --- | --- | ---: |
| A3 | V2 | 计划内 | 80 |

没有再次生成计划外20的授权；V2的计划外累计20来自 R2 固定已入基准。累计建议为20＋80＝100。若检查为G79/F21但仍明确放行，累计建议为99，管理员最终仍可按100定稿并保留差异；实际报废按独立决定记录，不能自动取F。

### 第三次：80分两次入库，既可入已有批次，也可新建

| 入库明细 | 消费授权 | 目标批次 | 数量 | 库存流水 |
| --- | --- | --- | ---: | --- |
| D2 | A3 | 已有 B1 | 30 | L2：B1 +30 |
| D3 | A3 | 新建 B2 | 50 | L3：B2 +50 |

在没有出库等其他流水的前提下，B1库存50＝计划外20＋计划内30；B2库存50＝计划内50。任务累计已入100，分别保留V1/Q1和V2/Q2的来源，旧事实不换挂新批准版。

| 授权 | 原授权量 | 历史实际已入 | 当前可执行余额 | 原因 |
| --- | ---: | ---: | ---: | --- |
| A1 | 100 | 0 | 0 | R1已替代；不是还可入100 |
| A2 | 20 | 20 | 0 | 已执行，保留旧依据 |
| A3 | 80 | 80 | 0 | 当前轮已执行完 |

若 D3 也选择 B1，最终就是一个库存批次100；授权、历史和累计计算完全相同。无论哪种归批，都不把历史授权100＋20＋80累计为新可入200，也不因后续领料减少库存而恢复已消费额度。
