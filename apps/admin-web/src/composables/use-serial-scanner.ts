import { readonly, ref, type Ref } from 'vue';

interface ScannerSerialPort extends EventTarget {
  readonly readable: ReadableStream<Uint8Array> | null;
  getInfo?(): { usbVendorId?: number; usbProductId?: number };
  open(options: {
    baudRate: number;
    dataBits: 8;
    stopBits: 1;
    parity: 'none';
    flowControl: 'none';
  }): Promise<void>;
  close(): Promise<void>;
}

interface ScannerSerialApi {
  requestPort(): Promise<ScannerSerialPort>;
  getPorts(): Promise<ScannerSerialPort[]>;
}

interface PortIdentity {
  usbVendorId: number | null;
  usbProductId: number | null;
}

interface RestorePreference extends PortIdentity {
  userId: string;
  baudRate: number;
}

interface ScannerConnectOptions {
  baudRate: number;
  userId?: string;
  isRestore?: boolean;
  selectPort(): Promise<ScannerSerialPort | undefined>;
}

interface ScanConsumer {
  canReceive(): boolean;
  onScan(code: string): void | Promise<void>;
}

interface ScanSubscription {
  invalidate(): void;
  unsubscribe(): void;
}

interface ActiveSubscription {
  consumer: ScanConsumer;
}

interface ScanFrame {
  bytes: Uint8Array;
  length: number;
  isDiscarding: boolean;
}

interface ScannerConnection {
  frame: ScanFrame;
  port?: ScannerSerialPort;
  opening?: Promise<void>;
  reader?: ReadableStreamDefaultReader<Uint8Array>;
  reading?: Promise<void>;
  detachListeners?: () => void;
  closing?: Promise<void>;
}

type ScannerStatus = 'disconnected' | 'connecting' | 'connected' | 'disconnecting' | 'error';

interface SerialScanner {
  isSupported: boolean;
  status: Readonly<Ref<ScannerStatus>>;
  error: Readonly<Ref<string | undefined>>;
  connect(baudRate?: number, userId?: string): Promise<void>;
  restore(userId: string): Promise<number | undefined>;
  disconnect(): Promise<void>;
  discardPendingScan(): void;
  subscribe(consumer: ScanConsumer): ScanSubscription;
}

const MAX_SCAN_BYTES = 256;
const CARRIAGE_RETURN = 13;
const LINE_FEED = 10;
const RESTORE_KEY = 'easy-mes.serial-scanner-connection.v1';
const CONNECT_FAILED = '无法连接扫码串口，请检查浏览器权限、设备和串口占用情况。';
const RESTORE_FAILED = '扫码枪连接恢复失败，请手动连接。';
const CONNECTION_LOST = '扫码枪连接已断开，请检查串口设备后重连。';
const decoder = new TextDecoder('utf-8', { fatal: true });
const status = ref<ScannerStatus>('disconnected');
const error = ref<string>();
let connection: ScannerConnection | undefined;
let subscriber: ActiveSubscription | undefined;
let hasEvaluatedRestore = false;

function getSerialApi(): ScannerSerialApi | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { serial?: ScannerSerialApi }).serial;
}

function isActiveConnection(current: ScannerConnection): boolean {
  return connection === current && !current.closing;
}

function getPortIdentity(port: ScannerSerialPort): PortIdentity {
  const info = port.getInfo?.();
  return {
    usbVendorId: info?.usbVendorId ?? null,
    usbProductId: info?.usbProductId ?? null,
  };
}

function isUsbId(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffff)
  );
}

function readRestorePreference(userId: string): RestorePreference | undefined {
  try {
    const raw = window.sessionStorage.getItem(RESTORE_KEY);
    if (raw === null) return undefined;
    const saved: unknown = JSON.parse(raw);
    if (
      saved &&
      typeof saved === 'object' &&
      'userId' in saved &&
      saved.userId === userId &&
      'baudRate' in saved &&
      typeof saved.baudRate === 'number' &&
      Number.isInteger(saved.baudRate) &&
      saved.baudRate > 0 &&
      saved.baudRate <= 0xffffffff &&
      'usbVendorId' in saved &&
      isUsbId(saved.usbVendorId) &&
      'usbProductId' in saved &&
      isUsbId(saved.usbProductId)
    ) {
      return {
        userId,
        baudRate: saved.baudRate,
        usbVendorId: saved.usbVendorId,
        usbProductId: saved.usbProductId,
      };
    }
  } catch {
    // Attempt to discard an unreadable record below and keep the manual connection available.
  }
  clearRestorePreference();
  return undefined;
}

