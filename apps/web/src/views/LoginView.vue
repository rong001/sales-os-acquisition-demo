<template>
  <div class="page" style="max-width:420px;margin-top:12vh">
    <div class="card stack">
      <div>
        <h2 style="margin:0 0 4px">销售获客 OS</h2>
        <p class="muted" style="margin:0">演示租户登录 · 抢票 / USGate</p>
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
        账号见本地 <code>.env</code>（<code>DEMO_AGENT_PASSWORD</code> / <code>DEMO_ADMIN_PASSWORD</code>），勿将真实密码写入 README。
      </p>
      <p class="muted" style="margin:0;font-size:12px">
        落地页：<a href="/p/ticket-grab">抢票</a> · <a href="/p/usgate">USGate</a>
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
const email = ref('agent@demo.local');
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
