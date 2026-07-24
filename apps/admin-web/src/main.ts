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

// Install global HTTP error handler for the application
// must be done before mounting the app to ensure that all HTTP requests
// are intercepted and handled appropriately. This setup allows for consistent error
// handling across the application, providing user feedback and managing authentication state as needed.
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
