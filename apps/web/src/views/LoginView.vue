<template>
  <div class="page" style="max-width:420px;margin-top:12vh">
    <div class="card stack">
      <div>
        <h2 style="margin:0 0 4px">企业 AI 定制销售 OS</h2>
        <p class="muted" style="margin:0">AI 客服 · 知识库 / CRM 流程自动化 · 销售智能体实施</p>
      </div>
      <label class="stack" style="gap:6px">
        <span class="muted">邮箱</span>
        <input class="input" v-model="email" autocomplete="username" />
      </label>
      <label class="stack" style="gap:6px">
        <span class="muted">密码</span>
        <input class="input" type="password" v-model="password" autocomplete="current-password" @keyup.enter="submit" />
      </label>
      <button class="btn btn-primary" :disabled="loading" @click="submit">
        {{ loading ? '登录中…' : '登录' }}
      </button>
      <p v-if="error" class="tag warn" style="margin:0">{{ error }}</p>
      <p class="muted" style="margin:0;font-size:12px">
        试用账号：<code>manager@demo.local</code> / <code>agent@demo.local</code> / <code>agent2@demo.local</code>。
        密码仅见本地 <code>.env.native</code>（或 <code>.env</code>）的 <code>DEMO_*_PASSWORD</code>，勿写入公开文档。
      </p>
      <p class="muted" style="margin:0;font-size:12px">
        面向 B2B ICP 的内部销售获客与跟进。公开流程参考（非客户）：Salesforce / Agentforce 类销售作业流。
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, inject } from 'vue';
import { useRouter } from 'vue-router';
import { AuthApi } from '../api/client';

const router = useRouter();
const toast = inject('toast', () => {});
const email = ref('manager@demo.local');
const password = ref('');
const loading = ref(false);
const error = ref('');

async function submit() {
  loading.value = true;
  error.value = '';
  try {
    const res = await AuthApi.login(email.value, password.value);
    localStorage.setItem('salesos_token', res.access_token);
    localStorage.setItem('salesos_user', JSON.stringify(res.user));
    toast('登录成功');
    router.push('/');
  } catch (e) {
    error.value = e.message || '登录失败';
  } finally {
    loading.value = false;
  }
}
</script>