function clearRestorePreference(): void {
  try {
    window.sessionStorage.removeItem(RESTORE_KEY);
  } catch {
    // Browser storage is optional. Always release the port when asked to disconnect.
  }
}

function saveRestorePreference(port: ScannerSerialPort, baudRate: number, userId?: string): void {
  if (!userId) {
    clearRestorePreference();
    return;
  }
  try {
    const preference: RestorePreference = { ...getPortIdentity(port), userId, baudRate };
    window.sessionStorage.setItem(RESTORE_KEY, JSON.stringify(preference));
  } catch {
    // Keep the live connection and try to remove any stale preference.
    clearRestorePreference();
  }
}

function discardPartialFrame(frame: ScanFrame): void {
  if (frame.length === 0) return;
  // Hold the discard state until the next delimiter consumes the old frame's tail.
  frame.length = 0;
  frame.isDiscarding = true;
}

function discardPendingScan(): void {
  if (connection) discardPartialFrame(connection.frame);
}

function subscribe(consumer: ScanConsumer): ScanSubscription {
  const subscription = { consumer };
  discardPendingScan();
  subscriber = subscription;

  function invalidate(): void {
    if (subscriber === subscription && connection) discardPartialFrame(connection.frame);
  }

  return {
    invalidate,
    unsubscribe() {
      if (subscriber !== subscription) return;
      invalidate();
      subscriber = undefined;
    },
  };
}

function activeSubscriber(): ActiveSubscription | undefined {
  const subscription = subscriber;
  if (document.visibilityState !== 'visible' || !document.hasFocus()) return undefined;
  return subscription?.consumer.canReceive() ? subscription : undefined;
}

function deliverScan(
  current: ScannerConnection,
  subscription: ActiveSubscription,
  bytes: Uint8Array,
): void {
  let code: string;
  try {
    code = decoder.decode(bytes).trim();
  } catch {
    error.value = '扫码数据格式无效，请检查扫码枪设置后重新扫码。';
    return;
  }
  if (!code) return;

  function reportFailure(): void {
    if (isActiveConnection(current) && subscriber === subscription) {
      error.value = '处理串口扫码失败，请核对本次操作结果。';
    }
  }

  error.value = undefined;
  if (current.closing || activeSubscriber() !== subscription) return;
  try {
    void Promise.resolve(subscription.consumer.onScan(code)).catch(reportFailure);
  } catch {
    reportFailure();
  }
}

function consumeScanBytes(current: ScannerConnection, bytes: Uint8Array): void {
  const { frame } = current;
  if (!activeSubscriber()) discardPartialFrame(frame);

  for (const byte of bytes) {
    if (current.closing) return;
    if (byte === CARRIAGE_RETURN || byte === LINE_FEED) {
      const length = frame.length;
      frame.length = 0;
      frame.isDiscarding = false;
      if (length === 0) continue;
      const subscription = activeSubscriber();
      if (subscription) deliverScan(current, subscription, frame.bytes.subarray(0, length));
      continue;
    }

    if (frame.isDiscarding) continue;
    if (frame.length === 0 && !activeSubscriber()) {
      frame.isDiscarding = true;
      continue;
    }
    if (frame.length === frame.bytes.length) {
      discardPartialFrame(frame);
      error.value = '扫码数据过长，请检查扫码枪设置后重新扫码。';
      continue;
    }
    frame.bytes[frame.length] = byte;
    frame.length += 1;
  }
}

