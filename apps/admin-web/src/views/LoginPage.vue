<template>
  <div class="login-page">
    <el-card class="login-card">
      <h1>生产工艺流程追溯系统</h1>
      <p>管理端登录</p>
      <el-form
        label-position="top"
        @submit.prevent
      >
        <el-form-item label="用户名">
          <el-input v-model="form.username" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            @keyup.enter="submit"
          />
        </el-form-item>
        <el-button
          type="primary"
          class="full"
          :loading="loading"
          @click="submit"
          >登录</el-button
        >
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { EMessage } from '../utils/message';

defineOptions({ name: 'LoginPage' });

const form = reactive({ username: '', password: '' });
const loading = ref(false);
const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const submit = async () => {
  if (!form.username || !form.password) return EMessage.warning('请输入用户名和密码');

  loading.value = true;
  try {
    await auth.login(form);
    await router.replace(typeof route.query.redirect === 'string' ? route.query.redirect : '/');
  } catch {
    // The centralized HTTP handler already presented the API failure.
  } finally {
    loading.value = false;
  }
};
</script>
