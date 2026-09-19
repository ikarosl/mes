<template>
  <el-dialog
    :model-value="visible"
    title="产出清单与结案核对"
    :width="DialogWidth.xl"
    workbench
    :close-on-click-modal="false"
    :before-close="editor.close"
    @update:model-value="(value: boolean) => !value && editor.close()"
  >
    <el-alert
      v-if="error"
      type="error"
      :closable="false"
      show-icon
      :title="error"
    />
    <el-alert
      v-if="lastSuccess"
      type="success"
      :closable="false"
      :title="lastSuccess"
      class="notice"
    />
    <div v-loading="loading">
      <template v-if="detail">
        <el-descriptions
          :column="3"
          border
          class="summary"
        >
          <el-descriptions-item label="工单 / 任务"
            >{{ detail.check.workOrderNo }} / {{ detail.check.batchNo }}</el-descriptions-item
          >
          <el-descriptions-item label="成品"
            >{{ detail.check.productCode }} · {{ detail.check.productName }}</el-descriptions-item
          >
          <el-descriptions-item label="计划数量"
            >{{ quantity(detail.check.plannedQuantity) }}
            {{ detail.check.unit }}</el-descriptions-item
          >
          <el-descriptions-item label="结案类型">{{
            PRODUCTION_CLOSEOUT_MODE_LABELS[detail.mode]
          }}</el-descriptions-item>
          <el-descriptions-item label="清单状态">{{
            PRODUCTION_OUTPUT_STATUS_LABELS[detail.status]
          }}</el-descriptions-item>
          <el-descriptions-item label="最终审批负责人">{{
            detail.workOrderOwnerName
          }}</el-descriptions-item>
        </el-descriptions>
        <el-alert
          title="产线草稿 → 质检留存记录 → 管理员核对清单 → 工单负责人审批 → 仓管入库"
          description="质检记录与产线草稿分别保存。批准清单仅作为入库依据，不自动增加库存。计划内产出不得超过计划；额外产出与新增报废据实填写。"
          type="info"
          :closable="false"
          class="notice"
        />
        <el-alert
          v-if="stale"
          title="其他操作已更新清单。当前输入已保留，请重新加载后核对，不能直接提交旧草稿。"
          type="warning"
          :closable="false"
          class="notice"
        />
        <el-tabs
          v-model="activeTab"
          class="notice"
        >
          <el-tab-pane
            label="产出草稿"
            name="draft"
          >
            <p
              v-if="!detail.draft"
              class="muted"
            >
              尚无产出草稿。请先填写并保存，再登记线下质检记录。
            </p>
            <el-form
              label-position="top"
              :disabled="locked"
            >
              <div class="quantity-fields">
                <el-form-item
                  label="计划内产出"
                  required
                >
                  <el-input-number
                    v-model="draft.availableQuantity"
                    :min="0"
                    :max="Number(detail.check.plannedQuantity)"
                    :precision="0"
                    :disabled="Boolean(detail.receipts.productionInboundId)"
                  />
                  <span class="unit">{{ detail.check.unit }}</span>
                  <p
                    v-if="detail.receipts.productionInboundId"
                    class="receipt-lock-note"
                    style="max-width: 100px; margin: 0 6px"
                  >
                    已有生产流转入库 {{ quantity(detail.receipts.productionReceivedQuantity) }}
                    {{ detail.check.unit }}，此类别数量已锁定。
                  </p>
                </el-form-item>
                <el-form-item
                  label="计划外产出"
                  required
                  ><el-input-number
                    v-model="draft.extraQuantity"
                    :min="0"
                    :max="PRODUCTION_OUTPUT_QUANTITY_MAX"
                    :precision="0"
                    :disabled="Boolean(detail.receipts.extraInboundId)"
                  /><span class="unit">{{ detail.check.unit }}</span>
                  <p
                    v-if="detail.receipts.extraInboundId"
                    class="receipt-lock-note"
                  >
                    已确认额外产出入库 {{ quantity(detail.receipts.extraReceivedQuantity) }}
                    {{ detail.check.unit }}，此类别数量已锁定。
                  </p></el-form-item
                >
                <el-form-item
                  label="本次新增成品报废"
                  required
                  ><el-input-number
                    v-model="draft.additionalScrapQuantity"
                    :min="0"
                    :max="PRODUCTION_OUTPUT_QUANTITY_MAX"
                    :precision="0"
                  /><span class="unit">{{ detail.check.unit }}</span></el-form-item
                >
              </div>
              <p class="quantity-summary">
                计划缺口
                <strong>{{
                  quantity(Number(detail.check.plannedQuantity) - draft.availableQuantity)
                }}</strong
                >；历史工序报废 {{ quantity(detail.check.existingScrapQuantity) }}，累计成品报废
                {{
                  quantity(
                    Number(detail.check.existingScrapQuantity) + draft.additionalScrapQuantity,
                  )
                }}
                {{ detail.check.unit }}。
              </p>
              <p class="muted">
                新增报废不重复包含历史工序报废，不包含原材料损耗，也不触发补料或补产。已入库类别的数量不可再改。
              </p>
              <el-form-item
                label="产出说明 / 计划差异原因"
                required
                ><el-input
                  v-model="draft.reason"
                  type="textarea"
                  :rows="2"
                  maxlength="5000"
                  show-word-limit
              /></el-form-item>
              <el-form-item
                label="物料核对总结及后续安排"
                required
                ><el-input
                  v-model="draft.materialReviewNote"
                  type="textarea"
                  :rows="2"
                  maxlength="5000"
                  show-word-limit
              /></el-form-item>
              <el-form-item
                label="本次引用的质检记录"
                required
              >
                <el-select
                  v-model="draft.inspectionRecordId"
                  placeholder="质检记录保存后，由管理员选择最新记录"
                  clearable
                  style="width: 100%"
                >
                  <el-option
                    v-for="record in detail.inspections"
                    :key="record.id"
                    :value="record.id"
                    :label="`质检 #${record.id} · ${record.inspectedAt} · ${record.createdByName}${record.id === detail.latestInspectionId ? '（最新）' : '（历史，不可送审）'}`"
                    :disabled="record.id !== detail.latestInspectionId"
                  />
                </el-select>
              </el-form-item>
            </el-form>
            <el-descriptions
              v-if="selectedInspection"
              :column="3"
              border
            >
              <el-descriptions-item label="质检计划内合格">{{
                selectedInspection.inspected.availableQuantity
              }}</el-descriptions-item>
              <el-descriptions-item label="质检计划外合格">{{
                selectedInspection.inspected.extraQuantity
              }}</el-descriptions-item>
              <el-descriptions-item label="质检新增报废">{{
                selectedInspection.inspected.additionalScrapQuantity
              }}</el-descriptions-item>
              <el-descriptions-item
                label="质检说明"
                :span="3"
                >{{ selectedInspection.resultNote }}</el-descriptions-item
              >
            </el-descriptions>
            <el-alert
              v-if="
                selectedInspection &&
                (!inspectionMatches || selectedInspection.id !== detail.latestInspectionId)
              "
              title="送审前须引用最新质检记录，并由产线管理员将三个申报数量核对为该记录的实检数量。"
              type="warning"
              :closable="false"
              class="notice"
            />
            <el-alert
              v-if="detail.blockers.length && detail.canEdit"
              type="warning"
              :closable="false"
              title="送审前仍需处理"
              class="notice"
              ><ul>
                <li
                  v-for="blocker in detail.blockers"
                  :key="blocker"
                >
                  {{ blocker }}
                </li>
              </ul></el-alert
            >
          </el-tab-pane>
          <el-tab-pane
            :label="`质检记录（${detail.inspections.length}）`"
            name="inspections"
          >
            <ProductionOutputInspectionPanel
              :key="detail.id"
              :detail="detail"
              :inspection="inspection"
              :declared="inspectionDeclared"
              :declared-version="inspectionVersion"
              :inspection-open="inspectionOpen"
              :inspection-stale="inspectionStale"
              :inspection-valid="inspectionValid"
              :busy="busy"
              :unresolved="unresolved"
              :error="error"
              :dirty="dirty"
              :submitting="submitting"
              @start="editor.startInspection"
              @record="editor.recordInspection"
              @discard="inspectionOpen = false"
              @change="Object.assign(inspection, $event)"
            />
          </el-tab-pane>
          <el-tab-pane
            :label="`批准清单与更正（${detail.revisions.length}）`"
            name="revisions"
          >
            <ProductionOutputRevisionPanel
              :detail="detail"
              :selected-revision="selectedRevision"
              :busy="busy"
              :unresolved="unresolved"
              :error="error"
              @begin-correction="editor.beginCorrection"
              @cancel-correction="editor.cancelCorrection"
              @select-revision="selectedRevisionId = $event"
              @open-approval="openApproval"
              @print="printRevision"
            />
          </el-tab-pane>
        </el-tabs>
      </template>
      <el-empty
        v-else-if="!loading && !error"
        description="尚无产出清单，请先完成工序执行或开始提前结束收尾"
      />
    </div>
    <el-alert
      v-if="unresolved"
      title="提交结果尚未确认，原操作和幂等标识已保留，请重试原操作或核对后关闭。"
      type="warning"
      :closable="false"
      class="notice"
    />
    <template #footer
      ><div class="toolbar">
        <div>
          <el-button
            :disabled="submitting"
            @click="editor.close"
            >关闭</el-button
          ><el-button
            :disabled="busy || unresolved"
            @click="editor.load()"
            >刷新核对</el-button
          ><el-button
            v-if="stale"
            :disabled="busy || unresolved"
            @click="editor.reloadDraft"
            >重新加载草稿</el-button
          ><el-button
            v-if="detail"
            :disabled="busy || unresolved"
            @click="openCloseout"
            >收尾与物料核对</el-button
          ><el-button
            v-if="detail?.approvalInstanceId"
            link
            type="primary"
            @click="openApproval(detail.approvalInstanceId)"
            >{{ detail.pendingApprovalId ? '查看在审申请' : '查看最近审批' }}</el-button
          >
        </div>
        <div>
          <el-button
            v-if="unresolved"
            type="primary"
            :loading="submitting"
            @click="editor.retry"
            >重试原操作</el-button
          ><template v-else-if="detail?.canEdit"
            ><span class="muted">{{
              dirty ? '草稿未保存' : detail.draft ? '草稿已保存' : '尚未建立草稿'
            }}</span
            ><el-button
              :disabled="locked || !valid || !dirty"
              @click="editor.save"
              >保存产出草稿</el-button
            ><el-button
              type="primary"
              :disabled="!canSubmit"
              :loading="submitting"
              @click="editor.submit"
              >提交结案审批</el-button
            ></template
          >
        </div>
      </div></template
    >
  </el-dialog>
  <Teleport to="body"
    ><article
      v-if="printingRevision"
      class="production-output-print"
    >
      <h1>成品产出批准清单 · 第 {{ printingRevision.revisionNo }} 版</h1>
      <p>
        {{
          printingRevision.id === detail?.currentRevisionId
            ? '当前有效版本'
            : '历史版本，仅供追溯，不用于入库'
        }}
        · 审批 #{{ printingRevision.approvalInstanceId }} · 批准人
        {{ printingRevision.approvedByName }} · {{ printingRevision.approvedAt }}
      </p>
      <BatchCloseoutEvidence :snapshot="printingRevision.snapshot" /></article
  ></Teleport>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { ProductionOutputRevision } from '@company/contracts';
