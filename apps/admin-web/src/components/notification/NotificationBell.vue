<template>
  <el-popover
    v-model:visible="visible"
    placement="bottom-end"
    :width="420"
    trigger="click"
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
        <strong>通知</strong>
        <el-button
          text
          :icon="Refresh"
          :loading="initializing || loading"
          :disabled="initializing || markingRead"
          aria-label="刷新通知"
          @click="refresh"
        />
      </div>
      <div
        v-if="initializing"
        class="notification-placeholder"
        role="status"
      >
        正在加载通知…
      </div>
      <template v-else>
        <div
          v-if="readFailed"
          class="notification-error"
          role="alert"
        >
          <span>通知已读状态更新未确认。</span>
          <el-button
            link
            type="primary"
            :loading="markingRead"
            @click="retryReadAll"
            >重试全部已读</el-button
          >
        </div>
        <p
          v-if="countFailed"
          class="notification-error"
          role="alert"
        >
          未读数刷新失败，当前数量可能不是最新状态，请刷新重试。
        </p>
        <p
          v-if="failed"
          class="notification-error"
          role="alert"
        >
          刷新失败，请重试。已显示的内容可能不是最新状态。
        </p>
        <div
          ref="listElement"
          class="notification-list"
          role="region"
          aria-label="通知历史"
          tabindex="0"
          @scroll="loadOnScroll"
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
          >
            <div class="notification-content">
              <span class="notification-title"
                ><i
                  v-if="item.isUnread || highlightedIds.has(item.id)"
                  class="unread-dot"
                  role="img"
                  aria-label="新通知"
                />{{ item.title }}</span
              >
              <span class="notification-body">{{ item.body }}</span>
              <time>{{ formatDateTime(item.createdAt) }}</time>
            </div>
            <el-button
              v-if="canOpenTarget(item)"
              link
              type="primary"
              @click="openTarget(item)"
              >查看详情</el-button
            >
          </article>
          <p
            v-if="loadingMore"
            class="notification-status notification-footer"
            role="status"
          >
            正在加载更早通知…
          </p>
          <div
            v-else-if="moreFailed"
            class="notification-error notification-footer"
            role="alert"
          >
            <span>更早通知加载失败。</span>
            <el-button
              link
              type="primary"
              @click="loadMore"
              >重试加载</el-button
            >
          </div>
          <p
            v-else-if="items.length && !hasMore && !loading && !failed"
            class="notification-status notification-footer"
          >
            没有更早的通知
          </p>
        </div>
      </template>
    </section>
  </el-popover>
</template>
<script setup lang="ts">
import { Bell, Refresh } from '@element-plus/icons-vue';
import { useRouter } from 'vue-router';
import type { NotificationItem } from '@company/contracts';
import { useNotifications } from './useNotifications';
import { notificationTarget } from './notification-targets';
import { EMessage } from '../../utils/message';
import { formatDateTimeForDisplay } from '../../utils/date';
import { useRouteAccess } from '../../composables/useRouteAccess';

defineOptions({ name: 'NotificationBell' });
const router = useRouter();
const { canAccessRoute } = useRouteAccess();
const {
  items,
  unreadCount,
  initializing,
  loading,
  loadingMore,
  failed,
  moreFailed,
  countFailed,
  markingRead,
  readFailed,
  hasMore,
  visible,
  highlightedIds,
  listElement,
  refresh,
  loadMore,
  loadOnScroll,
  retryReadAll,
} = useNotifications();
const formatDateTime = (value: string): string => formatDateTimeForDisplay(value, '—');
const canOpenTarget = (item: NotificationItem): boolean => {
  const target = notificationTarget(item);
  return target !== null && canAccessRoute(target);
};
const openTarget = async (item: NotificationItem) => {
  const target = notificationTarget(item);
  if (!target || !canAccessRoute(target)) return;
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
.notification-list {
  max-height: 480px;
  min-height: 110px;
  overflow-y: auto;
  margin-top: 12px;
}
.notification-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 110px;
  margin-top: 12px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.notification-list:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}
.notification-item {
  padding: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
}
.notification-content {
  display: flex;
  flex-direction: column;
  gap: 7px;
  width: 100%;
  color: var(--el-text-color-primary);
}
.notification-title {
  font-weight: 600;
}
.unread-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 7px;
  border-radius: 50%;
  background: var(--el-color-primary);
}
.notification-body {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.6;
}
time {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.notification-item > .el-button {
  margin-top: 8px;
}
.notification-footer {
  padding: 10px;
  text-align: center;
}
.notification-error,
.notification-status {
  font-size: 12px;
}
.notification-error {
  color: var(--el-color-warning-dark-2);
}
.notification-status {
  color: var(--el-text-color-secondary);
}
</style>
