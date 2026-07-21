import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import './styles/index.css';
import App from './App.vue';
import { router } from './router';
import { installHttpErrorHandler } from './api/error-handler';
import { httpClient } from './api/http';
import { useAuthStore } from './stores/auth';
import { EMessage } from './utils/message';

const pinia = createPinia();
const auth = useAuthStore(pinia);

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

createApp(App).use(pinia).use(router).use(ElementPlus).mount('#app');
