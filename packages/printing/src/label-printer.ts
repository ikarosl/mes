import { getLodop } from './lodop-funcs.js';
import type { LodopApi, LodopReturnHandler } from './lodop-types.js';
import { LodopPrintError } from './print-error.js';

export interface LabelPrintSettings {
  printerName: string;
  widthMm: number;
  heightMm: number;
  copies: number;
}

export interface BarcodeLabel {
  barcode: string;
  text: string;
}

export interface LodopPrinters {
  printers: string[];
  version: string;
}

export const LABEL_PRINT_LIMITS = Object.freeze({
  minDimensionMm: 10,
  maxDimensionMm: 300,
  minCopies: 1,
  maxCopies: 100,
});

export const DEFAULT_LABEL_PRINT_SETTINGS: Readonly<LabelPrintSettings> = Object.freeze({
  printerName: '',
  widthMm: 60,
  heightMm: 40,
  copies: 1,
});

const PRINT_CONFIRMATION_TIMEOUT_MS = 30_000;
const MAX_LABELS_PER_JOB = 1_000;
const MAX_BARCODE_LENGTH = 128;
const MAX_TEXT_LENGTH = 200;

let pendingOperation: Promise<void> = Promise.resolve();

function serializeOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = pendingOperation.then(operation);
  // A rejected job releases the queue without turning the next caller into a retry of that job.
  pendingOperation = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function validateSettings(settings: LabelPrintSettings): LabelPrintSettings {
  if (typeof settings.printerName !== 'string' || !settings.printerName.trim()) {
    throw new LodopPrintError('INVALID_SETTINGS', '请先选择标签打印机');
  }
  const { minDimensionMm, maxDimensionMm, minCopies, maxCopies } = LABEL_PRINT_LIMITS;
  if (
    !Number.isFinite(settings.widthMm) ||
    !Number.isFinite(settings.heightMm) ||
    settings.widthMm < minDimensionMm ||
    settings.widthMm > maxDimensionMm ||
    settings.heightMm < minDimensionMm ||
    settings.heightMm > maxDimensionMm
  ) {
    throw new LodopPrintError(
      'INVALID_SETTINGS',
      `标签宽度和高度须为 ${minDimensionMm} 至 ${maxDimensionMm} 毫米`,
    );
  }
  if (
    !Number.isInteger(settings.copies) ||
    settings.copies < minCopies ||
    settings.copies > maxCopies
  ) {
    throw new LodopPrintError(
      'INVALID_SETTINGS',
      `每张标签的份数须为 ${minCopies} 至 ${maxCopies} 的整数`,
    );
  }
  return { ...settings };
}

function validateLabels(labels: readonly BarcodeLabel[]): BarcodeLabel[] {
  if (labels.length === 0 || labels.length > MAX_LABELS_PER_JOB) {
    throw new LodopPrintError('INVALID_LABELS', `每次须打印 1 至 ${MAX_LABELS_PER_JOB} 张标签`);
  }
  return labels.map((label) => {
    if (
      typeof label.barcode !== 'string' ||
      !label.barcode ||
      label.barcode.length > MAX_BARCODE_LENGTH ||
      !/^[\x20-\x7e]+$/.test(label.barcode)
    ) {
      throw new LodopPrintError(
        'INVALID_LABELS',
        '条码须为非空可打印 ASCII 文本，且不超过 128 字符',
      );
    }
    if (
      typeof label.text !== 'string' ||
      !label.text.trim() ||
      label.text.length > MAX_TEXT_LENGTH ||
      /[\p{Cc}\p{Zl}\p{Zp}]/u.test(label.text)
    ) {
      throw new LodopPrintError('INVALID_LABELS', '标签文字须为非空单行文本，且不超过 200 字符');
    }
    return { barcode: label.barcode, text: label.text };
  });
}

function listPrinters(client: LodopApi): string[] {
  const count = client.GET_PRINTER_COUNT();
  if (!Number.isSafeInteger(count) || count < 0 || count > 10_000) {
    throw new LodopPrintError('CLIENT_UNSUPPORTED', '本机打印服务返回的打印机列表无效');
  }
  const printers: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const name = client.GET_PRINTER_NAME(index);
    if (typeof name !== 'string' || !name) {
      throw new LodopPrintError('CLIENT_UNSUPPORTED', '本机打印服务返回的打印机名称无效');
    }
    printers.push(name);
  }
  return printers;
}

