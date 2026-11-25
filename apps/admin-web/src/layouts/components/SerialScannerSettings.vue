<template>
  <el-popover
    v-model:visible="visible"
    role="dialog"
    title="扫码枪设置"
    trigger="click"
    placement="bottom-end"
    :width="320"
    :hide-after="0"
    :popper-style="{ display: visible ? undefined : 'none' }"
    popper-class="serial-scanner-settings"
    @after-enter="focusSettings"
  >
    <template #reference>
      <el-button
        ref="triggerButton"
        class="serial-scanner-trigger"
        text
        :icon="Aim"
        :aria-label="`扫码枪设置，${statusLabel}`"
      >
        扫码枪
        <span
          class="serial-scanner-status"
          :class="`is-${status}`"
          >{{ statusLabel }}</span
        >
      </el-button>
    </template>
    <section
      ref="panel"
      class="serial-scanner-panel"
      tabindex="-1"
    >
      <p class="serial-scanner-hint">
        USB 虚拟串口，8N1（8 数据位、无校验、1 停止位），无流控，结束符为 CR 或 LF。
      </p>
      <p
        v-if="unavailableReason"
        class="serial-scanner-hint"
      >
        {{ unavailableReason }}
      </p>
      <template v-else>
        <div class="serial-scanner-field">
          <label for="serial-scanner-baud-rate">波特率</label>
          <el-select
            id="serial-scanner-baud-rate"
            v-model="baudRate"
            size="small"
            :disabled="!canConnect"
            :teleported="false"
          >
            <el-option
              v-for="rate in BAUD_RATES"
              :key="rate"
              :value="rate"
              :label="String(rate)"
            />
          </el-select>
        </div>
        <p class="serial-scanner-hint">
          {{
            preferenceSaveFailed
              ? '本浏览器无法保存波特率，本次仍可连接。'
              : '波特率须与扫码枪一致，选项仅保存在本浏览器。'
          }}
        </p>
      </template>
      <p
        v-if="error"
        class="serial-scanner-error"
        role="alert"
      >
        {{ error }}
      </p>
      <div class="serial-scanner-actions">
        <el-button
          size="small"
          @click="closeSettings"
          >关闭</el-button
        >
        <template v-if="!unavailableReason">
          <el-button
            v-if="status === 'connected' || status === 'disconnecting'"
            size="small"
            :loading="status === 'disconnecting'"
            @click="disconnectScanner"
            >断开扫码枪</el-button
          >
          <el-button
            v-else
            size="small"
            type="primary"
            :disabled="!canConnect"
            :loading="status === 'connecting'"
            @click="connectScanner"
            >连接扫码枪</el-button
          >
        </template>
      </div>
    </section>
  </el-popover>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Aim } from '@element-plus/icons-vue';
import type { ButtonInstance } from 'element-plus';
import { useSerialScanner } from '../../composables/use-serial-scanner';
import { EMessage } from '../../utils/message';

defineOptions({ name: 'SerialScannerSettings' });
const props = defineProps<{ userId: string }>();

const BAUD_RATES = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200];
const DEFAULT_BAUD_RATE = 9600;
const STORAGE_KEY = 'easy-mes.serial-scanner-baud-rate.v1';
const SCANNER_STATUS_LABELS = {
  disconnected: '未连接',
  connecting: '连接中',
  connected: '已连接',
  disconnecting: '断开中',
  error: '连接故障',
};

function readBaudRate(): number {
  try {
    const storedRate = Number(window.localStorage.getItem(STORAGE_KEY));
    if (BAUD_RATES.includes(storedRate)) return storedRate;
  } catch {
    // 存储不可读时仍使用默认串口参数。
  }
  return DEFAULT_BAUD_RATE;
}

const { isSupported, status, error, connect, restore, disconnect, discardPendingScan } =
  useSerialScanner();
const visible = ref(false);
watch(visible, discardPendingScan, { flush: 'sync' });
const triggerButton = ref<ButtonInstance | null>(null);
const panel = ref<HTMLElement | null>(null);
const baudRate = ref(readBaudRate());
onMounted(async () => {
  const restoredRate = await restore(props.userId);
  if (restoredRate !== undefined) baudRate.value = restoredRate;
});
const preferenceSaveFailed = ref(false);
const unavailableReason = computed(() => {
  if (window.isSecureContext === false)
    return '串口连接需要安全上下文，请通过 HTTPS 或本机 localhost 打开。';
  if (!isSupported) return '当前浏览器不支持 Web Serial，请使用桌面版 Chrome 或 Edge。';
  return '';
});
const statusLabel = computed(() =>
  unavailableReason.value ? '不可用' : SCANNER_STATUS_LABELS[status.value],
);
const canConnect = computed(
  () => !unavailableReason.value && (status.value === 'disconnected' || status.value === 'error'),
);

watch(baudRate, (value) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
    preferenceSaveFailed.value = false;
  } catch {
    preferenceSaveFailed.value = true;
  }
});

watch(status, (value) => {
  if (value === 'connected' && visible.value && triggerButton.value) closeSettings();
});

function focusSettings(): void {
  if (visible.value && panel.value && !panel.value.contains(document.activeElement)) {
    panel.value.focus({ preventScroll: true });
  }
}

function closeSettings(): void {
  visible.value = false;
  triggerButton.value?.ref?.focus({ preventScroll: true });
}

function connectScanner(): void {
  if (!canConnect.value) return;
  void connect(baudRate.value, props.userId).catch(() =>
    EMessage.error('无法连接扫码串口，请检查设备后重试。'),
  );
}

function disconnectScanner(): void {
  void disconnect().catch(() => EMessage.error('关闭扫码串口失败，请拔插扫码枪后重试。'));
}
</script>

<style scoped>
.serial-scanner-trigger {
  vertical-align: middle;
}

.serial-scanner-status {
  margin-left: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.serial-scanner-status.is-connected {
  color: var(--el-color-success-dark-2);
}

.serial-scanner-status.is-error {
  color: var(--el-color-danger);
}

.serial-scanner-panel {
  display: grid;
  gap: 8px;
}

.serial-scanner-hint,
.serial-scanner-error {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.serial-scanner-hint {
  color: var(--el-text-color-secondary);
}

.serial-scanner-error {
  color: var(--el-color-danger);
}

.serial-scanner-field {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  align-items: center;
  gap: 12px;
}

.serial-scanner-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
