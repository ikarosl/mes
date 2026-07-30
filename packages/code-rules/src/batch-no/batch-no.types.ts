export interface BatchNoRule {
  prefix: string;
  padding: number;
}

export interface GenerateBatchNoInput extends BatchNoRule {
  sequence: number;
}
