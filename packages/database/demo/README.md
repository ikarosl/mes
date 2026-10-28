# 演示数据

本目录保存可重复加载的开发/演示样例数据，与 `seed` 中的运行基础数据严格分离。以下样例和准备命令用于人工核对；加载、数据准备或数量核对成功不代表用户验收或正式测试通过，剩余验收见[路线图](../../../docs/roadmap.md)。

当前数据集包含：

- System：生产操作工、生产管理员、仓管、采购员和质检员五类职责角色及下表账号；
- 仓储入口验收：`other-inbound-001`、`other-outbound-001` 只拥有首页及各自其他入库／出库的查看和办理权限，不授予外购／成品入库或生产领料权限；密码仍取 `DEMO_USER_PASSWORD`。
- Product：三个同名不同编码成品、两个同名基础物料 `m1.077.012` / `m1.077.013`、六个大小版本、仅关联基础物料的 BOM，以及可在创建批量任务时手动选择的独立工艺路线；
- 库存选择器样例：`demo-stock-multi` 含两个启用版本和一个停用版本；`demo-stock-meter` 与其同名、编码及单位不同；另含停用物料、只有停用版本的物料，以及启用／停用的两个同名成品。主数据只补缺，不覆盖已有状态或编辑。
- 入库归批样例：[`012-inbound-grouping-demo.sql`](012-inbound-grouping-demo.sql) 只补“演示共批供应商甲／乙”两条供应商主数据；采购正式分配及成品批准授权仍须通过业务流程准备，不在种子中伪造。
- 采购跟进样例：[`013-purchase-order-status-demo.sql`](013-purchase-order-status-demo.sql) 提供草稿取消、三行结束／恢复、无到货整单取消三张独立备料采购单；只补缺失标记，不覆盖已办理状态，不生成到货、质检、正式分配或库存事实。
- Production：一张批量工单与一张研发工单，编号按[统一业务编号](../../../apps/api/docs/business-numbering.md)的工单类型分配；`demo-mass-001` / `demo-research-001` 放入外部订单号作为重复加载时的补缺标记。均为草稿，不自动下达、选版本、生成需求或库存流水。

成品写 `products`，基础物料写 `materials`，具体版本写 `material_variants`；两类主数据的分类均写 `item_categories`，以 `item_kind` 区分。两个物料都叫“微带”，分类为“半成品 → 微带电路”，获取方式为 `purchased`；分类不意味着开放自产半成品链路。版本候选由管理员选择，批量按任务一次完整初配锁定同物料一个版本，同工单不同任务可以不同版本；研发不依赖 BOM，首次与后续均可手工选择有效物料及启用版本。

`admin` 账号不在演示数据中，仍由 `pnpm db:bootstrap-admin` 通过环境变量初始化。演示账号共用的密码不会写入 SQL，执行时由 `DEMO_USER_PASSWORD` 生成 bcrypt 哈希。

| 账号 | 角色编码 | 验收职责 |
| --- | --- | --- |
| `operator-001`、`operator-002` | `operator` | 本人负责工序的开始、完成、重开与报工 |
| `production-001` | `production` | 产品资料、工单与任务、独立报工记录查看、用料分配、产出及审批处理；库存仅查看 |
| `warehouse-001` | `warehouse` | 采购到货及整单登记作废、库存查询、出入库、退料、领料损耗和盘点 |
| `procurement-001` | `procurement` | 供应商和采购单，不办理到货、质检或库存记账 |
| `quality-001` | `quality` | 来料分组管理、检验与复核、成品质检、工序专检，不办理库存记账 |
| `other-inbound-001` | `demo-other-inbound` | 仅办理其他入库 |
| `other-outbound-001` | `demo-other-outbound` | 仅办理其他出库 |

完整初始化与演示数据加载：

```powershell
corepack pnpm db:init
$env:ALLOW_DEMO_SEED='1'
$env:DEMO_USER_PASSWORD='<至少 6 位的演示密码>'
corepack pnpm db:seed:demo
```

System 演示账号和权限按业务编码幂等更新，授权清单在 SQL 中显式列码，不使用权限前缀匹配。生产管理员的仓储授权只有 `warehouse:inventory:view`；出入库确认等库存操作由仓管办理。脚本整体覆盖上述角色的权限和上述账号的角色，包括已有同码 `quality` 角色，不保留手工调整后的配置。

Product 主数据、Procurement 供应商与 Production 草稿工单只补缺失样例，可以重复执行；不会覆盖已有样例的业务编辑、待审或已批准 BOM、已启用路线步骤或已下达工单。已有同名编码记录的停用/删除状态也不自动恢复。供应商名称作为补缺标识，手工改名后再次加载会补回原名称，不修改已改名记录。它不会进入 `db:init`、生产部署或 CI 自动执行链路。不得在生产数据库启用此门禁。

