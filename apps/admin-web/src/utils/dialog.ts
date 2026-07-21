/**
 * 管理端统一弹窗宽度。
 * 符合 design.md §5 弹窗规范：使用 CSS min() 同时限制推荐宽度和最大视口占比。
 */
export const DialogWidth = {
  sm: 'min(420px, 90vw)',
  md: 'min(640px, 75vw)',
  lg: 'min(860px, 75vw)',
  xl: 'min(1000px, 75vw)',
} as const;
