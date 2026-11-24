<template>
  <el-dialog
    :model-value="visible"
    :title="title"
    :width="showScrapItemMarks && scrapMarksExpanded ? DialogWidth.xl : DialogWidth.md"
    :before-close="beforeClose"
    :show-close="!submitting"
    @update:model-value="requestClose"
  >
    <div
      v-loading="loading"
      class="correction-content"
    >
      <el-descriptions
        :column="2"
        border
      >
        <el-descriptions-item label="追踪卡"
          ><strong>{{ target?.cardNo }}</strong></el-descriptions-item
        >
        <template v-if="basis && handling">
          <el-descriptions-item label="当前剩余盘量">
            <strong>{{ formatQuantity(basis.card.quantity) }} {{ basis.card.unit }}</strong>
          </el-descriptions-item>
          <el-descriptions-item
            label="异常描述"
            :span="2"
          >
            <div class="record-description">{{ basis.record.description }}</div>
          </el-descriptions-item>
          <el-descriptions-item
            v-if="isCorrection || originalQuantity > 0"
            :label="isCorrection ? '更正前报废数量' : '本次报废数量'"
          >
            <strong>{{ formatQuantity(originalQuantity) }} {{ basis.card.unit }}</strong>
          </el-descriptions-item>
          <el-descriptions-item
            v-else
            label="原处置"
          >
            返修完成 {{ formatQuantity(handling.repairedQuantity) }} {{ basis.card.unit }}
          </el-descriptions-item>
          <el-descriptions-item label="登记时间">
            {{ formatDateTimeForDisplay(handling.createdAt) }}
          </el-descriptions-item>
          <el-descriptions-item
            v-if="!showScrapItemMarks && originalMarks.length"
            label="当前报废编码"
            :span="2"
          >
            <div class="affected-codes">
              {{ originalMarks.map((mark) => mark.markCode).join('、') }}
            </div>
          </el-descriptions-item>
        </template>
      </el-descriptions>
      <SubmissionRecoveryNotice
        :status="intentStatus"
        :busy="submitting"
        records-label="异常与处理记录"
        :retry-disabled="!reads.isActive()"
        allow-restart
        @retry="submit"
        @restart="restart"
      />
      <el-alert
        v-if="readError"
        :title="readError"
        type="error"
        :closable="false"
        show-icon
      />
      <el-alert
        v-else-if="stale && !recovery"
        title="追踪卡或异常已更新，当前输入已保留。请载入最新资料后重新核对。"
        type="warning"
        :closable="false"
        show-icon
      />
      <el-alert
        v-if="blockedReason && !recovery && !readError"
        :title="blockedReason"
        type="warning"
        :closable="false"
        show-icon
      />

      <el-form
        v-if="basis && handling"
        label-position="top"
        :disabled="locked || Boolean(blockedReason)"
      >
        <template v-if="isCorrection">
          <el-form-item
            label="更正后报废总量"
            required
          >
            <el-input-number
              v-model="quantity"
              :min="1"
              :max="MAX_PERSISTED_INTEGER_QUANTITY"
              :precision="0"
              :step="1"
            /><span class="unit">{{ basis.card.unit }}</span>
          </el-form-item>
          <el-form-item
            v-if="showScrapItemMarks"
            label="更正后报废编码"
            :required="requiredScrapMarks || minimumScrapMarks > 0"
          >
            <div class="mark-choice">
              <TrackingItemMarkList
                v-model="selectedIds"
                v-model:expanded="scrapMarksExpanded"
                :card-id="basis.card.id"
                :revision="basis.card.version"
                :enabled="visible && !blockedReason"
                :locked="locked"
                :default-expanded="requiredScrapMarks"
                :minimum-selection="minimumScrapMarks"
                :retained-scrap-marks="originalMarks"
                :selection-target="requiredScrapMarks ? (quantity ?? null) : undefined"
                :selection-footer-host="selectionFooterHost"
                :selection-review-host="selectionReviewHost"
                selectable
                collapsible
                compact
              />
            </div>
          </el-form-item>
          <el-text
            v-if="quantityError && !blockedReason"
            class="quantity-state"
            type="danger"
            role="status"
          >
            {{ quantityError }}
          </el-text>
        </template>
        <InlineHint
          v-if="remainingQuantity !== undefined && remainingQuantity >= 0 && !blockedReason"
        >
          {{ isCorrection ? '更正' : '作废' }}后剩余盘量
          <strong>{{ formatQuantity(remainingQuantity) }} {{ basis.card.unit }}</strong
          >。
          <template v-if="basis.card.status === 'scrapped' && remainingQuantity > 0">
            本盘将解除整盘报废状态。
          </template>
          <template
            v-else-if="
              basis.card.status !== 'scrapped' &&
              remainingQuantity === 0 &&
              !basis.card.openAbnormalityCount
            "
          >
            本盘将标记为整盘报废。
          </template>
          <template v-if="!isCorrection">
            <template v-if="originalQuantity > 0">
              本次扣减的 {{ formatQuantity(originalQuantity) }}
              {{ basis.card.unit }} 将计回盘量。<template v-if="originalMarks.length">
                {{ formatQuantity(originalMarks.length) }} 个报废编码将恢复为有效绑定。
              </template>
            </template>
            原异常与作废原因保留在追踪记录中。
          </template>
        </InlineHint>
        <el-form-item
          :label="isCorrection ? '更正原因' : '作废原因'"
          required
        >
          <el-input
            v-model="reason"
            type="textarea"
            :rows="3"
            maxlength="5000"
            show-word-limit
          />
        </el-form-item>
      </el-form>
    </div>
    <template #footer>
      <div class="dialog-footer">
        <div
          v-if="visible && showScrapItemMarks"
          ref="selectionFooterHost"
        />
        <div class="dialog-actions">
          <el-button
            :disabled="submitting"
            @click="requestClose(false)"
            >取消</el-button
          >
          <el-button
            :loading="loading"
            :disabled="submitting || recovery"
            @click="reloadBasis"
          >
            {{ stale ? '载入最新资料' : '刷新信息' }}
          </el-button>
          <el-button
            :type="isCorrection ? 'primary' : 'danger'"
            :loading="submitting"
            :disabled="!canSubmit"
            @click="submit"
            >{{ isCorrection ? '确认更正' : '作废登记' }}</el-button
          >
        </div>
      </div>
    </template>
  </el-dialog>
  <div
    ref="selectionReviewHost"
    class="selection-review-host"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { ProductionTrackingCardDetail } from '@company/contracts';