库存样例供人工核对两级选料、成品无版本、按单位汇总及仅其他单权限的入口。种子不生成出入库单、库存批次或流水；已有批次、共享新批次及出库场景须从其他入库界面保存草稿并确认后再办理，库存事实仍由 Inventory 命令产生。

工单样例与通用日计数在种子运行器的同一事务中写入，前缀读取共享映射；重复加载不再取号。初始计划日期为加载日及其后第七日。样例的外部订单号承担演示标记，修改后再次加载会视为样例缺失；它不是正式工单编号，也不用于推算序列。

拆表及采购供应商层级迁移要求空业务库；先从空库执行完整 migration 和系统初始化，再显式运行 demo。`202610280002` 还保护全部 HTTP 幂等记录，已有开发数据不转换为主单供应商，具体守卫和停写要求见[迁移安全](../docs/migration-safety.md#202610280002采购主单供应商与明细金额)。

演示路线所有工序统一报工；操作工通过既有工序操作权限明确开始、完成及重开本人负责工序，数量达标不自动完成。

工序专检通过既有业务入口准备执行中的批量任务后办理，不由演示种子生成正式质检或生产处置事实。`quality-001` 负责登记和更正，`production-001` 负责在生产执行页处理不合格及后续返工或报废。生产演示角色显式包含独立的 `production:execution-records:view`，并另有专检查看权限用于追溯；产线最小权限验收须另用仅有生产报工记录查看及异常管理权限的账号，确认处理不依赖生产任务或质检页面权限。只读验收账号只分配报工记录查看及其生产分组，不授予任务查看或动作权限；既有角色不由迁移自动补授新权限。

## 采购跟进状态的人工验收准备

完成 `db:init` 并显式加载 demo 后，可按采购备注中的标记定位以下样例，编号按统一业务编号的采购订单类型分配，不依赖固定业务 ID。

| 备注标记 | 初始状态 | 人工验收用途 |
| --- | --- | --- |
| `[demo-purchase-state-draft]` | 草稿，三行 | 填原因直接取消；或先编辑并确认下单 |
| `[demo-purchase-state-ordered]` | 已下单，三行进行中 | 逐行结束、最后一行使主单结束、恢复任一行使主单恢复、整单结束；核对主行状态及通用操作日志中的原因 |
| `[demo-purchase-state-cancel]` | 已下单，三行进行中 | 无到货整单取消；也可先结束部分行再取消，核对已取消不可恢复及通用操作日志中的原因 |

每张样例单只有一个主单供应商：草稿与结束／恢复样例为演示共批供应商甲，取消样例为乙。三行依次使用 `demo-stock-multi-v1-A` 10 根、`demo-stock-multi-v1-B` 15 根及 `demo-stock-meter-v1-A` 5 米，保持同单精确物料版本唯一。首行两项采购单位单价含超 JavaScript 安全精度的长文本及尾零，其他行为空，供核对文本保存及正式冻结，不作税额运算。

样例只提供采购跟进场景，不包含实际到货。重新加载 demo 不恢复已取消／已结束的样例，也不覆盖采购编辑；标记位于备注开头，手动移除标记后再次加载会按缺失样例补建。需要再次验证可新建独立备料单。

## 共用本次新批次的人工验收准备

以下样例的采购放行和成品批准授权须由管理员通过业务入口准备；`other-inbound-001` 的权限只用于其他入库，不能办理采购或成品来源。正式规则分别见[采购实际入库](../../../apps/api/src/modules/procurement/docs/receipts.md#实际入库与退回)、[成品实际入库](../../../apps/api/src/modules/production/docs/database/finished-goods-inbound.md#直接确认事务)和[其他入出库](../../../apps/admin-web/docs/other-inventory-orders.md)。

外购物料先按下表供应商分别创建两张独立备料采购单，甲单含两种精确版本，乙单含一行；主单明确选择供应商，正式下单后分别登记真实到货。每条到货分别全检并明确放行，库管按该行数量核实并定稿可入分配；尚未实际入库时再进入入库管理共同核对。

| 供应商 | 精确物料版本 | 计划／本次到货量 | 全检合格／不合格 | 库管核实／可入量 |
| --- | --- | ---: | --- | --- |
| 演示共批供应商甲 | `demo-stock-multi-v1-A` | 10 根 | 10／0 | 10／10 |
| 演示共批供应商乙 | `demo-stock-multi-v1-A` | 15 根 | 15／0 | 15／15 |
| 演示共批供应商甲 | `demo-stock-multi-v1-B` | 5 根 | 5／0 | 5／5 |

前两条明确共用本次新批次时，预期形成同一个实际批号、合计 25 根，仍保留两条来源及各自供应商；第三条版本不同，不能加入该组，独立新建应形成另一个批号。默认独立新建、分出后再次共用、移除组内首行及选择已有批次可在确认前分别核对，确认后不改写事实。

其他入库可直接用 `demo-stock-multi-v1-A` 的两行正整数数量核对共用新批次及主行备注，再加入 `demo-stock-multi-v1-B` 核对版本隔离。`demo-stock-meter-v1-A` 与前者同名但编码及单位不同，不能因名称相同归到同一组。

成品来源可从外部订单号为 `demo-research-001` 的研发草稿工单准备，其成品为 `p-micro-20-30`、计划 10 pcs。设置有审批资格的工单负责人并下达，创建计划 10 pcs 的研发任务；手工提需 `demo-stock-multi-v1-A` 1 根，可从上述采购实际入库后形成的批次完成分配、领料，再按真实办理顺序开工、结束及收尾。产出草稿使用计划内 10 pcs、计划外 2 pcs、报废 0 pcs，成品全检 12 合格／0 不合格并明确放行；产线核对、引用检验记录，完成物料收尾后通过工单负责人审批。批准后应有计划内／外两条当前授权，在成品入库确认中显式共用本次新批次，预期同批 12 pcs，并保留各自授权类别。

研发开工、收尾、独立检验和审批的前置条件仍以页面当前资格及[生产工作流](../../../apps/api/src/modules/production/docs/business-workflow.md)、[成品操作手册](../../../docs/manuals/finished-output-inspection-inbound.md)为准，样例数量不能跳过业务步骤。若演示工单已被手工办理，按其当前阶段继续，或新建同成品研发工单；重新加载 demo 不覆盖历史、不恢复已消费授权。

## 到货整单登记作废的人工准备

显式重跑 demo 后，`warehouse-001` 获得 `warehouse:receipts:void`；该权限通过演示角色显式列码授权，已有自定义角色仍须自行分配。以下场景经业务入口人工准备，不由 seed 生成到货、检验、正式分配或作废事实；作废规则见[到货所有者文档](../../../apps/api/src/modules/procurement/docs/receipts.md#整单到货登记作废)。

管理员或采购员可用启用供应商与精确物料版本建立独立备料采购并正式下单，仓管登记含两行的同一张到货单；也可新建两行采购，避免覆盖采购跟进样例。先在任一行发起来料检查并保持未完成，再从主单作废入口核对完整两行及原因；提交同时携带详情的主单版本和完整行／轮版本。预期整单成功、主单版本由 0 增为 1、作废摘要显示原因／人员／时间、在途检查失效、原登记和数量修订可查、两行均退出有效数量及质检／入库候选。另建已完成 QC 并定稿、尚未实际入库或退回的到货登记，核对同样可作废且完成检验与清单保留。

阻断样例须另建到货：任一行实际入库或实际退回后应整单拒绝；存在草稿、已下单或已结束关联补单时也应拒绝，来源处理轮已变化仍阻断。人工取消符合取消资格的关联补单后，再核对到货自身能否作废；不提供解除或跨到货换绑来源。作废后旧页面的更正、检验、定稿、拒收、退回、入库及新补单引用应拒绝，采购状态保持人工跟进结果；历史到货存在，采购取消资格不会恢复。并发、失败回滚及正式自动化覆盖仍按[路线图](../../../docs/roadmap.md)的阶段安排。

## 补单来源与物流解耦的人工验收准备

完成 `db:init`、显式加载 demo 并启动本地 API 后，使用[准备脚本](../../../scripts/prepare-procurement-supplement-demo.mjs)生成业务样例。采购、到货、质检、定稿、入库及退回全部通过正式 API 办理；脚本不直接写业务表，不属于正式测试集。

```bash
ALLOW_DEMO_SEED=1 node scripts/prepare-procurement-supplement-demo.mjs prepare
ALLOW_DEMO_SEED=1 node scripts/prepare-procurement-supplement-demo.mjs report
```

未指定模式时只读报告。脚本读取初始化管理员的环境凭证，不输出密码或令牌；要求非生产环境及显式 `ALLOW_DEMO_SEED=1`。API 默认 `http://127.0.0.1:3002/api`，可用 `PROCUREMENT_SUPPLEMENT_DEMO_API_BASE_URL` 指定；远程地址额外要求 HTTPS 和 `PROCUREMENT_SUPPLEMENT_DEMO_ALLOW_REMOTE=1`。不会进入初始化、部署或 CI 自动执行链路。

默认备注标记为 `[demo-supplement-decoupled-v1]`，报告提供实际单号和明细 ID，不依赖固定 ID。已有标记时只报告、不继续写入；失败会保留已完成的真实事实并报告，不盲目重试。需要新一组样例可设置由字母、数字、下划线或连字符组成的 `PROCUREMENT_SUPPLEMENT_DEMO_TAG`，或重建开发库后重新准备。

| 场景标记 | 准备结果与人工核对目标 |
| --- | --- |
| `excess-original`、`excess-before-inbound`、`excess-after-inbound` | 原采购计划 100、到货及实入 120；分别在实入前、后办理 20 的超量补单。原采购保持 120／120，补单无自身物流统计和到货记录 |
| `quality-original`、`quality-old-draft`、`quality-old-continued` | 原到货 100，质量分配 A 为可入 95／待退 5，更正 B 为 97／3；两张补单均固定原到货，另一张旧草稿改量、下单并自身到货入库 5。核对同到货唯一候选、相关补单及独立统计 |
| `source-uninspected`、`source-all-pending`、`source-all-return` | 未检、全待处理、全超发待退来源不具备新建超量补单资格 |
| `source-quality-returned-history` | 质量实际退回 2 后剩余 8 全部可入，当前无质量待退，该到货仍可作为新质量补单来源 |

总计准备 10 张采购单、7 张到货单；超量样例的两张 20 用于比较办理时机，不表示应重复补购。成功报告应为 `prepared: true`、`initialReadinessIssues: []`。

## 质量补单按原到货关联的人工验收准备

两类补单都只保存原采购行、原到货明细和补购说明，不选择或保存分配 ID，也不提供分配依据更正入口。仓库入退仍使用真实 allocation；采购候选按到货明细去重，两类候选均核对整次到货的到货量、当前可入库、已入库、待退回及已退回。质量原因资格与全部原因的展示退回量分别核对，口径见[候选查询](../../../apps/api/src/modules/procurement/docs/receipt-queries.md#入库候选及正式分配)。

已有上一节的独立来源样例时，可追加一张小量历史退回草稿，不重复准备基础十张订单：

```bash
ALLOW_DEMO_SEED=1 PROCUREMENT_SUPPLEMENT_DEMO_TAG='<已有来源tag>' node scripts/prepare-procurement-supplement-demo.mjs prepare-history
ALLOW_DEMO_SEED=1 PROCUREMENT_SUPPLEMENT_DEMO_TAG='<已有来源tag>' node scripts/prepare-procurement-supplement-demo.mjs report
```

`prepare-history` 复用 `source-quality-returned-history`，要求其候选当前待退为 0、真实质量已退为 2，创建 `quality-history-receipt-draft` 草稿并保留供采购员手工下单。已有同场景标记时不追加；失败不盲目重试。报告提供实际采购单／行及原到货 ID。人工验收核对当前轮仅可入 8、历史已退 2 时仍可按原到货新建和下单；处理轮变化不改已建补单来源，采购员手动决定补购量，不以待退或累计补单量封顶。

该模式只通过正式 API 补充演示数据，不修改已有单据、实际退回或库存事实。

## 采购到货分层列表的人工验收准备

完成 `db:init`、显式加载 demo 并启动 API 后，使用[到货分层准备脚本](../../../scripts/prepare-procurement-receipt-demo.mjs)。采购、到货、检验和作废均通过正式 API 形成，不直接写业务表，不属于正式测试集。

```bash
ALLOW_DEMO_SEED=1 node scripts/prepare-procurement-receipt-demo.mjs prepare
ALLOW_DEMO_SEED=1 node scripts/prepare-procurement-receipt-demo.mjs report
```

默认模式 report 只读业务状态。脚本使用初始化管理员环境凭证，不输出密码或令牌；要求非 production 环境及 `ALLOW_DEMO_SEED=1`。API 默认 `http://127.0.0.1:3002/api`，可通过 `PROCUREMENT_RECEIPT_DEMO_API_BASE_URL` 指定；远程地址额外要求 HTTPS 和 `PROCUREMENT_RECEIPT_DEMO_ALLOW_REMOTE=1`，脚本不进入初始化、部署或 CI 自动链路。

默认备注标记为 `[demo-procurement-receipts-v1]`；设置 1～40 位字母、数字、下划线或连字符的 `PROCUREMENT_RECEIPT_DEMO_TAG` 后，标记为 `[demo-procurement-receipts-v1:<tag>]`。同标记已有采购时 prepare 不续写、不补缺，先用 report 核对；失败保留已提交事实且不自动重试，重新准备使用新 TAG。用户办理后统计可与初始值不同，`initialReadinessIssues` 仅对照初始样例，不表示用户验收或正式测试通过。

初始样例为 12 张甲／乙供应商交替的采购主单、23 张到货：`purchase-12` 有 12 张到货，其余各一张；最旧的 `large-1` 含完整 100 行，另有 4 条待定稿、1 条检查中明细及 1 张作废到货。用于核对两层深页、完整物料、作废保留、筛选后子集合不裁剪及页外定位。`single-11` 仅 B 版本待定稿、A 版本待检，可用 A 版本关键词与待定稿同时筛选，核对不能跨明细拼接命中；`single-1` 在默认父第 2 页，`large-1` 在所属到货第 2 页，报告提供真实单号及 ID 供精确定位。

## 来料质检分组的人工验收准备

完成 `db:init`、显式加载 demo 并启动本地 API 后，使用[来料分组准备脚本](../../../scripts/prepare-incoming-inspection-demo.mjs)。采购、到货、检查、分组、定稿、实际入库／退回及作废均通过正式 API 形成，不直接写业务表，不属于正式测试集。

```bash
ALLOW_DEMO_SEED=1 node scripts/prepare-incoming-inspection-demo.mjs prepare
ALLOW_DEMO_SEED=1 node scripts/prepare-incoming-inspection-demo.mjs report
```

默认模式 report 只读业务状态。脚本使用初始化管理员环境凭证，不输出密码或令牌；要求非 production 环境和 `ALLOW_DEMO_SEED=1`。API 默认 `http://127.0.0.1:3002/api`，可通过 `INCOMING_INSPECTION_DEMO_API_BASE_URL` 指定；远程地址额外要求 HTTPS 和 `INCOMING_INSPECTION_DEMO_ALLOW_REMOTE=1`。脚本不进入初始化、部署或 CI 自动链路。

默认备注标记为 `[demo-incoming-group-v1]`，可设置 1～40 位字母、数字、下划线或连字符的 `INCOMING_INSPECTION_DEMO_TAG` 建立独立样例组。发现已有同标记单据时仅报告，不覆盖手工办理后的状态、不续做部分流程；失败保留已成功事实，不自动换键重试，可先运行 report 核对，再用新 TAG 准备另一组。

一次准备建立 2 张分别属于不同供应商的采购、25 张到货及 12 张质检主单：大组关联 12 张跨采购到货，含一张 100 行到货；另含检查中已真实移出再移回的来源、已完成检查但未分组、空主单、关联后作废以及未分组作废来源。主单和大组到货均超过默认一页。报告返回真实单号、ID、版本与关联数，供跨页、精确历史、两窗口旧版本冲突及草稿保持的人工核对；这些数据存在不代表验收或并发测试通过。

上述 25 张到货中的 `single-8` 全检 5 合格、定稿可入 5 并实际入库 5；`single-9` 全检 4 合格／1 不合格、定稿可入 4／质量待退 1，再实际入库 4 并退回 1。两者均通过真实执行使剩余实物为零，用于核对 completed 阶段和真实入退聚合，包含正式分配、Inventory 入库／批次／正流水及供应商退回事实；不以直接改轮次状态制造已处理完样例，不额外增加到货或质检主单。

显式重跑 demo 后 `quality-001` 获得分组管理权限。自定义角色仍须明确授权，分组管理不自动授予原检查动作或仓储权限；业务边界见[Quality 分组主单](../../../apps/api/src/modules/quality/docs/incoming-inspection-orders.md)。

## BOM 审批演示

演示成品的 BOM 默认 `draft`，不生成审批配置、申请或批准记录。生产管理员演示角色具备审批查看和处理权限；管理员可在审批流程配置页选择“生产管理员 → 系统管理员”两级，使用 `production-001` 和 `.env` 初始化的管理员分别处理。流程配置权限仍由系统管理员管理，演示操作工不获得审批资格。

重建库后先 `pnpm db:init`，再显式运行 `ALLOW_DEMO_SEED=1 DEMO_USER_PASSWORD='<演示密码>' pnpm db:seed:demo`。工单仍是草稿；批量工单下达后，须先在产品页提交 BOM 并完成审批，才能创建批量任务；研发任务不要求 BOM 审批。

重复加载 demo 仅补缺失的草稿 BOM，锁成品聚合根并递增实际变更的 version；待审、已批准和软删除成品不会因此变动。不写入 `products.default_route_id`，工艺路线由创建任务的人员选择。System 演示账号与授权仍按本脚本重置，不用于保留用户手工调整后的角色分配。
