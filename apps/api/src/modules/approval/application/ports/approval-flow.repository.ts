import type {
  ApprovalFlowDetail,
  ApprovalRoleOption,
  ApprovalSceneItem,
  PublishApprovalFlowCommand,
  SaveApprovalFlowDraft,
  UserOption,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';

/** 流程配置端口；与申请生命周期分开，不向应用层暴露选版时的数据库连接。 */
export abstract class ApprovalFlowRepository {
  abstract listScenes(): Promise<ApprovalSceneItem[]>;
  abstract listRoleOptions(): Promise<ApprovalRoleOption[]>;
  abstract listUserOptions(): Promise<UserOption[]>;
  abstract getFlow(sceneCode: string): Promise<ApprovalFlowDetail>;
  abstract saveFlowDraft(
    sceneCode: string,
    payload: SaveApprovalFlowDraft,
    audit: CommandContext,
  ): Promise<ApprovalFlowDetail>;
  abstract publishFlow(
    sceneCode: string,
    command: PublishApprovalFlowCommand,
    audit: CommandContext,
  ): Promise<ApprovalFlowDetail>;
}
