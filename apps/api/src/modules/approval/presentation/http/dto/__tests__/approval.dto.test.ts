import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  ApprovalCommentDto,
  ApprovalDecisionDto,
  PublishApprovalFlowDto,
  SaveApprovalFlowDraftDto,
  SubmitBomApprovalDto,
  toComment,
  toDecision,
  toFlowDraft,
} from '../approval.dto.js';
import { createValidationPipe } from '../../../../../../presentation/http/validation.pipe.js';

describe('approval DTOs', () => {
  it('requires version and draft identity while allowing explicit null for a new draft', async () => {
    const firstDraft = plainToInstance(SaveApprovalFlowDraftDto, {
      name: '研发审批',
      version: null,
      draftId: null,
      steps: [{ name: '研发', roleId: '7' }],
    });
    expect(await validate(firstDraft)).toEqual([]);

    const missingVersion = plainToInstance(SaveApprovalFlowDraftDto, {
      name: '研发审批',
      draftId: null,
      steps: [{ name: '研发', roleId: '7' }],
    });
    const missingVersionProperties = (await validate(missingVersion)).map(
      (error) => error.property,
    );
    expect(missingVersionProperties).toContain('version');

    const missingDraftId = plainToInstance(SaveApprovalFlowDraftDto, {
      name: '研发审批',
      version: 0,
      steps: [{ name: '研发', roleId: '7' }],
    });
    const missingDraftIdProperties = (await validate(missingDraftId)).map(
      (error) => error.property,
    );
    expect(missingDraftIdProperties).toContain('draftId');
  });

  it('requires versions on publish, decisions, comments, and BOM submission', async () => {
    const cases = [
      plainToInstance(PublishApprovalFlowDto, { draftId: '1' }),
      plainToInstance(ApprovalDecisionDto, { taskId: '2' }),
      plainToInstance(ApprovalCommentDto, {}),
      plainToInstance(SubmitBomApprovalDto, {}),
    ];

    for (const dto of cases) {
      expect((await validate(dto)).some((error) => error.property === 'version')).toBe(true);
    }
  });

  it('transforms numeric versions and trims command text', () => {
    const draft = plainToInstance(SaveApprovalFlowDraftDto, {
      name: '  流程  ',
      version: '2',
      draftId: '9',
      steps: [{ nodeCode: '研发', name: '  节点  ', roleId: '7' }],
    });
    expect(toFlowDraft(draft)).toEqual({
      name: '流程',
      version: 2,
      draftId: '9',
      steps: [{ nodeCode: '研发', name: '节点', roleId: '7' }],
    });

    expect(
      toDecision(
        plainToInstance(ApprovalDecisionDto, {
          version: '3',
          taskId: '10',
          comment: '  同意  ',
        }),
      ),
    ).toEqual({ version: 3, taskId: '10', comment: '同意' });
    expect(
      toComment(plainToInstance(ApprovalCommentDto, { version: '4', comment: '   ' })),
    ).toEqual({ version: 4, comment: undefined });
  });

  it('rejects unknown fields through the same pipe used by the HTTP app', async () => {
    await expect(
      createValidationPipe().transform(
        {
          name: '流程',
          version: null,
          draftId: null,
          steps: [{ name: '研发', roleId: '7' }],
          bypassApproval: true,
        },
        { type: 'body', metatype: SaveApprovalFlowDraftDto },
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'VALIDATION_ERROR',
        message: '请求包含未允许的字段：bypassApproval',
      },
    });
  });
});
