import { createApp, type App, type VNode } from 'vue';

interface PrintVueComponentOptions {
  title: string;
  styles: string;
  render: () => VNode;
  bodyClassName?: string;
}

let activePrintWindow: Window | null = null;

function waitForPrintContent(printWindow: Window): Promise<boolean> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (isReady: boolean, error?: Error): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      printWindow.removeEventListener('load', onLoad);
      printWindow.removeEventListener('pagehide', onPageHide);
      if (error) reject(error);
      else resolve(isReady);
    };
    const onPageHide = (): void => finish(false);
    const onLoad = (): void => {
      printWindow.removeEventListener('load', onLoad);
      if (printWindow.closed) {
        finish(false);
        return;
      }
      try {
        // Force layout before waiting for the fonts used by this document.
        printWindow.document.body.getBoundingClientRect();
        void Promise.resolve(printWindow.document.fonts?.ready).then(
          () => finish(true),
          () => finish(false, new Error('打印字体加载失败，请重试')),
        );
      } catch {
        finish(false, new Error('打印内容准备失败，请重试'));
      }
    };
    const timeout = window.setTimeout(
      () => finish(false, new Error('打印内容准备超时，请重试')),
      5_000,
    );
    printWindow.addEventListener('load', onLoad, { once: true });
    printWindow.addEventListener('pagehide', onPageHide, { once: true });
    if (printWindow.document.readyState === 'complete') onLoad();
  });
}

/** 打印已准备好的同步展示内容和独立 CSS；不负责取数或注入 Element Plus 上下文。 */
export async function printVueComponent(options: PrintVueComponentOptions): Promise<void> {
  if (activePrintWindow && !activePrintWindow.closed) {
    activePrintWindow.focus();
    throw new Error('已有打印窗口打开，请完成打印或关闭该窗口后重试');
  }
  const printWindow = window.open('', '_blank', 'width=1200,height=850');
  if (!printWindow) throw new Error('打印窗口被浏览器拦截，请允许弹出窗口后重试');
  activePrintWindow = printWindow;
  let printApp: App<Element> | null = null;
  let cleanedUp = false;
  const cleanup = (closeWindow: boolean): void => {
    if (cleanedUp) return;
    cleanedUp = true;
    printWindow.removeEventListener('afterprint', onAfterPrint);
    printWindow.removeEventListener('pagehide', onPageHide);
    const app = printApp;
    printApp = null;
    try {
      app?.unmount();
    } finally {
      if (activePrintWindow === printWindow) activePrintWindow = null;
      if (closeWindow && !printWindow.closed) printWindow.close();
    }
  };
  const onAfterPrint = (): void => cleanup(true);
  const onPageHide = (): void => cleanup(false);
  try {
    // A visible document keeps the browser's native print dialog separate from the editor.
    const printDocument = printWindow.document;
    printDocument.write(
      '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"></head><body></body></html>',
    );
    printDocument.close();
    printDocument.title = options.title;
    const styles = printDocument.createElement('style');
    styles.textContent = options.styles;
    printDocument.head.append(styles);
    printDocument.body.className = options.bodyClassName ?? '';
    printApp = createApp({ render: options.render });
    printApp.mount(printDocument.body);
    printWindow.addEventListener('pagehide', onPageHide, { once: true });
    const isReady = await waitForPrintContent(printWindow);
    // Yield after font/layout readiness instead of invoking print from a load event.
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    if (cleanedUp || !isReady || printWindow.closed) {
      cleanup(false);
      return;
    }
    printWindow.addEventListener('afterprint', onAfterPrint, { once: true });
    // A live preview keeps its guard until afterprint or closure; elapsed time cannot end printing.
    printWindow.focus();
    printWindow.print();
  } catch (error) {
    const wasClosed = printWindow.closed;
    cleanup(true);
    if (!wasClosed) throw error;
  }
}
