<template>
  <main class="approval-inbox-page">
    <section class="query-panel">
      <el-form
        :model="query"
        :inline="true"
        class="query-form"
      >
        <el-form-item label="查看范围">
          <el-select
            v-model="query.scope"
            @change="changeScope"
          >
            <el-option
              label="待我处理"
              value="todo"
            />
            <el-option
              label="我发起的"
              value="mine"
            />
            <el-option
              :label="allScopeLabel"
              value="all"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select
            v-model="query.status"
            :disabled="query.scope === 'todo'"
            clearable
            :placeholder="query.scope === 'todo' ? '审批中' : '全部状态'"
            @change="search"
          >
            <el-option
              v-for="item in statusOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item class="query-actions">
          <el-button
            type="primary"
            :loading="loading"
            @click="search"
            >查询</el-button
          >
          <el-button @click="reset">重置</el-button>
        </el-form-item>
      </el-form>
    </section>

    <section class="table-panel">
      <TableToolbar :total="total">
        <template #actions>
          <div class="inbox-caption">
            <strong>审批中心</strong>
            <span>{{ scopeDescription }}</span>
          </div>
        </template>
        <template #tools>
          <el-tooltip
            content="刷新"
            placement="top"
          >
            <el-button
              :icon="Refresh"
              text
              circle
              :loading="loading"
              @click="load"
            />
          </el-tooltip>
        </template>
      </TableToolbar>
      <el-table
        v-loading="loading"
        :data="items"
        class="data-table"
        :empty-text="
          query.scope === 'todo' ? '暂无待办，可切换查看范围查看历史申请' : '暂无审批申请'
        "
      >
        <el-table-column
          label="申请事项"
          min-width="250"
        >
          <template #default="{ row }">
            <div class="instance-title">{{ row.title }}</div>
            <div class="instance-no">{{ row.instanceNo }}</div>
          </template>
        </el-table-column>
        <el-table-column
          label="申请人"
          prop="applicantName"
          width="130"
        />
        <el-table-column
          label="当前节点"
          min-width="160"
        >
          <template #default="{ row }">
            <span
              v-if="row.blocked"
              class="blocked-text"
              >暂无合格审批人</span
            >
            <span v-else>{{ row.currentStepName || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column
          label="状态"
          width="120"
        >
          <template #default="{ row }">
            <el-tag
              :type="statusMeta(row.status).type"
              effect="light"
              >{{ statusMeta(row.status).label }}</el-tag
            >
          </template>
        </el-table-column>
        <el-table-column
          label="提交时间"
          width="180"
        >
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column
          label="操作"
          width="120"
          fixed="right"
        >
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              @click="openDetail(row.id)"
              >查看详情</el-button
            >
          </template>
        </el-table-column>
      </el-table>
      <PaginationFooter
        :total="total"
        :current-page="currentPage"
        :page-size="pageSize"
        @update:page-size="changePageSize"
        @page-change="changePage"
      />
    </section>

    <ApprovalInstanceDetailDialog
      :visible="detailVisible"
      :detail="detail"
      :submitting="submitting"
      @update:visible="detailVisible = $event"
      @approve="approve"
      @reject="reject"
      @withdraw="withdraw"
    />
  </main>
</template>

<script setup lang="ts">
import { computed, onActivated, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Refresh } from '@element-plus/icons-vue';
import {
  APPROVAL_INSTANCE_STATUS_LABELS,
  APPROVAL_INSTANCE_STATUSES,
  PERMISSIONS,
} from '@company/constants';
import type { ApprovalInstanceDetail, ApprovalInstanceStatus } from '@company/contracts';
import { approvalApi } from '../../api/approval';
import PaginationFooter from '../../components/PaginationFooter.vue';
import TableToolbar from '../../components/TableToolbar.vue';
import { EMessage } from '../../utils/message';
import { useAuthStore } from '../../stores/auth';
import ApprovalInstanceDetailDialog from './components/ApprovalInstanceDetailDialog.vue';
import { useApprovalInstances } from './composables/useApprovalInstances';

defineOptions({ name: 'ApprovalInboxPage' });

const {
  items,
  loading,
  total,
  currentPage,
  pageSize,
  query,
  load,
  search,
  reset,
  changePageSize,
  changePage,
} = useApprovalInstances();

const route = useRoute();
const auth = useAuthStore();
const canViewAll = computed(() => auth.can(PERMISSIONS.approval.configure));
const allScopeLabel = computed(() => (canViewAll.value ? '全部申请' : '与我相关'));
const scopeDescription = computed(() => {
  if (query.scope === 'todo') return '仅显示当前可处理的待办，已结束的申请请切换查看范围';
  if (query.scope === 'mine') return '查看我发起的申请及完整处理记录，包含已结束的申请';
  return canViewAll.value
    ? '查看全部状态的申请和处理记录'
    : '查看我发起、实际审批过或当前可处理的申请';
});
const changeScope = (): void => {
  if (query.scope === 'todo') query.status = '';
  void search();
};

const statusOptions = APPROVAL_INSTANCE_STATUSES.map((value) => ({
  value,
  label: APPROVAL_INSTANCE_STATUS_LABELS[value],
}));
const detailVisible = ref(false);
const detail = ref<ApprovalInstanceDetail | null>(null);
const submitting = ref(false);
let detailRequestToken = 0;

const formatDateTime = (value: string | null): string =>
  value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—';
const statusMeta = (status: ApprovalInstanceStatus) =>
  ({
    label: APPROVAL_INSTANCE_STATUS_LABELS[status],
    type:
      status === 'approved'
        ? 'success'
        : status === 'rejected' || status === 'withdrawn'
          ? 'danger'
          : 'warning',
  }) as const;

const openDetail = async (id: string): Promise<void> => {
  const token = ++detailRequestToken;
  detail.value = null;
  detailVisible.value = true;
  try {
    const result = await approvalApi.instance(id);
    if (token === detailRequestToken) detail.value = result;
  } catch (error) {
    if (token !== detailRequestToken) return;
    detailVisible.value = false;
    EMessage.error(error, '审批详情加载失败');
  }
};

const execute = async (kind: 'approve' | 'reject' | 'withdraw', comment: string): Promise<void> => {
  const current = detail.value;
  if (!current || submitting.value) return;
  const token = detailRequestToken;
  submitting.value = true;
  try {
    let result: ApprovalInstanceDetail;
    if (kind === 'approve' || kind === 'reject') {
      if (!current.currentStepId || !current.canApprove) {
        EMessage.warning('当前账号没有可处理的审批待办');
        return;
      }
      result = await approvalApi[kind](current.id, {
        version: current.version,
        stepId: current.currentStepId,
        ...(comment ? { comment } : {}),
      });
    } else {
      result = await approvalApi[kind](current.id, {
        version: current.version,
        ...(comment ? { comment } : {}),
      });
    }
    if (token === detailRequestToken && detailVisible.value) detail.value = result;
    await load();
    EMessage.success(
      kind === 'approve' ? '当前节点已通过' : kind === 'reject' ? '申请已驳回' : '申请已撤回',
    );
  } catch (error) {
    EMessage.error(error, '审批操作失败');
    // 版本冲突、资格变化等错误后重读详情，避免继续以旧状态操作。
    if (token === detailRequestToken && detailVisible.value) {
      try {
        const refreshed = await approvalApi.instance(current.id);
        if (token === detailRequestToken && detailVisible.value) detail.value = refreshed;
      } catch (reloadError) {
        if (token === detailRequestToken) {
          detail.value = null;
          detailVisible.value = false;
          EMessage.error(reloadError, '审批详情刷新失败');
        }
      }
    }
    await load();
  } finally {
    submitting.value = false;
  }
};

const approve = (comment: string): Promise<void> => execute('approve', comment);
const reject = (comment: string): Promise<void> => execute('reject', comment);
const withdraw = (comment: string): Promise<void> => execute('withdraw', comment);

watch(
  () => [route.query.instanceId, route.query.subjectId],
  ([instanceId, subjectId]) => {
    query.subjectId = typeof subjectId === 'string' ? subjectId : '';
    if (query.subjectId) {
      query.scope = 'all';
      query.status = '';
    }
    if (typeof instanceId === 'string') void openDetail(instanceId);
    void search();
  },
  { immediate: true },
);
onActivated(() => void load());
</script>

<style scoped>
.approval-inbox-page {
  min-width: 0;
}
.query-panel,
.table-panel {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}
.query-panel {
  margin-bottom: 16px;
  padding: 20px 20px 4px;
}
.inbox-caption {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.inbox-caption span,
.instance-no {
  color: #6b7280;
  font-size: 12px;
}
.instance-title {
  color: #1f2937;
  font-weight: 600;
}
.instance-no {
  margin-top: 3px;
}
.blocked-text {
  color: #b45309;
}
.data-table :deep(.el-table__header th) {
  height: 48px;
  background: #f9fafb;
  color: #1f2937;
  font-weight: 600;
}
</style>
