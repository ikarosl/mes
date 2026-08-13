import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStepAssignments } from '../useStepAssignments';

const api = vi.hoisted(() => ({
  assignStep: vi.fn(),
  unassignStep: vi.fn(),
  reassignStep: vi.fn(),
}));
vi.mock('../../../../api/production', () => ({ productionApi: api }));

describe('useStepAssignments', () => {
  beforeEach(() => Object.values(api).forEach((mock) => mock.mockReset()));

  it('uses independent row pending keys and suppresses duplicate clicks', async () => {
    let resolve!: () => void;
    api.assignStep.mockReturnValue(new Promise<void>((done) => (resolve = done)));
    const state = useStepAssignments();
    const first = state.assign('1', '10', '7', 0);
    const duplicate = state.assign('1', '10', '7', 0);

    expect(state.isPending('10')).toBe(true);
    expect(api.assignStep).toHaveBeenCalledOnce();
    resolve();
    await Promise.all([first, duplicate]);
    expect(state.isPending('10')).toBe(false);
  });

  it('does not attach HTTP idempotency data to versioned assignment commands', async () => {
    api.reassignStep.mockResolvedValue({});
    api.unassignStep.mockResolvedValue({});
    const state = useStepAssignments();
    await state.reassign('1', '10', '8', 2);
    await state.unassign('1', '10', 3);
    expect(api.reassignStep).toHaveBeenCalledWith('1', '10', '8', 2);
    expect(api.unassignStep).toHaveBeenCalledWith('1', '10', 3);
  });
});
