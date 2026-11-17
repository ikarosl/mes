import type { OtherInventoryDirection, OtherInventoryItemKind } from '@company/contracts';
import type { FormItemRule } from 'element-plus';
import {
  otherInventoryDraftIdentity,
  otherInventoryDraftMatchesBatch,
  type OtherInventoryDraftLine,
} from './other-inventory-draft';

export type OtherInventoryDraftLineField =
  'itemKind' | 'material' | 'object' | 'target' | 'quantity' | 'remark';
export type OtherInventoryDraftLineErrors = Record<OtherInventoryDraftLineField, string>;

interface OtherInventoryDraftValidation {
  reason: string;
  remark: string;
  lines: string;
  lineByKey: Record<string, OtherInventoryDraftLineErrors>;
  message: string;
}

/** 字段反馈和命令提交前检查消费同一组规则，候选核验不能被表单必填检查替代。 */
export function validateOtherInventoryDraft(
  form: { reason: string; remark: string },
  lines: readonly OtherInventoryDraftLine[],
  direction: OtherInventoryDirection,
  itemKind: OtherInventoryItemKind,
): OtherInventoryDraftValidation {
  const reason = otherInventoryReasonMessage(form.reason, '办理原因');
  const remark = form.remark.length > 5000 ? '单据备注不能超过 5000 个字符' : '';
  const lineCount = !lines.length || lines.length > 50 ? '每单须保留 1–50 条有效明细' : '';
  const lineByKey: Record<string, OtherInventoryDraftLineErrors> = {};
  const groupIdentities = new Map<string, Set<string>>();
  for (const line of lines) {
    if (line.target.mode !== 'new' || !line.object) continue;
    const identities = groupIdentities.get(line.target.clientKey) ?? new Set<string>();
    identities.add(otherInventoryDraftIdentity(line));
    groupIdentities.set(line.target.clientKey, identities);
  }

  for (const line of lines) {
    const errors: OtherInventoryDraftLineErrors = {
      itemKind: '',
      material: '',
      object: '',
      target: '',
      quantity: '',
      remark: '',
    };
    if (line.itemKind !== itemKind) errors.itemKind = '每单明细须使用当前单据的库存对象类型';
    if (
      !Number.isInteger(line.quantity) ||
      !line.quantity ||
      line.quantity < 1 ||
      line.quantity > 99_999_999
    )
      errors.quantity = '数量须为 1–99,999,999 的整数';
    if (line.remark.length > 5000) errors.remark = '行备注不能超过 5000 个字符';

    if (line.target.mode === 'existing') {
      if (!line.target.batchId || !line.batch) {
        errors.target = '请选择已有库存批次';
      } else if (!otherInventoryDraftMatchesBatch(line)) {
        errors.target = '库存对象、精确版本及单位须与所选批次一致，请重新选择批次';
      }
    } else {
      if (direction === 'outbound') errors.target = '其他出库仅可选择已有库存批次';
      else if (!line.target.clientKey.trim()) errors.target = '请选择新批次目标';
      else if ((groupIdentities.get(line.target.clientKey)?.size ?? 0) > 1)
        errors.target = '共用新批次的明细须为同物料版本或同成品、同单位';

      if (!line.object?.id) {
        errors.object = line.itemKind === 'material' ? '请选择精确物料版本' : '请选择成品';
      } else if (line.object.itemKind !== line.itemKind) {
        errors.object = '明细类型与库存对象不一致，请重新选择';
      } else if (!line.objectVerified) {
        errors.object = '请重新核验库存对象；停用或读取失败的对象不能新建批次';
      }
      if (line.itemKind === 'material') {
        if (!line.material) errors.material = '请选择基础物料';
        else if (!line.materialVerified) errors.material = '请重新核验物料，核验成功后可新建批次';
        else if (line.object && line.object.itemId !== line.material.id)
          errors.object = '精确版本须属于所选物料，请重新选择';
      }
    }
    lineByKey[line.key] = errors;
  }

  return {
    reason,
    remark,
    lines: lineCount,
    lineByKey,
    message:
      reason ||
      remark ||
      lineCount ||
      Object.values(lineByKey)
        .flatMap((errors) => Object.values(errors))
        .find(Boolean) ||
      '',
  };
}

export function otherInventoryReasonMessage(value: string, label: string): string {
  if (!value.trim()) return `请填写${label}`;
  return value.length > 5000 ? `${label}不能超过 5000 个字符` : '';
}

export function otherInventoryFieldRule(message: () => string, required = false): FormItemRule {
  return {
    required,
    trigger: ['blur', 'change'],
    validator: (_rule, _value, callback) => {
      const error = message();
      callback(error ? new Error(error) : undefined);
    },
  };
}
