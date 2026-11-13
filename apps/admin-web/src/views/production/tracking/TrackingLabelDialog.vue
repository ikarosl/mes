<template>
  <el-dialog
    :model-value="visible"
    title="追踪卡标签预览与打印"
    :width="DialogWidth.md"
    @update:model-value="$emit('update:visible', $event)"
  >
    <p v-if="cardNo && !labels.length">追踪卡 {{ cardNo }}</p>
    <el-alert
      v-if="error"
      type="error"
      show-icon
      :closable="false"
    >
      <template #title>
        <span>{{ error }}</span>
        <el-button
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
    </template>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">关闭</el-button>
      <el-button
        :disabled="selectedLabels.length !== 1 || loading || !!error"
        @click="download"
        >下载所选 SVG</el-button
      >
      <el-button
        type="primary"
        :disabled="!selectedLabels.length || loading || !!error"
        @click="printLabel"
      >
        打印{{ selectedLabels.length ? ` ${selectedLabels.length} 张标签` : '标签' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ProductionTrackingCardItem } from '@company/contracts';
import InlineHint from '../../../components/InlineHint.vue';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
import { code128Svg } from './code128';

type LabelCard = Pick<ProductionTrackingCardItem, 'id' | 'cardNo'>;
const props = withDefaults(
  defineProps<{
    visible: boolean;
    card?: LabelCard | null;
    cards?: LabelCard[];
    cardNo?: string;
    loading?: boolean;
    error?: string;
  }>(),
  { card: null, cards: () => [], cardNo: '', loading: false, error: '' },
);
defineEmits<{
  (event: 'update:visible', value: boolean): void;
  (event: 'refresh'): void;
}>();
const labels = computed(() =>
  (props.card ? [props.card] : props.cards).map((card) => {
    const svg = code128Svg(card.cardNo);
    return { ...card, svg, url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` };
  }),
);
const selectedIds = ref<string[]>([]);
watch(
  [() => props.visible, labels],
  () => {
    selectedIds.value = labels.value.map((label) => label.id);
  },
  { immediate: true },
);
const selectedLabels = computed(() =>
  labels.value.filter((label) => selectedIds.value.includes(label.id)),
);
function selectAll(checked: unknown): void {
  selectedIds.value = checked ? labels.value.map((label) => label.id) : [];
}
function selectLabel(id: string, checked: boolean): void {
  selectedIds.value = checked
    ? [...new Set([...selectedIds.value, id])]
    : selectedIds.value.filter((value) => value !== id);
}
function download(): void {
  if (!props.visible || selectedLabels.value.length !== 1 || props.loading || props.error) return;
  const label = selectedLabels.value[0];
  if (!label) return;
  const link = document.createElement('a');
  link.href = label.url;
  link.download = `${label.cardNo}.svg`;
  link.click();
}
function printLabel(): void {
  if (!props.visible || !selectedLabels.value.length || props.loading || props.error) return;
  const popup = window.open('', '_blank', 'width=760,height=720');
  if (!popup) {
    EMessage.warning('打印窗口被浏览器拦截，请允许弹出窗口后重试');
    return;
  }
  popup.document.write(
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>追踪卡标签</title><style>@page{size:70mm 40mm;margin:3mm}*{box-sizing:border-box}body{margin:0;color:#000;background:#fff}.label{width:64mm;height:34mm;display:flex;align-items:center;justify-content:center;break-after:page;page-break-after:always}.label:last-child{break-after:auto;page-break-after:auto}svg{display:block;width:100%;height:auto;max-height:100%}</style></head><body>${selectedLabels.value.map((label) => `<div class="label">${label.svg}</div>`).join('')}</body></html>`,
  );
  popup.document.close();
  popup.focus();
  popup.print();
}
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
