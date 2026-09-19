<template>
  <el-dialog
    :model-value="visible"
    :title="check?.termination ? '结案信息核对' : detail ? '批次逐项收尾' : '提前结束生产'"
    :width="DialogWidth.workbench"
    workbench
    :close-on-click-modal="false"
    :before-close="closeWorkbench"
    @update:model-value="(value: boolean) => !value && closeWorkbench()"
  >
    <div v-loading="loading">
      <el-alert
        v-if="error"
        :title="error"
        type="error"
        :closable="false"
        show-icon
      />
      <el-alert
        v-if="lastSuccess"
        :title="lastSuccess"
        type="success"
        :closable="false"
        show-icon
        class="notice"
      />
      <template v-if="check">
        <el-descriptions
          :column="3"
          border
          class="section"
        >
          <el-descriptions-item label="工单 / 任务"
            >{{ check.workOrderNo }} / {{ check.batchNo }}</el-descriptions-item
          >
          <el-descriptions-item label="状态">{{
            batchStatusMeta(check.batchStatus).label
          }}</el-descriptions-item>
          <el-descriptions-item label="计划量"
            >{{ quantity(check.plannedQuantity) }} {{ check.unit }}</el-descriptions-item
          >
          <el-descriptions-item label="成品"
            >{{ check.productCode }} · {{ check.productName }}</el-descriptions-item
          >
          <el-descriptions-item label="末工序正常报工">{{
            quantity(check.reportedNormalQuantity)
          }}</el-descriptions-item>
          <el-descriptions-item label="历史报废">{{
            quantity(check.existingScrapQuantity)
          }}</el-descriptions-item>
        </el-descriptions>
        <el-alert
          class="notice"
          :title="
            check.termination
              ? '本批次已结束，以下内容仅供查阅'
              : '先处理收尾事项，再核对物料并填写产出清单'
          "
          :description="
            check.termination
              ? '以下展示收尾与物料核对记录，最终产出请打开批准清单查看。需要办理退料时，请在退料管理重新核对当前可退数量。'
              : '进入收尾即停止生产。每项处理保留独立记录；驳回结案审批不会恢复已关闭事项。余料在退料管理办理，现场损坏在物料实核中登记；原待确认损耗请先处理或取消。'
          "
          type="info"
          :closable="false"
        />
        <el-form
          v-if="!detail && !check.termination"
          label-position="top"
          class="section"
          :disabled="busy || unresolved"
        >
          <el-form-item
            label="提前结束原因"
            required
          >
            <el-input
              v-model="reason"
              type="textarea"
              :rows="3"
              maxlength="5000"
              show-word-limit
              placeholder="说明为何停止本批次生产"
            />
          </el-form-item>
        </el-form>
        <el-tabs
          v-else
          v-model="activeTab"
          class="section"
        >
          <el-tab-pane
            :label="`收尾事项（${check.termination ? 0 : (detail?.pendingItems.length ?? 0)}）`"
            name="items"
          >
            <el-collapse
              v-if="detail"
              v-model="demandPanels"
            >
              <el-collapse-item
                :title="`原需求与履约 · ${detail.demands.length} 条`"
                name="demands"
              >
                <p class="muted">
                  保留初始、追加、补料及替代历史。原需求量与本行已领量分别展示，关闭剩余不等于已领齐。
                </p>
                <el-table
                  :data="detail.demands"
                  row-key="id"
                  max-height="320"
                  size="small"
                >
                  <el-table-column
                    label="需求 / 来源"
                    min-width="180"
                  >
                    <template #default="{ row }">
                      <strong
                        >#{{ row.id }} ·
                        {{
                          DEMAND_GENERATION_GROUP_TYPE_LABELS[row.demandType as DemandType]
                        }}</strong
                      >
                      <div
                        v-if="row.parentDemandId"
                        class="muted"
                      >
                        补料原需求 #{{ row.parentDemandId }}
                      </div>
                      <div
                        v-if="row.replacesDemandId"
                        class="muted"
                      >
                        替代旧需求 #{{ row.replacesDemandId }}
                      </div>
                      <div
                        v-if="row.supplementId"
                        class="muted"
                      >
                        补料单 #{{ row.supplementId }}
                      </div>
                    </template>
                  </el-table-column>
                  <el-table-column
                    prop="itemCode"
                    label="物料编码"
                    min-width="140"
                  />
                  <el-table-column
                    prop="materialVariantCode"
                    label="精确版本"
                    min-width="170"
                  />
                  <el-table-column
                    label="原需求量"
                    width="120"
                    ><template #default="{ row }"
                      >{{ quantity(row.demandQuantity) }} {{ row.unit }}</template
                    ></el-table-column
                  >
                  <el-table-column
                    label="本行已领"
                    width="110"
                    ><template #default="{ row }">{{
                      quantity(row.outboundQuantity)
                    }}</template></el-table-column
                  >
                  <el-table-column
                    label="未领余量（保留）"
                    width="140"
                    ><template #default="{ row }">{{
                      quantity(row.remainingQuantity)
                    }}</template></el-table-column
                  >
                  <el-table-column
                    label="履约状态"
                    width="100"
                    ><template #default="{ row }">{{
                      DEMAND_BUSINESS_STATUS_LABELS[row.status as DemandBusinessStatus]
                    }}</template></el-table-column
                  >
                </el-table>
              </el-collapse-item>
            </el-collapse>
            <BatchCloseoutWorklist
              v-if="detail && !check.termination && detail.pendingItems.length"
              :key="detail.id"
              :items="detail.pendingItems"
              :demands="detail.demands"
              :disabled="locked"
              @process="editor.handleItems"
              @draft-change="(dirty: boolean) => (itemDraftDirty = dirty)"
            />
            <el-empty
              v-else
              :image-size="72"
              :description="
                check.termination ? '本批次已结束，无待处理收尾事项' : '当前没有待处理收尾事项'
              "
            >
              <p
                v-if="!detail"
                class="muted"
              >
                本批次未记录逐项收尾明细，可打开产出清单查看结案信息。
              </p>
            </el-empty>
          </el-tab-pane>
          <el-tab-pane
            :label="
              check.termination
                ? '结束时物料快照'
                : `物料实核（${reviewedCount}/${check.materials.length}）`
            "
            name="materials"
          >
            <BatchCloseoutMaterialPanel
              :check="check"
              :detail="detail"
              :readonly="readonly"
              :locked="locked"
              @review="selectMaterial"
            >
              <template #actions="{ row }">
                <el-button
                  link
                  type="warning"
                  :disabled="!canRecordLoss(row)"
                  @click="openMaterialLoss(row)"
                  >登记损坏（不补料）</el-button
                >
                <span
                  v-if="Number(row.returnableQuantity) <= 0"
                  class="muted"
                  >无可登记额度</span
                >
              </template>
              <ProductionMaterialLossRecords :records="check.lossRecords" />
            </BatchCloseoutMaterialPanel>
          </el-tab-pane>
          <el-tab-pane
            :label="`处理记录（${detail?.actions.length ?? 0}）`"
            name="history"
          >
            <el-table
              :data="detail?.actions ?? []"
              size="small"
              :empty-text="check.termination ? '未记录逐项处理明细' : '尚未处理事项'"
            >
              <el-table-column
                label="事项"
                min-width="180"
                ><template #default="{ row }"
                  >{{ BATCH_TERMINATION_IMPACT_LABELS[row.kind as BatchCloseoutItemKind] }} ·
                  {{ row.label }}</template
                ></el-table-column
              >
              <el-table-column
                prop="reason"
                label="处理说明"
                min-width="260"
              />
              <el-table-column
                label="结果"
                min-width="140"
                ><template #default="{ row }"
                  >{{ BATCH_CLOSEOUT_STATUS_LABELS[row.kind]?.[row.resultingStatus]
                  }}{{
                    row.quantity == null
                      ? ''
                      : ' ' + quantity(row.quantity) + ' ' + (row.unit ?? '')
                  }}</template
                ></el-table-column
              >
              <el-table-column
                prop="actorId"
                label="操作人 ID"
                width="100"
              />
              <el-table-column
                prop="createdAt"
                label="时间"
                min-width="180"
              />
            </el-table>
          </el-tab-pane>
        </el-tabs>
        <el-alert
          v-if="detail?.blockers.length && !readonly"
          type="warning"
          :closable="false"
          class="notice"
          title="送审前仍需处理"
        >
          <ul class="blockers">
            <li
              v-for="blocker in detail.blockers"
              :key="blocker"
            >
              {{ blocker }}
            </li>
          </ul>
        </el-alert>
      </template>
      <el-alert
        v-if="unresolved"
        title="提交结果尚未确认，请重试原操作；操作内容和提交标识已保留。"
        type="warning"
        :closable="false"
        class="notice"
      />
    </div>
    <template #footer>
      <div class="footer-bar">
        <div>
          <el-button
            :disabled="submitting || batchHandling"
            @click="closeWorkbench"
            >关闭</el-button
          >
          <el-button
            :disabled="busy"
            @click="editor.load()"
            >刷新核对</el-button
          >
          <el-button
            v-if="detail?.approvalInstanceId"
            link
            type="primary"
            @click="openApproval(detail.approvalInstanceId)"
            >{{ detail.pendingApprovalId ? '查看在审申请' : '查看最近审批' }}</el-button
          >
        </div>
        <div class="footer-actions">
          <el-button
            v-if="unresolved"
            type="primary"
            :loading="submitting"
            @click="editor.retry"
            >重试原操作</el-button
          >
          <el-button
            v-else-if="check && !detail && !check.termination"
            type="warning"
            :disabled="locked || !reason.trim()"
            @click="editor.begin"
            >开始收尾</el-button
          >
          <template v-else-if="detail">
            <el-button
              v-if="activeTab === 'items' && !readonly"
              :disabled="busy"
              @click="activeTab = 'materials'"
              >核对物料 →</el-button
            >
            <el-button
              type="primary"
              :disabled="busy || unresolved"
              @click="openOutput"
              >{{ readonly ? '查看产出清单' : '核对产出清单 →' }}</el-button
            >
          </template>
        </div>
      </div>
    </template>
  </el-dialog>
  <el-dialog
    :model-value="Boolean(selected)"
    title="物料实核与安排"
    :width="DialogWidth.lg"
    workbench
    :close-on-click-modal="false"
    :before-close="closeMaterial"
    @update:model-value="(value: boolean) => !value && closeMaterial()"
  >
    <template v-if="selected">
      <strong>{{ selected.label }}</strong>
      <p class="muted">
        请按现场情况修改预填说明。保存后显示核对结果，领退料或损耗变化后需重新核对。
      </p>
      <el-alert
        v-if="materialSelectionStale"
        title="核对依据已变化，请返回列表重新选择本项"
        type="warning"
        :closable="false"
      />
      <el-input
        v-model="itemReason"
        type="textarea"
        :rows="5"
        maxlength="5000"
        show-word-limit
        :disabled="locked"
      />
    </template>
    <template #footer>
      <el-button
        :disabled="busy || unresolved"
        @click="closeMaterial"
        >返回列表</el-button
      >
      <el-button
        v-if="unresolved"
        type="primary"
        :loading="submitting"
        @click="editor.retry"
        >重试原操作</el-button
      >
      <el-button
        v-else
        type="primary"
        :disabled="locked || !itemReason.trim() || materialSelectionStale"
        :loading="submitting"
        @click="editor.handle"
        >保存本项核对</el-button
      >
    </template>
  </el-dialog>
  <ProductionCloseoutMaterialLossDialog
    ref="materialLossDialog"
    v-model:visible="materialLossVisible"
    :batch-id="batchId"
    :material="lossMaterial"
    :detail="detail"
    :disabled="locked"
    @recorded="materialLossRecorded"
  />
