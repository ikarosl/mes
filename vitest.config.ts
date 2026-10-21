import { configDefaults, defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    // Turbo 并发运行多个 workspace，限制每个 Vitest 池避免重复占满宿主 CPU/内存。
    maxWorkers: 2,
    include: ['**/__tests__/**/*.test.ts'],
    exclude: [
      ...configDefaults.exclude,
      '**/.worktrees/**',
      '**/.claude/worktrees/**',
      '**/temp/**',
      '**/ai_output/**',
    ],
    coverage: { provider: 'v8', reporter: ['text', 'json', 'html'] },
  },
});
