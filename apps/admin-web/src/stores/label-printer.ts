import { ref } from 'vue';
import { defineStore } from 'pinia';
import {
  checkLabelPrinter,
  DEFAULT_LABEL_PRINT_SETTINGS,
  LABEL_PRINT_LIMITS,
  type LabelPrintSettings,
} from '@company/printing';

const STORAGE_KEY = 'easy-mes.label-printer-settings.v1';

function isSettings(value: unknown): value is LabelPrintSettings {
  if (!value || typeof value !== 'object') return false;
  const settings = value as Record<string, unknown>;
  return (
    typeof settings.printerName === 'string' &&
    settings.printerName.trim().length > 0 &&
    typeof settings.widthMm === 'number' &&
    Number.isFinite(settings.widthMm) &&
    settings.widthMm >= LABEL_PRINT_LIMITS.minDimensionMm &&
    settings.widthMm <= LABEL_PRINT_LIMITS.maxDimensionMm &&
    typeof settings.heightMm === 'number' &&
    Number.isFinite(settings.heightMm) &&
    settings.heightMm >= LABEL_PRINT_LIMITS.minDimensionMm &&
    settings.heightMm <= LABEL_PRINT_LIMITS.maxDimensionMm &&
    typeof settings.copies === 'number' &&
    Number.isInteger(settings.copies) &&
    settings.copies >= LABEL_PRINT_LIMITS.minCopies &&
    settings.copies <= LABEL_PRINT_LIMITS.maxCopies
  );
}

function copySettings(settings: LabelPrintSettings): LabelPrintSettings {
  return {
    printerName: settings.printerName,
    widthMm: settings.widthMm,
    heightMm: settings.heightMm,
    copies: settings.copies,
  };
}

function readSettings(): LabelPrintSettings {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const value: unknown = stored ? JSON.parse(stored) : null;
    if (isSettings(value)) return copySettings(value);
  } catch {
    // 本机设置损坏或浏览器禁用存储时，恢复未选打印机的默认值，不恢复业务载荷。
  }
  return copySettings(DEFAULT_LABEL_PRINT_SETTINGS);
}

export const useLabelPrinterStore = defineStore('label-printer', () => {
  // 打印机是本浏览器所在工位的配置；跨页面共用占用状态，业务单据仍由各编辑器持有。
  const settings = ref<LabelPrintSettings>(readSettings());
  const busy = ref(false);

  async function runOperation<TResult>(
    operation: (frozenSettings: Readonly<LabelPrintSettings>) => Promise<TResult>,
  ): Promise<TResult> {
    if (busy.value) throw new Error('标签打印正在处理中，请稍后再操作');
    const frozenSettings = Object.freeze(copySettings(settings.value));
    busy.value = true;
    try {
      return await operation(frozenSettings);
    } finally {
      busy.value = false;
    }
  }

  async function saveSettings(
    draft: LabelPrintSettings,
    isCurrent: () => boolean,
  ): Promise<boolean> {
    const next = copySettings(draft);
    if (!isSettings(next)) throw new Error('请选择打印机，并填写有效的纸张尺寸和打印份数');
    return runOperation(async () => {
      await checkLabelPrinter(next);
      if (!isCurrent()) return false;
      try {
        // 仅保存非敏感设备参数，不保存卡号、提交意图或认证信息。
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        throw new Error('浏览器未允许保存本机打印设置，请检查浏览器存储权限后重试');
      }
      settings.value = next;
      return true;
    });
  }

  return { settings, busy, runOperation, saveSettings };
});
