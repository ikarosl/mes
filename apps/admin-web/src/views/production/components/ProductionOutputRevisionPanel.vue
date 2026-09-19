<template>
  <section>
    <el-alert
      v-if="detail.correctionReason"
      :title="`本次更正原因：${detail.correctionReason}`"
      type="info"
      :closable="false"
      class="notice"
    />
    <div class="toolbar">
      <p class="muted">
        仅最新有效批准清单可用于入库。收齐本类别全部数量后一次确认；更正不重新开启工序。
      </p>
      <div>
        <el-button
          v-if="detail.canBeginCorrection"
          :disabled="busy || unresolved || Boolean(error)"
          @click="$emit('begin-correction')"
          >发起清单更正</el-button
        ><el-button
          v-if="detail.canCancelCorrection"
          :disabled="busy || unresolved || Boolean(error)"
          @click="$emit('cancel-correction')"
          >取消本次更正</el-button
        >
      </div>
    </div>
    <el-descriptions
      :column="2"
      border
    >
      <el-descriptions-item label="生产流转入库">{{
        detail.receipts.productionInboundId
          ? `已入库 ${detail.receipts.productionReceivedQuantity} ${detail.check.unit} · 入库单 #${detail.receipts.productionInboundId}`
          : '尚未确认入库'
      }}</el-descriptions-item>
      <el-descriptions-item label="额外产出入库">{{
        detail.receipts.extraInboundId
          ? `已入库 ${detail.receipts.extraReceivedQuantity} ${detail.check.unit} · 入库单 #${detail.receipts.extraInboundId}`
          : '尚未确认入库'
      }}</el-descriptions-item>
    </el-descriptions>
    <el-empty
      v-if="!detail.revisions.length"
      description="尚无批准清单，结案审批通过后生成"
      :image-size="72"
    />
    <el-table
      v-else
      :data="detail.revisions"
      row-key="id"
      class="notice"
    >
      <el-table-column
        label="版本"
        width="120"
        ><template #default="{ row }"
          >第 {{ row.revisionNo }} 版{{
            row.id === detail.currentRevisionId ? '（有效）' : '（历史）'
          }}</template
        ></el-table-column
      >
      <el-table-column
        label="计划内 / 计划外 / 新增报废"
        min-width="210"
        ><template #default="{ row }"
          >{{ row.availableQuantity }} / {{ row.extraQuantity }} /
          {{ row.additionalScrapQuantity }}</template
        ></el-table-column
      >
      <el-table-column
        prop="approvedByName"
        label="批准人"
        width="110"
      />
      <el-table-column
        prop="approvedAt"
        label="批准时间"
        min-width="175"
      />
      <el-table-column
        prop="correctionReason"
        label="更正原因"
        min-width="180"
      />
      <el-table-column
        label="操作"
        width="175"
        fixed="right"
        ><template #default="{ row }"
          ><el-button
            link
            type="primary"
            @click="$emit('select-revision', row.id)"
            >查看清单</el-button
          ><el-button
            link
            type="primary"
            @click="$emit('open-approval', row.approvalInstanceId)"
            >审批记录</el-button
          ></template
        ></el-table-column
      >
    </el-table>
    <section
      v-if="selectedRevision"
      class="revision-detail"
    >
      <div class="toolbar">
        <strong
          >第 {{ selectedRevision.revisionNo }} 版批准清单 ·
          {{
            selectedRevision.id === detail.currentRevisionId ? '当前有效版本' : '历史版本，仅供追溯'
          }}</strong
        ><el-button @click="$emit('print')">打印本版清单</el-button>
      </div>
      <BatchCloseoutEvidence :snapshot="selectedRevision.snapshot" />
    </section>
  </section>
</template>
<script setup lang="ts">
import type { ProductionOutputDetail, ProductionOutputRevision } from '@company/contracts';
import BatchCloseoutEvidence from './BatchCloseoutEvidence.vue';
defineProps<{
  detail: ProductionOutputDetail;
  selectedRevision: ProductionOutputRevision | null;
  busy: boolean;
  unresolved: boolean;
  error: string;
}>();
defineEmits<{
  'begin-correction': [];
  'cancel-correction': [];
  'select-revision': [string];
  'open-approval': [string];
  print: [];
}>();
</script>
<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
}
.muted {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.7;
}
.notice {
  margin-top: 12px;
}
.revision-detail {
  margin: 16px 0;
  padding: 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
}
.revision-detail > .toolbar {
  margin-bottom: 16px;
}
</style>
