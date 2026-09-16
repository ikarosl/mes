import { Body, Controller, Get, Param, Post, Put, Query, UseFilters } from '@nestjs/common';
import { APPROVAL_SCENE_CODES, PERMISSIONS, permissionMatches } from '@company/constants';
import type { UserProfile } from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import {
  AuditInApplication,
  CurrentCommandContext,
  CurrentUser,
  RequirePermission,
} from '../../../../common/security/auth.decorators.js';
import { ApprovalService } from '../../application/approval.service.js';
import { ApprovalDomainExceptionFilter } from './approval-domain-exception.filter.js';
import {
  ApprovalCommentDto,
  ApprovalDecisionDto,
  ApprovalIdParamDto,
  ApprovalInstanceQueryDto,
  ApprovalProductIdParamDto,
  ApprovalSceneCodeParamDto,
  PublishApprovalFlowDto,
  SaveApprovalFlowDraftDto,
  SubmitBomApprovalDto,
  toComment,
  toDecision,
  toFlowDraft,
  toInstanceQuery,
  toPublishCommand,
} from './dto/approval.dto.js';

const INSTANCE_ACCESS = [
  PERMISSIONS.approval.view,
  PERMISSIONS.approval.decide,
  PERMISSIONS.approval.configure,
  PERMISSIONS.product.products.manageBom,
  PERMISSIONS.production.materials.correctDemand,
  PERMISSIONS.production.tasks.terminate,
] as const;
const canManage = (user: UserProfile) =>
  permissionMatches(user.permissions, PERMISSIONS.approval.configure);

@Controller('approval')
@UseFilters(ApprovalDomainExceptionFilter)
export class ApprovalController {
  constructor(private readonly service: ApprovalService) {}

  /** 配置页入口：经 Service 查询场景及发布状态，读取不会注册或创建场景。 */
  @Get('scenes')
  @RequirePermission(PERMISSIONS.approval.configure)
  scenes() {
    return this.service.listScenes();
  }

  @Get('role-options')
  @RequirePermission(PERMISSIONS.approval.configure)
  roleOptions() {
    return this.service.listRoleOptions();
  }

  @Get('user-options')
  @RequirePermission(PERMISSIONS.approval.configure)
  userOptions() {
    return this.service.listUserOptions();
  }

  @Get('scenes/:sceneCode/flow')
  @RequirePermission(PERMISSIONS.approval.configure)
  flow(@Param() { sceneCode }: ApprovalSceneCodeParamDto) {
    return this.service.getFlow(sceneCode);
  }

  @Put('scenes/:sceneCode/flow/draft')
  @RequirePermission(PERMISSIONS.approval.configure)
  @AuditInApplication()
  saveDraft(
    @Param() { sceneCode }: ApprovalSceneCodeParamDto,
    @Body() body: SaveApprovalFlowDraftDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.saveFlowDraft(sceneCode, toFlowDraft(body), audit);
  }

  @Post('scenes/:sceneCode/flow/publish')
  @RequirePermission(PERMISSIONS.approval.configure)
  @AuditInApplication()
  publish(
    @Param() { sceneCode }: ApprovalSceneCodeParamDto,
    @Body() body: PublishApprovalFlowDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.publishFlow(sceneCode, toPublishCommand(body), audit);
  }

  @Get('instances')
  @RequirePermission(INSTANCE_ACCESS)
  instances(@Query() query: ApprovalInstanceQueryDto, @CurrentUser() user: UserProfile) {
    return this.service.listInstances(toInstanceQuery(query), user.id, canManage(user));
  }

  @Get('instances/:id')
  @RequirePermission(INSTANCE_ACCESS)
  instance(@Param() { id }: ApprovalIdParamDto, @CurrentUser() user: UserProfile) {
    return this.service.getInstance(id, user.id, canManage(user));
  }

  @Post('instances/:id/approve')
  @RequirePermission(PERMISSIONS.approval.decide)
  @AuditInApplication()
  approve(
    @Param() { id }: ApprovalIdParamDto,
    @Body() body: ApprovalDecisionDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.approve(id, toDecision(body), audit);
  }

  @Post('instances/:id/reject')
  @RequirePermission(PERMISSIONS.approval.decide)
  @AuditInApplication()
  reject(
    @Param() { id }: ApprovalIdParamDto,
    @Body() body: ApprovalDecisionDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.reject(id, toDecision(body), audit);
  }

  @Post('instances/:id/withdraw')
  @RequirePermission(INSTANCE_ACCESS)
  @AuditInApplication()
  withdraw(
    @Param() { id }: ApprovalIdParamDto,
    @Body() body: ApprovalCommentDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.withdraw(id, toComment(body), audit);
  }

  @Post('bom/:productId/submit')
  @RequirePermission(PERMISSIONS.product.products.manageBom)
  @AuditInApplication()
  submitBom(
    @Param() { productId }: ApprovalProductIdParamDto,
    @Body() body: SubmitBomApprovalDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    // 业务入口固定场景并校验 BOM 管理权限，客户端只提供产品 ID 和版本。
    return this.service.submit(
      {
        sceneCode: APPROVAL_SCENE_CODES.bom,
        subjectId: productId,
        expectedVersion: body.version,
      },
      audit,
    );
  }
}
