/** 人工维护的业务编号前缀；语义类型稳定，不按编号解析业务身份。 */
export const BUSINESS_NUMBER_PREFIX = {
  work_order: 'WO',
  production_batch: 'TB',
  purchase_order: 'PO',
  purchase_receipt: 'RC',
  supplier_return: 'VR',
  purchase_inbound: 'PI',
  finished_inbound: 'FI',
  inventory_batch: 'IB',
  stock_check: 'PD',
  production_material_outbound: 'PMO',
  production_material_return: 'TL',
  material_loss: 'SH',
  manual_material_demand: 'MD',
  rework: 'RW',
  step_report: 'SR',
  abnormal_disposition: 'BAD',
  scrap_supplement_plan: 'SSP',
  material_supplement: 'SUP',
  approval_instance: 'AP',
} as const;

export type BusinessNumberKind = keyof typeof BUSINESS_NUMBER_PREFIX;