import {
  PRODUCTION_CLOSEOUT_MODE_LABELS,
  PRODUCTION_OUTPUT_STATUS_LABELS,
  PRODUCTION_OUTPUT_QUANTITY_MAX,
} from '@company/constants';
import { DialogWidth } from '../../../utils/dialog';
import { formatQuantity as quantity } from '../production-status';
import { useProductionOutput } from '../composables/useProductionOutput';
import BatchCloseoutEvidence from './BatchCloseoutEvidence.vue';
import ProductionOutputInspectionPanel from './ProductionOutputInspectionPanel.vue';
import ProductionOutputRevisionPanel from './ProductionOutputRevisionPanel.vue';
const props = defineProps<{ visible: boolean; batchId: string | null }>();
const emit = defineEmits<{ 'update:visible': [boolean]; changed: []; 'open-closeout': [string] }>();
const editor = useProductionOutput(
  props,
  () => emit('changed'),
  () => emit('update:visible', false),
);
const {
  detail,
  draft,
  inspection,
  inspectionDeclared,
  inspectionVersion,
  inspectionOpen,
  loading,
  submitting,
  error,
  unresolved,
  lastSuccess,
  dirty,
  busy,
  stale,
  locked,
  valid,
  canSubmit,
  inspectionValid,
  inspectionStale,
  selectedInspection,
  inspectionMatches,
} = editor;
const router = useRouter();
const activeTab = ref('draft'),
  selectedRevisionId = ref<string | null>(null);