</template>
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type {
  BatchTerminationMaterial,
  BatchCloseoutItemKind,
  DemandType,
  DemandBusinessStatus,
} from '@company/contracts';
import {
  BATCH_TERMINATION_IMPACT_LABELS,
  BATCH_CLOSEOUT_STATUS_LABELS,
  DEMAND_GENERATION_GROUP_TYPE_LABELS,
  DEMAND_BUSINESS_STATUS_LABELS,
} from '@company/constants';
import { DialogWidth } from '../../../utils/dialog';
import { batchStatusMeta, formatQuantity as quantity } from '../production-status';
import { useBatchCloseout } from '../composables/useBatchCloseout';
import BatchCloseoutWorklist from './BatchCloseoutWorklist.vue';
import BatchCloseoutMaterialPanel from './BatchCloseoutMaterialPanel.vue';
import ProductionMaterialLossRecords from './ProductionMaterialLossRecords.vue';
import ProductionCloseoutMaterialLossDialog from './ProductionCloseoutMaterialLossDialog.vue';
const props = defineProps<{ visible: boolean; batchId: string | null }>();
const emit = defineEmits<{
  'update:visible': [boolean];
  terminated: [];
  'open-output': [string];
}>();
const router = useRouter();
const editor = useBatchCloseout(
  props,
  () => emit('terminated'),
  () => emit('update:visible', false),
);
const {
  check,
  detail,
  loading,
  submitting,
  batchHandling,
  lastSuccess,
  itemDraftDirty,
  unresolved,
  error,
  reason,
  selected,
  itemReason,
  readonly,
} = editor;
const activeTab = ref('items');
const demandPanels = ref(['demands']);
const materialLossVisible = ref(false),
  lossAllocationId = ref<string | null>(null),
  materialLossDialog = ref<InstanceType<typeof ProductionCloseoutMaterialLossDialog> | null>(null);
