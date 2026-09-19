<template>
  <el-dialog
    :model-value="visible"
    :title="`${FINISHED_GOODS_INBOUND_SOURCE_LABELS[effectiveSourceType]} · ${targetId ? '单据核对' : '创建草稿'}`"
    :width="DialogWidth.workbench"
    workbench
    :close-on-click-modal="false"
    :before-close="editor.close"
    @update:model-value="(value: boolean) => !value && editor.close()"
  >
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
      class="notice"
    />
    <el-alert
      title="按本类别批准数量收齐后，一次确认入库"
      description="草稿不增加库存。生产流转和额外产出分别办理，形成不同库存批次；仓管不能改写批准数量。实物不符时先线下核对，数量确需更正时由产线管理员重新办理清单更正审批。"
      type="info"
      :closable="false"
      class="notice"
    />
    <div v-loading="loading">
      <template v-if="!targetId">
        <div class="toolbar notice">
          <el-input
            v-model="keyword"
            clearable
            placeholder="搜索已结案工单 / 任务 / 成品"
            style="max-width: 430px"
            @keyup.enter="editor.searchCandidates"
          /><el-button
            :loading="candidateLoading"
            @click="editor.searchCandidates"
            >查询可办理任务</el-button
          >
        </div>
        <el-alert
          v-if="candidateError"
          :title="candidateError"
          type="error"
          :closable="false"
          class="notice"
        />
        <el-table
          v-loading="candidateLoading"
          :data="candidates"
          row-key="productionBatchId"
          max-height="280"
          empty-text="暂无本类别可办理任务，请先完成产出清单审批"
          class="notice"
        >
          <el-table-column
            label="工单 / 任务"
            min-width="180"
            ><template #default="{ row }"
              >{{ row.workOrderNo }}
              <div class="muted">{{ row.batchNo }}</div></template
            ></el-table-column
          >
          <el-table-column
            label="成品"
            min-width="180"
            ><template #default="{ row }"
              >{{ row.productCode }} · {{ row.productName }}</template
            ></el-table-column
          >
          <el-table-column
            label="批准依据"
            min-width="150"
            ><template #default="{ row }"
              >第 {{ row.revisionNo }} 版 · {{ quantity(row.approvedQuantity) }}
              {{ row.unit }}</template
            ></el-table-column
          >
          <el-table-column
            label="办理条件"
            min-width="200"
            ><template #default="{ row }">{{
              row.canCreate ? '可创建入库草稿' : row.blockers.join('；')
            }}</template></el-table-column
          >
          <el-table-column
            label="选择"
            width="100"
            fixed="right"
            ><template #default="{ row }"
              ><el-button
                link
                type="primary"
                :disabled="
                  !row.canCreate ||
                  candidateLoading ||
                  Boolean(candidateError) ||
                  submitting ||
                  unresolved
                "
                @click="editor.selectCandidate(row)"
                >{{
                  candidate?.productionBatchId === row.productionBatchId ? '已选择' : '选择任务'
                }}</el-button
              ></template
            ></el-table-column
          >
        </el-table>
        <el-pagination
          :total="candidateTotal"
          :page-size="10"
          :current-page="candidatePage"
          layout="total, prev, pager, next"
          @current-change="editor.changeCandidatePage"
        />
      </template>
      <template v-if="detail || candidate">
        <el-descriptions
          :column="3"
          border
          class="notice"
        >
          <el-descriptions-item label="工单 / 任务"
            >{{ detail?.workOrderNo ?? candidate?.workOrderNo }} /
            {{ detail?.batchNo ?? candidate?.batchNo }}</el-descriptions-item
          >
          <el-descriptions-item label="成品"
            >{{ detail?.productCode ?? candidate?.productCode }} ·
            {{ detail?.productName ?? candidate?.productName }}</el-descriptions-item
          >
          <el-descriptions-item label="业务来源">{{
            FINISHED_GOODS_INBOUND_SOURCE_LABELS[effectiveSourceType]
          }}</el-descriptions-item>
          <el-descriptions-item label="入库单">{{
            detail?.inboundNo ?? '保存后生成'
          }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{
            detail ? inboundOrderStatusLabel(detail.status) : '待保存草稿'
          }}</el-descriptions-item>
          <el-descriptions-item label="本次完整入库数量"
            >{{ quantity(expectedQuantity) }}
            {{ detail?.unit ?? candidate?.unit }}</el-descriptions-item
          >
        </el-descriptions>
        <el-alert
          v-if="stale"
          type="warning"
          :closable="false"
          title="服务端单据已变化，未保存输入已保留。请重新加载后核对，不能直接保存旧草稿。"
          class="notice"
        />
        <el-alert
          v-if="detail?.status === 'pending' && detail.blockers.length"
          type="warning"
          :closable="false"
          title="确认入库前仍需处理"
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
        <section
          v-if="
            detail &&
            detail.outputRevisionId !== detail.currentOutputRevisionId &&
            detail.status === 'pending'
          "
          class="revision-comparison"
        >
          <strong>批准清单已更新，请核对采用依据</strong>
          <p>
            本单采用第 {{ detail.approvedOutput.revisionNo }} 版：{{
              quantity(detail.inboundQuantity)
            }}
            {{ detail.unit }}；最新第 {{ detail.currentApprovedOutput.revisionNo }} 版：{{
              quantity(currentApprovedQuantity)
            }}
            {{ detail.unit }}。
          </p>
          <p
            v-if="Number(currentApprovedQuantity) <= 0"
            class="muted"
          >
            最新清单本类别数量为零，请取消当前草稿；无需办理零数量入库。
          </p>
          <el-button
            v-else
            :disabled="locked || adoptedLatest"
            type="primary"
            plain
            @click="editor.acceptLatest"
            >{{ adoptedLatest ? '已选择新版，保存后生效' : '核对后采用最新批准版' }}</el-button
          >
        </section>
        <el-form
          label-position="top"
          :disabled="locked"
          class="notice"
        >
          <el-form-item
            label="成品库存批次号"
            required
            ><el-input
              v-model="form.batchCode"
              maxlength="100"
              show-word-limit
              placeholder="为本次入库填写独立库存批次号"
          /></el-form-item>
          <el-form-item label="仓管备注"
            ><el-input
              v-model="form.remark"
              type="textarea"
              :rows="2"
              maxlength="5000"
              show-word-limit
          /></el-form-item>
        </el-form>
        <el-descriptions
          v-if="detail"
          :column="3"
          border
        >
          <el-descriptions-item label="创建人">{{ detail.createdByName }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{
            formatDateTimeForDisplay(detail.createdAt)
          }}</el-descriptions-item>
          <el-descriptions-item label="确认人">{{
            detail.operatorName ?? '尚未确认'
          }}</el-descriptions-item>
          <el-descriptions-item label="入库时间">{{
            detail.inboundAt ? formatDateTimeForDisplay(detail.inboundAt) : '尚未确认'
          }}</el-descriptions-item>
          <el-descriptions-item label="库存批次记录"
            ><el-button
              v-if="detail.itemBatchId"
              link
              type="primary"
              @click="openInventory(detail.itemBatchId)"
              >#{{ detail.itemBatchId }} · {{ detail.batchCode }}</el-button
            ><span v-else>确认入库后生成</span></el-descriptions-item
          >
          <el-descriptions-item label="正库存流水">{{
            detail.inventoryTransactionId ? `#${detail.inventoryTransactionId}` : '尚未产生'
          }}</el-descriptions-item>
          <el-descriptions-item
            v-if="detail.cancelReason"
            label="取消原因"
            :span="3"
            >{{ detail.cancelReason }} · {{ detail.cancelledByName }} ·
            {{
              detail.cancelledAt ? formatDateTimeForDisplay(detail.cancelledAt) : ''
            }}</el-descriptions-item
          >
        </el-descriptions>
        <el-collapse
          v-if="detail"
          v-model="evidencePanels"
          class="notice"
        >
          <el-collapse-item
            :title="`本单采用依据 · 第 ${detail.approvedOutput.revisionNo} 版批准清单 / 质检记录`"
            name="adopted"
            ><p>
              批准人 {{ detail.approvedOutput.approvedByName }} ·
              {{ formatDateTimeForDisplay(detail.approvedOutput.approvedAt) }}
              <el-button
                link
                type="primary"
                @click="openApproval(detail.approvedOutput.approvalInstanceId)"
                >审批记录 #{{ detail.approvedOutput.approvalInstanceId }}</el-button
              >
            </p>
            <BatchCloseoutEvidence :snapshot="detail.approvedOutput.snapshot"
          /></el-collapse-item>
          <el-collapse-item
            v-if="detail.outputRevisionId !== detail.currentOutputRevisionId"
            :title="`最新依据 · 第 ${detail.currentApprovedOutput.revisionNo} 版批准清单 / 质检记录`"
            name="latest"
            ><BatchCloseoutEvidence :snapshot="detail.currentApprovedOutput.snapshot"
          /></el-collapse-item>
        </el-collapse>
      </template>
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
            @click="editor.refresh"
            >刷新核对</el-button
          ><el-button
            v-if="stale"
            :disabled="busy || unresolved"
            @click="editor.reloadDraft"
            >重新加载草稿</el-button
          >
        </div>
        <div>
          <el-button
            v-if="unresolved"
            type="primary"
            :loading="submitting"
            @click="editor.retry"
            >重试原操作</el-button
          ><template v-else
            ><span
              v-if="dirty"
              class="muted"
              >草稿未保存</span
            ><el-button
              v-if="detail?.canCancel"
              type="danger"
              plain
              :disabled="busy || Boolean(error)"
              @click="editor.cancel"
              >取消草稿</el-button
            ><el-button
              v-if="!detail || detail.canEdit"
              :disabled="!canSave || Number(expectedQuantity) <= 0"
              :loading="submitting"
              @click="editor.save"
              >{{ detail ? '保存草稿' : '创建入库草稿' }}</el-button
            ><el-button
              v-if="detail?.status === 'pending'"
              type="primary"
              :disabled="!canConfirm"
              :loading="submitting"
              @click="editor.confirm"
              >已收齐，确认入库</el-button
            ></template
          >
        </div>
      </div></template
    >
  </el-dialog>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { FinishedGoodsInboundSource } from '@company/contracts';
