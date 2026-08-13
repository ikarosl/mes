import { ref } from 'vue';
import { productionApi } from '../../../api/production';

export const useStepAssignments = () => {
  const pendingKeys = ref(new Set<string>());

  const execute = async (key: string, command: () => Promise<unknown>): Promise<void> => {
    if (pendingKeys.value.has(key)) return;
    pendingKeys.value = new Set(pendingKeys.value).add(key);
    try {
      await command();
    } finally {
      const next = new Set(pendingKeys.value);
      next.delete(key);
      pendingKeys.value = next;
    }
  };

  const assign = (batchId: string, stepRecordId: string, userId: string, version: number) =>
    execute(`assign:${stepRecordId}`, () =>
      productionApi.assignStep(batchId, stepRecordId, userId, version),
    );
  const unassign = (batchId: string, stepRecordId: string, version: number) =>
    execute(`unassign:${stepRecordId}`, () =>
      productionApi.unassignStep(batchId, stepRecordId, version),
    );
  const reassign = (batchId: string, stepRecordId: string, userId: string, version: number) =>
    execute(`reassign:${stepRecordId}`, () =>
      productionApi.reassignStep(batchId, stepRecordId, userId, version),
    );

  const isPending = (stepRecordId: string): boolean =>
    [...pendingKeys.value].some((key) => key.endsWith(`:${stepRecordId}`));

  return { pendingKeys, isPending, assign, unassign, reassign };
};
