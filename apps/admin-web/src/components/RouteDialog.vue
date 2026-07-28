<template>
  <ElDialog
    v-bind="$attrs"
    :append-to-body="false"
    :modal-class="resolvedModalClass"
  >
    <slot />
    <template
      v-if="$slots.header"
      #header="slotProps"
    >
      <slot
        name="header"
        v-bind="slotProps"
      />
    </template>
    <template
      v-if="$slots.footer"
      #footer
    >
      <slot name="footer" />
    </template>
  </ElDialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ElDialog } from 'element-plus';

defineOptions({
  name: 'RouteDialog',
  inheritAttrs: false,
});

const props = defineProps<{
  modalClass?: string;
}>();

const resolvedModalClass = computed(() =>
  ['route-dialog-overlay', props.modalClass].filter(Boolean).join(' '),
);
</script>
