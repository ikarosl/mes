import type { CreateProductionBatchPayload } from '@company/contracts';

/**
 * createBatch 请求载荷归一化（数据处理，非字段规则验证）。
 *
 * 与后端幂等指纹必须使用同一规范形态：后端指纹按 `normalizeCreateBatchPayload` 的结果计算，
 * 前端 `createBatchIntent` 的意图签名也必须先归一化再计算。否则"删除尾部空格"这类语义等价修改
 * 会让前端误判内容变化而生成新幂等键，后端却因归一化后指纹相同而无法识别为同一意图，最终产生
 * 重复的自动编号批次（P1）。
 *
 * 规则由此函数唯一维护：后端 createBatch 的幂等指纹与前端意图签名都直接使用本函数，两端同源，
 * 杜绝漂移。
 *  - batchNo、remark 去除首尾空白；空串、纯空白串、undefined 统一为 null；
 *  - 其余字段（含 stepOverrides）原样透传，不做任何归一化。
 *
 * 归一化是幂等的：重复调用结果不变。后端仍会在控制器校验后防御性归一化，客户端不可信。
 */
export const normalizeCreateBatchPayload = (
  payload: CreateProductionBatchPayload,
): CreateProductionBatchPayload => ({
  ...payload,
  batchNo: payload.batchNo?.trim() || null,
  remark: payload.remark?.trim() || null,
});
