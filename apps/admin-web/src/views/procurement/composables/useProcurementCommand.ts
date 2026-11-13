import type { PurchaseOrderCommandResult } from '@company/contracts';
import {
  useIdempotentCommand,
  type IdempotentCommand,
} from '../../../composables/idempotency/use-idempotent-command';

/** 保留采购调用契约；跨模块的提交与错误恢复由公共工具负责。 */
export function useProcurementCommand<TResult = PurchaseOrderCommandResult>(
  onSuccess: (result: TResult) => void | Promise<void>,
  entityLabel = '采购单',
): IdempotentCommand<TResult> {
  const command = useIdempotentCommand(onSuccess, entityLabel);
  const canClose = async (dirty = false): Promise<boolean> => {
    if (!(await command.canClose(dirty))) return false;
    command.discard();
    return true;
  };
  return { ...command, canClose };
}
