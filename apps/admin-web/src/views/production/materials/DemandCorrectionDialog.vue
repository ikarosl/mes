<template>
  <el-dialog
    :model-value="visible"
    title="需求更正"
    :width="DialogWidth.lg"
    :close-on-click-modal="false"
    :show-close="!submitting && !confirming"
    :close-on-press-escape="!submitting && !confirming"
    :before-close="editor.close"
  >
    <div v-loading="loading">
      <el-alert
        v-if="error"
        type="error"
        :title="error"
        :closable="false"
        show-icon
      />
      <el-alert
        v-if="targetChanged"
        type="warning"
        :title="`当前目标已切换，需求 id:${openedDemandId} 的草稿仍保留。请先明确处理原草稿，再打开新的需求。`"
        :closable="false"
        show-icon
      />
      <el-alert
        v-if="unresolved"
        type="warning"
        :title="unresolvedMessage"
        :closable="false"
        show-icon
      />
      <el-alert
        v-if="writeError"
        type="error"
        :title="writeError"
        :closable="false"
      />
      <el-alert
        v-if="basisChanged && !unresolved"
        type="warning"
        title="输入仍保留；请刷新核对当前数量及影响，明确采用当前依据后再提交。"
        :closable="false"
        show-icon
      />
      <el-alert
        v-else-if="check && !ready && !loading && !submitting && !unresolved && !error"
        type="warning"
        title="本次核对尚未完成，草稿仍保留。请点击刷新核对后再提交。"
        :closable="false"
        show-icon
      />
      <template v-if="check">
        <DemandCorrectionEvidence
          :check="check"
          mode="command"
          :new-remaining-quantity="remaining"
        />
        <el-alert
          v-if="check.blockers.length"
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
          v-if="check.canCorrect || dirty || unresolved"
          label-position="top"
          :disabled="submitting || confirming || unresolved || targetChanged"
          @submit.prevent
        >
          <el-form-item label="处理方式">
            <el-radio-group v-model="kind">
              <el-radio-button
                v-for="option in kinds"
                :key="option"
                :value="option"
              >
                {{ DEMAND_CORRECTION_KIND_LABELS[option] }}
              </el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item
            label="更正后目标总量"
            required
            :error="dirty ? quantityError : ''"
          >
            <div class="target-input">
              <el-input
                v-model="target"
                inputmode="numeric"
                :disabled="kind === 'close'"
                aria-label="更正后目标总量"
              >
                <template #append>{{ check.unit }}</template>
              </el-input>
              <p class="input-hint">
                填写总目标，不能少于历次累计已领
                <strong>{{ quantity(check.issuedQuantity) }} {{ check.unit }}</strong
                >。
              </p>
            </div>
          </el-form-item>
          <InlineHint class="approval-effect">
            批准后关闭旧未领
            <strong>{{ quantity(check.oldRemainingQuantity) }} {{ check.unit }}</strong
            >；
            <template v-if="remaining !== undefined && remaining >= 0">
              新需求量（目标总量减去历次已领）为
              <strong>{{ quantity(remaining) }} {{ check.unit }}</strong
              >。
              {{
                remaining === 0
                  ? '只关闭旧剩余，不创建零数量需求。'
                  : '新需求沿用原物料、精确版本及来源单据。'
              }}
            </template>
            <template v-else>填写有效目标总量后计算本次新需求量。</template>
            历次领料保留，退料不抵减累计已领。
          </InlineHint>
          <el-form-item
            label="更正原因"
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
      </template>
    </div>
    <template #footer>
      <el-button
        :disabled="submitting || confirming"
        @click="editor.close()"
      >
        关闭
      </el-button>
      <el-button
        :disabled="submitting || confirming || unresolved || targetChanged"
        @click="editor.load()"
      >
        刷新核对
      </el-button>
      <el-button
        v-if="basisChanged && !unresolved"
        type="warning"
        :disabled="!canAdoptBasis"
        @click="editor.adoptCurrentBasis()"
      >
        采用当前依据
      </el-button>
      <el-button
        v-if="check?.canCorrect || unresolved || dirty"
        type="primary"
        :loading="submitting"
        :disabled="!canSubmit"
        @click="editor.submit()"
      >
        {{ unresolved ? '重试原提交' : '提交更正审批' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { DEMAND_CORRECTION_KIND_LABELS } from '@company/constants';
import InlineHint from '../../../components/InlineHint.vue';
import { DialogWidth } from '../../../utils/dialog';
import { formatQuantity as quantity } from '../../../utils/quantity';
import { useDemandCorrection } from './use-demand-correction';
import DemandCorrectionEvidence from './DemandCorrectionEvidence.vue';

const props = defineProps<{ visible: boolean; demandId: string | null }>();
const emit = defineEmits<{ 'update:visible': [boolean]; changed: [] }>();
defineOptions({ name: 'DemandCorrectionDialog' });
const editor = useDemandCorrection(
  props,
  () => emit('changed'),
  () => emit('update:visible', false),
);
const {
  check,
  demandId: openedDemandId,
  loading,
  ready,
  submitting,
  confirming,
  unresolved,
  unresolvedMessage,
  error,
  writeError,
  kind,
  kinds,
  target,
  reason,
  remaining,
  quantityError,
  dirty,
  basisChanged,
  targetChanged,
  canAdoptBasis,
  canSubmit,
} = editor;
defineExpose({ close: editor.close });
</script>

<style scoped>
.el-form {
  margin-top: 16px;
}
.el-alert {
  margin: 12px 0;
}
.target-input {
  width: 100%;
}
.target-input .el-input {
  max-width: 320px;
}
.input-hint {
  margin: 6px 0 0;
  color: var(--el-text-color-regular);
  line-height: 1.6;
}
.approval-effect {
  margin-bottom: 16px;
}
.blocker-list {
  margin: 6px 0 0;
  padding-left: 20px;
  line-height: 1.8;
}
</style>