import { MAX_PERSISTED_INTEGER_QUANTITY } from '@company/utils';
import InlineHint from '../../../components/InlineHint.vue';
import SubmissionRecoveryNotice from '../../../components/SubmissionRecoveryNotice.vue';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { DialogWidth } from '../../../utils/dialog';
import { formatQuantity } from '../../../utils/quantity';
import TrackingItemMarkList from './TrackingItemMarkList.vue';
import {
  useTrackingAbnormalityCorrection,
  type TrackingAbnormalityCorrectionTarget,
} from './use-tracking-abnormality-correction';

defineOptions({ name: 'TrackingAbnormalityCorrectionDialog' });
const props = defineProps<{
  visible: boolean;
  target: TrackingAbnormalityCorrectionTarget | null;
  routeName: string;
  contextGuard?: (card: ProductionTrackingCardDetail) => string;
}>();
const emit = defineEmits<{
  'update:visible': [value: boolean];
  changed: [card: ProductionTrackingCardDetail];
}>();
const selectionFooterHost = ref<HTMLElement | null>(null);
const selectionReviewHost = ref<HTMLElement | null>(null);
const {
  target,
  title,
  isCorrection,
  basis,
  handling,
  originalQuantity,
  originalMarks,
  showScrapItemMarks,
  requiredScrapMarks,
  scrapMarksExpanded,
  minimumScrapMarks,
  quantity,
  selectedIds,
  reason,
  remainingQuantity,
  quantityError,
  readError,
  stale,
  loading,
  submitting,
  intentStatus,
  recovery,
  locked,
  blockedReason,
  canSubmit,
  reads,
  reloadBasis,
  requestClose,
  beforeClose,
  restart,
  submit,
} = useTrackingAbnormalityCorrection(
  props,
  (card) => emit('changed', card),
  () => emit('update:visible', false),
);
</script>

<style scoped>
.correction-content {
  display: grid;
  gap: 16px;
  min-height: 72px;
}
.affected-codes,
.record-description {
  max-height: 9em;
  overflow: auto;
  overflow-wrap: anywhere;
}
.record-description {
  white-space: pre-wrap;
}
.unit {
  margin-left: 8px;
}
.mark-choice {
  width: 100%;
  min-width: 0;
}
.quantity-state {
  display: block;
  margin-bottom: 12px;
}
.dialog-footer,
.dialog-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.dialog-footer {
  column-gap: 16px;
  justify-content: space-between;
}
.dialog-actions {
  justify-content: flex-end;
  margin-inline-start: auto;
}
.dialog-actions .el-button + .el-button {
  margin-left: 0;
}
.selection-review-host {
  display: contents;
}
</style>
