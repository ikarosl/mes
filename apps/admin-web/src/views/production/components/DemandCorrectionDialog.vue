<template>
  <el-dialog
    :model-value="visible"
    title="需求更正与追溯"
    :width="DialogWidth.workbench"
    workbench
    :close-on-click-modal="false"
    :before-close="editor.close"
    @update:model-value="(value: boolean) => !value && editor.close()"
  >
    <div
      v-loading="loading"
      class="body"
    >
      <el-alert
        v-if="error"
        type="error"
        :title="error"
        :closable="false"
      />
      <template v-if="check">
        <DemandCorrectionEvidence
          :check="check"
          :new-remaining-quantity="remaining"
        />
        <el-alert
          v-if="check.blockers.length"
          class="correction-warning"
          type="warning"
          title="当前不可更正"
          :closable="false"
          show-icon
        >
          <ul class="blocker-list">
            <li
              v-for="blocker in check.blockers"
              :key="blocker"
            >
              {{ blocker }}
            </li>
          </ul>
        </el-alert>
        <el-form
          v-if="check.canCorrect"
          label-position="top"
          :disabled="submitting || unresolved"
        >
          <el-form-item label="处理方式"
            ><el-radio-group v-model="kind">
              <el-radio-button
                v-for="option in kinds"
                :key="option"
                :value="option"
                >{{ DEMAND_CORRECTION_KIND_LABELS[option] }}</el-radio-button
              >
            </el-radio-group></el-form-item
          >
          <el-form-item
            label="更正后总需求量"
            required
            ><el-input-number
              v-model="target"
              :min="Number(check.issuedQuantity)"
              :max="99999999"
              :precision="0"
              :disabled="kind === 'close'"
          /></el-form-item>
          <p>
            本次新建剩余量：<strong>{{ quantity(Math.max(0, remaining)) }}</strong>
            {{ check.unit }}。{{
              remaining === 0
                ? '只关闭旧剩余，不创建零数量需求。'
                : '新需求沿用原物料、精确版本及来源单据。'
            }}
          </p>
          <el-form-item
            label="更正 / 关闭原因"
            required
            ><el-input
              v-model="reason"
              type="textarea"
              :rows="3"
              maxlength="5000"
              show-word-limit
          /></el-form-item>
        </el-form>
        <h4>更正审批历史</h4>
        <el-table
          :data="history"
          size="small"
        >
          <el-table-column
            prop="id"
            label="更正 ID"
            width="90"
          />
          <el-table-column label="原 / 新需求"
            ><template #default="{ row }"
              >#{{ row.oldDemandId }} →
              {{ row.newDemandId ? `#${row.newDemandId}` : '无新需求' }}</template
            ></el-table-column
          >
          <el-table-column label="总量 / 新剩余"
            ><template #default="{ row }"
              >{{ quantity(row.snapshot.targetTotalQuantity) }} /
              {{ quantity(row.snapshot.newRemainingQuantity) }}</template
            ></el-table-column
          >
          <el-table-column label="状态"
            ><template #default="{ row }">{{
              DEMAND_CORRECTION_STATE_LABELS[row.state as DemandCorrectionHistoryItem['state']]
            }}</template></el-table-column
          >
          <el-table-column label="原因"
            ><template #default="{ row }">{{ row.snapshot.reason }}</template></el-table-column
          >
          <el-table-column label="生效影响"
            ><template #default="{ row }"
              >{{
                row.fulfilledSupplementIds.length
                  ? '齐套补料单 #' + row.fulfilledSupplementIds.join('、#')
                  : '未新增齐套'
              }}；{{
                row.reopenedStepIds.length
                  ? '重开工序 #' + row.reopenedStepIds.join('、#')
                  : '未重开工序'
              }}</template
            ></el-table-column
          >
          <el-table-column label="审批"
            ><template #default="{ row }"
              ><el-button
                v-if="row.approvalInstanceId"
                link
                type="primary"
                @click="openApproval(row.approvalInstanceId)"
                >查看审批</el-button
              ></template
            ></el-table-column
          >
        </el-table>
      </template>
      <el-alert
        v-if="unresolved"
        class="correction-warning"
        type="warning"
        title="提交结果未确认，输入与原提交标识已保留；请重试原提交或核对审批记录。"
        :closable="false"
        show-icon
      />
    </div>
    <template #footer>
      <el-button
        :disabled="submitting"
        @click="editor.close"
        >关闭</el-button
      >
      <el-button
        :disabled="submitting || unresolved"
        @click="editor.load()"
        >刷新核对</el-button
      >
      <el-button
        v-if="check?.canCorrect || unresolved"
        type="primary"
        :loading="submitting"
        :disabled="!unresolved && !canSubmit"
        @click="editor.submit"
        >{{ unresolved ? '重试原提交' : '提交更正审批' }}</el-button
      >
    </template>
  </el-dialog>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import type { DemandCorrectionHistoryItem, DemandCorrectionKind } from '@company/contracts';
import { DEMAND_CORRECTION_KIND_LABELS, DEMAND_CORRECTION_STATE_LABELS } from '@company/constants';
import { DialogWidth } from '../../../utils/dialog';
import { formatQuantity as quantity } from '../production-status';
import { useDemandCorrection } from '../composables/useDemandCorrection';
import DemandCorrectionEvidence from './DemandCorrectionEvidence.vue';
const props = defineProps<{ visible: boolean; demandId: string | null }>();
const emit = defineEmits<{ 'update:visible': [boolean]; changed: [] }>();
const router = useRouter();
const editor = useDemandCorrection(
  props,
  () => emit('changed'),
  () => emit('update:visible', false),
);
const {
  check,
  history,
  loading,
  submitting,
  unresolved,
  error,
  kind,
  target,
  reason,
  remaining,
  canSubmit,
} = editor;
const kinds = computed<DemandCorrectionKind[]>(() =>
  check.value?.demandType === 'manual_additional' ? ['quantity', 'close'] : ['quantity'],
);
const openApproval = (instanceId: string) =>
  router.push({ name: 'approval-inbox', query: { instanceId } });
</script>
<style scoped>
.el-form {
  margin-top: 20px;
}
.el-alert {
  margin: 12px 0;
}
.correction-warning.el-alert {
  color: #7c2d12;
  background-color: #fff7ed;
  border: 1px solid #fed7aa;
}
.correction-warning :deep(.el-alert__title) {
  color: #7c2d12;
  font-weight: 600;
}
.correction-warning :deep(.el-alert__icon) {
  color: #92400e;
}
.blocker-list {
  margin: 6px 0 0;
  padding-left: 20px;
  color: #374151;
  font-size: 14px;
  line-height: 1.8;
}
</style>
