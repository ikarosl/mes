<template>
  <el-dialog
    :model-value="visible"
    title="标签打印设置"
    :width="DialogWidth.md"
    :before-close="requestClose"
  >
    <InlineHint>设置仅保存在本浏览器，供本工位打印使用。请按实际标签纸填写尺寸。</InlineHint>
    <el-alert
      v-if="serviceError || saveError"
      :title="saveError || serviceError"
      type="error"
      show-icon
      :closable="false"
      class="settings-notice"
    />
    <el-form
      :model="draft"
      label-width="96px"
      class="printer-form"
      @submit.prevent="save"
    >
      <el-form-item
        label="标签打印机"
        required
      >
        <div class="printer-field">
          <el-select
            v-model="draft.printerName"
            filterable
            :disabled="saving || printer.busy.value || loading"
            :loading="loading"
            placeholder="选择本机已安装的打印机"
          >
            <el-option
              v-if="draft.printerName && !printers.includes(draft.printerName)"
              :value="draft.printerName"
              :label="`${draft.printerName}（未找到）`"
              disabled
            />
            <el-option
              v-for="name in printers"
              :key="name"
              :value="name"
              :label="name"
            />
          </el-select>
          <el-button
            :loading="loading"
            :disabled="saving || printer.busy.value"
            @click="loadPrinters"
            >重新检测</el-button
          >
        </div>
      </el-form-item>
      <el-form-item
        label="纸张宽度"
        required
      >
        <el-input-number
          v-model="draft.widthMm"
          :min="LABEL_PRINT_LIMITS.minDimensionMm"
          :max="LABEL_PRINT_LIMITS.maxDimensionMm"
          :precision="1"
          :step="1"
          :disabled="saving || printer.busy.value"
          controls-position="right"
        />
        <span class="field-unit">mm</span>
      </el-form-item>
      <el-form-item
        label="纸张高度"
        required
      >
        <el-input-number
          v-model="draft.heightMm"
          :min="LABEL_PRINT_LIMITS.minDimensionMm"
          :max="LABEL_PRINT_LIMITS.maxDimensionMm"
          :precision="1"
          :step="1"
          :disabled="saving || printer.busy.value"
          controls-position="right"
        />
        <span class="field-unit">mm</span>
      </el-form-item>
      <el-form-item
        label="每张打印"
        required
      >
        <el-input-number
          v-model="draft.copies"
          :min="LABEL_PRINT_LIMITS.minCopies"
          :max="LABEL_PRINT_LIMITS.maxCopies"
          :precision="0"
          :step="1"
          :disabled="saving || printer.busy.value"
          controls-position="right"
        />
        <span class="field-unit">份</span>
      </el-form-item>
    </el-form>
    <InlineHint>新增或移除打印机后需刷新整个页面。保存后请主动提交或补打标签。</InlineHint>
    <template #footer>
      <el-button
        :disabled="saving"
        @click="requestClose"
        >取消</el-button
      >
      <el-button
        type="primary"
        :loading="saving"
        :disabled="!draft.printerName || loading || printer.busy.value"
        @click="save"
        >保存设置</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { onScopeDispose, reactive, ref, watch } from 'vue';
import { getLodopPrinters, LABEL_PRINT_LIMITS } from '@company/printing';
import InlineHint from '../../../components/InlineHint.vue';
import { useLabelPrinter } from '../../../composables/printing/use-label-printer';
import { useLatestReadRequest } from '../../../composables/requests/useLatestReadRequest';
import { DialogWidth } from '../../../utils/dialog';
import { EMessage } from '../../../utils/message';
import { RouteMessageBox } from '../../../utils/route-message-box';
import { useTabsStore } from '../../../stores/tabs';

defineOptions({ name: 'LabelPrinterSettingsDialog' });
const props = defineProps<{ visible: boolean; routeName: string }>();
const emit = defineEmits<{ (event: 'update:visible', value: boolean): void }>();
const printer = useLabelPrinter();
const draft = reactive({ ...printer.settings.value });
const printers = ref<string[]>([]);
const loading = ref(false);
const saving = ref(false);
const serviceError = ref('');
const saveError = ref('');
const draftKey = (): string => JSON.stringify(draft);
let baseline = draftKey();
const reads = useLatestReadRequest(() => {
  loading.value = false;
});

async function loadPrinters(): Promise<void> {
  if (!props.visible || !reads.isActive() || saving.value || printer.busy.value) return;
  const read = reads.begin(() => props.visible);
  loading.value = true;
  serviceError.value = '';
  try {
    const result = await getLodopPrinters();
    if (!read.isCurrent()) return;
    printers.value = result.printers;
    if (!result.printers.length)
      serviceError.value = '本机未找到已安装的打印机，请安装后刷新整个页面';
  } catch (error) {
    if (read.isCurrent())
      serviceError.value = error instanceof Error ? error.message : '本机打印服务连接失败';
  } finally {
    if (read.isCurrent()) loading.value = false;
  }
}

async function allowClose(): Promise<boolean> {
  if (!props.visible) return true;
  if (saving.value) return false;
  if (draftKey() === baseline) return true;
  try {
    await RouteMessageBox.confirm('打印设置尚未保存，确认放弃并关闭？', '关闭打印设置', {
      type: 'warning',
    });
    return !saving.value;
  } catch {
    return false;
  }
}

async function requestClose(): Promise<void> {
  if (await allowClose()) emit('update:visible', false);
}

async function save(): Promise<void> {
  if (!props.visible || !reads.isActive() || saving.value || loading.value || printer.busy.value)
    return;
  const read = reads.begin(() => props.visible);
  const frozen = { ...draft };
  saving.value = true;
  saveError.value = '';
  try {
    const saved = await printer.saveSettings(frozen, read.isCurrent);
    if (!saved || !read.isCurrent()) return;
    EMessage.success('本机标签打印设置已保存');
    baseline = draftKey();
    emit('update:visible', false);
  } catch (error) {
    if (read.isCurrent())
      saveError.value = error instanceof Error ? error.message : '标签打印设置保存失败';
  } finally {
    saving.value = false;
  }
}

watch(
  () => props.visible,
  (visible) => {
    reads.invalidate();
    if (!visible) return;
    Object.assign(draft, printer.settings.value);
    baseline = draftKey();
    saveError.value = '';
    void loadPrinters();
  },
);
const unregister = useTabsStore().registerCloseGuard(props.routeName, allowClose);
onScopeDispose(unregister);
</script>

<style scoped>
.settings-notice {
  margin: 12px 0;
}
.printer-form {
  margin-top: 16px;
}
.printer-field {
  display: flex;
  width: 100%;
  gap: 8px;
}
.printer-field .el-select {
  flex: 1;
  min-width: 0;
}
.field-unit {
  margin-left: 8px;
}
</style>
