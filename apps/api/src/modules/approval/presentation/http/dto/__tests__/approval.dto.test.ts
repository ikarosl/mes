import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  ApprovalCommentDto,
  ApprovalDecisionDto,
  ApprovalInstanceQueryDto,
  PublishApprovalFlowDto,
  SaveApprovalFlowDraftDto,
  SubmitBomApprovalDto,
  toComment,
  toDecision,
  toFlowDraft,
} from '../approval.dto.js';
import { createValidationPipe } from '../../../../../../presentation/http/validation.pipe.js';

const roleStep = { name: '研发', assigneeType: 'role', roleId: '7', assigneeUserId: null };
const userStep = { name: '管理', assigneeType: 'user', roleId: null, assigneeUserId: '8' };
const newDraft = { name: '审批流程', version: null, draftId: null, steps: [roleStep, userStep] };

describe('approval DTOs', () => {
  it('requires version and draft identity while allowing explicit null for a new draft', async () => {
    const firstDraft = plainToInstance(SaveApprovalFlowDraftDto, {
      name: '研发审批',
      version: null,
      draftId: null,
      steps: [roleStep, userStep],
    });
    expect(await validate(firstDraft)).toEqual([]);

    const missingVersion = plainToInstance(SaveApprovalFlowDraftDto, {
      name: '研发审批',
      draftId: null,
      steps: [roleStep],
    });
    const missingVersionProperties = (await validate(missingVersion)).map(
      (error) => error.property,
    );
    expect(missingVersionProperties).toContain('version');

    const missingDraftId = plainToInstance(SaveApprovalFlowDraftDto, {
      name: '研发审批',
      version: 0,
      steps: [roleStep],
    });
    const missingDraftIdProperties = (await validate(missingDraftId)).map(
      (error) => error.property,
    );
    expect(missingDraftIdProperties).toContain('draftId');
  });

  it('requires versions on publish, decisions, comments, and BOM submission', async () => {
    const cases = [
      plainToInstance(PublishApprovalFlowDto, { draftId: '1' }),
      plainToInstance(ApprovalDecisionDto, { stepId: '2' }),
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
      steps: [{ ...roleStep, nodeCode: 'review', name: '  节点  ' }, userStep],
    });
    expect(toFlowDraft(draft)).toEqual({
      name: '流程',
      version: 2,
      draftId: '9',
      steps: [{ ...roleStep, nodeCode: 'review', name: '节点' }, userStep],
    });

    expect(
      toDecision(
        plainToInstance(ApprovalDecisionDto, {
          version: '3',
          stepId: '10',
          comment: '  同意  ',
        }),
      ),
    ).toEqual({ version: 3, stepId: '10', comment: '同意' });
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
          steps: [roleStep],
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

  it.each(['assigneeType', 'roleId', 'assigneeUserId'] as const)(
    'requires explicit %s even when the other reference is null',
    async (field) => {
      const step: Record<string, unknown> = { ...roleStep };
      delete step[field];
      await expect(
        createValidationPipe().transform(
          { ...newDraft, steps: [step] },
          { type: 'body', metatype: SaveApprovalFlowDraftDto },
        ),
      ).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
    },
  );

  it.each([
    { assigneeType: 'department' },
    { roleId: 'not-an-id' },
    { assigneeUserId: 8 },
    { roleIds: ['7', '8'] },
    { assigneeUserIds: ['7', '8'] },
  ])('rejects invalid types or client-supplied candidate sets: %j', async (invalid) => {
    await expect(
      createValidationPipe().transform(
        { ...newDraft, steps: [{ ...roleStep, ...invalid }] },
        { type: 'body', metatype: SaveApprovalFlowDraftDto },
      ),
    ).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
  });

  it.each([
    { version: 1, taskId: '2' },
    { version: 1 },
    { version: 1, stepId: null },
    { version: 1, stepId: '2', canApprove: true },
    { version: 1, stepId: '2', actorId: '99' },
    { version: 1, stepId: '2', roleIds: ['7'] },
  ])('rejects legacy decisions and client-supplied authorization: %j', async (body) => {
    await expect(
      createValidationPipe().transform(body, { type: 'body', metatype: ApprovalDecisionDto }),
    ).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
  });

  it.each(['roleId', 'roleIds', 'userId', 'canApprove'])(
    'rejects %s as an authorization query parameter',
    async (field) => {
      await expect(
        createValidationPipe().transform(
          { scope: 'todo', [field]: '7' },
          { type: 'query', metatype: ApprovalInstanceQueryDto },
        ),
      ).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
    },
  );

  it('accepts ordinary pending todo pagination and large string node identifiers', async () => {
    const query = await createValidationPipe().transform(
      { scope: 'todo', status: 'pending', page: '2', pageSize: '10', subjectId: '99' },
      { type: 'query', metatype: ApprovalInstanceQueryDto },
    );
    expect(query).toMatchObject({
      scope: 'todo',
      status: 'pending',
      page: 2,
      pageSize: 10,
      subjectId: '99',
    });
    const decision = await createValidationPipe().transform(
      { version: 0, stepId: '9007199254740993' },
      { type: 'body', metatype: ApprovalDecisionDto },
    );
    expect(toDecision(decision)).toEqual({
      version: 0,
      stepId: '9007199254740993',
      comment: undefined,
    });
  });
});
