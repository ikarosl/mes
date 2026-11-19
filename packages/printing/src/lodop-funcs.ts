import { LodopPrintError } from './print-error.js';
import type { LodopApi } from './lodop-types.js';

// Adapted from the user's LodopFuncs.js; provenance and deliberate browser-only scope:
// ../docs/lodop.md. Importing this module never opens a connection or changes the host UI.
const SCRIPT_TIMEOUT_MS = 5_000;
const CONNECTION_TIMEOUT_MS = 5_000;
const CONNECTION_POLL_MS = 50;
const CLIENT_METHODS = [
  'OpenWebSocket',
  'PRINT_INIT',
  'GET_PRINTER_COUNT',
  'GET_PRINTER_NAME',
  'SET_PRINTER_INDEX',
  'SET_PRINT_PAGESIZE',
  'SET_PRINT_COPIES',
  'SET_PRINT_MODE',
  'ADD_PRINT_BARCODE',
  'ADD_PRINT_TEXT',
  'SET_PRINT_STYLEA',
  'NEWPAGE',
  'PRINT',
] as const;

interface LodopWindow extends Window {
  getCLodop?: () => unknown;
}

let loadingClient: Promise<LodopApi> | undefined;
let hasUnfinishedScript = false;

function isLodopApi(value: unknown): value is LodopApi {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.VERSION === 'string' &&
    typeof candidate.CVERSION === 'string' &&
    CLIENT_METHODS.every((name) => typeof candidate[name] === 'function')
  );
}

function readClient(): LodopApi | undefined {
  const browser: LodopWindow = window;
  if (typeof browser.getCLodop !== 'function') return undefined;
  const candidate = browser.getCLodop();
  if (!isLodopApi(candidate)) {
    throw new LodopPrintError(
      'CLIENT_UNSUPPORTED',
      '本机打印服务接口不完整，请更新 C-Lodop 后刷新网页',
    );
  }
  return candidate;
}

function serviceScriptUrls(): readonly string[] {
  if (window.location.protocol === 'https:') {
    return [
      'https://localhost.lodop.net:8443/CLodopfuncs.js',
      'https://localhost:8443/CLodopfuncs.js',
    ];
  }
  return ['http://localhost:8000/CLodopfuncs.js', 'http://localhost:18000/CLodopfuncs.js'];
}

function loadServiceScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    let isSettled = false;
    const finish = (error?: LodopPrintError): void => {
      if (isSettled) return;
      isSettled = true;
      window.clearTimeout(timeout);
      script.onload = null;
      script.onerror = null;
      script.remove();
      if (error) reject(error);
      else resolve();
    };
    const timeout = window.setTimeout(() => {
      // Removing a timed-out script is not a guaranteed network abort in every browser.
      // Do not inject a fallback that a late script could overwrite during a print job.
      hasUnfinishedScript = true;
      finish(
        new LodopPrintError(
          'SERVICE_LOAD_TIMEOUT',
          '加载本机打印服务超时，请确认服务与本机访问权限后刷新网页',
        ),
      );
    }, SCRIPT_TIMEOUT_MS);
    script.async = true;
    script.src = url;
    script.onload = () => finish();
    script.onerror = () =>
      finish(new LodopPrintError('SERVICE_UNAVAILABLE', '无法加载本机打印服务'));
    try {
      document.head.appendChild(script);
    } catch {
      finish(new LodopPrintError('SERVICE_UNAVAILABLE', '浏览器未允许加载本机打印服务'));
    }
  });
}

async function loadClient(): Promise<LodopApi> {
  const existing = readClient();
  if (existing) return existing;
  if (hasUnfinishedScript) {
    throw new LodopPrintError(
      'SERVICE_LOAD_TIMEOUT',
      '上次本机打印服务加载超时，请确认服务与本机访问权限后刷新网页',
    );
  }

  for (const url of serviceScriptUrls()) {
    try {
      await loadServiceScript(url);
      const client = readClient();
      if (client) return client;
    } catch (error) {
      if (!(error instanceof LodopPrintError) || error.code !== 'SERVICE_UNAVAILABLE') throw error;
      // Script loading is read-only. Try the vendor's alternate local port before giving up.
    }
  }
  throw new LodopPrintError(
    'SERVICE_UNAVAILABLE',
    '未能连接本机 C-Lodop，请确认服务已启动并允许浏览器访问本机打印服务；HTTPS 页面还需启用 8443 服务',
  );
}

/** Require an open socket so the vendor cannot queue an unobserved delayed PRINT retry. */
function waitForConnection(client: LodopApi): Promise<LodopApi> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + CONNECTION_TIMEOUT_MS;
    let timer: number | undefined;
    let hasRequestedReconnect = false;
    const inspect = (): void => {
      if (client.SocketEnable && client.webskt?.readyState === WebSocket.OPEN) {
        if (timer !== undefined) window.clearTimeout(timer);
        resolve(client);
        return;
      }
      if (
        !hasRequestedReconnect &&
        (!client.webskt || client.webskt.readyState === WebSocket.CLOSED)
      ) {
        // First connection refusal disables the vendor's automatic reconnect. An explicit
        // consumer action may safely reopen this same object without loading another SDK.
        hasRequestedReconnect = true;
        try {
          client.OpenWebSocket();
        } catch {
          reject(
            new LodopPrintError('SERVICE_UNAVAILABLE', '本机打印通信连接失败，请刷新网页重试'),
          );
          return;
        }
      }
      if (Date.now() >= deadline) {
        if (timer !== undefined) window.clearTimeout(timer);
        reject(
          new LodopPrintError(
            'SERVICE_UNAVAILABLE',
            '本机打印服务通信尚未就绪，请确认服务运行及浏览器本机访问权限后重新检测',
          ),
        );
        return;
      }
      timer = window.setTimeout(inspect, CONNECTION_POLL_MS);
    };
    inspect();
  });
}

export async function getLodop(): Promise<LodopApi> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new LodopPrintError('BROWSER_REQUIRED', '本机打印只能在浏览器中使用');
  }
  if (typeof WebSocket === 'undefined') {
    throw new LodopPrintError('CLIENT_UNSUPPORTED', '当前浏览器不支持本机打印通信');
  }
  if (!loadingClient) loadingClient = loadClient();
  try {
    return await waitForConnection(await loadingClient);
  } catch (error) {
    loadingClient = undefined;
    if (error instanceof LodopPrintError) throw error;
    throw new LodopPrintError('SERVICE_UNAVAILABLE', '本机打印服务连接失败，请重新检测');
  }
}
