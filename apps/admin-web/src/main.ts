import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import 'element-plus/dist/index.css';
import './styles/index.css';
import App from './App.vue';
import RouteDialog from './components/RouteDialog.vue';
import { router } from './router';
import { installHttpErrorHandler } from './api/error-handler';
import { httpClient } from './api/http';
import { useAuthStore } from './stores/auth';
import { EMessage } from './utils/message';
import { RouteMessageBox } from './utils/route-message-box';

const pinia = createPinia();
const auth = useAuthStore(pinia);

// 安装全局 HTTP 错误处理器。
// 必须在挂载应用前完成，确保所有 HTTP 请求都能被统一拦截和处理，
// 为用户提供一致的错误反馈并维护认证状态。
installHttpErrorHandler(httpClient, {
  notify: (message) => EMessage.error(message),
  onUnauthorized: () => {
    auth.clear();
    if (router.currentRoute.value.name !== 'login')
      void router.replace({
        name: 'login',
        query: { redirect: router.currentRoute.value.fullPath },
      });
  },
  onForbidden: () => {
    if (router.currentRoute.value.name !== 'no-permission')
      void router.replace({ name: 'no-permission' });
  },
});

const app = createApp(App);

app.use(pinia).use(router).use(ElementPlus, { locale: zhCn });
// 将所有 Element Plus 弹窗保留在缓存路由子树内，使非活动标签页保留编辑状态，
// 同时不阻塞内容区域之外的路由导航。
app.component('ElDialog', RouteDialog);
router.beforeEach(() => {
  RouteMessageBox.close();
});
app.mount('#app');