const lossMaterial = computed(
  () => check.value?.materials.find((row) => row.allocationId === lossAllocationId.value) ?? null,
);
watch(
  () => props.batchId,
  () => {
    activeTab.value = 'items';
  },
);
const busy = computed(() => loading.value || submitting.value || batchHandling.value);
const locked = computed(
  () => readonly.value || busy.value || unresolved.value || Boolean(error.value),
);
const reviewedCount = computed(
  () => detail.value?.materialReviews.filter((row) => row.status === 'reviewed').length ?? 0,
);
const materialSelectionStale = computed(() =>
  Boolean(
    selected.value &&
    (selected.value.checkToken !== detail.value?.check.checkToken ||
      selected.value.closeoutVersion !== detail.value?.version),
  ),
);
function selectMaterial(row: BatchTerminationMaterial) {
  if (!detail.value) return;
  selected.value = {
    kind: 'material',
    id: row.allocationId,
    version: 0,
    closeoutVersion: detail.value.version,
    checkToken: detail.value.check.checkToken,
    label: `${row.materialVariantCode} / 库存批次 ${row.inventoryBatchCode} / 分配 #${row.allocationId}`,
  };
  itemReason.value =
    detail.value.materialReviews.find((review) => review.allocationId === row.allocationId)
      ?.reason ??
    (Number(row.outboundQuantity) === 0
      ? '该分配未实际领料，无本来源物料需要退回；释放剩余预留后结束本项。'
      : '已核对本来源的领料、退料和损耗记录；现场剩余物料由管理员核实保管，后续退料按原库存批次独立办理。');
}
function closeMaterial() {
  if (!busy.value && !unresolved.value) selected.value = null;
}
function canRecordLoss(row: BatchTerminationMaterial) {
  return (
    !locked.value &&
    check.value?.batchStatus === 'closing' &&
    !!detail.value?.canHandle &&
    !detail.value.pendingApprovalId &&
    !detail.value.currentRevisionId &&
    Number(row.returnableQuantity) > 0
  );
}
function openMaterialLoss(row: BatchTerminationMaterial) {
  if (!canRecordLoss(row)) return;
  lossAllocationId.value = row.allocationId;
  materialLossVisible.value = true;
}
async function materialLossRecorded() {
  emit('terminated');
  await editor.load();
}
async function closeWorkbench() {
  if (materialLossVisible.value && !(await materialLossDialog.value?.close())) return;
  await editor.close();
}
async function openOutput() {
  const batchId = props.batchId;
  if (!batchId) return;
  await closeWorkbench();
  await nextTick();
  if (!props.visible) emit('open-output', batchId);
}
const openApproval = (instanceId: string) =>
  router.push({ name: 'approval-inbox', query: { instanceId } });
</script>
<style scoped>
.section {
  margin-top: 16px;
}
.notice {
  margin-top: 12px;
}
.muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.7;
}
.review-note {
  margin-top: 6px;
  white-space: pre-wrap;
  line-height: 1.6;
}
.quantities {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 24px;
}
.output-summary {
  padding: 12px 24px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  line-height: 1.8;
}
.footer-bar,
.footer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
}
.blockers {
  margin: 4px 0;
  padding-left: 20px;
}
</style>