const selectedRevision = computed(
  () => detail.value?.revisions.find((row) => row.id === selectedRevisionId.value) ?? null,
);
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      activeTab.value = 'draft';
      selectedRevisionId.value = null;
    }
  },
);
watch(
  () => detail.value?.currentRevisionId,
  (id) => {
    selectedRevisionId.value = id ?? null;
  },
);
async function openCloseout() {
  const batchId = props.batchId;
  if (!batchId) return;
  await editor.close();
  await nextTick();
  if (!props.visible) emit('open-closeout', batchId);
}
const openApproval = (instanceId: string) =>
  router.push({ name: 'approval-inbox', query: { instanceId } });
const printingRevision = ref<ProductionOutputRevision | null>(null);
const finishPrint = () => {
  printingRevision.value = null;
};
async function printRevision() {
  if (!selectedRevision.value) return;
  printingRevision.value = selectedRevision.value;
  await nextTick();
  window.addEventListener('afterprint', finishPrint, { once: true });
  window.print();
}
onBeforeUnmount(() => {
  window.removeEventListener('afterprint', finishPrint);
});
</script>
<style scoped>
.summary,
.notice {
  margin-top: 12px;
}
.quantity-fields,
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
}
.quantity-fields {
  justify-content: flex-start;
  align-items: flex-start;
  gap: 32px;
}
.receipt-lock-note {
  flex-basis: 100%;
  max-width: 100px;
  margin: 0 6px;
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 1.7;
}
.unit {
  margin-left: 8px;
}
.muted {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.7;
}
.quantity-summary {
  padding: 12px;
  background: var(--el-fill-color-light);
}
</style>
<style>
.production-output-print {
  display: none;
}
@media print {
  body > * {
    display: none !important;
  }
  body > .production-output-print {
    display: block !important;
    color: #000;
    background: #fff;
    font-size: 12px;
  }
  .production-output-print .el-table {
    overflow: visible;
  }
  .production-output-print .el-table__body-wrapper,
  .production-output-print .el-scrollbar__wrap {
    overflow: visible !important;
    max-height: none !important;
  }
  @page {
    size: A4 landscape;
    margin: 12mm;
  }
}
</style>
