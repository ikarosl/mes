import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

// HTTP 管线集成测试经真实 Nest DI 启动应用：esbuild 变换不发射 design:paramtypes 元数据
// （emitDecoratorMetadata 为 esbuild 明确不支持的 TS 选项），Nest 构造器注入会全部得到
// undefined；因此集成套件统一改用 SWC 变换（apps/api/tsconfig.json 已开启 emitDecoratorMetadata，
// 与生产 tsc 构建行为一致）。
export default defineConfig({
  plugins: [
    swc.vite({
      // Explicitly set the module type to avoid inheriting this value from a `.swcrc` config file
      module: { type: 'es6' },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    fileParallelism: false,
    // 真实 MySQL 迁移套件需要在临时库执行完整 DDL 链；本地/CI 资源较慢时 30s 会超时。
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
