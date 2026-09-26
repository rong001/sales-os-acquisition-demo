<template>
  <div class="nav-links" data-testid="app-nav">
    <button class="btn btn-ghost" data-testid="nav-workbench" @click="go('/')">工作台</button>
    <button v-if="canBoss" class="btn btn-ghost" data-testid="nav-boss" @click="go('/boss')">老板三屏</button>
    <button class="btn btn-ghost" data-testid="nav-pool" @click="go('/pool')">公海</button>
    <button class="btn btn-ghost" data-testid="nav-dial" @click="go('/dial')">外呼任务</button>
    <button class="btn btn-ghost" data-testid="nav-scripts" @click="go('/scripts')">话术库</button>
    <button class="btn btn-ghost" data-testid="nav-import" @click="go('/import')">导入</button>
    <button class="btn btn-ghost" data-testid="nav-wecom" @click="go('/wecom/sidepanel')">企微侧栏</button>
    <button v-if="canFunnel" class="btn btn-ghost" data-testid="nav-funnel" @click="go('/admin/funnel')">漏斗</button>
    <button v-if="canFunnel" class="btn btn-ghost" data-testid="nav-growth" @click="go('/admin/growth')">获客配置</button>
    <button v-if="canFunnel" class="btn btn-ghost" data-testid="nav-conversion" @click="go('/admin/conversion')">来源转化</button>
    <button class="btn" data-testid="nav-logout" @click="logout">退出</button>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const user = ref(null);
try { user.value = JSON.parse(localStorage.getItem('salesos_user') || 'null'); } catch { /* */ }

const isAdmin = computed(() => ['admin', 'supervisor'].includes(user.value?.role));
const canFunnel = computed(() => isAdmin.value || user.value?.role === 'viewer');
const canBoss = computed(() => isAdmin.value || user.value?.role === 'viewer');

function go(path) {
  if (router.currentRoute.value.path !== path) router.push(path);
}

function logout() {
  localStorage.removeItem('salesos_token');
  localStorage.removeItem('salesos_user');
  router.push('/login');
}
</script>
