<template>
  <el-dialog
    :model-value="visible"
    title="追踪卡标签预览与打印"
    :width="DialogWidth.md"
    :before-close="requestClose"
  >
    <p v-if="cardNo && !labels.length">追踪卡 {{ cardNo }}</p>
    <el-alert
      v-if="previewError"
      type="error"
      show-icon
      :closable="false"
    >
      <template #title>
        <span>{{ previewError }}</span>
        <el-button
          v-if="error"
          link
          type="primary"
          :disabled="loading"
          @click="$emit('refresh')"
          >重试</el-button
        >
      </template>
    </el-alert>
    <el-skeleton
      v-if="loading && !labels.length"
      :rows="6"
      animated
    />
    <template v-else-if="labels.length">
      <div
        v-if="labels.length > 1"
        class="selection-bar"
      >
        <el-checkbox
          :model-value="selectedIds.length === labels.length"
          :indeterminate="selectedIds.length > 0 && selectedIds.length < labels.length"
          :disabled="printing"
          @change="selectAll"
          >全选本批标签</el-checkbox
        >
        <span>已选 {{ selectedLabels.length }} / {{ labels.length }} 张</span>
      </div>
      <div class="label-preview">
        <div
          v-for="label in labels"
          :key="label.id"
          class="label-item"
        >
          <el-checkbox
            v-if="labels.length > 1"
            :model-value="selectedIds.includes(label.id)"
            :aria-label="`选择 ${label.cardNo}`"
            :disabled="printing"
            @change="(checked: unknown) => selectLabel(label.id, Boolean(checked))"
          />
          <div class="label-sheet">
            <img
              :src="label.url"
              :alt="`${label.cardNo} 条形码`"
            />
          </div>
        </div>
      </div>
      <InlineHint
        >标签只包含条形码与卡号。更正盘量无需更换标签；打印失败时选择原卡补打。</InlineHint
      >
      <el-alert
        v-if="printError"
        :title="printError"
        type="warning"
        show-icon
        :closable="false"
      />
    </template>
    <template #footer>
      <el-button
        :disabled="printing || printer.busy.value"
        @click="$emit('settings')"
        >打印设置</el-button
      >
      <el-button
        :disabled="printing"
        @click="requestClose"
        >关闭</el-button
      >
      <el-button
        :disabled="printing || selectedLabels.length !== 1 || loading || !!previewError"
        @click="download"
        >下载所选 SVG</el-button
      >
      <el-button
        type="primary"
        :loading="printing"
        :disabled="
          printing || printer.busy.value || !selectedLabels.length || loading || !!previewError
        "
        @click="printLabel"
      >
        打印{{ selectedLabels.length ? ` ${selectedLabels.length} 张标签` : '标签' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onActivated, onDeactivated, onScopeDispose, ref, watch } from 'vue';
import type { ProductionTrackingCardItem } from '@company/contracts';
import { printBarcodeLabels } from '@company/printing';
import { encodeTrackingCardBarcode } from '@company/utils';
import InlineHint from '../../../components/InlineHint.vue';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
import { useLabelPrinter } from '../../../composables/printing/use-label-printer';
import { useTabsStore } from '../../../stores/tabs';
import { code128Svg } from './code128';
import {
  confirmTrackingLabelReprint,
  trackingBarcodeLabels,
  trackingPrintFailure,
} from './tracking-label-printing';

type LabelCard = Pick<ProductionTrackingCardItem, 'id' | 'cardNo'>;
type PreparedLabel = LabelCard & { svg: string; url: string };
const props = withDefaults(
  defineProps<{
    visible: boolean;
    routeName: string;
    card?: LabelCard | null;
    cards?: LabelCard[];
    cardNo?: string;
    loading?: boolean;
    error?: string;
  }>(),
  { card: null, cards: () => [], cardNo: '', loading: false, error: '' },
);
const emit = defineEmits<{
  (event: 'update:visible', value: boolean): void;
  (event: 'refresh'): void;
  (event: 'settings'): void;
}>();
const printer = useLabelPrinter();
const printing = ref(false);
const printError = ref('');
const printUnknown = ref(false);
const active = ref(true);
onActivated(() => {
  active.value = true;
});
onDeactivated(() => {
  active.value = false;
});
onScopeDispose(() => {
  active.value = false;
});
const prepared = computed<{ labels: PreparedLabel[]; error: string }>(() => {
  try {
    const labels = (props.card ? [props.card] : props.cards).map((card) => {
      const svg = code128Svg(encodeTrackingCardBarcode(card.cardNo), card.cardNo);
      return { ...card, svg, url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` };
    });
    return { labels, error: '' };
  } catch (error) {
    return { labels: [], error: error instanceof Error ? error.message : '追踪卡标签生成失败' };
  }
});
const labels = computed(() => prepared.value.labels);
const previewError = computed(() => props.error || prepared.value.error);
const selectedIds = ref<string[]>([]);
let labelSourceKey = '';
watch(
  [() => props.visible, labels],
  () => {
    if (!props.visible || printing.value) return;
    const key = JSON.stringify(labels.value.map((label) => [label.id, label.cardNo]));
    if (key === labelSourceKey) return;
    labelSourceKey = key;
    selectedIds.value = labels.value.map((label) => label.id);
    printError.value = '';
    printUnknown.value = false;
  },
  { immediate: true },
);
const selectedLabels = computed(() =>
  labels.value.filter((label) => selectedIds.value.includes(label.id)),
);
function selectAll(checked: unknown): void {
  if (printing.value) return;
  selectedIds.value = checked ? labels.value.map((label) => label.id) : [];
}
function selectLabel(id: string, checked: boolean): void {
  if (printing.value) return;
  selectedIds.value = checked
    ? [...new Set([...selectedIds.value, id])]
    : selectedIds.value.filter((value) => value !== id);
}
function download(): void {
  if (
    !active.value ||
    printing.value ||
    !props.visible ||
    selectedLabels.value.length !== 1 ||
    props.loading ||
    previewError.value
  )
    return;
  const label = selectedLabels.value[0];
  if (!label) return;
  const link = document.createElement('a');
  link.href = label.url;
  link.download = `${label.cardNo}.svg`;
  link.click();
}
function requestClose(): void {
  if (!printing.value) emit('update:visible', false);
}

async function printLabel(): Promise<void> {
  if (
    !active.value ||
    printing.value ||
    printer.busy.value ||
    !props.visible ||
    !selectedLabels.value.length ||
    props.loading ||
    previewError.value
  )
    return;
  const cards = selectedLabels.value.map((label) => ({ id: label.id, cardNo: label.cardNo }));
  printing.value = true;
  try {
    if (!(await confirmTrackingLabelReprint(printUnknown.value))) return;
    if (!active.value || !props.visible || printer.busy.value) return;
    const frozenLabels = trackingBarcodeLabels(cards);
    await printer.runOperation((settings) => printBarcodeLabels(frozenLabels, settings));
    printError.value = '';
    printUnknown.value = false;
    if (active.value && props.visible) EMessage.success('标签已提交打印服务，请核对实际出纸');
  } catch (error) {
    const failure = trackingPrintFailure(error);
    printError.value = failure.message;
    printUnknown.value = failure.unknown;
  } finally {
    printing.value = false;
  }
}

const unregister = useTabsStore().registerCloseGuard(props.routeName, async () => !printing.value);
onScopeDispose(unregister);
</script>

<style scoped>
.selection-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  color: var(--el-text-color-regular);
}
.label-preview {
  display: grid;
  gap: 16px;
  max-height: 55vh;
  overflow: auto;
  padding: 24px;
  margin-bottom: 16px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
}
.label-item {
  display: flex;
  align-items: center;
  gap: 12px;
}
.label-sheet {
  width: 380px;
  max-width: 100%;
  min-width: 0;
  padding: 12px;
  margin: auto;
  background: white;
  color: black;
  border: 1px solid var(--el-border-color);
}
.label-sheet img {
  display: block;
  width: 100%;
}
</style>