async function readScans(
  current: ScannerConnection,
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<void> {
  try {
    while (!current.closing) {
      const { value, done } = await reader.read();
      if (done || current.closing) break;
      consumeScanBytes(current, value);
    }
  } finally {
    reader.releaseLock();
    current.reader = undefined;
  }
}

function reportDisconnected(message?: string): void {
  error.value = message;
  status.value = message ? 'error' : 'disconnected';
}

function stopConnection(current: ScannerConnection, message?: string): Promise<void> {
  if (current.closing) return current.closing;
  if (connection !== current) return Promise.resolve();

  const { port } = current;
  if (!port) {
    // A pending port selection can still resolve. The connection identity guards its result.
    connection = undefined;
    reportDisconnected(message);
    return Promise.resolve();
  }

  current.closing = Promise.resolve().then(async () => {
    current.detachListeners?.();
    // Close only after a successful open, once the read loop has released the lock.
    const opened = await current.opening?.then(
      () => true,
      () => false,
    );
    if (opened) {
      await current.reader?.cancel().catch(() => undefined);
      await current.reading?.catch(() => undefined);
      try {
        await port.close();
      } catch {
        message ??= '关闭扫码串口失败，请拔插扫码设备后重试。';
      }
    }
    connection = undefined;
    reportDisconnected(message);
  });
  status.value = 'disconnecting';
  return current.closing;
}

export async function disconnectSerialScanner(): Promise<void> {
  clearRestorePreference();
  if (connection) await stopConnection(connection);
  else reportDisconnected();
}

async function openScanner({
  baudRate,
  userId,
  isRestore,
  selectPort,
}: ScannerConnectOptions): Promise<ScannerConnection | undefined> {
  if (connection) return;
  const current: ScannerConnection = {
    frame: { bytes: new Uint8Array(MAX_SCAN_BYTES), length: 0, isDiscarding: false },
  };
  connection = current;
  error.value = undefined;
  status.value = 'connecting';
  if (connection !== current) return;

  try {
    const port = await selectPort();
    if (connection !== current) return;
    if (!port) {
      await stopConnection(current);
      return;
    }

    current.port = port;
    current.opening = port.open({
      baudRate,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      flowControl: 'none',
    });
    await current.opening;
    if (current.closing) return;
    const reader = port.readable?.getReader();
    if (!reader) {
      await stopConnection(current, CONNECTION_LOST);
      return;
    }

    const discardOnFocusChange = () => discardPartialFrame(current.frame);
    const handleDisconnect = () => void stopConnection(current, CONNECTION_LOST);
    port.addEventListener('disconnect', handleDisconnect);
    document.addEventListener('visibilitychange', discardOnFocusChange);
    window.addEventListener('blur', discardOnFocusChange);
    current.detachListeners = () => {
      port.removeEventListener('disconnect', handleDisconnect);
      document.removeEventListener('visibilitychange', discardOnFocusChange);
      window.removeEventListener('blur', discardOnFocusChange);
    };

    current.reader = reader;
    current.reading = readScans(current, reader);
    void current.reading.then(handleDisconnect, () => {
      void stopConnection(current, '读取扫码串口失败，请检查设备和串口设置后重连。');
    });
    saveRestorePreference(port, baudRate, userId);
    status.value = 'connected';
    return current;
  } catch (cause) {
    if (connection !== current || current.closing) return;
    const isCancelled =
      !isRestore &&
      !current.port &&
      cause instanceof DOMException &&
      cause.name === 'NotFoundError';
    const failure = isRestore ? RESTORE_FAILED : CONNECT_FAILED;
    await stopConnection(current, isCancelled ? undefined : failure);
  }
}

async function connect(baudRate = 9600, userId?: string): Promise<void> {
  if (connection) return;
  const serial = getSerialApi();
  if (!serial) {
    reportDisconnected('当前浏览器或站点协议不支持串口扫码。');
    return;
  }
  await openScanner({ baudRate, userId, selectPort: () => serial.requestPort() });
}

async function restore(userId: string): Promise<number | undefined> {
  if (typeof window === 'undefined' || !userId || hasEvaluatedRestore) return;
  hasEvaluatedRestore = true;
  if (connection) return;

  const navigation = window.performance?.getEntriesByType?.('navigation')[0];
  if (!navigation || !('type' in navigation) || navigation.type !== 'reload') {
    clearRestorePreference();
    return;
  }

  const serial = getSerialApi();
  const preference = readRestorePreference(userId);
  if (typeof serial?.getPorts !== 'function' || !preference) return;

  const restoredConnection = await openScanner({
    baudRate: preference.baudRate,
    userId,
    isRestore: true,
    async selectPort() {
      const ports = await serial.getPorts();
      const hasUsbIdentity = preference.usbVendorId !== null && preference.usbProductId !== null;
      if (!hasUsbIdentity && ports.length !== 1) return undefined;
      return ports.find((port) => {
        const identity = getPortIdentity(port);
        return (
          identity.usbVendorId === preference.usbVendorId &&
          identity.usbProductId === preference.usbProductId
        );
      });
    },
  });
  if (restoredConnection && isActiveConnection(restoredConnection)) return preference.baudRate;
}

export function useSerialScanner(): SerialScanner {
  return {
    isSupported: Boolean(getSerialApi()),
    status: readonly(status),
    error: readonly(error),
    connect,
    restore,
    disconnect: disconnectSerialScanner,
    discardPendingScan,
    subscribe,
  };
}
