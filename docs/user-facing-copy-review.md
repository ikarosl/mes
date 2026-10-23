# 用户提示语语义核对

本文只维护提示语中尚需核对的业务含义，不维护逐句改写记录。文案调整已获准实施，下列两项仍未完成；用户验收及正式测试未完成，待办见[路线图](roadmap.md#用户提示语友好化待验收)。

| 待核对项 | 剩余问题与边界 | 来源 |
| --- | --- | --- |
| A01：DTO 业务字段名称 | 结构异常、共用字段和明确的数值范围已有提示；完整 DTO 字段仍须逐项对应业务名称。未知路径不能猜测业务含义，不以全局正则替换字段名，也不改变校验条件、HTTP 状态或错误码。 | [ValidationPipe](../apps/api/src/presentation/http/validation.pipe.ts)、[API 错误诊断](../apps/api/README.md#http-错误诊断) |
| P16：履约术语 | 补料、需求关闭和补产授权中的“待履约”“取消未履约补料单”“补料履约依据”仍需分别核对是待领料、待补料完成还是待授权生效。不能统一替换为“已出库”，不改变状态代码、数量公式或办理资格。 | [生产状态](../packages/constants/src/production/statuses.ts)、[需求更正依据](../apps/admin-web/src/views/production/components/DemandCorrectionEvidence.vue) |

通用表达和恢复动作遵守[HTTP 错误处理](../apps/admin-web/docs/http-error-handling.md#7-错误对象与页面责任)，诊断与用户提示的边界遵守 [API 文档](../apps/api/README.md#http-错误诊断)。具体业务术语由所属模块定义，不因文案精简合并不同事实：冲销不等于删除、不合格不等于报废、批准产出不等于已入库，盘点账面快照不表示冻结实际库存。