function ensureClientAvailable(client: LodopApi): void {
  if (!client.SocketEnable || client.webskt?.readyState !== WebSocket.OPEN) {
    throw new LodopPrintError('SERVICE_UNAVAILABLE', '本机打印服务连接已断开，请重新检测');
  }
  if (client.blWorking || client.blOneByone) {
    throw new LodopPrintError('SERVICE_BUSY', '本机打印服务正处理其他任务，请关闭打印窗口后重试');
  }
}

function configurePrinter(client: LodopApi, settings: LabelPrintSettings): void {
  ensureClientAvailable(client);
  const printers = listPrinters(client);
  const printerIndex = printers.indexOf(settings.printerName);
  if (printerIndex < 0) {
    throw new LodopPrintError(
      'PRINTER_NOT_FOUND',
      '所选标签打印机已不可用，请重新检测并选择打印机',
    );
  }
  // The vendor also treats a numeric printer name as an index. Reject the rare ambiguous case.
  if (printers.some((name, index) => index < printerIndex && name === String(printerIndex))) {
    throw new LodopPrintError(
      'PRINTER_AMBIGUOUS',
      '打印机名称与设备序号冲突，请在系统中重命名后刷新网页',
    );
  }
  // An empty task name prevents previously remembered maintenance settings overriding this job.
  if (!client.PRINT_INIT('')) {
    throw new LodopPrintError('INITIALIZATION_FAILED', '本机打印任务初始化失败');
  }
  // Resolve the persisted exact name on this same object; never select -1 or a default device.
  if (!client.SET_PRINTER_INDEX(printerIndex)) {
    throw new LodopPrintError(
      'PRINTER_NOT_FOUND',
      '所选标签打印机无法使用，请重新检测并选择打印机',
    );
  }
  client.SET_PRINT_PAGESIZE(1, `${settings.widthMm}mm`, `${settings.heightMm}mm`, '');
  if (!client.SET_PRINT_COPIES(settings.copies)) {
    throw new LodopPrintError('CONFIGURATION_FAILED', '本机打印服务未能设置标签份数');
  }
  client.SET_PRINT_MODE('CATCH_PRINT_STATUS', false);
  client.SET_PRINT_MODE('TRYLINKPRINTER_NOALERT', true);
}

function mm(value: number): string {
  return `${Number(value.toFixed(3))}mm`;
}

function fitLabelText(
  text: string,
  widthMm: number,
  heightMm: number,
): { text: string; fontSize: number } {
  const characters = Array.from(text);
  const widthPt = (widthMm * 72) / 25.4;
  const heightPt = (heightMm * 72) / 25.4;
  for (let fontSize = 10; fontSize >= 4; fontSize -= 0.5) {
    // Reserve a full em per character so Chinese and wide Latin characters also fit.
    const charactersPerLine = Math.max(1, Math.floor(widthPt / fontSize));
    const lineCount = Math.ceil(characters.length / charactersPerLine);
    if (lineCount * fontSize * 1.4 > heightPt) continue;
    const lines: string[] = [];
    for (let offset = 0; offset < characters.length; offset += charactersPerLine) {
      lines.push(characters.slice(offset, offset + charactersPerLine).join(''));
    }
    return { text: lines.join('\n'), fontSize };
  }
  throw new LodopPrintError('INVALID_LABELS', '当前纸张无法完整容纳标签文字，请增大标签尺寸');
}

function addLabel(client: LodopApi, label: BarcodeLabel, settings: LabelPrintSettings): void {
  const margin = Math.min(3, settings.widthMm / 10, settings.heightMm / 10);
  const contentWidth = settings.widthMm - margin * 2;
  const contentHeight = settings.heightMm - margin * 2;
  const barcodeHeight = contentHeight * 0.65;
  const textTop = margin + contentHeight * 0.72;
  const textHeight = contentHeight * 0.28;
  const textLayout = fitLabelText(label.text, contentWidth, textHeight);

  client.ADD_PRINT_BARCODE(
    mm(margin),
    mm(margin),
    mm(contentWidth),
    mm(barcodeHeight),
    '128Auto',
    label.barcode,
  );
  client.SET_PRINT_STYLEA(0, 'ShowBarText', 0);
  client.ADD_PRINT_TEXT(mm(textTop), mm(margin), mm(contentWidth), mm(textHeight), textLayout.text);
  client.SET_PRINT_STYLEA(0, 'FontName', 'Arial');
  client.SET_PRINT_STYLEA(0, 'FontSize', textLayout.fontSize);
  client.SET_PRINT_STYLEA(0, 'Alignment', 2);
}

