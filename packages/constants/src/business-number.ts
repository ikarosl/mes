/** 人工维护的中文名称拼音首字母前缀；语义类型稳定，不按编号解析业务身份。 */
export const BUSINESS_NUMBER_PREFIX = {
  work_order: 'GD', // 工单
  production_batch: 'SC', // 生产任务
  purchase_order: 'CG', // 采购订单
  purchase_receipt: 'DH', // 采购到货
  incoming_inspection_order: 'LLZJ', // 来料质检单
  incoming_inspection_report: 'JLJYBG', // 进料检验报告
  inbound_order: 'RK', // 入库单，物料与成品共用方向日序列
  outbound_order: 'CK', // 出库单，物料与成品共用方向日序列
  inventory_batch: 'KCPC', // 库存批次
  stock_check: 'PD', // 盘点
  material_loss: 'SH', // 损耗
  manual_material_demand: 'RGXQ', // 人工需求
  approval_instance: 'SP', // 审批
} as const;

export type BusinessNumberKind = keyof typeof BUSINESS_NUMBER_PREFIX;
