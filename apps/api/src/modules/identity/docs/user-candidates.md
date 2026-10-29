# 业务场景人员候选

> [返回 Identity](../README.md#业务场景人员候选)。本页拥有候选配置、资格公开边界和并发规则；表结构见[数据库设计](database.md#18-user_candidate_configs)。业务模块拥有何时要求人员、是否必填及业务状态资格。

## 场景与集合语义

场景来自共享 [`USER_CANDIDATE_SCENE_CATALOG`](../../../../../../packages/constants/src/user-candidates.ts) 代码目录，当前仅开放 `production.work_order_owner`（工单负责人）。目录保存稳定代码与名称，配置接口不能创建场景。新增场景先确认产品范围和业务所有者，再增加共享目录及契约，并由对应业务模块固定场景调用；Identity 不反向依赖业务模块，也不承载其状态或办理规则。只新增场景且表结构、权限不变时，无需为运行时创建配置增加 migration。

每个场景选择多个当前启用且未删除的角色；候选为这些角色的当前成员并集，按用户 ID 去重。账号与所命中角色都必须启用且未删除。角色表示职责分组，不表示职级，不固定生产角色编码，不根据通配管理员身份自动加入，不要求候选具有配置页面权限。无配置、空角色集合、无成员或只有失效角色均返回空集合；没有宽松回退。

角色停用会即时使该角色不能贡献候选，其他已配置有效角色仍可命中同一用户。配置引用的角色不能软删除，即使当前没有成员；须先从所有配置移除引用。已有停用角色仍回显名称，保存时须移除失效角色或先恢复角色启用。配置不保存用户快照、指定用户名单或 JSON 条件。

## 管理接口与权限

| 接口 | 消费入口 | 独立权限 |
| --- | --- | --- |
| `GET /system/user-candidate-configs` | 业务人员配置 | `system:user-candidates:view` |
| `PUT /system/user-candidate-configs/:sceneCode` | 业务人员配置 | `system:user-candidates:configure` |
| `GET /system/roles/options` | 用户管理、业务人员配置 | any-of：`system:user:view`、`system:user-candidates:view`、`system:user-candidates:configure` |

前端页面入口为 `/system/user-candidates`，页面和菜单名称来自权限目录。接口响应使用 [`UserCandidateConfigItem`](../../../../../../packages/contracts/src/system.ts)，按场景目录返回全部场景，未配置项仍返回且 `configId/version` 为 `null`、角色为空、候选数为 `0`。`roles` 回显已选角色，包括已停用项；角色选项接口仅返回当前有效角色。`candidateCount` 使用与候选相同的实时去重口径，不持久化人数或成员名单。

PUT 通过 class DTO 校验场景、版本和角色集合，完整替换所选角色，最多 50 个且不能重复，允许显式保存空集合。首次保存传 `version:null`，创建后返回版本 `1`；后续保存传当前整数版本，以 CAS 更新并递增。两个首次保存请求或旧版本保存只允许一个成功，其余返回 `409 CONCURRENT_MODIFICATION`；无效角色返回 `400`。配置及前后角色集合成功审计同事务提交，失败不留下新配置或部分关联。该接口不启用 HTTP 幂等，收到幂等键遵守[公共拒绝规则](../../../../../../docs/api-conventions.md#7-请求上下文与幂等键)。

## 公开资格与历史显示

[`UserCandidateService`](../public.ts) 公开 `listCandidates(sceneCode): Promise<UserOption[]>` 和 `checkEligibility(sceneCode, userId): Promise<{ eligible: boolean; message: string | null }>`，不暴露连接、事务或数据库行类型，不抛 Nest HTTP 异常。候选是完整的当前集合，按姓名、ID 稳定排序，不分页或静默截断；规模迁移遵守[公共候选规则](../../../../../../docs/api-conventions.md#51-候选完备性与增长迁移)。

业务写入必须在自身事务内调用 `checkEligibility`，并将失败结果映射为所属模块业务错误。该检查自动复用同池活动事务；事务外调用只保证本次判断的一致性，不能保护后续另一个事务的写入。候选列表只能辅助选择，不能替代写入时复核。

历史引用独立使用 `IdentityDirectoryService.listUserReferencesByIds`，保留停用、软删除用户的当前显示姓名，不按当前候选过滤。配置或成员变化不会抹去历史显示，也不会自动改写既有单据负责人；业务后续命令是否要求再次满足资格由业务模块所有。

## 并发与锁序

- 保存配置按操作者用户共享锁、配置根插入或排他锁、所选角色 ID 升序共享锁、配置角色关联排他锁执行；初次创建直接使用场景唯一键竞争。验证角色失败抛出协议无关错误，事务整体回滚。
- 写入资格先共享锁定目标用户，再共享锁定配置根、配置角色关联、ID 升序的角色及目标用户成员关系。所有资格数据使用当前锁定读，避免复用调用事务早先建立的 RR 快照；锁保留到最外层业务事务结束。
- 配置根锁互斥同场景保存与资格检查，所以资格检查获取配置关联后再读角色不会与同场景的集合替换交错。成员替换维持现有 `user -> roles -> user_roles` 顺序，账号停用锁用户、角色停用锁角色，都会与资格检查串行化。
- 角色删除先锁角色，再对成员和配置关联做当前共享读，只读取引用、不反向锁用户或配置根；所选角色的共享锁与删除排他锁互斥。保存、成员替换及角色删除不会通过一次普通快照读绕过仍存在的引用。

Identity 管理命令只写本模块两张配置表和既有身份资料，跨模块业务写入继续由各模块公开能力执行；审计写入沿用[唯一事务 Writer](../../../../docs/audit.md)。
