<template>
  <el-dialog
    :model-value="visible"
    title="追踪卡条码与打印"
    :width="DialogWidth.md"
    @update:model-value="$emit('update:visible', $event)"
  >
    <template v-if="card">
      <el-tabs v-model="format"
        ><el-tab-pane
          label="内部条码标签"
          name="internal" /><el-tab-pane
          label="完整工序追踪卡"
          name="external"
      /></el-tabs>
      <div class="label-preview">
        <div
          class="label-sheet"
          :class="{ 'label-sheet--external': format === 'external' }"
        >
          <h3 v-if="format === 'external'">工序追踪卡</h3>
          <div class="label-caption">
            <strong>{{ card.batchNo }}</strong
            ><span>{{ formatQuantity(card.quantity) }} {{ card.unit }}</span>
          </div>
          <img
            :src="barcodeUrl"
            :alt="`${card.cardNo} 条形码`"
          />
          <dl v-if="format === 'external'">
            <dt>工单</dt>
            <dd>{{ card.workOrderNo }}</dd>
            <dt>产品</dt>
            <dd>{{ card.productCode }} / {{ card.productName }}</dd>
            <dt>登记人</dt>
            <dd>{{ card.personnelName }}</dd>
            <dt>建卡时间</dt>
            <dd>{{ formatDateTimeForDisplay(card.createdAt) }}</dd>
          </dl>
          <strong v-if="terminalStatusLabel">{{ terminalStatusLabel }}</strong>
        </div>
      </div>
      <InlineHint
        >标签与完整追踪卡使用同一个码；补打不产生新卡或报工量。更正盘量后请重新打印。</InlineHint
      >
    </template>
    <template #footer
      ><el-button @click="$emit('update:visible', false)">关闭</el-button
      ><el-button @click="download">下载条形码 SVG</el-button
      ><el-button
        type="primary"
        @click="printLabel"
        >打印{{ format === 'internal' ? '内部标签' : '追踪卡' }}</el-button
      ></template
    >
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ProductionTrackingCardDetail } from '@company/contracts';
import { PRODUCTION_TRACKING_CARD_STATUS_LABELS } from '@company/constants';
import InlineHint from '../../../components/InlineHint.vue';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { formatQuantity } from '../../../utils/quantity';
import { code128Svg } from './code128';
const props = defineProps<{ visible: boolean; card: ProductionTrackingCardDetail | null }>();
defineEmits<{ (event: 'update:visible', value: boolean): void }>();
const format = ref('internal');
const terminalStatusLabel = computed(() => {
  const status = props.card?.status;
  return status === 'voided' || status === 'scrapped'
    ? PRODUCTION_TRACKING_CARD_STATUS_LABELS[status]
    : '';
});
const svg = computed(() => (props.card ? code128Svg(props.card.cardNo) : ''));
const barcodeUrl = computed(
  () => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.value)}`,
);
function download(): void {
  if (!props.card) return;
  const link = document.createElement('a');
  link.href = barcodeUrl.value;
  link.download = `${props.card.cardNo}.svg`;
  link.click();
}
const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
function printLabel(): void {
  const card = props.card;
  if (!card) return;
  const popup = window.open('', '_blank', 'width=760,height=720');
  if (!popup) {
    EMessage.warning('打印窗口被浏览器拦截，请允许弹出窗口后重试');
    return;
  }
  const external = format.value === 'external';
  popup.document.write(
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(card.cardNo)}</title><style>@page{size:${external ? 'A5' : '70mm 40mm'};margin:${external ? '10mm' : '3mm'}}*{box-sizing:border-box}body{font-family:Arial,'Microsoft YaHei',sans-serif;color:#000;margin:0}main{width:${external ? '100%' : '64mm'};margin:auto}h2{text-align:center;font-size:20px}.caption{display:flex;justify-content:space-between;gap:10px;font-size:12px}svg{display:block;width:100%;height:auto;margin:6px 0}dl{display:grid;grid-template-columns:70px 1fr;gap:10px;font-size:13px}dt,dd{margin:0}dd{overflow-wrap:anywhere}</style></head><body><main>${external ? '<h2>工序追踪卡</h2>' : ''}<div class="caption"><strong>${escapeHtml(card.batchNo)}</strong><strong>${escapeHtml(formatQuantity(card.quantity))} ${escapeHtml(card.unit)}</strong></div>${svg.value}${external ? `<dl><dt>工单</dt><dd>${escapeHtml(card.workOrderNo)}</dd><dt>产品</dt><dd>${escapeHtml(card.productCode)} / ${escapeHtml(card.productName)}</dd><dt>建卡登记人</dt><dd>${escapeHtml(card.personnelName)}</dd><dt>建卡时间</dt><dd>${escapeHtml(formatDateTimeForDisplay(card.createdAt))}</dd></dl>` : ''}${terminalStatusLabel.value ? `<strong>${escapeHtml(terminalStatusLabel.value)}</strong>` : ''}</main></body></html>`,
  );
  popup.document.close();
  popup.focus();
  popup.print();
}
</script>

<style scoped>
.label-preview {
  padding: 24px;
  margin-bottom: 16px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
}
.label-sheet {
  width: 340px;
  max-width: 100%;
  padding: 16px;
  margin: auto;
  background: white;
  color: black;
  border: 1px solid var(--el-border-color);
}
.label-sheet--external {
  width: 460px;
}
.label-sheet h3 {
  text-align: center;
  margin: 0 0 16px;
}
.label-caption {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 14px;
}
.label-sheet img {
  display: block;
  width: 100%;
  margin: 8px 0;
}
.label-sheet dl {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 12px;
  font-size: 14px;
}
.label-sheet dt,
.label-sheet dd {
  margin: 0;
  overflow-wrap: anywhere;
}
</style>