function submitPrint(client: LodopApi): Promise<void> {
  ensureClientAvailable(client);
  return new Promise((resolve, reject) => {
    const previousHandler = client.On_Return;
    const previousRemain = client.On_Return_Remain;
    let taskId: string | undefined;
    let hasReturned = false;
    let isSettled = false;
    const earlyReturns: { taskId: string; value: unknown }[] = [];

    const restoreCallback = (): void => {
      window.clearTimeout(timeout);
      if (client.On_Return === handler) {
        client.On_Return = previousHandler;
        client.On_Return_Remain = previousRemain;
      }
    };
    const finish = (error?: LodopPrintError): void => {
      if (isSettled) return;
      isSettled = true;
      restoreCallback();
      if (error) reject(error);
      else resolve();
    };
    const acceptReturn = (returnedTaskId: string, value: unknown): void => {
      if (returnedTaskId !== taskId || isSettled) return;
      if (value === true || (typeof value === 'string' && value.toLowerCase() === 'true')) {
        finish();
        return;
      }
      if (value === false || (typeof value === 'string' && value.toLowerCase() === 'false')) {
        finish(
          new LodopPrintError('PRINT_REJECTED', '本机打印服务未受理标签打印，请检查打印机后重试'),
        );
        return;
      }
      finish(
        new LodopPrintError(
          'PRINT_UNCONFIRMED',
          '本机打印服务返回了无法确认的结果，请先核对打印队列与已打印标签，避免重复打印',
          'unknown',
        ),
      );
    };
    const handler: LodopReturnHandler = (returnedTaskId, value) => {
      const returnedId = String(returnedTaskId);
      if (!hasReturned) {
        earlyReturns.push({ taskId: returnedId, value });
        return;
      }
      acceptReturn(returnedId, value);
    };
    const timeout = window.setTimeout(
      () =>
        finish(
          new LodopPrintError(
            'PRINT_TIMEOUT',
            '等待本机打印服务确认超时，任务可能已提交；请先核对打印队列与已打印标签，避免重复打印',
            'unknown',
          ),
        ),
      PRINT_CONFIRMATION_TIMEOUT_MS,
    );

    client.On_Return = handler;
    // The vendor clears On_Return after ANY callback by default, even an unrelated TaskID.
    client.On_Return_Remain = true;
    try {
      const returnedId = client.PRINT();
      hasReturned = true;
      if (
        (typeof returnedId !== 'string' && typeof returnedId !== 'number') ||
        !String(returnedId).trim()
      ) {
        finish(
          new LodopPrintError(
            'PRINT_UNCONFIRMED',
            '未取得打印任务确认编号，任务可能已提交；请先核对打印队列与已打印标签',
            'unknown',
          ),
        );
        return;
      }
      taskId = String(returnedId);
      for (const result of earlyReturns) acceptReturn(result.taskId, result.value);
    } catch {
      // Even an exception/null from PRINT cannot prove the vendor did not queue a delayed send.
      finish(
        new LodopPrintError(
          'PRINT_UNCONFIRMED',
          '打印提交后通信异常，任务可能已提交；请先核对打印队列与已打印标签',
          'unknown',
        ),
      );
    }
  });
}

function mapPreparationError(error: unknown): never {
  if (error instanceof LodopPrintError) throw error;
  throw new LodopPrintError('CONFIGURATION_FAILED', '本机打印任务准备失败，请重新检测打印机');
}

export async function getLodopPrinters(): Promise<LodopPrinters> {
  return serializeOperation(async () => {
    try {
      const client = await getLodop();
      return { printers: listPrinters(client), version: client.CVERSION || client.VERSION };
    } catch (error) {
      mapPreparationError(error);
    }
  });
}

/** Validate configuration and the exact local device; this never submits a print job. */
export async function checkLabelPrinter(settings: LabelPrintSettings): Promise<void> {
  const snapshot = validateSettings(settings);
  return serializeOperation(async () => {
    try {
      configurePrinter(await getLodop(), snapshot);
    } catch (error) {
      mapPreparationError(error);
    }
  });
}

/** Resolution confirms submission to C-Lodop, never physical completion or scan quality. */
export async function printBarcodeLabels(
  labels: readonly BarcodeLabel[],
  settings: LabelPrintSettings,
): Promise<void> {
  const settingsSnapshot = validateSettings(settings);
  const labelsSnapshot = validateLabels(labels);
  return serializeOperation(async () => {
    const client = await getLodop();
    try {
      configurePrinter(client, settingsSnapshot);
      labelsSnapshot.forEach((label, index) => {
        if (index > 0) client.NEWPAGE();
        addLabel(client, label, settingsSnapshot);
      });
    } catch (error) {
      mapPreparationError(error);
    }
    await submitPrint(client);
  });
}
