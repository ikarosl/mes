<template>
  <el-dialog
    :model-value="editor.visible.value"
    :title="dialogTitle"
    :width="DialogWidth.workbench"
    :close-on-click-modal="false"
    :before-close="editor.beforeClose"
    @update:model-value="handleVisible"
  >
    <div
      v-loading="editor.loading.value"
      class="order-dialog"
    >
      <InlineHint>
        {{
          direction === 'inbound'
            ? '保存草稿不增加库存，确认时才生成新批次及正库存流水。'
            : '保存草稿不占用库存，确认时按可用库存扣除生产预留后核对并整单出库。'
        }}
        每单保留 1–50 条有效明细，确认或取消后不可编辑。
      </InlineHint>
      <el-alert
        v-if="editor.intentStatus.value !== 'idle'"
        type="warning"
        :closable="false"
        show-icon
        :title="
          editor.intentStatus.value === 'pending'
            ? '上次写入结果尚未确认，原请求已保留。请重试原提交或先核对单据列表。'
            : '原提交已不能安全重试，请核对单据结果后再明确放弃本地重试标识。'
        "
      />
      <el-alert
        v-if="editor.readError.value"
        type="error"
        :closable="false"
        title="单据详情读取失败，原输入已保留。请刷新读取后继续办理。"
      />
      <el-alert
        v-if="editor.conflict.value"
        type="warning"
        :closable="false"
        title="单据已有其他保存或办理结果，本地输入已保留。请刷新核对后明确采用最新单据。"
      />
      <div
        v-if="editor.latestOrder.value"
        class="latest-summary"
      >
        <span>
          已读取 {{ editor.latestOrder.value.orderNo }} 的最新单据，状态：
          {{
            OTHER_INVENTORY_STATUS_LABELS[editor.latestOrder.value.status]
          }}；当前输入与原提交依据仍保留。
        </span>
        <el-button
          link
          type="primary"
          :disabled="editor.submitting.value"
          @click="editor.adoptLatest"
        >
          采用最新单据
        </el-button>
      </div>

      <el-descriptions
        v-if="editor.order.value"
        :column="3"
        border
      >
        <el-descriptions-item label="单号">{{ editor.order.value.orderNo }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="otherInventoryStatusTag(editor.order.value.status)">
            {{ OTHER_INVENTORY_STATUS_LABELS[editor.order.value.status] }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="有效明细">
          {{ activeOtherInventoryLines(editor.order.value).length }} 条
        </el-descriptions-item>
        <el-descriptions-item label="制单人">{{
          editor.order.value.createdByName || '-'
        }}</el-descriptions-item>
        <el-descriptions-item label="制单时间">{{
          formatDateTimeForDisplay(editor.order.value.createdAt)
        }}</el-descriptions-item>
        <el-descriptions-item label="确认人">{{
          editor.order.value.operatorName || '-'
        }}</el-descriptions-item>
        <el-descriptions-item label="确认时间">{{
          formatDateTimeForDisplay(editor.order.value.confirmedAt)
        }}</el-descriptions-item>
        <el-descriptions-item
          label="本单数量"
          :span="2"
          >{{ otherInventoryQuantitySummary(editor.order.value) }}</el-descriptions-item
        >
        <template v-if="editor.order.value.status === 'cancelled'">
          <el-descriptions-item label="取消人">{{
            editor.order.value.cancelledByName || '-'
          }}</el-descriptions-item>
          <el-descriptions-item label="取消时间">{{
            formatDateTimeForDisplay(editor.order.value.cancelledAt)
          }}</el-descriptions-item>
          <el-descriptions-item label="取消原因">{{
            editor.order.value.cancelReason
          }}</el-descriptions-item>
        </template>
      </el-descriptions>

      <el-form
        v-if="editor.isEditing.value && editor.loaded.value"
        label-position="top"
        :disabled="editor.controlsLocked.value || !editor.readReady.value"
        class="draft-form"
      >
        <div class="reason-fields">
          <el-form-item
            label="办理原因"
            required
          >
            <el-input
              v-model="editor.form.reason"
              type="textarea"
              :rows="2"
              maxlength="5000"
              show-word-limit
              placeholder="说明本次其他入出库原因"
            />
          </el-form-item>
          <el-form-item label="单据备注">
            <el-input
              v-model="editor.form.remark"
              type="textarea"
              :rows="2"
              maxlength="5000"
              show-word-limit
              placeholder="人工补差时可注明原单号"
            />
          </el-form-item>
        </div>
        <div class="draft-heading">
          <strong>有效明细 {{ editor.lines.value.length }} / 50</strong>
          <el-button
            type="primary"
            plain
            :disabled="editor.controlsLocked.value || editor.lines.value.length >= 50"
            @click="editor.addLine"
          >
            添加明细
          </el-button>
        </div>
        <div class="draft-lines">
          <OtherStockDraftLine
            v-for="line in editor.lines.value"
            :key="line.key"
            :line="line"
            :direction="direction"
            :disabled="editor.controlsLocked.value || !editor.readReady.value"
            :new-batch-groups="newBatchGroups(line)"
            @update-line="updateLine"
            @remove="editor.removeLine"
          />
          <el-empty
            v-if="!editor.lines.value.length"
            description="请添加至少一条有效明细后保存"
          />
        </div>
        <p
          v-if="editor.validationMessage.value"
          class="validation-note"
        >
          {{ editor.validationMessage.value }}
        </p>
        <p
          v-if="editor.dirty.value && editor.order.value"
          class="validation-note"
        >
          当前修改尚未保存；请保存草稿后再整单确认。
        </p>
      </el-form>

      <template v-else-if="editor.order.value">
        <el-descriptions
          :column="1"
          border
        >
          <el-descriptions-item label="办理原因">{{
            editor.order.value.reason
          }}</el-descriptions-item>
          <el-descriptions-item label="单据备注">{{
            editor.order.value.remark || '-'
          }}</el-descriptions-item>
        </el-descriptions>
        <el-table
          :data="editor.order.value.details"
          row-key="id"
          class="detail-table"
        >
          <el-table-column
            prop="lineNo"
            label="明细行"
            width="80"
          />
          <el-table-column
            label="库存对象"
            min-width="250"
          >
            <template #default="{ row }">
              <div>{{ row.itemCode }} · {{ row.itemName }}</div>
              <div class="secondary-text">
                {{ INVENTORY_ITEM_KIND_LABELS[row.itemKind as OtherInventoryItemKind] }}
                <template v-if="row.materialVariantCode">
                  · 版本 {{ row.materialVariantCode }}</template
                >
              </div>
            </template>
          </el-table-column>
          <el-table-column
            label="库存批次"
            min-width="180"
          >
            <template #default="{ row }">
              <div>
                {{ row.batchCode || (row.isDeleted ? '未生成库存批次' : '确认时生成库存批次') }}
              </div>
              <div class="secondary-text">
                {{ INVENTORY_TARGET_MODE_LABELS[row.targetMode as 'new' | 'existing'] }}
                <template v-if="row.targetMode === 'new' && !row.isDeleted">
                  · {{ otherInventoryNewBatchGroupLabel(editor.order.value, row) }}
                </template>
              </div>
            </template>
          </el-table-column>
          <el-table-column
            label="数量"
            min-width="135"
            align="right"
          >
            <template #default="{ row }"
              >{{ otherInventoryQuantity(row.quantity) }} {{ row.unit }}</template
            >
          </el-table-column>
          <el-table-column
            label="行状态"
            width="105"
          >
            <template #default="{ row }">
              <el-tag
                v-if="row.isDeleted"
                type="info"
                >已移除</el-tag
              >
              <span v-else>有效</span>
            </template>
          </el-table-column>
          <el-table-column
            prop="remark"
            label="行备注"
            min-width="180"
            show-overflow-tooltip
          />
        </el-table>
      </template>
      <el-form
        v-if="editor.mode.value === 'cancel' && editor.order.value"
        label-position="top"
        class="cancel-form"
        :disabled="editor.controlsLocked.value"
      >
        <el-form-item
          label="取消原因"
          required
        >
          <el-input
            v-model="editor.cancelReason.value"
            type="textarea"
            :rows="3"
            maxlength="5000"
            show-word-limit
            placeholder="填写取消原因；取消后保留全部历史行"
          />
        </el-form-item>
      </el-form>
    </div>
    <template #footer>
      <el-button
        :disabled="editor.submitting.value"
        @click="editor.close"
        >关闭</el-button
      >
      <el-button
        v-if="editor.mode.value !== 'create'"
        :loading="editor.loading.value"
        :disabled="editor.submitting.value"
        @click="editor.refresh"
        >刷新单据</el-button
      >
      <el-button
        v-if="editor.intentStatus.value === 'pending'"
        type="warning"
        :loading="editor.submitting.value"
        @click="editor.retry"
        >重试原提交</el-button
      >
      <template v-else-if="editor.intentStatus.value === 'idle'">
        <el-button
          v-if="editor.isEditing.value"
          type="primary"
          :loading="editor.submitting.value"
          :disabled="!editor.canSave.value"
          @click="editor.save"
          >保存草稿</el-button
        >
        <el-button
          v-if="editor.mode.value === 'detail' && editor.isPending.value"
          type="primary"
          :disabled="!editor.readReady.value"
          @click="editor.mode.value = 'edit'"
          >编辑草稿</el-button
        >
        <el-button
          v-if="editor.isPending.value && editor.mode.value !== 'cancel'"
          type="warning"
          :loading="editor.submitting.value"
          :disabled="!editor.canConfirm.value"
          @click="editor.confirm"
          >确认整单{{ direction === 'inbound' ? '入库' : '出库' }}</el-button
        >
        <el-button
          v-if="editor.mode.value === 'cancel'"
          type="danger"
          :loading="editor.submitting.value"
          :disabled="!editor.canCancel.value"
          @click="editor.cancel"
          >取消单据</el-button
        >
      </template>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  INVENTORY_ITEM_KIND_LABELS,
  INVENTORY_TARGET_MODE_LABELS,
  OTHER_INVENTORY_DIRECTION_LABELS,
  OTHER_INVENTORY_STATUS_LABELS,
} from '@company/constants';
import type { OtherInventoryDirection, OtherInventoryItemKind } from '@company/contracts';
import InlineHint from '../../../components/InlineHint.vue';
import { DialogWidth } from '../../../utils/dialog';
import { formatDateTimeForDisplay } from '../../../utils/date';
import type { useOtherInventoryOrderEditor } from '../composables/useOtherInventoryOrderEditor';
import {
  otherInventoryDraftIdentity,
  type OtherInventoryDraftLine,
} from '../other-inventory-draft';
import {
  activeOtherInventoryLines,
  otherInventoryNewBatchGroupLabel,
  otherInventoryQuantity,
  otherInventoryQuantitySummary,
  otherInventoryStatusTag,
} from '../other-inventory-presentation';
import OtherStockDraftLine from './OtherStockDraftLine.vue';

defineOptions({ name: 'OtherInventoryOrderDialog' });
const props = defineProps<{
  direction: OtherInventoryDirection;
  editor: ReturnType<typeof useOtherInventoryOrderEditor>;
}>();
const editor = props.editor;
const dialogTitle = computed(() => {
  const prefix =
    editor.mode.value === 'create'
      ? '创建'
      : editor.mode.value === 'edit'
        ? '编辑'
        : editor.mode.value === 'cancel'
          ? '取消'
          : editor.mode.value === 'confirm'
            ? '确认'
            : '';
  return `${prefix}${OTHER_INVENTORY_DIRECTION_LABELS[props.direction]}单${editor.mode.value === 'detail' ? '详情' : ''}`;
});
function updateLine(value: OtherInventoryDraftLine): void {
  editor.lines.value = editor.lines.value.map((line) => (line.key === value.key ? value : line));
}
function newBatchGroups(current: OtherInventoryDraftLine): { value: string; label: string }[] {
  const allKeys = [
    ...new Set(
      editor.lines.value.flatMap((line) =>
        line.target.mode === 'new' ? [line.target.clientKey] : [],
      ),
    ),
  ];
  const identity = otherInventoryDraftIdentity(current);
  const matching = editor.lines.value.filter(
    (line) => line.target.mode === 'new' && otherInventoryDraftIdentity(line) === identity,
  );
  const counts = new Map<string, number>();
  for (const line of matching) {
    if (line.target.mode === 'new')
      counts.set(line.target.clientKey, (counts.get(line.target.clientKey) ?? 0) + 1);
  }
  return [...counts].map(([value, count]) => ({
    value,
    label: `本单新批次组 ${allKeys.indexOf(value) + 1}（${count} 行）`,
  }));
}
function handleVisible(value: boolean): void {
  if (!value && editor.visible.value) void editor.close();
}
</script>

<style scoped>
.order-dialog {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.reason-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}
.draft-heading,
.latest-summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.draft-heading {
  margin-bottom: 12px;
}
.draft-lines {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.latest-summary {
  padding: 10px 12px;
  background: var(--el-color-warning-light-9);
  border: 1px solid var(--el-color-warning-light-7);
  border-radius: 6px;
  font-size: 13px;
}
.secondary-text {
  margin-top: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.validation-note {
  margin: 10px 0 0;
  color: var(--el-color-warning-dark-2);
  font-size: 13px;
}
.detail-table :deep(th.el-table__cell) {
  background: var(--el-fill-color-light);
}
.cancel-form :deep(.el-form-item) {
  margin-bottom: 0;
}
@media (max-width: 1100px) {
  .reason-fields {
    grid-template-columns: 1fr;
    gap: 0;
  }
}
</style>
