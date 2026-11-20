import { DEFAULT_LABEL_DPI, renderBarcodeLabel, type RenderedLabelImage } from './label-image.js';
import {
  checkLabelSize,
  LABEL_PRINT_LIMITS,
  type BarcodeLabel,
  type LabelPrintSettings,
} from './label-settings.js';
import { getLodop } from './lodop-funcs.js';
import type { LodopApi, LodopReturnHandler } from './lodop-types.js';
import { LodopPrintError } from './print-error.js';

export interface LodopPrinters {
  printers: string[];
  version: string;
}

const PRINT_CONFIRMATION_TIMEOUT_MS = 30_000;
const MAX_LABELS_PER_JOB = 1_000;

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
  checkLabelSize(settings);
  const { minCopies, maxCopies } = LABEL_PRINT_LIMITS;
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

function findPrinterIndex(client: LodopApi, printerName: string): number {
  const printers = listPrinters(client);
  const printerIndex = printers.indexOf(printerName);
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
  return printerIndex;
}

function readPrinterDpi(client: LodopApi, index: number): number {
  try {
    // Windows queues may report a negative quality preset instead of a physical resolution.
    const dpi = Number(client.GET_PRINTER_NAME(`${index}:PrintQuality`));
    if (Number.isInteger(dpi) && dpi >= 72 && dpi <= 1200) return dpi;
  } catch {
    // Older agents may expose queue names without the optional driver property.
  }
  return DEFAULT_LABEL_DPI;
}

function configurePrinter(client: LodopApi, settings: LabelPrintSettings): number {
  ensureClientAvailable(client);
  const printerIndex = findPrinterIndex(client, settings.printerName);
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
  client.SET_PRINT_MODE('CATCH_PRINT_STATUS', false);
  client.SET_PRINT_MODE('TRYLINKPRINTER_NOALERT', true);
  client.SET_PRINT_MODE('POS_BASEON_PAPER', true);
  client.SET_PRINT_PAGESIZE(1, `${settings.widthMm}mm`, `${settings.heightMm}mm`, '');
  if (!client.SET_PRINT_COPIES(settings.copies)) {
    throw new LodopPrintError('CONFIGURATION_FAILED', '本机打印服务未能设置标签份数');
  }
  return printerIndex;
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
      // The SDK can queue a delayed send even when its submission call fails to return a task ID.
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
      const printers = listPrinters(client);
      return { printers, version: client.CVERSION || client.VERSION };
    } catch (error) {
      mapPreparationError(error);
    }
  });
}

/** Read-only lookup used to render a preview at the selected queue's dot pitch. */
export function getLabelPrinterDpi(printerName: string): Promise<number> {
  return serializeOperation(async () => {
    const client = await getLodop();
    return readPrinterDpi(client, findPrinterIndex(client, printerName));
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

/** Prepare every page before PRINT so layout failures cannot submit a partial batch. */
async function printPages<T extends object>(
  pages: readonly T[],
  settings: LabelPrintSettings,
  prepare: (page: T, paper: LabelPrintSettings, dpi: number) => RenderedLabelImage,
): Promise<void> {
  const snapshot = validateSettings(settings);
  if (!pages.length || pages.length > MAX_LABELS_PER_JOB) {
    throw new LodopPrintError('INVALID_LABELS', `每次须打印 1 至 ${MAX_LABELS_PER_JOB} 张标签`);
  }
  const frozenPages = pages.map((page) => ({ ...page }));
  return serializeOperation(async () => {
    const client = await getLodop();
    try {
      const index = configurePrinter(client, snapshot);
      const dpi = readPrinterDpi(client, index);
      frozenPages.forEach((page, i) => {
        const image = prepare(page, snapshot, dpi);
        if (image.widthMm !== snapshot.widthMm || image.heightMm !== snapshot.heightMm) {
          throw new LodopPrintError('INVALID_SETTINGS', '纸张尺寸已更改，请核对更新后的标签预览');
        }
        if (!image.pngDataUrl.startsWith('data:image/png;base64,iVBORw0KGgo')) {
          throw new LodopPrintError('INVALID_LABELS', '标签原图无效，请重新打开预览');
        }
        if (i > 0) client.NEWPAGE();
        client.ADD_PRINT_IMAGE(0, 0, `${image.widthMm}mm`, `${image.heightMm}mm`, image.pngDataUrl);
        client.SET_PRINT_STYLEA(0, 'Stretch', 2);
      });
    } catch (error) {
      mapPreparationError(error);
    }
    await submitPrint(client);
  });
}

/** Submit the exact full-page PNGs displayed by the preview. */
export function printLabelImages(
  images: readonly RenderedLabelImage[],
  settings: LabelPrintSettings,
): Promise<void> {
  return printPages(images, settings, (image) => image);
}

/** Automatic creation uses the same page renderer as manual preview and reprinting. */
export function printBarcodeLabels(
  labels: readonly BarcodeLabel[],
  settings: LabelPrintSettings,
): Promise<void> {
  return printPages(labels, settings, renderBarcodeLabel);
}