import { FINISHED_GOODS_INBOUND_SOURCE_LABELS } from '@company/constants';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateTimeForDisplay } from '../../../utils/date';
import { inboundOrderStatusLabel } from '../../../constants/business-status';
import { formatQuantity as quantity } from '../../production/production-status';
import BatchCloseoutEvidence from '../../production/components/BatchCloseoutEvidence.vue';
import { useFinishedGoodsInboundEditor } from '../composables/useFinishedGoodsInboundEditor';
const props = defineProps<{
  visible: boolean;
  active: boolean;
  inboundId: string | null;
  sourceType: FinishedGoodsInboundSource;
}>();
const emit = defineEmits<{ 'update:visible': [boolean]; changed: [] }>();
const editor = useFinishedGoodsInboundEditor(
  props,
  () => emit('changed'),
  () => emit('update:visible', false),
);
const {
  detail,
  targetId,
  form,
  candidate,
  candidates,
  keyword,
  candidatePage,
  candidateTotal,
  candidateLoading,
  candidateError,
  loading,
  submitting,
  unresolved,
  error,
  lastSuccess,
  dirty,
  busy,
  locked,
  stale,
  sourceType: effectiveSourceType,
  canSave,
  canConfirm,
  adoptedLatest,
  expectedQuantity,
  currentApprovedQuantity,
} = editor;
const evidencePanels = ref<string[]>([]),
  router = useRouter();
watch(
  () => props.visible,
  (value) => {
    if (value) evidencePanels.value = [];
  },
);
watch(
  () => props.active,
  (active) => {
    if (active && props.visible && !submitting.value && !unresolved.value) void editor.refresh();
  },
);
const openApproval = (instanceId: string) =>
  router.push({ name: 'approval-inbox', query: { instanceId } });
const openInventory = (itemBatchId: string) =>
  router.push({ name: 'warehouse-inventory', query: { itemBatchId } });
defineExpose({
  prepareTargetSwitch: editor.prepareTargetSwitch,
  currentInboundId: () => targetId.value,
});
</script>
<style scoped>
.notice {
  margin-top: 14px;
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}
.muted {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.7;
}
.revision-comparison {
  margin-top: 16px;
  padding: 16px;
  background: var(--el-color-warning-light-9);
  border-left: 3px solid var(--el-color-warning);
}
</style>
