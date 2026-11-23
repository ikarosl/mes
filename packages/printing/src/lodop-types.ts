export type LodopTaskId = string | number;
export type LodopReturnHandler = (taskId: LodopTaskId, value: unknown) => void;

/** The browser service subset owned by this adapter, rather than the vendor's full API. */
export interface LodopApi {
  VERSION: string;
  CVERSION: string;
  On_Return?: LodopReturnHandler | null;
  On_Return_Remain?: boolean;
  webskt?: WebSocket | null;
  SocketEnable?: boolean;
  blWorking?: boolean;
  blOneByone?: boolean;
  OpenWebSocket(): void;
  PRINT_INIT(taskName: string): boolean;
  GET_PRINTER_COUNT(): number;
  GET_PRINTER_NAME(index: number): string;
  GET_PRINTER_NAME(property: string): unknown;
  SET_PRINTER_INDEX(indexOrName: number | string): boolean;
  SET_PRINT_PAGESIZE(
    orientation: number,
    width: number | string,
    height: number | string,
    pageName: string,
  ): void;
  SET_PRINT_COPIES(copies: number): boolean;
  SET_PRINT_MODE(mode: string, value: boolean | string | number): void;
  ADD_PRINT_IMAGE(top: number, left: number, width: string, height: string, image: string): void;
  SET_PRINT_STYLEA(item: number, style: string, value: string | number): void;
  NEWPAGE(): void;
  PRINT(): unknown;
}
