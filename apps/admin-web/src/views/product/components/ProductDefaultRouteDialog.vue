<template>
  <el-dialog
    :model-value="visible"
    title="设置默认工艺路线"
    :width="DialogWidth.md"
    @update:model-value="$emit('update:visible', $event)"
  >
    <el-form label-width="96px">
      <el-form-item label="产品">
        <span>{{ product?.itemCode }} / {{ product?.productName }}</span>
      </el-form-item>
      <el-form-item label="默认路线">
        <el-select
          v-model="selectedRouteId"
          clearable
          placeholder="不设置默认路线"
          @visible-change="(visible: boolean) => visible && routeSource.refresh()"
        >
          <el-option
            v-for="choice in routeChoices"
            :key="choice.value"
            :label="
              choice.option
                ? `${choice.option.routeCode} / ${choice.option.routeName} / ${choice.option.versionNo}`
                : `${choice.value}（已失效）`
            "
            :value="choice.value"
            :disabled="choice.isUnavailable"
          />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        @click="handleConfirm"
        >保存默认路线</el-button
      >
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onActivated, ref, watch } from 'vue';
import type { ProductListItem } from '@company/contracts';
import { DialogWidth } from '../../../utils/dialog';
import { buildLiveOptions, hasUnavailableSelection } from '../../../utils/live-options';
import { EMessage } from '../../../utils/message';
import { useProcessRouteOptions } from '../../../composables/options/useProcessRouteOptions';

const props = defineProps<{
  visible: boolean;
  product: ProductListItem | null;
  currentRouteId: string | null;
  submitting: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'confirm', routeId: string | null): void;
}>();

const routeSource = useProcessRouteOptions();
const selectedRouteId = ref('');

const availableRoutes = computed(() =>
  routeSource.options.value.filter(
    (route) => route.productId === props.product?.id && route.status === 'enabled',
  ),
);

const routeChoices = computed(() =>
  buildLiveOptions(
    availableRoutes.value,
    selectedRouteId.value ? [selectedRouteId.value] : [],
    (item) => item.id,
  ),
);

const handleConfirm = (): void => {
  if (
    hasUnavailableSelection(
      availableRoutes.value,
      selectedRouteId.value ? [selectedRouteId.value] : [],
      (item) => item.id,
    )
  ) {
    EMessage.warning('默认工艺路线已失效，请重新选择');
    return;
  }
  emit('confirm', selectedRouteId.value || null);
};

/** 打开弹窗时同步当前默认路线并刷新可用路线候选 */
watch(
  () => [props.visible, props.product?.id, props.currentRouteId] as const,
  ([visible]) => {
    if (!visible) return;
    selectedRouteId.value = props.currentRouteId ?? '';
    void routeSource.refresh();
  },
);

/** 页面重新激活且弹窗打开时刷新候选（弹窗自持，页面不再调用） */
onActivated(() => {
  if (props.visible) void routeSource.refresh();
});
</script>
