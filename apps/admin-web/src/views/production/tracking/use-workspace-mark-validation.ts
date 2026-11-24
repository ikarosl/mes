import {
  computed,
  onActivated,
  onDeactivated,
  onScopeDispose,
  ref,
  shallowReactive,
  watch,
  type ComputedRef,
} from 'vue';
import type {
  ProductionTrackingCardDetail,
  ProductionTrackingItemMarkWorkspaceRow as Row,
} from '@company/contracts';
import { normalizeTrackingItemMarkCode, TRACKING_ITEM_MARK_CODE_PATTERN } from '@company/utils';
import { readItemMarkCodeAvailability } from './use-item-mark-code-availability';

export type WorkspaceMarkDraft = {
  row: Row;
  input: string;
  transferTarget?: Pick<ProductionTrackingCardDetail, 'id' | 'cardNo' | 'version'>;
};
export const workspaceMarkRowKey = (row: Row) => row.item.id;
export const canonicalDraftCode = (input: string) => normalizeTrackingItemMarkCode(input.trim());
type Check = 'checking' | 'available' | 'occupied' | 'failed';
export type MarkFieldFeedback = {
  state: 'invalid' | 'failed' | 'checking' | 'valid';
  message: string;
};

export function useWorkspaceMarkValidation(drafts: ComputedRef<WorkspaceMarkDraft[]>) {
  const checks = shallowReactive(new Map<string, Check>());
  const cancel = new Map<string, () => void>();
  const active = ref(true);
  const codes = computed(
    () =>
      new Set(
        drafts.value
          .filter((draft) => !draft.transferTarget)
          .map((d) => canonicalDraftCode(d.input))
          .filter((code) => TRACKING_ITEM_MARK_CODE_PATTERN.test(code)),
      ),
  );

  function check(code: string, delay = 0) {
    if (!active.value || !codes.value.has(code)) return;
    cancel.get(code)?.();
    checks.set(code, 'checking');
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const available = await readItemMarkCodeAvailability(code, controller.signal);
        if (!controller.signal.aborted) checks.set(code, available ? 'available' : 'occupied');
      } catch {
        if (!controller.signal.aborted) checks.set(code, 'failed');
      } finally {
        if (!controller.signal.aborted) cancel.delete(code);
      }
    }, delay);
    cancel.set(code, () => {
      clearTimeout(timer);
      controller.abort();
    });
  }
  function clear() {
    for (const stop of cancel.values()) stop();
    cancel.clear();
    checks.clear();
  }
  function refresh() {
    clear();
    for (const code of codes.value) check(code, 300);
  }
  watch(
    [codes, active],
    ([current, enabled]) => {
      if (!enabled) return clear();
      for (const code of checks.keys())
        if (!current.has(code)) {
          cancel.get(code)?.();
          cancel.delete(code);
          checks.delete(code);
        }
      for (const code of current) if (!checks.has(code)) check(code, 300);
    },
    { immediate: true },
  );
  onActivated(() => {
    active.value = true;
  });
  onDeactivated(() => {
    active.value = false;
    clear();
  });
  onScopeDispose(clear);

  const fields = computed(() => {
    const targets = new Map<string, number>();
    const sources = new Map<string, Row>();
    for (const { row, input } of drafts.value) {
      sources.set(row.item.markCode, row);
      const target = canonicalDraftCode(input);
      if (target) targets.set(target, (targets.get(target) ?? 0) + 1);
    }
    const result = new Map<string, MarkFieldFeedback>();
    for (const { row, input, transferTarget } of drafts.value) {
      const key = workspaceMarkRowKey(row),
        code = canonicalDraftCode(input);
      const remote = checks.get(code);
      const source = sources.get(code);
      let field: MarkFieldFeedback;
      if (!code)
        field = row.canClear
          ? { state: 'valid', message: '保存后释放原码' }
          : { state: 'invalid', message: '此件必须保留编码' };
      else if (!TRACKING_ITEM_MARK_CODE_PATTERN.test(code))
        field = { state: 'invalid', message: '请输入最多 32 位的正整数' };
      else if ((targets.get(code) ?? 0) > 1) {
        const duplicate = `${targets.get(code)} 行重复`;
        field = {
          state: 'invalid',
          message: remote === 'occupied' && !source ? duplicate + '，编码已占用' : duplicate,
        };
      } else if (transferTarget) continue;
      else if (!row.canClear && (targets.has(row.item.markCode) || source)) {
        field = { state: 'invalid', message: '此件只能改为未占用的编码' };
      } else if (source && !source.canClear) {
        field = { state: 'invalid', message: '原绑定不能参与换码' };
      } else if (remote === 'failed') field = { state: 'failed', message: '查重失败' };
      else if (!remote || remote === 'checking')
        field = { state: 'checking', message: '正在查重…' };
      else if (remote === 'occupied' && !source)
        field = { state: 'invalid', message: '编码已被占用，请更换' };
      else if (source)
        field =
          remote === 'occupied'
            ? { state: 'valid', message: '随本次更改换码' }
            : { state: 'invalid', message: '原码占用已变化，请刷新核对' };
      else field = { state: 'valid', message: '编码可用' };
      result.set(key, field);
    }
    return result;
  });
  const issues = computed(
    () =>
      [...fields.value.values()].filter((f) => f.state === 'invalid' || f.state === 'failed')
        .length,
  );
  const checking = computed(() => [...fields.value.values()].some((f) => f.state === 'checking'));
  return {
    fields,
    issues,
    checking,
    refresh,
    retry: (input: string) => check(canonicalDraftCode(input)),
  };
}
