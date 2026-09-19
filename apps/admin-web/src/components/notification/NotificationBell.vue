<template>
  <el-popover
    v-model:visible="visible"
    placement="bottom-end"
    :width="420"
    trigger="click"
    @show="open"
  >
    <template #reference>
      <el-button
        text
        circle
        class="notification-bell"
        :aria-label="unreadCount === null ? '通知' : `通知，${unreadCount} 条未读`"
      >
        <el-badge
          :value="unreadCount ?? 0"
          :max="99"
          :hidden="!unreadCount"
        >
          <el-icon :size="21"><Bell /></el-icon>
        </el-badge>
      </el-button>
    </template>
    <section
      class="notification-panel"
      aria-label="我的通知"
    >
      <div class="notification-header">
        <strong
          >通知
          <span
            v-if="unreadCount !== null"
            class="notification-count"
            >{{ unreadCount }} 条未读</span
          ></strong
        >
        <el-button
          text
          :icon="Refresh"
          :loading="loading"
          aria-label="刷新通知"
          @click="refresh"
        />
      </div>
      <el-radio-group
        v-model="readFilter"
        size="small"
        @change="changeFilter"
      >
        <el-radio-button
          v-for="filter in filters"
          :key="filter.value"
          :value="filter.value"
          >{{ filter.label }}</el-radio-button
        >
      </el-radio-group>
      <p
        v-if="failed"
        class="notification-error"
        role="alert"
      >
        刷新失败，请重试。已显示的内容可能不是最新状态。
      </p>
      <div
        v-loading="loading"
        class="notification-list"
      >
        <el-empty
          v-if="!items.length && !loading && !failed"
          description="暂无通知"
          :image-size="60"
        />
        <article
          v-for="item in items"
          :key="item.id"
          class="notification-item"
          :class="{ unread: !item.readAt }"
        >
          <button
            class="notification-content"
            :disabled="pending.has(item.id)"
            @click="read(item)"
          >
            <span class="notification-title"
              ><i
                v-if="!item.readAt"
                class="unread-dot"
              />{{ item.title }}</span
            >
            <span class="notification-body">{{ item.body }}</span>
            <time>{{ formatDateTime(item.createdAt) }}</time>
          </button>
          <el-button
            v-if="notificationTarget(item)"
            link
            type="primary"
            :loading="pending.has(item.id)"
            @click="openTarget(item)"
            >查看详情</el-button
          >
        </article>
      </div>
      <el-pagination
        v-if="total > pageSize"
        class="notification-pagination"
        small
        layout="prev, pager, next"
        :pager-count="5"
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        @current-change="changePage"
      />
    </section>
  </el-popover>
</template>
<script setup lang="ts">
import { Bell, Refresh } from '@element-plus/icons-vue';
import { useRouter } from 'vue-router';
import { NOTIFICATION_READ_FILTERS, NOTIFICATION_READ_FILTER_LABELS } from '@company/constants';
import type { NotificationItem } from '@company/contracts';
import { useNotifications } from './useNotifications';
import { notificationTarget } from './notification-targets';
import { EMessage } from '../../utils/message';

defineOptions({ name: 'NotificationBell' });
const router = useRouter();
const {
  items,
  unreadCount,
  total,
  page,
  pageSize,
  readFilter,
  loading,
  failed,
  visible,
  pending,
  open,
  refresh,
  changePage,
  changeFilter,
  read,
} = useNotifications();
const filters = NOTIFICATION_READ_FILTERS.map((value) => ({
  value,
  label: NOTIFICATION_READ_FILTER_LABELS[value],
}));
const formatDateTime = (value: string) =>
  new Date(value).toLocaleString('zh-CN', { hour12: false });
const openTarget = async (item: NotificationItem) => {
  const target = notificationTarget(item);
  if (!target || !(await read(item))) return;
  visible.value = false;
  try {
    await router.push(target);
  } catch (error) {
    EMessage.error(error, '通知详情暂时无法打开');
  }
};
</script>
<style scoped>
.notification-bell {
  margin-right: 18px;
  vertical-align: middle;
}
.notification-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.notification-count {
  font-size: 12px;
  font-weight: 400;
  color: #6b7280;
  margin-left: 6px;
}
.notification-list {
  max-height: 480px;
  min-height: 110px;
  overflow-y: auto;
  margin-top: 12px;
}
.notification-item {
  padding: 12px;
  border-bottom: 1px solid #e5e7eb;
  border-radius: 4px;
}
.notification-item.unread {
  background: #f0f7ff;
}
.notification-content {
  display: flex;
  flex-direction: column;
  gap: 7px;
  width: 100%;
  border: 0;
  background: transparent;
  padding: 0;
  text-align: left;
  cursor: pointer;
  color: #1f2937;
  font: inherit;
}
.notification-content:focus-visible {
  outline: 2px solid #409eff;
  outline-offset: 3px;
}
.notification-content:disabled {
  cursor: wait;
}
.notification-title {
  font-weight: 600;
}
.unread-dot {
  display: inline-block;
  height: 7px;
  width: 7px;
  margin-right: 7px;
  border-radius: 50%;
  background: #409eff;
}
.notification-body {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.6;
}
time {
  color: #6b7280;
  font-size: 12px;
}
.notification-item > .el-button {
  margin-top: 8px;
}
.notification-pagination {
  justify-content: center;
  margin-top: 12px;
}
.notification-error {
  color: #b45309;
  font-size: 12px;
}
</style>
