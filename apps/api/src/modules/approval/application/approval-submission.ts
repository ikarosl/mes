/**
 * 已鉴权业务入口交给审批引擎的内部提交命令，不直接作为 HTTP 请求体开放。
 * 场景编码由业务入口固定；对象类型从 Registry 获取，不能由客户端任意组合。
 */
export interface ApprovalSubmission {
  sceneCode: string;
  subjectId: string;
  expectedVersion: number;
}
