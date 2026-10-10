import type { ProductionReportContext } from './production-report-selection';
import { PRODUCTION_REPORT_QUANTITY_MAX } from '@company/constants';
import { formatQuantity } from './production-status';

type ReportEntryContext = Pick<
  ProductionReportContext,
  'canReport' | 'reportBlockedReason' | 'availableReportQuantity' | 'status'
>;

/** 剩余额度来自服务端投影；普通新增与独立历史纠错使用各自资格。 */
export const canOpenProductionReport = (context: ReportEntryContext, historical = false): boolean =>
  context.canReport &&
  (historical || context.status === 'doing') &&
  Number.isFinite(Number(context.availableReportQuantity)) &&
  Number(context.availableReportQuantity) > 0;

export const productionReportBlockedReason = (
  context: ReportEntryContext,
  historical = false,
): string | null => {
  if (canOpenProductionReport(context, historical)) return null;
  if (!historical && context.status === 'completed')
    return context.reportBlockedReason || '工序已完成，请重新开工后再报工';
  if (!context.canReport) return context.reportBlockedReason || '当前没有报工资格';
  if (Number(context.availableReportQuantity) <= 0)
    return '本工序剩余报工额度为零，请核对报工记录或等待补产授权生效';
  return '当前工序或剩余额度不可用，请刷新后核对';
};

/** 只解析，不回写输入；非法原文在输入、失焦和刷新时均保留。 */
export const validateProductionReportQuantity = (
  input: string,
  available: number,
): { quantity: number | null; error: string | null } => {
  const text = input.trim();
  if (!text) return { quantity: null, error: '请输入本次数量' };
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text)))
    return { quantity: null, error: '本次数量必须为正整数，不能含小数或其他字符' };
  const quantity = Number(text);
  if (quantity <= 0) return { quantity: null, error: '本次数量必须大于零' };
  if (quantity > PRODUCTION_REPORT_QUANTITY_MAX)
    return {
      quantity: null,
      error: `本次数量不能超过单次报工上限 ${formatQuantity(PRODUCTION_REPORT_QUANTITY_MAX)}`,
    };
  if (!Number.isFinite(available) || quantity > available)
    return { quantity: null, error: `本次数量不能超过剩余可报 ${formatQuantity(available)}` };
  return { quantity, error: null };
};

/** 更正是完整替代量；零量保留原文，由人员明确改办全量冲销。 */
export const validateProductionReportCorrectionQuantity = (
  input: string,
  maximum: number,
): { quantity: number | null; error: string | null } => {
  const text = input.trim();
  if (!text) return { quantity: null, error: '请输入更正后的完整正常数量' };
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text)))
    return { quantity: null, error: '更正后数量必须为正整数，不能含小数或其他字符' };
  const quantity = Number(text);
  if (quantity === 0) return { quantity, error: '数量为 0 时请使用全量冲销' };
  if (quantity > PRODUCTION_REPORT_QUANTITY_MAX)
    return {
      quantity,
      error: `更正后数量不能超过单次报工上限 ${formatQuantity(PRODUCTION_REPORT_QUANTITY_MAX)}`,
    };
  if (!Number.isFinite(maximum)) return { quantity, error: '当前报工额度不可用，请重新核对工序' };
  if (maximum <= 0)
    return { quantity, error: '当前没有可用于更正的正常报工额度，请核对记录或另办全量冲销' };
  if (quantity > maximum) return { quantity, error: `更正后数量最多为 ${formatQuantity(maximum)}` };
  return { quantity, error: null };
};
