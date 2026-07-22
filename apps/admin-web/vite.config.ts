import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { loadWorkspaceEnv } from '@company/config';
loadWorkspaceEnv();
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: { '/api': { target: `http://127.0.0.1:${process.env.APP_PORT}`, changeOrigin: true } },
  },
  build: { sourcemap: true },
});
